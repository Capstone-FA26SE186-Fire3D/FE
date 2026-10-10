"use client";

import { FileText, Mail, RefreshCw, Search, Wrench } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { organizationsApi } from "@/features/organizations/api";
import { billingApi } from "../api";
import { billingErrorText, isStatus } from "../errors";
import { formatDateTime, formatVnd, isoToLocalInput, localInputToIso } from "../format";
import type { Quotation, WithEtag } from "../types";
import { PaymentStatusView } from "./payment-progress";
import { QuotationSnapshot, QuotationStatusBadge } from "./quotation-snapshot";
import { BILLING_V7_ISSUE } from "./v7-pending";
import "../billing.css";

const PAGE_SIZE = 20;

/** Admin issue: explicit tax, terms and a future expiry freeze the snapshot. Totals shown are the BE's. */
function IssueForm({ accessToken, quotation, etag, onIssued, onStale }: { accessToken: string; quotation: Quotation; etag: string | null; onIssued: (next: WithEtag<Quotation>) => void; onStale: () => void }) {
  const toast = useToast();
  const lock = useRef(false);
  const [tax, setTax] = useState("0");
  const [terms, setTerms] = useState("");
  const [validUntil, setValidUntil] = useState(() => isoToLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const found: Record<string, string> = {};
    if (!/^\d+$/.test(tax.trim())) found.taxAmount = "Thuế là số nguyên VND không âm (nhập 0 nếu không có).";
    if (!terms.trim() || terms.trim().length > 10000) found.terms = "Nhập điều khoản (1–10.000 ký tự).";
    const iso = localInputToIso(validUntil);
    if (!iso || new Date(iso) <= new Date()) found.validUntil = "Chọn thời hạn chấp nhận trong tương lai.";
    setErrors(found);
    if (Object.keys(found).length) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const next = await billingApi.issueQuotation(accessToken, quotation.id, { taxAmount: Number(tax), terms: terms.trim(), validUntil: iso as string }, etag ?? "");
      toast.notify({ tone: "success", title: "Đã phát hành báo giá", description: `Tổng thanh toán ${formatVnd(next.data.totalAmount)} theo bản chụp của hệ thống.` });
      onIssued(next);
    } catch (cause) {
      setError(billingErrorText(cause));
      if (isStatus(cause, 412)) onStale();
    } finally { lock.current = false; setSaving(false); }
  };

  return <form onSubmit={submit} noValidate className="ops-stack" aria-label="Phát hành báo giá">
    <p className="ops-field-label" style={{ margin: 0 }}>Phát hành báo giá</p>
    <p className="bill-muted">Hệ thống tính lại giá, giảm giá và chốt bản chụp khi phát hành. Thuế và điều khoản do bạn nhập rõ ràng.</p>
    <div className="ops-form-grid">
      <Field label="Thuế (VND)" required error={errors.taxAmount}>{(p) => <Input {...p} inputMode="numeric" value={tax} onChange={(event) => setTax(event.target.value)} />}</Field>
      <Field label="Hạn chấp nhận" required error={errors.validUntil} hint="Giờ địa phương, lưu dưới dạng UTC.">{(p) => <Input {...p} type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />}</Field>
      <Field label="Điều khoản" required className="ops-span-all" error={errors.terms}>{(p) => <Textarea {...p} maxLength={10000} value={terms} onChange={(event) => setTerms(event.target.value)} />}</Field>
    </div>
    {error && <Alert tone="danger" title="Chưa phát hành được">{error}</Alert>}
    <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button type="submit" disabled={saving}>{saving ? "Đang phát hành…" : "Phát hành báo giá"}</Button></div>
  </form>;
}

