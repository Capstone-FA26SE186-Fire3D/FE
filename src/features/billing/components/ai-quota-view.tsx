"use client";

import { Gauge, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberPop } from "@/components/ui/number-pop";
import { SkeletonKpis } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { billingApi } from "../api";
import { billingErrorText } from "../errors";
import { formatDateTime, formatNumber, formatQuota } from "../format";
import type { AiQuotaGrant, AiQuotaUnitBalance, AiUsageEntry, Quotation } from "../types";
import { QuotationStatusBadge } from "./quotation-snapshot";
import "../billing.css";

const PAGE_SIZE = 10;

const sourceLabel: Record<string, string> = { BuildingService: "Gói công trình", Upgrade: "Nâng cấp", TopUp: "Top-up trả trước" };
const grantStatus: Record<string, { label: string; tone: Tone }> = { Scheduled: { label: "Chưa đến kỳ", tone: "info" }, Active: { label: "Đang hiệu lực", tone: "success" }, Expired: { label: "Đã hết hạn", tone: "neutral" } };
const usageStatus: Record<string, { label: string; tone: Tone }> = { Reserved: { label: "Đang giữ chỗ", tone: "info" }, Settled: { label: "Đã tính", tone: "success" }, Released: { label: "Đã hoàn lại", tone: "neutral" } };

const short = (id: string) => id.slice(0, 8);

function Kpi({ label, value, hint, testId }: { label: string; value: number; hint?: string; testId?: string }) {
  return <div className="ops-kpi"><span className="ops-kpi-label">{label}</span><div className="ops-kpi-row"><strong className="ops-kpi-value" data-testid={testId}><NumberPop value={value} /></strong></div>{hint && <span className="ops-kpi-hint">{hint}</span>}</div>;
}

function UnitBalance({ unit }: { unit: AiQuotaUnitBalance }) {
  const used = unit.reserved + unit.consumed;
  const percent = unit.granted > 0 ? Math.min(100, Math.round((used / unit.granted) * 100)) : 100;
  return <section className="org-card ops-stack" data-testid="quota-unit" data-unit={unit.quotaUnit} data-available={unit.available} aria-label={`Quota đơn vị ${unit.quotaUnit}`}>
    <div className="bill-row"><span className="ops-field-label"><Gauge size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Đơn vị: {unit.quotaUnit}</span><span className="bill-dim">Đơn vị không quy đổi lẫn nhau</span></div>
    <div className="bill-kpis bill-kpis-6">
      <Kpi label="Còn dùng được" value={unit.available} hint="= đã cấp − giữ chỗ − đã dùng" testId="quota-available" />
      <Kpi label="Đã cấp (còn hiệu lực)" value={unit.granted} />
      <Kpi label="Đang giữ chỗ" value={unit.reserved} />
      <Kpi label="Đã dùng" value={unit.consumed} />
      <Kpi label="Đã hết hạn chưa dùng" value={unit.expired} hint="Không cộng dồn sang kỳ sau" />
      <Kpi label="Sắp có hiệu lực" value={unit.scheduled} />
    </div>
    <div className="bill-meter" role="img" aria-label={`Đã dùng hoặc giữ chỗ ${used} trên ${unit.granted} ${unit.quotaUnit}`}><span style={{ width: `${percent}%` }} /></div>
  </section>;
}

const grantColumns: DataColumn<AiQuotaGrant>[] = [
  { key: "source", header: "Nguồn", primary: true, render: (grant) => <span data-testid="quota-grant" data-source={grant.sourceKind} style={{ display: "block" }}><CellTitle title={sourceLabel[grant.sourceKind] ?? grant.sourceKind} sub={`${grant.buildingId ? `Công trình ${short(grant.buildingId)}` : "Cấp cho tổ chức"} · thanh toán ${short(grant.paymentTransactionId)}`} /></span> },
  { key: "granted", header: "Đã cấp", width: 130, align: "right", render: (grant) => <span className="bill-money">{formatQuota(grant.quotaUnits, grant.quotaUnit)}</span> },
  { key: "reserved", header: "Giữ chỗ", width: 100, align: "right", hideBelow: 1100, render: (grant) => <span className="bill-money">{formatNumber(grant.reserved)}</span> },
  { key: "consumed", header: "Đã dùng", width: 100, align: "right", hideBelow: 1100, render: (grant) => <span className="bill-money">{formatNumber(grant.consumed)}</span> },
  { key: "available", header: "Còn lại", width: 100, align: "right", render: (grant) => <span className="bill-money">{formatNumber(grant.available)}</span> },
  { key: "period", header: "Hiệu lực", width: 190, hideBelow: 900, render: (grant) => <CellTitle title={<span style={{ fontWeight: 400 }}>{formatDateTime(grant.startsAt)}</span>} sub={`đến ${formatDateTime(grant.endsAt)}`} /> },
  { key: "status", header: "Trạng thái", width: 140, render: (grant) => <StatusBadge tone={(grantStatus[grant.status] ?? { tone: "neutral" as Tone }).tone}>{grantStatus[grant.status]?.label ?? grant.status}</StatusBadge> },
];

