"use client";

import { Building2, CheckCircle2, CircleAlert, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, Stat } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "@/features/buildings/api";
import { billingApi } from "../api";
import { summarizeEntitlements, EXPIRY_REMINDER_DAYS } from "../entitlements";
import { billingErrorText } from "../errors";
import { formatDate, formatDateTime, formatVnd } from "../format";
import type { Entitlement, Quotation, WithEtag } from "../types";
import { CheckoutPanel } from "./checkout-panel";
import { QuotationCreateDrawer, type CreateMode } from "./quotation-create-drawer";
import { QuotationSnapshot, QuotationStatusBadge } from "./quotation-snapshot";
import { ServiceCapacity } from "./service-capacity";
import "../billing.css";

const entitlementStatus: Record<string, string> = { Active: "Đang hoạt động", Trial: "Dùng thử", Expired: "Hết hạn", Revoked: "Đã thu hồi", Suspended: "Tạm ngưng" };

function Check({ ok, children }: { ok: boolean; children: string }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return <li data-ok={ok}><Icon size={16} aria-hidden="true" /><span>{children}<span className="sr-only-state" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{ok ? " (đạt)" : " (chưa đạt)"}</span></span></li>;
}

function EntitlementTable({ items }: { items: Entitlement[] }) {
  return <Table className="bill-table" caption="Các kỳ dịch vụ của công trình">
    <thead><tr><th>Kỳ dịch vụ</th><th>Trạng thái</th><th>Hiệu lực hiện tại</th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.id}>
      <td><span className="ops-cell-primary">{formatDate(item.startsAt)} – {formatDate(item.endsAt)}<span className="ops-cell-sub">{item.paymentTransactionId ? "Đã thanh toán" : "Không qua thanh toán (dùng thử/cấp tay)"}</span></span></td>
      <td>{entitlementStatus[item.status] ?? item.status}</td>
      <td><StatusBadge tone={item.isEffective ? "success" : "neutral"}>{item.isEffective ? "Đang hiệu lực" : "Không hiệu lực"}</StatusBadge></td>
    </tr>)}</tbody>
  </Table>;
}