export function QuotationsSection({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const selectedId = get("quotation");
  const list = useAsyncData(`commerce:quotes:${page}`, (signal) => billingApi.listQuotations(accessToken, page, PAGE_SIZE, signal));
  const organizations = useAsyncData("commerce:orgs", () => organizationsApi.list(accessToken, { page: 1, pageSize: 100 }));
  const detail = useAsyncData(`commerce:quote:${selectedId}`, (signal) => billingApi.getQuotation(accessToken, selectedId, signal), Boolean(selectedId));
  const [override, setOverride] = useState<WithEtag<Quotation> | null>(null);
  const current = override && override.data.id === selectedId ? override : detail.data ?? null;
  const orgName = useMemo(() => Object.fromEntries((organizations.data?.items ?? []).map((item) => [item.id, item.name])), [organizations.data]);
  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;

  return <div className="ops-stack">
    <div className="bill-row"><p className="bill-muted">Báo giá của mọi tổ chức. Phát hành báo giá nháp để tổ chức chấp nhận và thanh toán.</p><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button></div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    <Table className="bill-table" caption="Báo giá của mọi tổ chức">
      <thead><tr><th>Báo giá</th><th>Tổ chức</th><th>Trạng thái</th><th>Hiệu lực đến</th><th className="bill-money">Tổng thanh toán</th><th aria-label="Thao tác" /></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={6}><SkeletonRows rows={5} label="Đang tải báo giá…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td><span className="ops-cell-primary bill-wrap">{item.quotationNumber}<span className="ops-cell-sub">{item.items.length} công trình</span></span></td>
          <td className="bill-wrap">{orgName[item.organizationId] ?? item.organizationId.slice(0, 8)}</td>
          <td><QuotationStatusBadge status={item.status} /></td>
          <td>{formatDateTime(item.validUntil)}</td>
          <td className="bill-money">{formatVnd(item.totalAmount)}</td>
          <td className="ops-cell-actions"><Button size="sm" variant="quiet" onClick={() => { setOverride(null); setParams({ quotation: item.id }); }} aria-label={`Mở báo giá ${item.quotationNumber}`}>{item.status === "Draft" ? "Phát hành" : "Xem"}</Button></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={6}><EmptyState icon={FileText} title="Chưa có báo giá" description="Báo giá xuất hiện khi tổ chức tạo từ công trình của họ." /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) { setOverride(null); setParams({ quotation: null }); } }} title="Chi tiết báo giá" description="Số liệu là bản chụp do hệ thống trả." className="bill-wide-drawer">
      {selectedId && detail.loading && !current && <SkeletonRows rows={4} label="Đang tải báo giá…" />}
      {selectedId && detail.error !== undefined && !current && <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{billingErrorText(detail.error)}</Alert>}
      {current && <div className="ops-stack">
        <QuotationSnapshot quotation={current.data} organizationName={orgName[current.data.organizationId]} />
        {current.data.status === "Draft" && <IssueForm key={current.etag ?? current.data.revision} accessToken={accessToken} quotation={current.data} etag={current.etag} onIssued={(next) => { setOverride(next); list.reload(); }} onStale={() => { setOverride(null); detail.reload(); }} />}
        {current.data.status === "Issued" && <Alert tone="info" title="Đang chờ tổ chức chấp nhận">PlatformAdmin không chấp nhận hay thanh toán thay tổ chức.</Alert>}
      </div>}
    </Drawer>
  </div>;
}

/** Payment inspection: payments have no admin list endpoint, so look one up by the checkout id from support/logs. */
export function PaymentsSection({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const [checkoutId, setCheckoutId] = useState("");
  const [lookup, setLookup] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const checkout = useAsyncData(`commerce:checkout:${lookup}`, (signal) => billingApi.getCheckout(accessToken, lookup as string, signal), Boolean(lookup));
  const paymentId = checkout.data?.paymentRequestId ?? "";
  const payment = useAsyncData(`commerce:payment:${paymentId}`, (signal) => billingApi.getPayment(accessToken, paymentId, signal), Boolean(paymentId));
  const quote = useAsyncData(`commerce:payment-quote:${checkout.data?.quotationId ?? ""}`, async (signal) => {
    const result = await billingApi.getQuotation(accessToken, checkout.data!.quotationId, signal);
    setNames(Object.fromEntries(result.data.items.map((line) => [line.buildingId, line.buildingName])));
    return result;
  }, Boolean(checkout.data?.quotationId));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = checkoutId.trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(value)) { setError("Nhập mã checkout dạng GUID (36 ký tự)."); return; }
    setError(""); setLookup(value);
  };

  const reconcile = async () => {
    if (!lookup || reconciling) return;
    setReconciling(true);
    try {
      await billingApi.reconcile(accessToken, lookup);
      toast.notify({ tone: "success", title: "Đã yêu cầu đối soát", description: "Hệ thống xếp hàng thử lại; không đổi số tiền hay chữ ký. Kiểm tra lại trạng thái sau ít phút." });
      checkout.reload(); payment.reload();
    } catch (cause) { toast.notify({ tone: "danger", title: "Không gửi được yêu cầu đối soát", description: billingErrorText(cause) }); }
    finally { setReconciling(false); }
  };

  return <div className="ops-stack">
    <Alert tone="info" title="Chưa có danh sách thanh toán">BE chưa có endpoint liệt kê thanh toán cho PlatformAdmin. Tra cứu từng giao dịch bằng mã checkout (từ tổ chức, nhật ký hoặc hỗ trợ).</Alert>
    <form onSubmit={submit} noValidate className="ops-toolbar" aria-label="Tra cứu thanh toán">
      <Field label="Mã checkout" error={error} className="ops-toolbar-grow">{(p) => <Input {...p} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={checkoutId} onChange={(event) => setCheckoutId(event.target.value)} />}</Field>
      <Button type="submit" style={{ alignSelf: error ? "center" : "end" }}><Search size={16} aria-hidden="true" />Tra cứu</Button>
    </form>
    {checkout.loading && !checkout.data && <SkeletonRows rows={3} label="Đang tra cứu…" />}
    {checkout.error !== undefined && <Alert tone="danger" title="Không tra cứu được checkout">{billingErrorText(checkout.error)}</Alert>}
    {checkout.data && <Panel title={`Checkout · đơn ${checkout.data.orderCode}`} description={`Báo giá ${quote.data?.data.quotationNumber ?? checkout.data.quotationId}`} actions={<Button variant="secondary" size="sm" onClick={() => void reconcile()} disabled={reconciling}><Wrench size={14} aria-hidden="true" />{reconciling ? "Đang gửi…" : "Yêu cầu đối soát"}</Button>} bodyClassName="ops-stack">
      <div className="bill-stats">
        <div className="ops-stat"><span>Số tiền theo báo giá</span><strong>{formatVnd(checkout.data.amount)}</strong></div>
        <div className="ops-stat"><span>Trạng thái checkout</span><strong>{checkout.data.checkoutStatus}</strong>{checkout.data.errorCode && <small>Mã lỗi: {checkout.data.errorCode}</small>}</div>
        <div className="ops-stat"><span>Hết hạn liên kết</span><strong>{formatDateTime(checkout.data.expiresAt)}</strong></div>
      </div>
      {!paymentId && <Alert tone="warning" title="Chưa có bản ghi thanh toán">Liên kết PayOS chưa được ghi nhận nên chưa có trạng thái thanh toán hay kích hoạt.</Alert>}
      {payment.error !== undefined && <Alert tone="danger" title="Không đọc được thanh toán" action={<Button size="sm" variant="secondary" className="mt-3" onClick={payment.reload}>Thử lại</Button>}>{billingErrorText(payment.error)}</Alert>}
      {payment.data && <PaymentStatusView payment={payment.data} buildingNames={names} />}
    </Panel>}
  </div>;
}

