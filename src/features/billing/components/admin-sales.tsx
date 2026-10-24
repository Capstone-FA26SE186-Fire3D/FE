"use client";

import { Eye, FileText, RefreshCw, Send } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { ChartCard } from "@/components/charts/chart-card";
import { RankedBars } from "@/components/charts/ranked-bars";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea, type FieldControlProps } from "@/components/ui/field";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { organizationsApi } from "@/features/organizations/api";
import { billingApi } from "../api";
import { billingErrorText, isStatus } from "../errors";
import { formatDateTime, formatNumber, formatVnd, isoToLocalInput, localInputToIso } from "../format";
import type { IssuePeriodInput, IssueQuotationInput, QuotaPolicy, Quotation, WithEtag } from "../types";
import { CheckoutHistory, purposeLabel } from "./payment-states";
import { QuotationCancel } from "./quotation-cancel";
import { actionLabel, QuotationSnapshot, QuotationStatusBadge } from "./quotation-snapshot";
import "../billing.css";

const PAGE_SIZE = 20;
/** Start of the 30-day window, read when a request runs (not during render). */
const since30 = () => new Date(Date.now() - 30 * 86_400_000).toISOString();
const REVENUE_SAMPLE = 100;

type LineForm = { startsAt: string; learnerLimit: string; oneTimePrice: string; additionalQuotaUnits: string; aiPolicyVersionId: string };
type TopUpForm = { policyVersionId: string; quotaUnits: string; amount: string; startsAt: string; endsAt: string };

const emptyLine: LineForm = { startsAt: "", learnerLimit: "", oneTimePrice: "", additionalQuotaUnits: "", aiPolicyVersionId: "" };
const isWhole = (value: string) => /^\d+$/.test(value.trim());

function policyLabel(policy: QuotaPolicy) {
  return `${policy.quotaUnit} · ${policy.id.slice(0, 8)}`;
}

/**
 * Admin issue: explicit tax, terms and a future expiry freeze the snapshot. Building lines need their fixed UTC
 * service start (New; Renewal may continue the committed period); Upgrade lines need effective time, the new
 * learner limit and the one-time fee; a top-up needs the policy, quota units, amount and interval. Totals shown
 * afterwards are the BE's; the form never computes a price.
 */