/**
 * "Dịch vụ & thanh toán" for one Building: current and upcoming periods with learner capacity and seats, buying
 * (New/Renewal/Upgrade/AI top-up), quotation, accept, PayOS checkout and per-line provisioning.
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

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!enabled) return <Alert tone="danger" title="Không có quyền truy cập">Tab này dành cho tài khoản tổ chức.</Alert>;

  const stateBadge = {
    effective: <StatusBadge tone="success">Đang hiệu lực</StatusBadge>,
    expiring: <StatusBadge tone="warning">Sắp hết hạn</StatusBadge>,
    expired: <StatusBadge tone="danger">Đã hết hạn</StatusBadge>,
    upcoming: <StatusBadge tone="info">Chưa đến kỳ</StatusBadge>,
    none: <StatusBadge tone="neutral">Chưa có dịch vụ</StatusBadge>,
  }[summary.state];
  const buyLabel = summary.purchaseAction === "Renewal" ? "Gia hạn kỳ mới" : "Mua dịch vụ";

  return <div className="ops-stack" data-testid="building-services">
    <Panel title="Dịch vụ hiện có" description="Trạng thái do máy chủ xác định theo kỳ dịch vụ (UTC) của công trình này." actions={<Button size="sm" variant="quiet" onClick={reloadAll} disabled={entitlements.loading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>} bodyClassName="ops-stack">
      {entitlements.error !== undefined && <Alert tone="danger" title="Không tải được dịch vụ của công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={entitlements.reload}>Thử lại</Button>}>{billingErrorText(entitlements.error)}</Alert>}
      {entitlements.loading && !entitlements.data && <div role="status" aria-live="polite" className="ops-stack"><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Đang tải dịch vụ…</span><Skeleton style={{ height: 76 }} /><Skeleton style={{ height: 120 }} /></div>}
      {entitlements.data && <>
        <div className="bill-stats">
          <Stat label="Trạng thái" value={stateBadge} />
          <Stat label="Kỳ hiện tại" value={summary.current ? `${formatDate(summary.current.startsAt)} – ${formatDate(summary.current.endsAt)}` : "—"} hint={summary.current ? undefined : "Không có kỳ nào đang hiệu lực"} />
          <Stat label="Còn lại" value={summary.current && summary.daysLeft !== null ? `${Math.max(summary.daysLeft, 0)} ngày` : "—"} hint={summary.current ? `Hết hạn ${formatDate(summary.current.endsAt)}` : undefined} />
        </div>
        {summary.state === "expiring" && <Alert tone="warning" title={`Dịch vụ hết hạn sau ${Math.max(summary.daysLeft ?? 0, 0)} ngày`} action={canPurchase ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => setCreate({ open: true, mode: "service" })}>Gia hạn ngay</Button> : undefined}>Nhắc trước {EXPIRY_REMINDER_DAYS} ngày khi kỳ sắp kết thúc. Gia hạn mở kỳ mới (suất học viên tính lại); nâng cấp giữ kỳ hiện tại.</Alert>}
        {summary.state === "expired" && <Alert tone="danger" title="Dịch vụ đã hết hạn" action={canPurchase ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => setCreate({ open: true, mode: "service" })}>Gia hạn dịch vụ</Button> : undefined}>Kỳ gần nhất kết thúc {formatDate(summary.latest?.endsAt)}. Học viên vẫn xem được trạng thái nhưng không bắt đầu phiên học mới cho tới khi gia hạn.</Alert>}
        {summary.state === "none" && <EmptyState icon={Building2} title="Công trình chưa có dịch vụ" description="Mua gói 6 hoặc 12 tháng ở bước bên dưới để học viên có thể bắt đầu phiên học." />}
        {entitlements.data.items.length > 0 && <EntitlementTable items={entitlements.data.items} />}
      </>}
    </Panel>

    <Panel title="Học viên và suất" description="Học viên tối đa hiệu lực (kể cả nâng cấp) và số suất đã dùng trong kỳ. Chỉ lần bắt đầu online đầu tiên của mỗi học viên tính một suất." bodyClassName="ops-stack">
      <ServiceCapacity accessToken={token} buildingId={buildingId} refreshKey={settled} />
    </Panel>

    <Panel title="Mua, gia hạn hoặc nâng cấp" description="Tạo báo giá; tổng tiền, giảm giá, kỳ dịch vụ, học viên và quota do máy chủ tính ở báo giá." bodyClassName="ops-stack">
      {!canPurchase && <Alert tone="info" title="Chỉ xem">PlatformAdmin không mua dịch vụ thay tổ chức. Dùng khu Thương mại để phát hành và đối soát.</Alert>}
      {building.loading && !building.data && <Skeleton style={{ height: 96 }} />}
      {building.error !== undefined && <Alert tone="danger" title="Không tải được thông tin công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={building.reload}>Thử lại</Button>}>{billingErrorText(building.error)}</Alert>}
      {building.data && <ul className="bill-checks" aria-label="Điều kiện trước khi mua">
        <Check ok={hasName}>Công trình có tên</Check>
        <Check ok={hasAddress}>Công trình có địa chỉ (bắt buộc để báo giá và thanh toán)</Check>
        <Check ok={isActiveBuilding}>Công trình đang hoạt động</Check>
      </ul>}
      {building.data && (!hasName || !hasAddress) && <Alert tone="warning" title="Cần bổ sung thông tin công trình trước khi thanh toán">Báo giá lưu lại tên và địa chỉ công trình tại thời điểm phát hành. <Link href={`${routes.workspaceBuildings}/${buildingId}`} style={{ color: "var(--ember)" }}>Mở thông tin công trình</Link> để cập nhật.</Alert>}
      <div className="ops-actions" data-testid="purchase-actions">
        <Button onClick={() => setCreate({ open: true, mode: "service" })} disabled={!readyToBuy}><FileText size={16} aria-hidden="true" />{buyLabel}</Button>
        <Button variant="secondary" onClick={() => setCreate({ open: true, mode: "upgrade" })} disabled={!readyToBuy || summary.state === "none" || summary.state === "expired"}>Nâng cấp học viên</Button>
        <Button variant="secondary" onClick={() => setCreate({ open: true, mode: "topup" })} disabled={!canPurchase}>Mua thêm quota AI</Button>
      </div>
      <p className="bill-dim" style={{ margin: 0 }}>Mua nhiều công trình cùng lúc hoặc số lượng lớn? <Link href={`${routes.workspaceBilling}?tab=quotes`} style={{ color: "var(--ember)" }}>Mở Dịch vụ & thanh toán</Link>. Quota AI dùng chung cả tổ chức: <Link href={`${routes.workspaceBilling}?tab=ai`} style={{ color: "var(--ember)" }}>xem số dư</Link>.</p>
    </Panel>

    <Panel title="Báo giá và thanh toán" description="Các báo giá có công trình này. Chọn một báo giá để chấp nhận, thanh toán và theo dõi kích hoạt." bodyClassName="ops-stack">
      {quotations.error !== undefined && <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={quotations.reload}>Thử lại</Button>}>{billingErrorText(quotations.error)}</Alert>}
      {quotations.loading && !quotations.data && <Skeleton style={{ height: 90 }} />}
      {quotations.data && mine.length === 0 && <EmptyState icon={FileText} title="Chưa có báo giá cho công trình này" description="Tạo báo giá ở bước trên. Sau khi PlatformAdmin phát hành, bạn chấp nhận và thanh toán tại đây." />}
      {mine.length > 0 && <Table className="bill-table" caption="Báo giá của công trình">
        <thead><tr><th>Báo giá</th><th>Trạng thái</th><th>Hiệu lực đến</th><th className="bill-money">Tổng thanh toán</th><th aria-label="Thao tác" /></tr></thead>
        <tbody>{mine.map((item) => <tr key={item.id} aria-selected={item.id === selectedId}>
          <td><span className="ops-cell-primary bill-wrap">{item.quotationNumber}<span className="ops-cell-sub">{item.items.some((line) => line.purchaseAction === "Upgrade") ? "Nâng cấp · " : ""}{item.items.length} công trình</span></span></td>
          <td><QuotationStatusBadge status={item.status} /></td>
          <td>{formatDateTime(item.validUntil)}</td>
          <td className="bill-money">{formatVnd(item.totalAmount)}</td>
          <td className="ops-cell-actions"><Button size="sm" variant={item.id === selectedId ? "secondary" : "quiet"} onClick={() => openQuotation(item.id)} aria-label={`Xem báo giá ${item.quotationNumber}`}>Xem</Button></td>
        </tr>)}</tbody>
      </Table>}

      {selectedId && selected.loading && !current && <Skeleton style={{ height: 160 }} />}
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
    </Panel>

    {canPurchase && <QuotationCreateDrawer
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
