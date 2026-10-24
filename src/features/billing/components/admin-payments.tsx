"use client";

import { CreditCard, Eye, RefreshCw, Wrench } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { ChartCard } from "@/components/charts/chart-card";
import { Donut } from "@/components/charts/lazy";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { ChipPopover, FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { organizationsApi } from "@/features/organizations/api";
import { billingApi, type LedgerKind } from "../api";
import { billingCodeMessage, billingErrorText } from "../errors";
import { formatDateTime, formatNumber, formatVnd, isoToLocalInput, localInputToIso } from "../format";
import type { PayosLedgerItem } from "../types";
import { PaymentStatusView } from "./payment-progress";
import { canReconcile, checkoutLabels, paymentLabels, PaymentStateBadges, purposeLabel } from "./payment-states";
import "../billing.css";

const PAGE_SIZE = 20;
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/** Start of the 30-day window, read when a request runs (not during render). */
const since30 = () => new Date(Date.now() - 30 * 86_400_000).toISOString();
const PAYMENT_STATUSES = Object.keys(paymentLabels);
const toneColor: Record<string, string> = { Paid: "var(--success)", Pending: "var(--warning)", Cancelled: "var(--danger)", Expired: "var(--dim)", Failed: "var(--danger)" };

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
    {checkout.loading && !checkout.data && <SkeletonDetail rows={4} />}
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
 * Donut "Thanh toán theo trạng thái" (Figma 53:1540): one `totalCount` per payment status from the payment-request ledger
 * over the last 30 days (page size 1). Counts come from the server, never from the page on screen.
 */
function PaymentStatusDonut({ accessToken }: { accessToken: string }) {
  // One small read per status, in parallel; only `totalCount` is used.
  const counts = useAsyncData("commerce:count:requests30", (signal) => Promise.all(PAYMENT_STATUSES.map((status) => billingApi.listLedger(accessToken, "requests", { status, from: since30(), page: 1, pageSize: 1 }, signal).then((result) => [status, result.totalCount] as const))));
  const loading = counts.loading && !counts.data;
  const failed = counts.error !== undefined && !counts.data;
  const byStatus = Object.fromEntries(counts.data ?? []);
  const slices = PAYMENT_STATUSES.map((status) => ({ key: status, label: paymentLabels[status]?.label ?? status, value: byStatus[status] ?? 0, color: toneColor[status] ?? "var(--info)" }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return <ChartCard title="Thanh toán theo trạng thái" description="30 ngày gần nhất · yêu cầu thanh toán PayOS, số lượng từ máy chủ" height={170} loading={loading} empty={!loading && (failed || total === 0)} emptyText={failed ? "Chưa đọc được số lượng theo trạng thái" : "Chưa có yêu cầu thanh toán trong 30 ngày"} data-testid="payments-status-chart"
    table={<table className="ops-table"><caption className="ops-sr-only">Thanh toán theo trạng thái</caption><thead><tr><th>Trạng thái</th><th>Số yêu cầu</th></tr></thead><tbody>{slices.map((slice) => <tr key={slice.key}><td>{slice.label}</td><td>{formatNumber(slice.value)}</td></tr>)}</tbody></table>}>
    <Donut slices={slices} center={{ value: formatNumber(total), caption: "yêu cầu" }} />
  </ChartCard>;
}

/**
 * PlatformAdmin payment ledger (Figma "Thương mại · Thanh toán"): every checkout (including links that never bound a
 * payment) or every payment request, filtered and paginated by the server. Checkout / payment / provisioning are shown
 * as three states; a row opens the detail drawer and the "···" menu offers reconcile only where something is stuck.
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

  const [quoteDraft, setQuoteDraft] = useState(quotationId);
  const [quoteError, setQuoteError] = useState("");
  const [range, setRange] = useState({ from: isoToLocalInput(from), to: isoToLocalInput(to) });
  const [rangeError, setRangeError] = useState("");

  const organizations = useAsyncData("commerce:orgs", () => organizationsApi.list(accessToken, { page: 1, pageSize: 100 }));
  const orgName = useMemo(() => Object.fromEntries((organizations.data?.items ?? []).map((item) => [item.id, item.name])), [organizations.data]);
  const list = useAsyncData(`commerce:ledger:${kind}:${page}:${status}:${organizationId}:${quotationId}:${from}:${to}`, (signal) => billingApi.listLedger(accessToken, kind, { page, pageSize: PAGE_SIZE, status: status || undefined, organizationId: organizationId || undefined, quotationId: quotationId || undefined, from: from || undefined, to: to || undefined }, signal));
  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;
  const statusOptions = Object.entries(kind === "checkouts" ? checkoutLabels : paymentLabels).map(([value, item]) => ({ value, label: item.label }));
  const filtering = Boolean(status || organizationId || quotationId || from || to);

  const applyQuote = (close: () => void) => {
    const value = quoteDraft.trim();
    if (value && !GUID.test(value)) { setQuoteError("Mã báo giá là GUID (36 ký tự)."); return; }
    setQuoteError("");
    setParams({ q: value || null });
    close();
  };
  const applyRange = (close: () => void) => {
    const fromIso = range.from ? localInputToIso(range.from) : null;
    const toIso = range.to ? localInputToIso(range.to) : null;
    if (fromIso && toIso && new Date(toIso) <= new Date(fromIso)) { setRangeError("Thời điểm kết thúc phải sau thời điểm bắt đầu."); return; }
    setRangeError("");
    setParams({ from: fromIso, to: toIso });
    close();
  };
  const clearAll = () => { setQuoteDraft(""); setQuoteError(""); setRange({ from: "", to: "" }); setRangeError(""); setParams({ status: null, org: null, q: null, from: null, to: null }); };
  const openDetail = (item: PayosLedgerItem) => setParams({ checkout: item.checkoutId, payment: item.checkoutId ? null : item.paymentRequestId });

  const columns: DataColumn<PayosLedgerItem>[] = [
    { key: "quotation", header: "Báo giá", primary: true, render: (item) => <CellTitle title={item.quotationNumber} sub={purposeLabel(item.purpose)} /> },
    { key: "created", header: "Tạo lúc", width: 190, render: (item) => <CellTitle title={formatDateTime(item.createdAt)} sub={item.paidAt ? `Nhận tiền ${formatDateTime(item.paidAt)}` : undefined} /> },
    { key: "organization", header: "Tổ chức", width: 180, hideBelow: 1000, render: (item) => orgName[item.organizationId] ?? item.organizationId.slice(0, 8) },
    { key: "amount", header: "Số tiền", width: 170, align: "right", render: (item) => <CellTitle title={formatVnd(item.amount)} sub={item.provisioningLines > 0 ? `kích hoạt ${item.provisioningSucceeded}/${item.provisioningLines}` : "chưa có mục kích hoạt"} /> },
    { key: "state", header: "Trạng thái", render: (item) => <><PaymentStateBadges item={item} />{item.checkoutError && <span className="ops-cell-sub">{billingCodeMessage(item.checkoutError) ?? item.checkoutError}</span>}</> },
  ];

  const detailOpen = Boolean(openCheckout || openPayment);
  return <div className="ops-stack">
    <div className="bill-charts"><PaymentStatusDonut accessToken={accessToken} /></div>

    <div className="bill-row">
      <div role="radiogroup" aria-label="Loại danh sách" className="bill-segment">
        <button type="button" role="radio" aria-checked={kind === "checkouts"} data-active={kind === "checkouts"} onClick={() => setParams({ kind: null, status: null })}>Checkout</button>
        <button type="button" role="radio" aria-checked={kind === "requests"} data-active={kind === "requests"} onClick={() => setParams({ kind: "requests", status: null })}>Yêu cầu thanh toán</button>
      </div>
      <p className="bill-muted" style={{ margin: 0 }}>Ba trạng thái tách biệt: checkout (liên kết), thanh toán (tiền, chỉ do PayOS xác nhận qua webhook) và kích hoạt (dịch vụ/quota đã cấp).</p>
    </div>

    <DataTable<PayosLedgerItem>
      caption={kind === "checkouts" ? "Checkout PayOS" : "Yêu cầu thanh toán PayOS"}
      data-testid="admin-ledger-table"
      columns={columns}
      rows={items}
      rowKey={(item) => `${item.checkoutId}:${item.paymentRequestId}`}
      loading={list.loading && !list.data}
      onRowClick={openDetail}
      rowTone={(item) => (canReconcile(item) ? "warning" : undefined)}
      rowMenu={(item) => [
        { label: "Xem chi tiết", icon: Eye, onSelect: () => openDetail(item) },
        ...(canReconcile(item) ? [{ label: "Xử lý đối soát", icon: Wrench, onSelect: () => openDetail(item), hint: "Gửi lệnh trong chi tiết", separator: true }] : []),
      ]}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được danh sách thanh toán" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <FilterChips label="Bộ lọc thanh toán">
          <FilterChip label="Trạng thái" value={status} onChange={(value) => setParams({ status: value })} options={statusOptions} />
          <ChipPopover label="Mã báo giá" value={quotationId ? `${quotationId.slice(0, 8)}…` : "tất cả"} active={Boolean(quotationId)} dataValue={quotationId} panelLabel="Lọc theo mã báo giá">
            {(close) => <div className="bill-chip-form">
              <Field label="Mã báo giá" hint="GUID 36 ký tự." error={quoteError || undefined}>{(p) => <Input {...p} placeholder="GUID" value={quoteDraft} onChange={(event) => setQuoteDraft(event.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />}</Field>
              <div className="bill-chip-actions">{quotationId && <Button type="button" size="sm" variant="quiet" onClick={() => { setQuoteDraft(""); setQuoteError(""); setParams({ q: null }); close(); }}>Bỏ</Button>}<Button type="button" size="sm" variant="secondary" onClick={() => applyQuote(close)}>Áp dụng</Button></div>
            </div>}
          </ChipPopover>
          <ChipPopover label="Khoảng ngày" value={from || to ? `${from ? formatDateTime(from) : "…"} – ${to ? formatDateTime(to) : "…"}` : "tất cả"} active={Boolean(from || to)} dataValue={from || to ? `${from}..${to}` : ""} panelLabel="Lọc theo thời gian tạo">
            {(close) => <div className="bill-chip-form">
              <Field label="Từ (giờ địa phương)" error={rangeError || undefined}>{(p) => <Input {...p} type="datetime-local" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} />}</Field>
              <Field label="Đến">{(p) => <Input {...p} type="datetime-local" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} />}</Field>
              <div className="bill-chip-actions">{(from || to) && <Button type="button" size="sm" variant="quiet" onClick={() => { setRange({ from: "", to: "" }); setRangeError(""); setParams({ from: null, to: null }); close(); }}>Bỏ</Button>}<Button type="button" size="sm" variant="secondary" onClick={() => applyRange(close)}>Áp dụng</Button></div>
            </div>}
          </ChipPopover>
        </FilterChips>
        <Combobox aria-label="Tổ chức" value={organizationId} onChange={(value) => setParams({ org: value })} options={(organizations.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))} placeholder="Tổ chức: tất cả" searchPlaceholder="Tìm tổ chức" groupLabel="Tổ chức" loading={organizations.loading && !organizations.data} clearable className="bill-toolbar-pick" />
        {filtering && <Button variant="quiet" onClick={clearAll}>Xóa lọc</Button>}
        <Button variant="quiet" onClick={list.reload} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
      </>}
      empty={<EmptyState icon={CreditCard} title="Không có thanh toán" description={filtering ? "Không có bản ghi khớp bộ lọc. Nới bộ lọc hoặc xóa lọc." : "Chưa có checkout nào. Bản ghi xuất hiện khi tổ chức bắt đầu thanh toán một báo giá đã chấp nhận."} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className="bill-hint">Bấm hàng để mở chi tiết thanh toán trong ngăn bên phải; đối soát chỉ mở ở đơn đang kẹt.</p>

    <Drawer open={detailOpen} onOpenChange={(open) => { if (!open) setParams({ checkout: null, payment: null }); }} size="lg" data-testid="payment-drawer" title="Chi tiết thanh toán" description="Trạng thái checkout, thanh toán và kích hoạt đọc trực tiếp từ hệ thống.">
      {detailOpen && <PaymentDetail key={`${openCheckout}:${openPayment}`} accessToken={accessToken} checkoutId={openCheckout} paymentRequestId={openPayment} onChanged={list.reload} />}
    </Drawer>
  </div>;
}
