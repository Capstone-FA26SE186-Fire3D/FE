"use client";

import { Gauge, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { billingApi } from "../api";
import { billingErrorText } from "../errors";
import { formatDateTime, formatNumber, formatQuota } from "../format";
import type { AiQuotaUnitBalance } from "../types";
import { QuotationStatusBadge } from "./quotation-snapshot";
import "../billing.css";

const PAGE_SIZE = 10;

const sourceLabel: Record<string, string> = { BuildingService: "Gói công trình", Upgrade: "Nâng cấp", TopUp: "Top-up trả trước" };
const grantStatus: Record<string, { label: string; tone: Tone }> = { Scheduled: { label: "Chưa đến kỳ", tone: "info" }, Active: { label: "Đang hiệu lực", tone: "success" }, Expired: { label: "Đã hết hạn", tone: "neutral" } };
const usageStatus: Record<string, { label: string; tone: Tone }> = { Reserved: { label: "Đang giữ chỗ", tone: "info" }, Settled: { label: "Đã tính", tone: "success" }, Released: { label: "Đã hoàn lại", tone: "neutral" } };

const short = (id: string) => id.slice(0, 8);

function UnitBalance({ unit }: { unit: AiQuotaUnitBalance }) {
  const used = unit.reserved + unit.consumed;
  const percent = unit.granted > 0 ? Math.min(100, Math.round((used / unit.granted) * 100)) : 100;
  return <div className="ops-stack" data-testid="quota-unit" data-unit={unit.quotaUnit} data-available={unit.available}>
    <div className="bill-row"><span className="ops-field-label"><Gauge size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Đơn vị: {unit.quotaUnit}</span><span className="bill-dim">Đơn vị không quy đổi lẫn nhau</span></div>
    <div className="bill-stats">
      <div className="ops-stat"><span>Còn dùng được</span><strong data-testid="quota-available">{formatNumber(unit.available)}</strong><small>= đã cấp − giữ chỗ − đã dùng</small></div>
      <div className="ops-stat"><span>Đã cấp (còn hiệu lực)</span><strong>{formatNumber(unit.granted)}</strong></div>
      <div className="ops-stat"><span>Đang giữ chỗ</span><strong>{formatNumber(unit.reserved)}</strong></div>
      <div className="ops-stat"><span>Đã dùng</span><strong>{formatNumber(unit.consumed)}</strong></div>
      <div className="ops-stat"><span>Đã hết hạn chưa dùng</span><strong>{formatNumber(unit.expired)}</strong><small>Không cộng dồn sang kỳ sau</small></div>
      <div className="ops-stat"><span>Sắp có hiệu lực</span><strong>{formatNumber(unit.scheduled)}</strong></div>
    </div>
    <div className="bill-meter" role="img" aria-label={`Đã dùng hoặc giữ chỗ ${used} trên ${unit.granted} ${unit.quotaUnit}`}><span style={{ width: `${percent}%` }} /></div>
  </div>;
}

/**
 * Prepaid pooled AI quota: balance per unit, grants (service/upgrade/top-up, each with its own expiry) and usage
 * allocations. An organization reads its own tenant; PlatformAdmin passes `organizationId`. When a unit is exhausted
 * (or there is no quota) paid AI requests are blocked: the view says so and offers a prepaid top-up. No overage.
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

  return <div className="ops-stack" data-testid="ai-quota">
    <div className="bill-row">
      <p className="bill-muted">Quota AI trả trước dùng chung cho cả tổ chức: gói công trình, nâng cấp và top-up đều cộng vào cùng một quỹ, mỗi lần cấp có hạn riêng. {balance.data && `Số liệu tại ${formatDateTime(balance.data.asOf)}.`}</p>
      <div className="ops-actions"><Button variant="quiet" onClick={reloadAll} disabled={balance.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>{topUpButton}</div>
    </div>

    {balance.error !== undefined && <Alert tone="danger" title="Không tải được số dư quota AI" action={<Button size="sm" variant="secondary" className="mt-3" onClick={balance.reload}>Thử lại</Button>}>{billingErrorText(balance.error)}</Alert>}
    {balance.loading && !balance.data && <SkeletonRows rows={3} label="Đang tải số dư quota…" />}

    {blocked && <div data-testid="quota-exhausted"><Alert tone="warning" title={units.length === 0 ? "Chưa có quota AI" : "Quota AI đã hết"}
      action={onTopUp ? <Button size="sm" variant="secondary" className="mt-3" onClick={onTopUp}>Mua thêm quota (top-up)</Button> : undefined}>
      {units.length === 0
        ? "Tổ chức chưa được cấp quota AI. Yêu cầu AI tính phí bị chặn cho tới khi có quota từ gói công trình hoặc top-up đã thanh toán."
        : `Đơn vị ${exhausted.map((unit) => unit.quotaUnit).join(", ")} không còn quota. Yêu cầu AI tính phí mới bị chặn trước khi gọi dịch vụ AI; hệ thống không tính vượt mức và không ghi nợ.`}
      {onTopUp ? " Mua top-up, thanh toán xong và chờ kích hoạt rồi mới dùng tiếp." : ""}
    </Alert></div>}

    {units.map((unit) => <UnitBalance key={unit.quotaUnit} unit={unit} />)}

    <Panel title="Lịch sử cấp quota" description="Mỗi dòng là một lần cấp có kỳ riêng (gói công trình, nâng cấp hoặc top-up trả trước)." bodyClassName="ops-stack">
      {grants.error !== undefined && <Alert tone="danger" title="Không tải được lịch sử cấp quota" action={<Button size="sm" variant="secondary" className="mt-3" onClick={grants.reload}>Thử lại</Button>}>{billingErrorText(grants.error)}</Alert>}
      <Table className="bill-table" caption="Lịch sử cấp quota AI">
        <thead><tr><th>Nguồn</th><th className="bill-money">Đã cấp</th><th className="bill-money">Giữ chỗ</th><th className="bill-money">Đã dùng</th><th className="bill-money">Còn lại</th><th>Hiệu lực</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {grants.loading && !grants.data && <TableMessage colSpan={7}><SkeletonRows rows={3} label="Đang tải…" /></TableMessage>}
          {(grants.data?.items ?? []).map((grant) => <tr key={grant.id} data-testid="quota-grant" data-source={grant.sourceKind}>
            <td>{sourceLabel[grant.sourceKind] ?? grant.sourceKind}<span className="ops-cell-sub">{grant.buildingId ? `Công trình ${short(grant.buildingId)}` : "Cấp cho tổ chức"} · thanh toán {short(grant.paymentTransactionId)}</span></td>
            <td className="bill-money">{formatQuota(grant.quotaUnits, grant.quotaUnit)}</td>
            <td className="bill-money">{formatNumber(grant.reserved)}</td>
            <td className="bill-money">{formatNumber(grant.consumed)}</td>
            <td className="bill-money">{formatNumber(grant.available)}</td>
            <td>{formatDateTime(grant.startsAt)}<span className="ops-cell-sub">đến {formatDateTime(grant.endsAt)}</span></td>
            <td><StatusBadge tone={(grantStatus[grant.status] ?? { tone: "neutral" as Tone }).tone}>{grantStatus[grant.status]?.label ?? grant.status}</StatusBadge></td>
          </tr>)}
          {grants.data && grants.data.items.length === 0 && <TableMessage colSpan={7}><EmptyState icon={Sparkles} title="Chưa có lần cấp quota nào" description="Quota xuất hiện sau khi thanh toán gói công trình (có kèm quota) hoặc top-up được kích hoạt." /></TableMessage>}
        </tbody>
      </Table>
      {(grants.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={grantPage} pageSize={PAGE_SIZE} totalCount={grants.data?.totalCount ?? 0} onPageChange={setGrantPage} disabled={grants.loading} />}
    </Panel>

    {!organizationId && <Panel title="Báo giá top-up" description="Các yêu cầu mua thêm quota trả trước của tổ chức." bodyClassName="ops-stack">
      {topUps.error !== undefined && <Alert tone="danger" title="Không tải được báo giá top-up" action={<Button size="sm" variant="secondary" className="mt-3" onClick={topUps.reload}>Thử lại</Button>}>{billingErrorText(topUps.error)}</Alert>}
      {topUps.data && topUps.data.length === 0 && <p className="bill-muted">Chưa có báo giá top-up. Bấm “Mua thêm quota (top-up)” để gửi yêu cầu.</p>}
      <ul className="bill-list">{(topUps.data ?? []).map((item) => <li key={item.id} data-testid="topup-quotation"><div className="bill-row">
        <span className="bill-wrap"><strong>{item.quotationNumber}</strong><span className="bill-dim"> · yêu cầu {item.topUp?.requestedQuotaUnits != null ? formatNumber(item.topUp.requestedQuotaUnits) : "không nêu"}</span></span>
        <div className="ops-actions"><QuotationStatusBadge status={item.status} />{onOpenQuotation && <Button size="sm" variant="quiet" onClick={() => onOpenQuotation(item.id)} aria-label={`Xem báo giá ${item.quotationNumber}`}>Xem</Button>}</div>
      </div></li>)}</ul>
    </Panel>}

    <Panel title="Lịch sử sử dụng" description="Mỗi yêu cầu AI giữ chỗ trước, rồi tính theo mức dùng thực tế hoặc hoàn lại phần chưa dùng." bodyClassName="ops-stack">
      {usage.error !== undefined && <Alert tone="danger" title="Không tải được lịch sử sử dụng" action={<Button size="sm" variant="secondary" className="mt-3" onClick={usage.reload}>Thử lại</Button>}>{billingErrorText(usage.error)}</Alert>}
      <Table className="bill-table" caption="Lịch sử sử dụng quota AI">
        <thead><tr><th>Yêu cầu</th><th className="bill-money">Giữ chỗ</th><th className="bill-money">Đã tính</th><th>Trạng thái</th><th>Thời điểm</th></tr></thead>
        <tbody>
          {usage.loading && !usage.data && <TableMessage colSpan={5}><SkeletonRows rows={3} label="Đang tải…" /></TableMessage>}
          {(usage.data?.items ?? []).map((entry) => <tr key={entry.allocationId} data-testid="quota-usage">
            <td><span className="ops-cell-primary">{short(entry.requestId)}<span className="ops-cell-sub">đợt cấp {short(entry.grantId)}</span></span></td>
            <td className="bill-money">{formatQuota(entry.reservedUnits, entry.quotaUnit)}</td>
            <td className="bill-money">{entry.consumedUnits === null ? "—" : formatNumber(entry.consumedUnits)}</td>
            <td><StatusBadge tone={(usageStatus[entry.status] ?? { tone: "neutral" as Tone }).tone}>{usageStatus[entry.status]?.label ?? entry.status}</StatusBadge></td>
            <td>{formatDateTime(entry.settledAt ?? entry.createdAt)}</td>
          </tr>)}
          {usage.data && usage.data.items.length === 0 && <TableMessage colSpan={5}><EmptyState icon={Gauge} title="Chưa có lượt dùng AI" description="Mỗi yêu cầu AI tính phí sẽ hiện ở đây sau khi được giữ chỗ hoặc tính quota." /></TableMessage>}
        </tbody>
      </Table>
      {(usage.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={usagePage} pageSize={PAGE_SIZE} totalCount={usage.data?.totalCount ?? 0} onPageChange={setUsagePage} disabled={usage.loading} />}
    </Panel>
  </div>;
}
