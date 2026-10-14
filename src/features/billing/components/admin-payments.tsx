"use client";

import { CreditCard, RefreshCw, Search, Wrench } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { organizationsApi } from "@/features/organizations/api";
import { billingApi, type LedgerKind } from "../api";
import { billingCodeMessage, billingErrorText } from "../errors";
import { formatDateTime, formatVnd, isoToLocalInput, localInputToIso } from "../format";
import { PaymentStatusView } from "./payment-progress";
import { canReconcile, checkoutLabels, paymentLabels, PaymentStateBadges, purposeLabel } from "./payment-states";
import "../billing.css";

const PAGE_SIZE = 20;
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Everything about one payment: checkout (link), payment (money) and provisioning (service) apart, plus reconcile. */
function PaymentDetail({ accessToken, checkoutId, paymentRequestId, onChanged }: { accessToken: string; checkoutId: string; paymentRequestId: string; onChanged: () => void }) {
  const toast = useToast();
  const lock = useRef(false);
  const [reconciling, setReconciling] = useState(false);
  const checkout = useAsyncData(`commerce:checkout:${checkoutId}`, (signal) => billingApi.getCheckout(accessToken, checkoutId, signal), Boolean(checkoutId));
  const paymentId = paymentRequestId || checkout.data?.paymentRequestId || "";
  const payment = useAsyncData(`commerce:payment:${paymentId}`, (signal) => billingApi.getPayment(accessToken, paymentId, signal), Boolean(paymentId));
  const quotationId = checkout.data?.quotationId ?? payment.data?.quotationId ?? "";
  const quote = useAsyncData(`commerce:payment-quote:${quotationId}`, (signal) => billingApi.getQuotation(accessToken, quotationId, signal), Boolean(quotationId));
  const names = useMemo(() => Object.fromEntries((quote.data?.data.items ?? []).map((line) => [line.buildingId, line.buildingName])), [quote.data]);

  const stateItem = { checkoutId: checkoutId || null, checkoutStatus: checkout.data?.checkoutStatus ?? null, paymentStatus: payment.data?.paymentStatus ?? null, provisioningStatus: payment.data?.provisioningStatus ?? "NotStarted" };
  const allowed = canReconcile(stateItem);

  const reconcile = async () => {
    if (lock.current || !checkoutId) return;
    lock.current = true;
    setReconciling(true);
    try {
      await billingApi.reconcile(accessToken, checkoutId);
      toast.notify({ tone: "success", title: "Đã yêu cầu đối soát", description: "Hệ thống xếp hàng thử lại các mục còn lỗi; không đổi số tiền, chữ ký hay cấp quyền thủ công. Kiểm tra lại trạng thái sau ít phút." });
      checkout.reload(); payment.reload(); onChanged();
    } catch (cause) {
      toast.notify({ tone: "danger", title: "Không gửi được yêu cầu đối soát", description: billingErrorText(cause) });
    } finally { lock.current = false; setReconciling(false); }
  };

  return <div className="ops-stack" data-testid="payment-detail">
    {checkout.loading && !checkout.data && <SkeletonRows rows={3} label="Đang tải checkout…" />}
    {checkout.error !== undefined && <Alert tone="danger" title="Không đọc được checkout" action={<Button size="sm" variant="secondary" className="mt-3" onClick={checkout.reload}>Thử lại</Button>}>{billingErrorText(checkout.error)}</Alert>}
    {checkout.data && <>
      <div className="bill-row"><PaymentStateBadges item={stateItem} />
        <Button variant="secondary" size="sm" onClick={() => void reconcile()} disabled={!allowed || reconciling} title={allowed ? undefined : "Không có mục nào cần đối soát"}><Wrench size={14} aria-hidden="true" />{reconciling ? "Đang gửi…" : "Yêu cầu đối soát"}</Button></div>
      {!allowed && <p className="bill-dim" style={{ margin: 0 }}>Đối soát chỉ mở khi checkout cần đối soát hoặc đã nhận tiền nhưng kích hoạt chưa xong. Đối soát chỉ xếp hàng thử lại, không tự ghi “đã thanh toán”.</p>}
      <div className="bill-stats">
        <div className="ops-stat"><span>Số tiền theo báo giá</span><strong>{formatVnd(checkout.data.amount)}</strong><small>Đơn {checkout.data.orderCode}</small></div>
        <div className="ops-stat"><span>Checkout</span><strong>{checkoutLabels[checkout.data.checkoutStatus]?.label ?? checkout.data.checkoutStatus}</strong>{checkout.data.errorCode && <small>{billingCodeMessage(checkout.data.errorCode) ?? `Mã lỗi: ${checkout.data.errorCode}`}</small>}</div>
        <div className="ops-stat"><span>Hết hạn liên kết</span><strong>{formatDateTime(checkout.data.expiresAt)}</strong></div>
      </div>
      <p className="bill-dim bill-wrap" style={{ margin: 0 }}>Báo giá {quote.data?.data.quotationNumber ?? checkout.data.quotationId} · checkout {checkout.data.checkoutId}</p>
      {!paymentId && <Alert tone="warning" title="Chưa có bản ghi thanh toán">Liên kết PayOS chưa được ghi nhận nên chưa có trạng thái thanh toán hay kích hoạt.</Alert>}
    </>}
    {payment.error !== undefined && <Alert tone="danger" title="Không đọc được thanh toán" action={<Button size="sm" variant="secondary" className="mt-3" onClick={payment.reload}>Thử lại</Button>}>{billingErrorText(payment.error)}</Alert>}
    {payment.data && <PaymentStatusView payment={payment.data} buildingNames={names} />}
  </div>;
}