const requestStatus: Record<string, string> = { New: "Mới gửi", Contacted: "Đã liên hệ", Quoted: "Đã báo giá", Closed: "Đã đóng" };

export function EnterpriseAdminSection({ accessToken }: { accessToken: string }) {
  const { page, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const list = useAsyncData(`commerce:enterprise:${page}`, (signal) => billingApi.listEnterpriseRequests(accessToken, page, PAGE_SIZE, "admin", signal));
  const organizations = useAsyncData("commerce:orgs", () => organizationsApi.list(accessToken, { page: 1, pageSize: 100 }));
  const orgName = useMemo(() => Object.fromEntries((organizations.data?.items ?? []).map((item) => [item.id, item.name])), [organizations.data]);
  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;
  return <div className="ops-stack">
    <Alert tone="warning" title="Chờ BE: xử lý yêu cầu liên hệ">
      Hiện chỉ đọc được danh sách. BE chưa có API đổi trạng thái hay chuyển yêu cầu thành báo giá, nên chưa xử lý được tại đây. Theo dõi tại <a href={BILLING_V7_ISSUE} target="_blank" rel="noreferrer" style={{ color: "var(--ember)" }}>BE #56</a>.
    </Alert>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    <Table className="bill-table" caption="Yêu cầu báo giá số lượng lớn">
      <thead><tr><th>Tổ chức</th><th>Nhu cầu</th><th>Liên hệ</th><th>Trạng thái</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={4} label="Đang tải yêu cầu…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td className="bill-wrap">{orgName[item.organizationId] ?? item.organizationId.slice(0, 8)}<span className="ops-cell-sub">{formatDateTime(item.createdAt)}</span></td>
          <td>{item.requestedBuildingCount} công trình{item.requestedDurationMonths ? ` · ${item.requestedDurationMonths} tháng` : ""}{item.notes && <span className="ops-cell-sub bill-wrap">{item.notes}</span>}</td>
          <td className="bill-wrap">{item.contactName}<span className="ops-cell-sub">{item.contactEmail}{item.contactPhone ? ` · ${item.contactPhone}` : ""}</span></td>
          <td><StatusBadge tone={item.status === "New" ? "info" : "neutral"}>{requestStatus[item.status] ?? item.status}</StatusBadge></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={Mail} title="Chưa có yêu cầu liên hệ" description="Yêu cầu của tổ chức cần số lượng lớn sẽ hiện ở đây." /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}
  </div>;
}