const usageColumns: DataColumn<AiUsageEntry>[] = [
  { key: "request", header: "Yêu cầu", primary: true, render: (entry) => <CellTitle title={short(entry.requestId)} sub={`đợt cấp ${short(entry.grantId)}`} /> },
  { key: "reserved", header: "Giữ chỗ", width: 130, align: "right", render: (entry) => <span className="bill-money">{formatQuota(entry.reservedUnits, entry.quotaUnit)}</span> },
  { key: "consumed", header: "Đã tính", width: 110, align: "right", render: (entry) => <span className="bill-money">{entry.consumedUnits === null ? "—" : formatNumber(entry.consumedUnits)}</span> },
  { key: "status", header: "Trạng thái", width: 140, render: (entry) => <StatusBadge tone={(usageStatus[entry.status] ?? { tone: "neutral" as Tone }).tone}>{usageStatus[entry.status]?.label ?? entry.status}</StatusBadge> },
  { key: "time", header: "Thời điểm", width: 170, hideBelow: 900, render: (entry) => formatDateTime(entry.settledAt ?? entry.createdAt) },
];

/**
 * Prepaid pooled AI quota (Figma "Quota AI" tab): balance per unit as KPI tiles, grants (service/upgrade/top-up, each with
 * its own expiry) and usage allocations as DataTables. An organization reads its own tenant; PlatformAdmin passes
 * `organizationId`. When a unit is exhausted (or there is no quota) paid AI requests are blocked: the view says so and
 * offers a prepaid top-up. No overage.
 */