function IssueForm({ accessToken, quotation, etag, onIssued, onStale }: { accessToken: string; quotation: Quotation; etag: string | null; onIssued: (next: WithEtag<Quotation>) => void; onStale: () => void }) {
  const toast = useToast();
  const lock = useRef(false);
  const isTopUp = quotation.purpose === "AIQuotaTopUp";
  const policies = useAsyncData("commerce:policies:issue", (signal) => billingApi.listQuotaPolicies(accessToken, 1, 100, signal));
  const policyOptions = (policies.data?.items ?? []).map((policy) => ({ value: policy.id, label: policyLabel(policy) }));

  const [tax, setTax] = useState("0");
  const [terms, setTerms] = useState("");
  const [validUntil, setValidUntil] = useState(() => isoToLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()));
  const [lines, setLines] = useState<Record<string, LineForm>>({});
  const [topUp, setTopUp] = useState<TopUpForm>({ policyVersionId: "", quotaUnits: quotation.topUp?.requestedQuotaUnits != null ? String(quotation.topUp.requestedQuotaUnits) : "", amount: "", startsAt: "", endsAt: "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const line = (id: string): LineForm => lines[id] ?? emptyLine;
  const setLine = (id: string, patch: Partial<LineForm>) => setLines((state) => ({ ...state, [id]: { ...(state[id] ?? emptyLine), ...patch } }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lock.current) return;
    const found: Record<string, string> = {};
    if (!/^\d+$/.test(tax.trim())) found.taxAmount = "Thuế là số nguyên VND không âm (nhập 0 nếu không có).";
    if (!terms.trim() || terms.trim().length > 10000) found.terms = "Nhập điều khoản (1–10.000 ký tự).";
    const iso = localInputToIso(validUntil);
    if (!iso || new Date(iso) <= new Date()) found.validUntil = "Chọn thời hạn chấp nhận trong tương lai.";

    const input: IssueQuotationInput = { taxAmount: Number(tax), terms: terms.trim(), validUntil: iso as string };
    if (isTopUp) {
      const startsAt = localInputToIso(topUp.startsAt);
      const endsAt = localInputToIso(topUp.endsAt);
      if (!topUp.policyVersionId) found.topUpPolicy = "Chọn phiên bản chính sách quota.";
      if (!isWhole(topUp.quotaUnits) || Number(topUp.quotaUnits) < 1) found.topUpUnits = "Số lượng quota là số nguyên lớn hơn 0.";
      if (!isWhole(topUp.amount) || Number(topUp.amount) < 1) found.topUpAmount = "Số tiền là số nguyên VND lớn hơn 0.";
      if (!startsAt) found.topUpStart = "Chọn thời điểm bắt đầu hiệu lực quota.";
      if (!endsAt || (startsAt && new Date(endsAt) <= new Date(startsAt))) found.topUpEnd = "Thời điểm kết thúc phải sau thời điểm bắt đầu.";
      if (!Object.keys(found).length) input.topUp = { policyVersionId: topUp.policyVersionId, quotaUnits: Number(topUp.quotaUnits), amount: Number(topUp.amount), startsAt: startsAt as string, endsAt: endsAt as string };
    } else {
      const items: IssuePeriodInput[] = [];
      for (const item of quotation.items) {
        const form = line(item.id);
        const startsAt = form.startsAt ? localInputToIso(form.startsAt) : null;
        const entry: IssuePeriodInput = { quotationItemId: item.id };
        if (item.purchaseAction === "Upgrade") {
          if (!startsAt) found[`${item.id}:startsAt`] = "Chọn thời điểm nâng cấp có hiệu lực.";
          if (!isWhole(form.learnerLimit) || Number(form.learnerLimit) < 1) found[`${item.id}:learnerLimit`] = "Nhập số học viên mới (lớn hơn mức hiện tại).";
          if (!isWhole(form.oneTimePrice) || Number(form.oneTimePrice) < 1) found[`${item.id}:oneTimePrice`] = "Nhập phí nâng cấp một lần (VND, lớn hơn 0).";
          if (form.additionalQuotaUnits.trim() && !isWhole(form.additionalQuotaUnits)) found[`${item.id}:additionalQuotaUnits`] = "Quota thêm là số nguyên không âm hoặc để trống.";
          if (form.additionalQuotaUnits.trim() && Number(form.additionalQuotaUnits) > 0 && !form.aiPolicyVersionId) found[`${item.id}:aiPolicyVersionId`] = "Quota thêm cần chọn phiên bản chính sách.";
          entry.startsAt = startsAt;
          entry.learnerLimit = Number(form.learnerLimit);
          entry.oneTimePrice = Number(form.oneTimePrice);
          if (form.additionalQuotaUnits.trim() && Number(form.additionalQuotaUnits) > 0) { entry.additionalQuotaUnits = Number(form.additionalQuotaUnits); entry.aiPolicyVersionId = form.aiPolicyVersionId; }
        } else {
          if (item.purchaseAction === "New" && !startsAt) found[`${item.id}:startsAt`] = "Mua mới cần ngày bắt đầu dịch vụ trong tương lai.";
          if (startsAt) entry.startsAt = startsAt;
        }
        items.push(entry);
      }
      input.items = items;
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    lock.current = true; setSaving(true); setError(null);
    try {
      const next = await billingApi.issueQuotation(accessToken, quotation.id, input, etag ?? "");
      toast.notify({ tone: "success", title: "Đã phát hành báo giá", description: `Tổng thanh toán ${formatVnd(next.data.totalAmount)} theo bản chụp của hệ thống.` });
      onIssued(next);
    } catch (cause) {
      setError({ message: billingErrorText(cause), details: cause instanceof ApiError ? cause.fieldErrors.map((item) => item.message) : [] });
      if (isStatus(cause, 412)) onStale();
    } finally { lock.current = false; setSaving(false); }
  };

  const policyPick = (props: FieldControlProps, label: string, value: string, onChange: (value: string) => void) => <Combobox {...props} aria-label={label} value={value} onChange={onChange} options={policyOptions} placeholder="Chọn phiên bản chính sách" searchPlaceholder="Tìm theo đơn vị hoặc mã" groupLabel="Phiên bản" loading={policies.loading && !policies.data} />;

  return <form onSubmit={submit} noValidate className="ops-stack" aria-label="Phát hành báo giá">
    <p className="ops-field-label" style={{ margin: 0 }}>Phát hành báo giá</p>
    <p className="bill-muted">Hệ thống tính lại giá, giảm giá và chốt bản chụp khi phát hành. Kỳ dịch vụ là mốc UTC cố định, không chồng nhau; thuế và điều khoản do bạn nhập rõ ràng.</p>
    {policies.error !== undefined && <Alert tone="warning" title="Chưa đọc được chính sách quota" action={<Button size="sm" variant="secondary" className="mt-3" type="button" onClick={policies.reload}>Thử lại</Button>}>{billingErrorText(policies.error)}</Alert>}

    {isTopUp ? <fieldset className="ops-fieldset"><legend>Top-up quota AI</legend>
      <p className="bill-muted">Tổ chức yêu cầu {quotation.topUp?.requestedQuotaUnits != null ? formatNumber(quotation.topUp.requestedQuotaUnits) : "không nêu số lượng"}. Top-up không đổi dịch vụ công trình; chính sách phải phủ trọn khoảng hiệu lực.</p>
      <div className="ops-form-grid">
        <Field label="Chính sách quota" required error={errors.topUpPolicy}>{(p) => policyPick(p, "Chính sách quota", topUp.policyVersionId, (value) => setTopUp({ ...topUp, policyVersionId: value }))}</Field>
        <Field label="Số lượng quota cấp" required error={errors.topUpUnits}>{(p) => <Input {...p} inputMode="numeric" value={topUp.quotaUnits} onChange={(event) => setTopUp({ ...topUp, quotaUnits: event.target.value })} />}</Field>
        <Field label="Số tiền (VND)" required error={errors.topUpAmount}>{(p) => <Input {...p} inputMode="numeric" value={topUp.amount} onChange={(event) => setTopUp({ ...topUp, amount: event.target.value })} />}</Field>
        <Field label="Hiệu lực từ" required error={errors.topUpStart} hint="Không trước hạn thanh toán.">{(p) => <Input {...p} type="datetime-local" value={topUp.startsAt} onChange={(event) => setTopUp({ ...topUp, startsAt: event.target.value })} />}</Field>
        <Field label="Hiệu lực đến" required error={errors.topUpEnd}>{(p) => <Input {...p} type="datetime-local" value={topUp.endsAt} onChange={(event) => setTopUp({ ...topUp, endsAt: event.target.value })} />}</Field>
      </div>
    </fieldset> : quotation.items.map((item) => {
      const form = line(item.id);
      const upgrade = item.purchaseAction === "Upgrade";
      return <fieldset key={item.id} className="ops-fieldset" data-testid="issue-line"><legend>{item.buildingName || "Công trình"} · {actionLabel[item.purchaseAction] ?? item.purchaseAction}</legend>
        <p className="bill-muted">{item.packageName} · {item.durationMonths} tháng{upgrade && item.upgradePreviousLearnerLimit != null ? ` · hiện ${formatNumber(item.upgradePreviousLearnerLimit)} học viên` : ""}</p>
        <div className="ops-form-grid">
          <Field label={upgrade ? "Hiệu lực từ" : "Bắt đầu dịch vụ"} required={item.purchaseAction !== "Renewal"} error={errors[`${item.id}:startsAt`]} hint={upgrade ? "Trong tương lai, không trước hạn thanh toán, trước khi kỳ kết thúc." : item.purchaseAction === "Renewal" ? "Để trống nếu nối tiếp kỳ đang cam kết; kỳ đã hết cần ngày bắt đầu mới." : "Giờ địa phương, lưu dưới dạng UTC."}>{(p) => <Input {...p} type="datetime-local" value={form.startsAt} onChange={(event) => setLine(item.id, { startsAt: event.target.value })} />}</Field>
          {upgrade && <>
            <Field label="Học viên sau nâng cấp" required error={errors[`${item.id}:learnerLimit`]}>{(p) => <Input {...p} inputMode="numeric" value={form.learnerLimit} onChange={(event) => setLine(item.id, { learnerLimit: event.target.value })} />}</Field>
            <Field label="Phí nâng cấp một lần (VND)" required error={errors[`${item.id}:oneTimePrice`]} hint="Admin ấn định, không prorata từ giá tháng; giảm giá không áp dụng.">{(p) => <Input {...p} inputMode="numeric" value={form.oneTimePrice} onChange={(event) => setLine(item.id, { oneTimePrice: event.target.value })} />}</Field>
            <Field label="Quota AI cấp thêm" error={errors[`${item.id}:additionalQuotaUnits`]} hint="Tùy chọn; để trống nếu không kèm.">{(p) => <Input {...p} inputMode="numeric" value={form.additionalQuotaUnits} onChange={(event) => setLine(item.id, { additionalQuotaUnits: event.target.value })} />}</Field>
            <Field label="Chính sách cho quota thêm" error={errors[`${item.id}:aiPolicyVersionId`]}>{(p) => policyPick(p, "Chính sách cho quota thêm", form.aiPolicyVersionId, (value) => setLine(item.id, { aiPolicyVersionId: value }))}</Field>
          </>}
        </div>
      </fieldset>;
    })}

    <fieldset className="ops-fieldset"><legend>Giá và điều khoản</legend>
      <div className="ops-form-grid">
        <Field label="Thuế (VND)" required error={errors.taxAmount}>{(p) => <Input {...p} inputMode="numeric" value={tax} onChange={(event) => setTax(event.target.value)} />}</Field>
        <Field label="Hạn chấp nhận" required error={errors.validUntil} hint="Giờ địa phương, lưu dưới dạng UTC; không muộn hơn ngày bắt đầu sớm nhất.">{(p) => <Input {...p} type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />}</Field>
        <Field label="Điều khoản" required className="ops-span-all" error={errors.terms}>{(p) => <Textarea {...p} maxLength={10000} value={terms} onChange={(event) => setTerms(event.target.value)} />}</Field>
      </div>
    </fieldset>
    {error && <Alert tone="danger" title="Chưa phát hành được">{error.message}{error.details.length > 0 && <>{" "}{error.details.join(" ")}</>}</Alert>}
    <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button type="submit" disabled={saving}><Send size={16} aria-hidden="true" />{saving ? "Đang phát hành…" : "Phát hành báo giá"}</Button></div>
  </form>;
}

/**
 * "Doanh thu theo mục đích" (Figma 53:1540): paid payment requests of the last 30 days grouped by the quotation purpose
 * (`purpose`, `amount` as the ledger returns them). The BE has no revenue-by-purpose report, so the sum covers at most
 * the newest {REVENUE_SAMPLE} paid requests and the footer says when the window holds more.
 */
function RevenueByPurpose({ accessToken }: { accessToken: string }) {
  const paid = useAsyncData("commerce:paid30:sample", (signal) => billingApi.listLedger(accessToken, "requests", { status: "Paid", from: since30(), page: 1, pageSize: REVENUE_SAMPLE }, signal));
  const rows = useMemo(() => {
    const sums = new Map<string, { amount: number; count: number }>();
    for (const item of paid.data?.items ?? []) {
      const key = String(item.purpose ?? "BuildingService");
      const entry = sums.get(key) ?? { amount: 0, count: 0 };
      entry.amount += item.amount;
      entry.count += 1;
      sums.set(key, entry);
    }
    return Array.from(sums, ([purpose, entry]) => ({ key: purpose, label: purposeLabel(purpose), value: entry.amount, hint: `${formatNumber(entry.count)} giao dịch` })).sort((a, b) => b.value - a.value);
  }, [paid.data]);
  const total = paid.data?.totalCount ?? 0;
  const sampled = paid.data?.items.length ?? 0;
  return <ChartCard title="Doanh thu theo mục đích" description="30 ngày gần nhất · yêu cầu thanh toán đã nhận tiền (webhook hợp lệ)" height={150} loading={paid.loading && !paid.data} empty={!paid.loading && (paid.error !== undefined || rows.length === 0)} emptyText={paid.error !== undefined ? "Chưa đọc được sổ thanh toán" : "Chưa có khoản đã nhận tiền trong 30 ngày"} data-testid="revenue-purpose-chart"
    footer={total > sampled ? `Tính trên ${formatNumber(sampled)} giao dịch mới nhất trong ${formatNumber(total)} đã nhận tiền.` : undefined}
    table={<table className="ops-table"><caption className="ops-sr-only">Doanh thu theo mục đích</caption><thead><tr><th>Mục đích</th><th>Số tiền</th><th>Giao dịch</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><td>{row.label}</td><td>{formatVnd(row.value)}</td><td>{row.hint}</td></tr>)}</tbody></table>}>
    <RankedBars rows={rows} format={formatVnd} color="var(--success)" label="Doanh thu theo mục đích" />
  </ChartCard>;
}

