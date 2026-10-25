"use client";

import { CalendarClock, RefreshCw, Users } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { billingApi } from "../api";
import { billingErrorText } from "../errors";
import { daysUntil, formatDate, formatDateTime, formatNumber } from "../format";
import type { ServiceEntitlementView } from "../types";
import "../billing.css";

const statusLabel: Record<string, string> = { Active: "Đang hoạt động", Trial: "Dùng thử", Expired: "Hết hạn", Revoked: "Đã thu hồi", Suspended: "Tạm ngưng" };

/** Seat usage as the BE reports it: distinct Trainees with a first online start in this period. */
function Seats({ view }: { view: ServiceEntitlementView }) {
  const limit = view.effectiveLearnerLimit;
  if (limit === null) return <p className="bill-muted">Kỳ này không đặt giới hạn học viên (dịch vụ theo gói cũ). Đã dùng {formatNumber(view.seatsUsed)} suất.</p>;
  const percent = limit > 0 ? Math.min(100, Math.round((view.seatsUsed / limit) * 100)) : 100;
  const full = view.seatsRemaining !== null && view.seatsRemaining <= 0;
  return <div className="ops-stack" style={{ gap: 8 }}>
    <div className="bill-row"><span className="ops-field-label"><Users size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Suất học viên của kỳ</span><span data-testid="seat-count" className="bill-dim">Đã dùng {formatNumber(view.seatsUsed)} / {formatNumber(limit)} · còn {formatNumber(view.seatsRemaining)}</span></div>
    <div className="bill-meter" role="img" aria-label={`Đã dùng ${view.seatsUsed} trên ${limit} suất`}><span style={{ width: `${percent}%` }} /></div>
    {full && <Alert tone="warning" title="Đã hết suất học viên">Học viên mới không thể bắt đầu học trực tuyến ở công trình này; học viên đã được tính vẫn tiếp tục nếu dịch vụ còn hiệu lực. Nâng cấp để tăng số học viên (kỳ và suất đã dùng được giữ).</Alert>}
  </div>;
}

function PeriodCard({ view, kind }: { view: ServiceEntitlementView; kind: "current" | "upcoming" }) {
  const days = daysUntil(view.endsAt);
  return <div className="bill-period" data-testid={`period-${kind}`}>
    <div className="bill-row">
      <div><p className="ops-field-label" style={{ margin: 0 }}>{kind === "current" ? "Kỳ hiện tại" : "Kỳ sắp tới"}</p><strong>{formatDate(view.startsAt)} – {formatDate(view.endsAt)}</strong></div>
      <div className="ops-actions">
        <StatusBadge tone={view.isEffective ? "success" : "neutral"}>{view.isEffective ? "Đang hiệu lực" : kind === "upcoming" ? "Chưa đến kỳ" : "Không hiệu lực"}</StatusBadge>
        <StatusBadge tone="neutral">{statusLabel[view.status] ?? "Không rõ"}</StatusBadge>
      </div>
    </div>
    {kind === "current" && view.isEffective && days !== null && <p className="bill-dim" style={{ margin: 0 }}>Còn {Math.max(days, 0)} ngày</p>}
    <div className="bill-stats">
      <div className="ops-stat"><span>Học viên tối đa (hiệu lực)</span><strong>{view.effectiveLearnerLimit === null ? "Không giới hạn" : formatNumber(view.effectiveLearnerLimit)}</strong>{view.baseLearnerLimit !== view.effectiveLearnerLimit && <small>Gói gốc {formatNumber(view.baseLearnerLimit)}, đã nâng cấp</small>}</div>
      <div className="ops-stat"><span>Phiên bản sức chứa</span><strong>{view.capacityRevision}</strong></div>
    </div>
    {kind === "current" && <Seats view={view} />}
    {view.upgrades.length > 0 && <Table className="bill-table" caption="Lịch sử nâng cấp của kỳ">
      <thead><tr><th>Hiệu lực từ</th><th className="bill-money">Từ</th><th className="bill-money">Lên</th><th className="bill-money">Hạn mức AI kèm</th></tr></thead>
      <tbody>{view.upgrades.map((item) => <tr key={item.id}><td>{formatDateTime(item.effectiveFrom)}</td><td className="bill-money">{formatNumber(item.previousLearnerLimit)}</td><td className="bill-money">{formatNumber(item.learnerLimit)}</td><td className="bill-money">{formatNumber(item.additionalQuotaUnits)}</td></tr>)}</tbody>
    </Table>}
  </div>;
}

/**
 * Current and upcoming paid service of one Building from `GET /api/buildings/{id}/service-entitlement`:
 * effective learner limit (with upgrades), seats used/remaining and upgrade history. Renewal opens a new
 * period (new seat count); an upgrade keeps the period and the seats already used.
 */
export function ServiceCapacity({ accessToken, buildingId, refreshKey = 0, onLoaded }: {
  accessToken: string;
  buildingId: string;
  /** Bump to re-read (e.g. after a payment settled). */
  refreshKey?: number;
  onLoaded?: (value: { currentEntitlementId: string | null; effectiveLearnerLimit: number | null }) => void;
}) {
  const query = useAsyncData(`billing:service-entitlement:${buildingId}:${refreshKey}`, async (signal) => {
    const value = await billingApi.getBuildingServiceEntitlement(accessToken, buildingId, signal);
    onLoaded?.({ currentEntitlementId: value.current?.entitlementId ?? null, effectiveLearnerLimit: value.current?.effectiveLearnerLimit ?? null });
    return value;
  });
  const data = query.data;
  return <div className="ops-stack" data-testid="service-capacity">
    <div className="bill-row"><p className="bill-muted">Số liệu do hệ thống tính {data ? `lúc ${formatDateTime(data.asOf)}` : "khi tải"}.</p><Button size="sm" variant="quiet" onClick={query.reload} disabled={query.loading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button></div>
    {query.error !== undefined && <Alert tone="danger" title="Không tải được dịch vụ của công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={query.reload}>Thử lại</Button>}>{billingErrorText(query.error)}</Alert>}
    {query.loading && !data && <div role="status" aria-live="polite"><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Đang tải dịch vụ…</span><Skeleton style={{ height: 140 }} /></div>}
    {data && !data.current && data.upcoming.length === 0 && <EmptyState icon={CalendarClock} title="Công trình chưa có kỳ dịch vụ đã trả tiền" description="Tạo báo giá để mua gói đầu tiên. Dùng thử không có suất học viên." />}
    {data?.current && <PeriodCard view={data.current} kind="current" />}
    {data?.upcoming.map((view) => <PeriodCard key={view.entitlementId} view={view} kind="upcoming" />)}
  </div>;
}
