"use client";

import { Building2, CheckCircle2, CircleAlert, FileText, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberPop } from "@/components/ui/number-pop";
import { Panel } from "@/components/ui/panel";
import { SkeletonDetail, SkeletonKpis } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "@/features/buildings/api";
import { billingApi } from "../api";
import { summarizeEntitlements, EXPIRY_REMINDER_DAYS } from "../entitlements";
import { billingErrorText } from "../errors";
import { formatDate, formatDateTime, formatVnd } from "../format";
import type { Entitlement, Quotation, WithEtag } from "../types";
import { CheckoutPanel } from "./checkout-panel";
import { QuotationCreateModal, type CreateMode } from "./quotation-create-modal";
import { QuotationSnapshot, QuotationStatusBadge } from "./quotation-snapshot";
import { ServiceCapacity } from "./service-capacity";
import "../billing.css";

const entitlementStatus: Record<string, string> = { Active: "Đang hoạt động", Trial: "Dùng thử", Expired: "Hết hạn", Revoked: "Đã thu hồi", Suspended: "Tạm ngưng" };

function Check({ ok, children }: { ok: boolean; children: string }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return <li data-ok={ok}><Icon size={16} aria-hidden="true" /><span>{children}<span className="ops-sr-only">{ok ? " (đạt)" : " (chưa đạt)"}</span></span></li>;
}

const periodColumns: DataColumn<Entitlement>[] = [
  { key: "period", header: "Kỳ dịch vụ", primary: true, render: (item) => <CellTitle title={`${formatDate(item.startsAt)} – ${formatDate(item.endsAt)}`} sub={item.paymentTransactionId ? "Đã thanh toán" : "Không qua thanh toán (dùng thử/cấp tay)"} /> },
  { key: "status", header: "Trạng thái", width: 160, render: (item) => entitlementStatus[item.status] ?? item.status },
  { key: "effective", header: "Hiệu lực hiện tại", width: 170, render: (item) => <StatusBadge tone={item.isEffective ? "success" : "neutral"}>{item.isEffective ? "Đang hiệu lực" : "Không hiệu lực"}</StatusBadge> },
];

/**
 * "Dịch vụ" tab of one Building (Figma 47:2379 / 54:10145): three KPI tiles, the current package card with Mua / Gia hạn /
 * Nâng cấp / top-up opening the quotation modal, learner capacity, and the Building's quotations as a DataTable whose
 * rows open the quotation drawer (accept, PayOS checkout, per-line provisioning). Props stay `{ buildingId }`.
 */