/** Quotations of every organization (Figma "Thương mại · Báo giá"): a row opens the drawer where a Draft is issued or an unpaid one cancelled. */
export function QuotationsSection({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const selectedId = get("quotation");
  const list = useAsyncData(`commerce:quotes:${page}`, (signal) => billingApi.listQuotations(accessToken, page, PAGE_SIZE, signal));
  const organizations = useAsyncData("commerce:orgs", () => organizationsApi.list(accessToken, { page: 1, pageSize: 100 }));
  const detail = useAsyncData(`commerce:quote:${selectedId}`, (signal) => billingApi.getQuotation(accessToken, selectedId, signal), Boolean(selectedId), { keepPrevious: false });
  const checkouts = useAsyncData(`commerce:quote-checkouts:${selectedId}:${detail.data?.data.revision ?? 0}`, (signal) => billingApi.listQuotationCheckouts(accessToken, selectedId, 1, 20, signal), Boolean(selectedId) && Boolean(detail.data) && detail.data?.data.status !== "Draft", { keepPrevious: false });
  const [override, setOverride] = useState<WithEtag<Quotation> | null>(null);
  const current = override && override.data.id === selectedId ? override : detail.data ?? null;
  const orgName = useMemo(() => Object.fromEntries((organizations.data?.items ?? []).map((item) => [item.id, item.name])), [organizations.data]);
  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;
  const open = (id: string) => { setOverride(null); setParams({ quotation: id }); };

  const summarize = (quotation: Quotation) => (quotation.purpose === "AIQuotaTopUp" ? "Top-up quota AI" : `${quotation.items.length} công trình${quotation.items.some((line) => line.purchaseAction === "Upgrade") ? " · nâng cấp" : ""}`);

  const columns: DataColumn<Quotation>[] = [
    { key: "number", header: "Báo giá", primary: true, render: (item) => <CellTitle title={item.quotationNumber} sub={summarize(item)} /> },
    { key: "organization", header: "Tổ chức", width: 200, render: (item) => orgName[item.organizationId] ?? item.organizationId.slice(0, 8) },
    { key: "status", header: "Trạng thái", width: 170, render: (item) => <QuotationStatusBadge status={item.status} /> },
    { key: "validUntil", header: "Hiệu lực đến", width: 180, hideBelow: 1000, render: (item) => formatDateTime(item.validUntil) },
    { key: "total", header: "Tổng thanh toán", width: 170, align: "right", render: (item) => <CellTitle title={formatVnd(item.totalAmount)} sub={item.taxAmount === null ? "ước tính" : undefined} /> },
  ];

  return <div className="ops-stack">
    <div className="bill-charts"><RevenueByPurpose accessToken={accessToken} /></div>

    <DataTable<Quotation>
      caption="Báo giá của mọi tổ chức"
      data-testid="admin-quotations-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={(item) => open(item.id)}
      rowTone={(item) => (item.status === "Cancelled" || item.status === "Expired" ? "muted" : undefined)}
      rowMenu={(item) => [
        { label: "Xem chi tiết", icon: Eye, onSelect: () => open(item.id) },
        ...(item.status === "Draft" ? [{ label: "Phát hành báo giá", icon: Send, onSelect: () => open(item.id), hint: "Nhập thuế, điều khoản và kỳ dịch vụ", separator: true }] : []),
      ]}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <p className="bill-muted ops-toolbar-grow" style={{ margin: 0 }}>Phát hành báo giá nháp để tổ chức chấp nhận và thanh toán; hủy báo giá chưa thanh toán khi cần.</p>
        <Button variant="quiet" onClick={list.reload} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
      </>}
      empty={<EmptyState icon={FileText} title="Chưa có báo giá" description="Báo giá xuất hiện khi tổ chức tạo từ công trình của họ, yêu cầu top-up, hoặc khi bạn tạo từ yêu cầu doanh nghiệp." />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className="bill-hint">Bấm hàng để mở báo giá; bản nháp phát hành ngay trong ngăn chi tiết.</p>

    <Drawer open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) { setOverride(null); setParams({ quotation: null }); } }} size="lg" data-testid="quotation-drawer" title="Chi tiết báo giá" description="Số liệu là bản chụp do hệ thống trả."
      eyebrow={current ? <><QuotationStatusBadge status={current.data.status} /><StatusBadge tone="neutral">{current.data.quotationNumber}</StatusBadge></> : undefined}>
      {selectedId && detail.loading && !current && <SkeletonDetail rows={6} label="Đang tải báo giá…" />}
      {selectedId && detail.error !== undefined && !current && <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{billingErrorText(detail.error)}</Alert>}
      {current && <div className="ops-stack">
        <QuotationSnapshot quotation={current.data} organizationName={orgName[current.data.organizationId]} />
        {current.data.status === "Draft" && <IssueForm key={current.etag ?? current.data.revision} accessToken={accessToken} quotation={current.data} etag={current.etag} onIssued={(next) => { setOverride(next); list.reload(); }} onStale={() => { setOverride(null); detail.reload(); }} />}
        {current.data.status === "Issued" && <Alert tone="info" title="Đang chờ tổ chức chấp nhận">PlatformAdmin không chấp nhận hay thanh toán thay tổ chức.</Alert>}
        {checkouts.error !== undefined && <Alert tone="danger" title="Không tải được lịch sử thanh toán" action={<Button size="sm" variant="secondary" className="mt-3" onClick={checkouts.reload}>Thử lại</Button>}>{billingErrorText(checkouts.error)}</Alert>}
        <CheckoutHistory rows={checkouts.data?.items ?? []} />
        {(checkouts.data?.items ?? []).some((row) => row.paymentStatus === "Paid") && <StatusBadge tone="success">Đã có tiền: không hủy được báo giá này</StatusBadge>}
        <QuotationCancel accessToken={accessToken} scope="admin" quotation={current.data} etag={current.etag} onChanged={(next) => { setOverride(next); list.reload(); }} onStale={() => { setOverride(null); detail.reload(); }} />
      </div>}
    </Drawer>
  </div>;
}