export function AiQuotaView({ accessToken, organizationId, onTopUp, onOpenQuotation, refreshKey = 0 }: {
  accessToken: string;
  organizationId?: string;
  /** Organization only: start a top-up quotation. */
  onTopUp?: () => void;
  onOpenQuotation?: (id: string) => void;
  refreshKey?: number;
}) {
  const scope = organizationId ?? "me";
  const [grantPage, setGrantPage] = useState(1);
  const [usagePage, setUsagePage] = useState(1);
  const balance = useAsyncData(`quota:balance:${scope}:${refreshKey}`, (signal) => billingApi.getAiQuota(accessToken, organizationId, signal));
  const grants = useAsyncData(`quota:grants:${scope}:${grantPage}:${refreshKey}`, (signal) => billingApi.listAiGrants(accessToken, organizationId, grantPage, PAGE_SIZE, signal));
  const usage = useAsyncData(`quota:usage:${scope}:${usagePage}:${refreshKey}`, (signal) => billingApi.listAiUsage(accessToken, organizationId, usagePage, PAGE_SIZE, signal));
  const topUps = useAsyncData(`quota:topups:${refreshKey}`, async (signal) => (await billingApi.listQuotations(accessToken, 1, 100, signal)).items.filter((item) => item.purpose === "AIQuotaTopUp"), !organizationId);

  const reloadAll = () => { balance.reload(); grants.reload(); usage.reload(); topUps.reload(); };
  const units = balance.data?.units ?? [];
  const exhausted = units.filter((unit) => unit.available <= 0);
  const blocked = balance.data !== undefined && (units.length === 0 || exhausted.length > 0);
  const topUpButton = onTopUp ? <Button onClick={onTopUp}><Plus size={16} aria-hidden="true" />Mua thêm quota (top-up)</Button> : undefined;

  const topUpColumns: DataColumn<Quotation>[] = [
    { key: "number", header: "Mã đơn", primary: true, render: (item) => <CellTitle title={<span className="bill-mono">{item.quotationNumber}</span>} sub={`Yêu cầu ${item.topUp?.requestedQuotaUnits != null ? formatNumber(item.topUp.requestedQuotaUnits) : "không nêu"}`} /> },
    { key: "granted", header: "Được cấp", width: 160, hideBelow: 900, render: (item) => item.topUp?.quotaUnits != null ? formatQuota(item.topUp.quotaUnits, item.topUp.quotaUnit) : "Chờ phát hành" },
    { key: "status", header: "Trạng thái", width: 210, render: (item) => <QuotationStatusBadge status={item.status} /> },
  ];

  return <div className="ops-stack" data-testid="ai-quota">
    <div className="bill-row">
      <p className="bill-muted">Quota AI trả trước dùng chung cho cả tổ chức: gói công trình, nâng cấp và top-up đều cộng vào cùng một quỹ, mỗi lần cấp có hạn riêng. {balance.data && `Số liệu tại ${formatDateTime(balance.data.asOf)}.`}</p>
      <div className="ops-actions"><Button variant="quiet" onClick={reloadAll} disabled={balance.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>{topUpButton}</div>
    </div>

    {balance.error !== undefined && <Alert tone="danger" title="Không tải được số dư quota AI" action={<Button size="sm" variant="secondary" className="mt-3" onClick={balance.reload}>Thử lại</Button>}>{billingErrorText(balance.error)}</Alert>}
    {balance.loading && !balance.data && <SkeletonKpis count={3} />}

    {blocked && <div data-testid="quota-exhausted"><Alert tone="warning" title={units.length === 0 ? "Chưa có quota AI" : "Quota AI đã hết"}
      action={onTopUp ? <Button size="sm" variant="secondary" className="mt-3" onClick={onTopUp}>Mua thêm quota (top-up)</Button> : undefined}>
      {units.length === 0
        ? "Tổ chức chưa được cấp quota AI. Yêu cầu AI tính phí bị chặn cho tới khi có quota từ gói công trình hoặc top-up đã thanh toán."
        : `Đơn vị ${exhausted.map((unit) => unit.quotaUnit).join(", ")} không còn quota. Yêu cầu AI tính phí mới bị chặn trước khi gọi dịch vụ AI; hệ thống không tính vượt mức và không ghi nợ.`}
      {onTopUp ? " Mua top-up, thanh toán xong và chờ kích hoạt rồi mới dùng tiếp." : ""}
    </Alert></div>}

    {units.map((unit) => <UnitBalance key={unit.quotaUnit} unit={unit} />)}

    <section className="ops-stack" aria-labelledby="quota-grants-title">
      <div><h2 id="quota-grants-title" className="org-card-title" style={{ margin: 0 }}>Lịch sử cấp quota</h2><p className="bill-dim" style={{ margin: "4px 0 0" }}>Mỗi dòng là một lần cấp có kỳ riêng (gói công trình, nâng cấp hoặc top-up trả trước).</p></div>
      {grants.error !== undefined && <Alert tone="danger" title="Không tải được lịch sử cấp quota" action={<Button size="sm" variant="secondary" className="mt-3" onClick={grants.reload}>Thử lại</Button>}>{billingErrorText(grants.error)}</Alert>}
      <DataTable caption="Lịch sử cấp quota AI" data-testid="quota-grants" columns={grantColumns} rows={grants.data?.items ?? []} rowKey={(grant) => grant.id} loading={grants.loading && !grants.data}
        empty={<EmptyState icon={Sparkles} title="Chưa có lần cấp quota nào" description="Quota xuất hiện sau khi thanh toán gói công trình (có kèm quota) hoặc top-up được kích hoạt." />}
        pagination={(grants.data?.totalCount ?? 0) > PAGE_SIZE ? { page: grantPage, pageSize: PAGE_SIZE, totalCount: grants.data?.totalCount ?? 0, onPageChange: setGrantPage } : undefined} />
    </section>

    {!organizationId && <section className="ops-stack" aria-labelledby="quota-topups-title">
      <div><h2 id="quota-topups-title" className="org-card-title" style={{ margin: 0 }}>Báo giá top-up</h2><p className="bill-dim" style={{ margin: "4px 0 0" }}>Các yêu cầu mua thêm quota trả trước của tổ chức. Bấm một hàng để mở báo giá.</p></div>
      {topUps.error !== undefined && <Alert tone="danger" title="Không tải được báo giá top-up" action={<Button size="sm" variant="secondary" className="mt-3" onClick={topUps.reload}>Thử lại</Button>}>{billingErrorText(topUps.error)}</Alert>}
      <DataTable caption="Báo giá top-up quota AI" data-testid="topup-quotations" columns={topUpColumns} rows={topUps.data ?? []} rowKey={(item) => item.id} loading={topUps.loading && !topUps.data} onRowClick={onOpenQuotation ? (item) => onOpenQuotation(item.id) : undefined}
        empty={<p className="bill-muted">Chưa có báo giá top-up. Bấm “Mua thêm quota (top-up)” để gửi yêu cầu.</p>} />
    </section>}

    <section className="ops-stack" aria-labelledby="quota-usage-title">
      <div><h2 id="quota-usage-title" className="org-card-title" style={{ margin: 0 }}>Lịch sử sử dụng</h2><p className="bill-dim" style={{ margin: "4px 0 0" }}>Mỗi yêu cầu AI giữ chỗ trước, rồi tính theo mức dùng thực tế hoặc hoàn lại phần chưa dùng.</p></div>
      {usage.error !== undefined && <Alert tone="danger" title="Không tải được lịch sử sử dụng" action={<Button size="sm" variant="secondary" className="mt-3" onClick={usage.reload}>Thử lại</Button>}>{billingErrorText(usage.error)}</Alert>}
      <DataTable caption="Lịch sử sử dụng quota AI" data-testid="quota-usage" columns={usageColumns} rows={usage.data?.items ?? []} rowKey={(entry) => entry.allocationId} loading={usage.loading && !usage.data}
        empty={<EmptyState icon={Gauge} title="Chưa có lượt dùng AI" description="Mỗi yêu cầu AI tính phí sẽ hiện ở đây sau khi được giữ chỗ hoặc tính quota." />}
        pagination={(usage.data?.totalCount ?? 0) > PAGE_SIZE ? { page: usagePage, pageSize: PAGE_SIZE, totalCount: usage.data?.totalCount ?? 0, onPageChange: setUsagePage } : undefined} />
    </section>
  </div>;
}