/**
 * PlatformAdmin payment ledger: every checkout (including links that never bound a payment) or every payment
 * request, filtered and paginated by the server. Checkout / payment / provisioning are shown as three states;
 * reconcile is offered only where something is stuck.
 */
export function PaymentsSection({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const kind: LedgerKind = get("kind") === "requests" ? "requests" : "checkouts";
  const status = get("status");
  const organizationId = get("org");
  const quotationId = get("q");
  const from = get("from");
  const to = get("to");
  const openCheckout = get("checkout");
  const openPayment = get("payment");

  const [lookup, setLookup] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [filters, setFilters] = useState({ quotationId, from: isoToLocalInput(from), to: isoToLocalInput(to) });
  const [filterError, setFilterError] = useState("");

  const organizations = useAsyncData("commerce:orgs", () => organizationsApi.list(accessToken, { page: 1, pageSize: 100 }));
  const orgName = useMemo(() => Object.fromEntries((organizations.data?.items ?? []).map((item) => [item.id, item.name])), [organizations.data]);
  const list = useAsyncData(`commerce:ledger:${kind}:${page}:${status}:${organizationId}:${quotationId}:${from}:${to}`, (signal) => billingApi.listLedger(accessToken, kind, { page, pageSize: PAGE_SIZE, status: status || undefined, organizationId: organizationId || undefined, quotationId: quotationId || undefined, from: from || undefined, to: to || undefined }, signal));
  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;
  const statusOptions = kind === "checkouts" ? Object.entries(checkoutLabels) : Object.entries(paymentLabels);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = filters.quotationId.trim();
    if (q && !GUID.test(q)) { setFilterError("Mã báo giá là GUID (36 ký tự)."); return; }
    const fromIso = filters.from ? localInputToIso(filters.from) : null;
    const toIso = filters.to ? localInputToIso(filters.to) : null;
    if (fromIso && toIso && new Date(toIso) <= new Date(fromIso)) { setFilterError("Thời điểm kết thúc phải sau thời điểm bắt đầu."); return; }
    setFilterError("");
    setParams({ q: q || null, from: fromIso, to: toIso });
  };

  const submitLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = lookup.trim();
    if (!GUID.test(value)) { setLookupError("Nhập mã checkout dạng GUID (36 ký tự)."); return; }
    setLookupError("");
    setParams({ checkout: value, payment: null });
  };

  const detailOpen = Boolean(openCheckout || openPayment);
  return <div className="ops-stack">
    <div className="bill-row"><p className="bill-muted">Mọi checkout và yêu cầu thanh toán PayOS của các tổ chức, mới nhất trước. Ba trạng thái tách biệt: checkout (liên kết), thanh toán (tiền, chỉ do PayOS xác nhận qua webhook) và kích hoạt (dịch vụ/quota đã cấp).</p><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button></div>

    <div role="radiogroup" aria-label="Loại danh sách" className="bill-segment">
      <button type="button" role="radio" aria-checked={kind === "checkouts"} data-active={kind === "checkouts"} onClick={() => setParams({ kind: null, status: null })}>Checkout</button>
      <button type="button" role="radio" aria-checked={kind === "requests"} data-active={kind === "requests"} onClick={() => setParams({ kind: "requests", status: null })}>Yêu cầu thanh toán</button>
    </div>

    <form onSubmit={applyFilters} noValidate className="ops-toolbar bill-filters" aria-label="Bộ lọc thanh toán">
      <Field label="Trạng thái" className="ops-toolbar-grow">{(p) => <Select {...p} value={status} onChange={(event) => setParams({ status: event.target.value })}><option value="">Tất cả</option>{statusOptions.map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</Select>}</Field>
      <Field label="Tổ chức" className="ops-toolbar-grow">{(p) => <Select {...p} value={organizationId} onChange={(event) => setParams({ org: event.target.value })}><option value="">Tất cả</option>{(organizations.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}</Field>
      <Field label="Mã báo giá" error={filterError || undefined} className="ops-toolbar-grow">{(p) => <Input {...p} placeholder="GUID" value={filters.quotationId} onChange={(event) => setFilters({ ...filters, quotationId: event.target.value })} />}</Field>
      <Field label="Từ (giờ địa phương)">{(p) => <Input {...p} type="datetime-local" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />}</Field>
      <Field label="Đến">{(p) => <Input {...p} type="datetime-local" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />}</Field>
      <Button type="submit" variant="secondary"><Search size={16} aria-hidden="true" />Lọc</Button>
      {(status || organizationId || quotationId || from || to) && <Button type="button" variant="quiet" onClick={() => { setFilters({ quotationId: "", from: "", to: "" }); setFilterError(""); setParams({ status: null, org: null, q: null, from: null, to: null }); }}>Xóa lọc</Button>}
    </form>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách thanh toán" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    <Table className="bill-table" caption={kind === "checkouts" ? "Checkout PayOS" : "Yêu cầu thanh toán PayOS"}>
      <thead><tr><th>Tạo lúc</th><th>Báo giá</th><th>Tổ chức</th><th className="bill-money">Số tiền</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={6}><SkeletonRows rows={5} label="Đang tải thanh toán…" /></TableMessage>}
        {items.map((item) => <tr key={`${item.checkoutId}:${item.paymentRequestId}`} data-testid="ledger-row" data-checkout-status={item.checkoutStatus ?? ""} data-payment-status={item.paymentStatus ?? ""} data-provisioning-status={item.provisioningStatus}>
          <td>{formatDateTime(item.createdAt)}{item.paidAt && <span className="ops-cell-sub">Nhận tiền {formatDateTime(item.paidAt)}</span>}</td>
          <td className="bill-wrap"><span className="ops-cell-primary">{item.quotationNumber}</span><span className="ops-cell-sub">{purposeLabel(item.purpose)}</span></td>
          <td className="bill-wrap">{orgName[item.organizationId] ?? item.organizationId.slice(0, 8)}</td>
          <td className="bill-money">{formatVnd(item.amount)}<span className="ops-cell-sub">{item.provisioningLines > 0 ? `kích hoạt ${item.provisioningSucceeded}/${item.provisioningLines}` : "chưa có mục kích hoạt"}</span></td>
          <td><PaymentStateBadges item={item} />{item.checkoutError && <span className="ops-cell-sub">{billingCodeMessage(item.checkoutError) ?? item.checkoutError}</span>}</td>
          <td className="ops-cell-actions"><Button size="sm" variant="quiet" onClick={() => setParams({ checkout: item.checkoutId, payment: item.checkoutId ? null : item.paymentRequestId })} aria-label={`Chi tiết thanh toán ${item.quotationNumber}`}>{canReconcile(item) ? "Xử lý" : "Chi tiết"}</Button></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={6}><EmptyState icon={CreditCard} title="Không có thanh toán" description={status || organizationId || quotationId || from || to ? "Không có bản ghi khớp bộ lọc. Nới bộ lọc hoặc xóa lọc." : "Chưa có checkout nào. Bản ghi xuất hiện khi tổ chức bắt đầu thanh toán một báo giá đã chấp nhận."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <form onSubmit={submitLookup} noValidate className="ops-toolbar" aria-label="Tra cứu theo mã checkout">
      <Field label="Tra cứu theo mã checkout" error={lookupError || undefined} className="ops-toolbar-grow" hint="Dán mã từ tổ chức, nhật ký hoặc hỗ trợ.">{(p) => <Input {...p} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={lookup} onChange={(event) => setLookup(event.target.value)} />}</Field>
      <Button type="submit" style={{ alignSelf: lookupError ? "center" : "end" }}><Search size={16} aria-hidden="true" />Tra cứu</Button>
    </form>

    <Drawer open={detailOpen} onOpenChange={(open) => { if (!open) setParams({ checkout: null, payment: null }); }} title="Chi tiết thanh toán" description="Trạng thái checkout, thanh toán và kích hoạt đọc trực tiếp từ hệ thống." className="bill-wide-drawer">
      {detailOpen && <PaymentDetail key={`${openCheckout}:${openPayment}`} accessToken={accessToken} checkoutId={openCheckout} paymentRequestId={openPayment} onChanged={list.reload} />}
    </Drawer>
  </div>;
}