export function BuildingServicesTab({ buildingId }: { buildingId: string }) {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const pathname = usePathname();
  const search = useSearchParams();

  const enabled = ready && Boolean(accessToken) && (user?.role === 1 || user?.role === 0);
  const canPurchase = user?.role === 1;
  const token = accessToken as string;

  const building = useAsyncData(`billing:building:${buildingId}`, () => buildingsApi.get(token, buildingId), enabled);
  const entitlements = useAsyncData(`billing:entitlements:${buildingId}`, (signal) => billingApi.listEntitlements(token, { buildingId, pageSize: 50 }, signal), enabled);
  const quotations = useAsyncData(`billing:quotations:${buildingId}`, (signal) => billingApi.listQuotations(token, 1, 50, signal), enabled);

  const [create, setCreate] = useState<{ open: boolean; mode: CreateMode }>({ open: false, mode: "service" });
  const [override, setOverride] = useState<WithEtag<Quotation> | null>(null);
  const [settled, setSettled] = useState(0);

  const selectedId = get("quotation");
  const paymentId = get("payment");
  const selected = useAsyncData(`billing:quotation:${selectedId}`, (signal) => billingApi.getQuotation(token, selectedId, signal), enabled && Boolean(selectedId), { keepPrevious: false });
  const current: WithEtag<Quotation> | null = override && override.data.id === selectedId ? override : selected.data ?? null;

  const summary = useMemo(() => summarizeEntitlements(entitlements.data?.items ?? []), [entitlements.data]);
  const mine = useMemo(() => (quotations.data?.items ?? []).filter((item) => item.items.some((line) => line.buildingId === buildingId)), [quotations.data, buildingId]);

  const returnTo = useMemo(() => {
    const next = new URLSearchParams(search.toString());
    next.delete("payment");
    next.delete("quotation");
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, search]);

  const reloadAll = useCallback(() => {
    entitlements.reload();
    quotations.reload();
    setSettled((value) => value + 1);
  }, [entitlements, quotations]);

  const hasName = Boolean(building.data?.name?.trim());
  const hasAddress = Boolean(building.data?.location?.address?.trim());
  const isActiveBuilding = building.data?.isActive !== false;
  const readyToBuy = canPurchase && hasName && hasAddress && isActiveBuilding;

  const openQuotation = (id: string) => {
    setOverride(null);
    setParams({ quotation: id, payment: null }, "replace");
  };
  const closeQuotation = () => { setOverride(null); setParams({ quotation: null, payment: null }, "replace"); };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!enabled) return <Alert tone="danger" title="Không có quyền truy cập">Tab này dành cho tài khoản tổ chức.</Alert>;

  const stateBadge = {
    effective: <StatusBadge tone="success">Đang hiệu lực</StatusBadge>,
    expiring: <StatusBadge tone="warning">Sắp hết hạn</StatusBadge>,
    expired: <StatusBadge tone="danger">Đã hết hạn</StatusBadge>,
    upcoming: <StatusBadge tone="info">Chưa đến kỳ</StatusBadge>,
    none: <StatusBadge tone="neutral">Chưa có dịch vụ</StatusBadge>,
  }[summary.state];
  const stateText = { effective: "Đang hiệu lực", expiring: "Sắp hết hạn", expired: "Đã hết hạn", upcoming: "Chưa đến kỳ", none: "Chưa có dịch vụ" }[summary.state];
  const buyLabel = summary.purchaseAction === "Renewal" ? "Gia hạn kỳ mới" : "Mua dịch vụ";
  const daysLeft = summary.current && summary.daysLeft !== null ? Math.max(summary.daysLeft, 0) : null;

  const quotationColumns: DataColumn<Quotation>[] = [
    { key: "number", header: "Mã đơn", primary: true, render: (item) => <CellTitle title={<span className="bill-mono">{item.quotationNumber}</span>} sub={`${item.items.some((line) => line.purchaseAction === "Upgrade") ? "Nâng cấp · " : ""}${item.items.length} công trình`} /> },
    { key: "content", header: "Nội dung", width: 160, hideBelow: 900, render: (item) => item.purpose === "AIQuotaTopUp" ? "Top-up quota AI" : "Công trình" },
    { key: "amount", header: "Số tiền", width: 150, align: "right", render: (item) => <span className="bill-money">{formatVnd(item.totalAmount)}</span> },
    { key: "status", header: "Trạng thái", width: 210, render: (item) => <QuotationStatusBadge status={item.status} /> },
    { key: "valid", header: "Hiệu lực đến", width: 170, hideBelow: 1100, render: (item) => formatDateTime(item.validUntil) },
  ];

  return <div className="ops-stack bill-building" data-testid="building-services">
    {entitlements.error !== undefined && <Alert tone="danger" title="Không tải được dịch vụ của công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={entitlements.reload}>Thử lại</Button>}>{billingErrorText(entitlements.error)}</Alert>}
    {entitlements.loading && !entitlements.data ? <SkeletonKpis count={3} /> : entitlements.data && <div className="bill-kpis" role="group" aria-label="Tình trạng dịch vụ">
      <div className="ops-kpi" data-testid="kpi-state"><span className="ops-kpi-label">Trạng thái</span><div className="ops-kpi-row"><strong className="ops-kpi-value bill-kpi-text">{stateText}</strong>{stateBadge}</div><span className="ops-kpi-hint">Máy chủ xác định theo kỳ dịch vụ (UTC)</span></div>
      <div className="ops-kpi" data-testid="kpi-period"><span className="ops-kpi-label">Kỳ hiện tại</span><div className="ops-kpi-row"><strong className="ops-kpi-value bill-kpi-text">{summary.current ? `${formatDate(summary.current.startsAt)} – ${formatDate(summary.current.endsAt)}` : "—"}</strong></div><span className="ops-kpi-hint">{summary.current ? "Kỳ đang hiệu lực" : "Không có kỳ đang hiệu lực"}</span></div>
      <div className="ops-kpi" data-testid="kpi-days"><span className="ops-kpi-label">Còn lại</span><div className="ops-kpi-row"><strong className="ops-kpi-value">{daysLeft === null ? "—" : <><NumberPop value={daysLeft} /> ngày</>}</strong></div><span className="ops-kpi-hint">{summary.current ? `Hết hạn ${formatDate(summary.current.endsAt)}` : summary.latest ? `Kỳ gần nhất kết thúc ${formatDate(summary.latest.endsAt)}` : "Chưa mở kỳ dịch vụ"}</span></div>
    </div>}
    {summary.state === "expiring" && <Alert tone="warning" title={`Dịch vụ hết hạn sau ${Math.max(summary.daysLeft ?? 0, 0)} ngày`} action={canPurchase ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => setCreate({ open: true, mode: "service" })}>Gia hạn ngay</Button> : undefined}>Nhắc trước {EXPIRY_REMINDER_DAYS} ngày khi kỳ sắp kết thúc. Gia hạn mở kỳ mới (suất học viên tính lại); nâng cấp giữ kỳ hiện tại.</Alert>}
    {summary.state === "expired" && <Alert tone="danger" title="Dịch vụ đã hết hạn" action={canPurchase ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => setCreate({ open: true, mode: "service" })}>Gia hạn dịch vụ</Button> : undefined}>Kỳ gần nhất kết thúc {formatDate(summary.latest?.endsAt)}. Học viên vẫn xem được trạng thái nhưng không bắt đầu phiên học mới cho tới khi gia hạn.</Alert>}

    <Panel title="Gói dịch vụ hiện có" description="Phí game + hạn mức học viên + quota AI. Giá, giảm giá, kỳ dịch vụ, học viên và quota do máy chủ tính ở báo giá." actions={<Button size="sm" variant="quiet" onClick={reloadAll} disabled={entitlements.loading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>} bodyClassName="ops-stack">
      {!canPurchase && <Alert tone="info" title="Chỉ xem">PlatformAdmin không mua dịch vụ thay tổ chức. Dùng khu Thương mại để phát hành và đối soát.</Alert>}
      {summary.state === "none" && entitlements.data && <EmptyState icon={Building2} title="Công trình chưa có dịch vụ" description="Mua gói 6 hoặc 12 tháng để học viên có thể bắt đầu phiên học. Chọn gói trong hộp thoại báo giá." />}
      {building.loading && !building.data && <SkeletonDetail rows={3} />}
      {building.error !== undefined && <Alert tone="danger" title="Không tải được thông tin công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={building.reload}>Thử lại</Button>}>{billingErrorText(building.error)}</Alert>}
      {building.data && <ul className="bill-checks" aria-label="Điều kiện trước khi mua">
        <Check ok={hasName}>Công trình có tên</Check>
        <Check ok={hasAddress}>Công trình có địa chỉ (bắt buộc để báo giá và thanh toán)</Check>
        <Check ok={isActiveBuilding}>Công trình đang hoạt động</Check>
      </ul>}
      {building.data && (!hasName || !hasAddress) && <Alert tone="warning" title="Cần bổ sung thông tin công trình trước khi thanh toán">Báo giá lưu lại tên và địa chỉ công trình tại thời điểm phát hành. <Link href={`${routes.workspaceBuildings}/${buildingId}`}>Mở thông tin công trình</Link> để cập nhật.</Alert>}
      <div className="ops-actions" data-testid="purchase-actions">
        <Button onClick={() => setCreate({ open: true, mode: "service" })} disabled={!readyToBuy}><FileText size={16} aria-hidden="true" />{buyLabel}</Button>
        <Button variant="secondary" onClick={() => setCreate({ open: true, mode: "upgrade" })} disabled={!readyToBuy || summary.state === "none" || summary.state === "expired"}>Nâng cấp học viên</Button>
        <Button variant="secondary" onClick={() => setCreate({ open: true, mode: "topup" })} disabled={!canPurchase}><Sparkles size={16} aria-hidden="true" />Mua thêm quota AI</Button>
      </div>
      {entitlements.data && entitlements.data.items.length > 0 && <DataTable caption="Các kỳ dịch vụ của công trình" columns={periodColumns} rows={entitlements.data.items} rowKey={(item) => item.id} empty={null} className="bill-periods" />}
      <p className="bill-dim" style={{ margin: 0 }}>Mua nhiều công trình cùng lúc hoặc số lượng lớn? <Link href={`${routes.workspaceBilling}?tab=quotes`}>Mở Dịch vụ & thanh toán</Link>. Quota AI dùng chung cả tổ chức: <Link href={`${routes.workspaceBilling}?tab=ai`}>xem số dư</Link>.</p>
    </Panel>

    <Panel title="Học viên và suất" description="Học viên tối đa hiệu lực (kể cả nâng cấp) và số suất đã dùng trong kỳ. Chỉ lần bắt đầu online đầu tiên của mỗi học viên tính một suất." bodyClassName="ops-stack">
      <ServiceCapacity accessToken={token} buildingId={buildingId} refreshKey={settled} />
    </Panel>

    <div className="ops-stack">
      {quotations.error !== undefined && <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={quotations.reload}>Thử lại</Button>}>{billingErrorText(quotations.error)}</Alert>}
      <DataTable
        caption="Báo giá của công trình"
        data-testid="building-quotations"
        columns={quotationColumns}
        rows={mine}
        rowKey={(item) => item.id}
        loading={quotations.loading && !quotations.data}
        onRowClick={(item) => openQuotation(item.id)}
        empty={<EmptyState icon={FileText} title="Chưa có báo giá cho công trình này" description="Tạo báo giá ở gói dịch vụ bên trên. Sau khi PlatformAdmin phát hành, bạn chấp nhận và thanh toán tại đây." />}
      />
      <p className="bill-dim" style={{ margin: "-6px 0 0" }}>Bấm một hàng để xem báo giá và thanh toán trong ngăn bên phải.</p>
    </div>

    <Drawer open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) closeQuotation(); }} size="xl" title="Chi tiết báo giá" description="Số tiền, kỳ và điều khoản là bản chụp do hệ thống phát hành." eyebrow={current ? <><span className="bill-mono">{current.data.quotationNumber}</span><QuotationStatusBadge status={current.data.status} /></> : undefined} data-testid="quotation-drawer">
      {selectedId && selected.loading && !current && <SkeletonDetail rows={6} />}
      {selectedId && selected.error !== undefined && !current && <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={selected.reload}>Thử lại</Button>}>{billingErrorText(selected.error)}</Alert>}
      {current && <div className="ops-stack" data-testid="selected-quotation">
        <QuotationSnapshot quotation={current.data} />
        <CheckoutPanel
          key={current.data.id}
          accessToken={token}
          quotation={current.data}
          etag={current.etag}
          canPurchase={canPurchase}
          returnTo={returnTo}
          resumePaymentId={paymentId || null}
          onQuotationChange={(next) => { setOverride(next); quotations.reload(); }}
          onReload={() => { setOverride(null); selected.reload(); quotations.reload(); }}
          onSettled={reloadAll}
        />
      </div>}
    </Drawer>

    {canPurchase && <QuotationCreateModal
      open={create.open}
      onOpenChange={(open) => setCreate((state) => ({ ...state, open }))}
      accessToken={token}
      mode={create.mode}
      onModeChange={(mode) => setCreate((state) => ({ ...state, mode }))}
      lockedBuildingId={buildingId}
      onCreated={(result) => { openQuotation(result.data.id); setOverride(result); quotations.reload(); }}
    />}
  </div>;
}
