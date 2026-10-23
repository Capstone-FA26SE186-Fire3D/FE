"use client";

import { FileText, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "@/features/buildings/api";
import { billingApi } from "../api";
import { summarizeEntitlements } from "../entitlements";
import { billingErrorText } from "../errors";
import { formatDate, formatDateTime, formatNumber, formatVnd } from "../format";
import type { Entitlement, Quotation, WithEtag } from "../types";
import { AiQuotaView } from "./ai-quota-view";
import { CheckoutPanel } from "./checkout-panel";
import { EnterpriseSection } from "./enterprise-section";
import { NotificationsPanel, ReminderBanner } from "./notifications-panel";
import { QuotationCreateDrawer, type CreateMode } from "./quotation-create-drawer";
import { QuotationSnapshot, QuotationStatusBadge } from "./quotation-snapshot";
import { ServiceCapacity } from "./service-capacity";
import "../billing.css";

const PAGE_SIZE = 20;
const TABS = ["services", "quotes", "ai", "reminders", "enterprise"] as const;
type TabId = (typeof TABS)[number];

/** Figma "Quota AI trả trước": used of granted per quota unit, with a top-up action. The full ledger is the "Quota AI" tab. */
function QuotaSummary({ accessToken, refreshKey, onTopUp, onOpen }: { accessToken: string; refreshKey: number; onTopUp?: () => void; onOpen: () => void }) {
  const balance = useAsyncData(`quota:balance:me:${refreshKey}`, (signal) => billingApi.getAiQuota(accessToken, undefined, signal));
  const units = balance.data?.units ?? [];
  return <section className="org-card bill-quota-card" aria-labelledby="bill-quota-title">
    <div className="bill-row"><h2 id="bill-quota-title" className="org-card-title" style={{ margin: 0 }}>Quota AI trả trước</h2><Button size="sm" variant="quiet" onClick={onOpen}>Chi tiết</Button></div>
    <p className="bill-dim" style={{ margin: 0 }}>Gộp từ các gói công trình và top-up đã thanh toán. Hết quota thì chặn yêu cầu tính phí mới; không có nợ trả sau.</p>
    {balance.error !== undefined && <p className="bill-dim" role="alert" style={{ margin: 0 }}>{billingErrorText(balance.error)}</p>}
    {balance.loading && !balance.data && <SkeletonRows rows={2} label="Đang tải số dư quota…" />}
    {balance.data && units.length === 0 && <p className="bill-dim" style={{ margin: 0 }}>Tổ chức chưa có quota AI còn hiệu lực.</p>}
    {units.map((unit) => {
      const used = unit.reserved + unit.consumed;
      const percent = unit.granted > 0 ? Math.min(100, Math.round((used / unit.granted) * 100)) : 100;
      return <div key={unit.quotaUnit} className="ops-stack" style={{ gap: 6 }}>
        <div className="bill-row"><span>Đã dùng ({unit.quotaUnit})</span><strong>{formatNumber(used)} / {formatNumber(unit.granted)}</strong></div>
        <div className="bill-meter" role="img" aria-label={`Đã dùng hoặc giữ chỗ ${used} trên ${unit.granted} ${unit.quotaUnit}`}><span style={{ width: `${percent}%` }} /></div>
        <span className="bill-dim">Còn dùng được {formatNumber(unit.available)} {unit.quotaUnit}</span>
      </div>;
    })}
    {onTopUp && <div><Button onClick={onTopUp}>Nạp quota AI</Button></div>}
  </section>;
}

function summarizeQuotation(quotation: Quotation) {
  if (quotation.purpose === "AIQuotaTopUp") return "Top-up quota AI";
  const names = quotation.items.map((line) => line.buildingName || "Công trình");
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

const stateBadge = {
  effective: <StatusBadge tone="success">Đang hiệu lực</StatusBadge>,
  expiring: <StatusBadge tone="warning">Sắp hết hạn</StatusBadge>,
  expired: <StatusBadge tone="danger">Đã hết hạn</StatusBadge>,
  upcoming: <StatusBadge tone="info">Chưa đến kỳ</StatusBadge>,
  none: <StatusBadge tone="neutral">Chưa có dịch vụ</StatusBadge>,
};

/**
 * Organization-level "Dịch vụ & thanh toán": quotations (New/Renewal/Upgrade/AI top-up), service periods with learner
 * capacity and seats, prepaid AI quota, expiry reminders and bulk requests. Everything shown is the BE's snapshot.
 */
export function BillingWorkspace() {
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const pathname = usePathname();
  const search = useSearchParams();

  const tabParam = get("tab");
  const tab: TabId = (TABS as readonly string[]).includes(tabParam) ? (tabParam as TabId) : "services";
  const selectedId = get("quotation");
  const paymentId = get("payment");
  const serviceBuilding = get("service");

  const enabled = ready && Boolean(accessToken) && (user?.role === 1 || user?.role === 0);
  const canPurchase = user?.role === 1;
  const token = accessToken as string;

  const quotations = useAsyncData(`billing:quotes:${page}`, (signal) => billingApi.listQuotations(token, page, PAGE_SIZE, signal), enabled);
  const entitlements = useAsyncData("billing:entitlements:all", (signal) => billingApi.listEntitlements(token, { pageSize: 100 }, signal), enabled);
  const buildings = useAsyncData("billing:buildings", (signal) => buildingsApi.list(token, { isActive: true, page: 1, pageSize: 100 }, signal), enabled);
  const selected = useAsyncData(`billing:quotation:${selectedId}`, (signal) => billingApi.getQuotation(token, selectedId, signal), enabled && Boolean(selectedId), { keepPrevious: false });

  const [override, setOverride] = useState<WithEtag<Quotation> | null>(null);
  const current: WithEtag<Quotation> | null = override && override.data.id === selectedId ? override : selected.data ?? null;

  const [create, setCreate] = useState<{ open: boolean; mode: CreateMode; preselect: string[] }>({ open: false, mode: "service", preselect: [] });
  const [settled, setSettled] = useState(0);

  const buildingItems = useMemo(() => buildings.data?.items ?? [], [buildings.data]);
  const nameOf = useMemo(() => Object.fromEntries(buildingItems.map((item) => [item.id, item.name])), [buildingItems]);
  const entitlementsByBuilding = useMemo(() => {
    const map = new Map<string, Entitlement[]>();
    for (const item of entitlements.data?.items ?? []) map.set(item.buildingId, [...(map.get(item.buildingId) ?? []), item]);
    return map;
  }, [entitlements.data]);
  const serviceRows = useMemo(() => {
    const ids = new Set<string>([...buildingItems.map((item) => item.id), ...entitlementsByBuilding.keys()]);
    return [...ids].map((buildingId) => ({ buildingId, summary: summarizeEntitlements(entitlementsByBuilding.get(buildingId) ?? []) }));
  }, [buildingItems, entitlementsByBuilding]);

  const returnTo = useMemo(() => {
    const next = new URLSearchParams(search.toString());
    next.delete("payment");
    return next.toString() ? `${pathname}?${next.toString()}` : pathname;
  }, [pathname, search]);

  const openCreate = (mode: CreateMode, preselect: string[] = []) => setCreate({ open: true, mode, preselect });
  const reloadAll = () => { quotations.reload(); entitlements.reload(); setSettled((value) => value + 1); };
  const openQuotation = (id: string) => { setOverride(null); setParams({ tab: "quotes", quotation: id, payment: null }); };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!enabled) return <Alert tone="danger" title="Không có quyền truy cập">Khu này dành cho tài khoản tổ chức.</Alert>;

  const items = quotations.data?.items ?? [];
  const totalCount = quotations.data?.totalCount ?? 0;
  const noAccess = (error: unknown) => (error as { status?: number } | undefined)?.status === 403;

  return <div className="org">
    <PageHeader
      title="Dịch vụ và thanh toán"
      description="Gói công trình, trạng thái kích hoạt, quota AI trả trước và lịch sử thanh toán. Mua, gia hạn hoặc nâng cấp theo công trình; thanh toán qua PayOS."
      eyebrow="Quản lý" breadcrumbs={[{ label: "Dịch vụ & thanh toán" }]}
      actions={<><Button variant="quiet" size="icon" onClick={reloadAll} disabled={quotations.loading} aria-label="Tải lại" title="Tải lại"><RefreshCw size={16} aria-hidden="true" /></Button>{canPurchase && <><Button variant="secondary" onClick={() => openCreate("topup")}>Nạp quota AI</Button><Button onClick={() => openCreate("service")}><Plus size={16} aria-hidden="true" />Mua gói công trình</Button></>}</>}
    />

    {canPurchase && <ReminderBanner accessToken={token} refreshKey={settled} onOpen={() => setParams({ tab: "reminders", quotation: null, payment: null })} />}

    <Tabs value={tab} onValueChange={(value) => setParams({ tab: value === "services" ? null : value, quotation: null, payment: null, service: null, request: null })}>
      <TabsList aria-label="Dịch vụ và thanh toán">
        <TabsTrigger value="services">Dịch vụ theo công trình</TabsTrigger>
        <TabsTrigger value="quotes">Báo giá và thanh toán</TabsTrigger>
        <TabsTrigger value="ai">Quota AI</TabsTrigger>
        <TabsTrigger value="reminders">Nhắc gia hạn</TabsTrigger>
        <TabsTrigger value="enterprise">Số lượng lớn</TabsTrigger>
      </TabsList>

      <TabsContent value="quotes" style={{ marginTop: 16 }}>
        {quotations.error !== undefined && <Alert tone="danger" title={noAccess(quotations.error) ? "Không có quyền xem báo giá" : "Không tải được báo giá"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={quotations.reload}>Thử lại</Button>}>{billingErrorText(quotations.error)}</Alert>}
        <Table className="bill-table" caption="Danh sách báo giá">
          <thead><tr><th>Báo giá</th><th>Nội dung</th><th>Trạng thái</th><th>Hiệu lực đến</th><th className="bill-money">Tổng thanh toán</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
          <tbody>
            {quotations.loading && !quotations.data && <TableMessage colSpan={6}><SkeletonRows rows={5} label="Đang tải báo giá…" /></TableMessage>}
            {items.map((item) => <tr key={item.id}>
              <td><span className="ops-cell-primary bill-wrap">{item.quotationNumber}</span></td>
              <td className="bill-wrap">{summarizeQuotation(item)}<span className="ops-cell-sub">{item.purpose === "AIQuotaTopUp" ? "Quota AI trả trước" : item.items.some((line) => line.purchaseAction === "Upgrade") ? `Nâng cấp · ${item.items.length} công trình` : `${item.items.length} công trình`}</span></td>
              <td><QuotationStatusBadge status={item.status} /></td>
              <td>{formatDateTime(item.validUntil)}</td>
              <td className="bill-money">{formatVnd(item.totalAmount)}{item.taxAmount === null && <span className="ops-cell-sub">ước tính, chưa thuế</span>}</td>
              <td className="ops-cell-actions"><Button size="sm" variant="quiet" onClick={() => openQuotation(item.id)} aria-label={`Xem báo giá ${item.quotationNumber}`}>Xem</Button></td>
            </tr>)}
            {quotations.data && !items.length && <TableMessage colSpan={6}><EmptyState icon={FileText} title="Chưa có báo giá" description="Chọn một hoặc nhiều công trình và gói 6/12 tháng để tạo báo giá đầu tiên." action={canPurchase ? <Button onClick={() => openCreate("service")}><Plus size={16} aria-hidden="true" />Mua gói công trình</Button> : undefined} /></TableMessage>}
          </tbody>
        </Table>
        {totalCount > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={quotations.loading} />}
      </TabsContent>

      <TabsContent value="services" style={{ marginTop: 16 }}>
        {entitlements.error !== undefined && <Alert tone="danger" title="Không tải được dịch vụ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={entitlements.reload}>Thử lại</Button>}>{billingErrorText(entitlements.error)}</Alert>}
        {((entitlements.loading && !entitlements.data) || (buildings.loading && !buildings.data)) && <SkeletonRows rows={3} label="Đang tải dịch vụ…" />}
        <div className="org-cols org-cols-3 org-service-cards">
          {serviceRows.map(({ buildingId, summary }) => {
            const period = summary.current ?? summary.latest;
            const name = nameOf[buildingId] ?? `Công trình ${buildingId.slice(0, 8)}`;
            return <article key={buildingId} className="org-card org-service-card" data-testid="service-row">
              <div className="org-row" style={{ alignItems: "flex-start" }}><h3 className="org-service-name">{name}</h3>{stateBadge[summary.state]}</div>
              <div className="org-stack-sm">
                <p className="org-service-line">{period ? `${formatDate(period.startsAt)} – ${formatDate(period.endsAt)}` : "Chưa có kỳ dịch vụ"}</p>
                {summary.state === "expiring" && <p className="org-service-line">Còn {Math.max(summary.daysLeft ?? 0, 0)} ngày</p>}
                <p className="org-service-line">{period?.learnerLimit != null ? `Trainee: ${formatNumber(period.learnerLimit)} khác nhau/kỳ` : "Trainee: chưa đặt giới hạn"}</p>
                <p className="org-service-line">Quota AI: tính gộp ở cấp tổ chức</p>
              </div>
              <div className="ops-actions">
                <Button size="sm" variant="quiet" onClick={() => setParams({ service: buildingId })} aria-label={`Chi tiết dịch vụ ${name}`}>Chi tiết</Button>
                {canPurchase && summary.state === "none" && <Button size="sm" variant="secondary" onClick={() => openCreate("service", [buildingId])} aria-label={`Mua dịch vụ ${name}`}>Mua</Button>}
                {canPurchase && (summary.state === "effective" || summary.state === "expiring") && <Button size="sm" variant="secondary" onClick={() => openCreate("upgrade", [buildingId])} aria-label={`Nâng cấp ${name}`}>Nâng cấp</Button>}
                {canPurchase && (summary.state === "expiring" || summary.state === "expired") && <Button size="sm" variant="quiet" onClick={() => openCreate("service", [buildingId])} aria-label={`Gia hạn ${name}`}>Gia hạn</Button>}
              </div>
            </article>;
          })}
        </div>
        {entitlements.data && buildings.data && serviceRows.length === 0 && <EmptyState icon={ShieldAlert} title="Chưa có công trình" description="Tạo công trình (tên và địa chỉ) rồi mua gói dịch vụ để kích hoạt." />}
        {serviceRows.length > 0 && <div className="bill-overview">
          <QuotaSummary accessToken={token} refreshKey={settled} onTopUp={canPurchase ? () => openCreate("topup") : undefined} onOpen={() => setParams({ tab: "ai" })} />
          <section className="org-card bill-recent" aria-labelledby="bill-recent-title">
            <div className="bill-row"><h2 id="bill-recent-title" className="org-card-title" style={{ margin: 0 }}>Báo giá và thanh toán gần đây</h2><Button size="sm" variant="quiet" onClick={() => setParams({ tab: "quotes" })}>Xem tất cả</Button></div>
            {quotations.data && items.length > 0 ? <Table className="bill-table" caption="Báo giá gần đây">
              <thead><tr><th>Mã đơn</th><th>Nội dung</th><th className="bill-money">Số tiền</th><th>Trạng thái</th></tr></thead>
              <tbody>{items.slice(0, 4).map((item) => <tr key={item.id}>
                <td><button type="button" className="bill-link-cell" onClick={() => openQuotation(item.id)} aria-label={`Mở báo giá ${item.quotationNumber}`}>{item.quotationNumber}</button></td>
                <td className="bill-wrap">{summarizeQuotation(item)}</td>
                <td className="bill-money">{formatVnd(item.totalAmount)}</td>
                <td><QuotationStatusBadge status={item.status} /></td>
              </tr>)}</tbody>
            </Table> : <p className="bill-dim" style={{ margin: 0 }}>{quotations.data ? "Chưa có báo giá nào. Mua gói công trình hoặc nạp quota AI để tạo báo giá đầu tiên." : "Đang tải báo giá…"}</p>}
            <p className="bill-dim" style={{ margin: 0 }}>Giá, quota và chính sách nâng cấp hiển thị theo cấu hình từ máy chủ, không cố định trong giao diện.</p>
          </section>
        </div>}
        <p className="bill-dim" style={{ marginTop: 10 }}>“Chi tiết” hiện học viên tối đa hiệu lực, suất đã dùng và lịch sử nâng cấp. Báo giá và thanh toán của từng công trình nằm ở tab “Dịch vụ” trong trang công trình.</p>
      </TabsContent>

      <TabsContent value="ai" style={{ marginTop: 16 }}>
        {tab === "ai" && <AiQuotaView accessToken={token} refreshKey={settled} onTopUp={canPurchase ? () => openCreate("topup") : undefined} onOpenQuotation={openQuotation} />}
      </TabsContent>

      <TabsContent value="reminders" style={{ marginTop: 16 }}>
        {tab === "reminders" && <NotificationsPanel accessToken={token} onChanged={() => setSettled((value) => value + 1)} onRenew={canPurchase ? (buildingId) => openCreate("service", [buildingId]) : undefined} />}
      </TabsContent>

      <TabsContent value="enterprise" style={{ marginTop: 16 }}>
        {tab === "enterprise" && <EnterpriseSection accessToken={token} defaultEmail={user?.email} defaultName={user?.fullName ?? undefined} onOpenQuotation={openQuotation} />}
      </TabsContent>
    </Tabs>

    <Drawer open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) { setOverride(null); setParams({ quotation: null, payment: null }); } }} title="Chi tiết báo giá" description="Số tiền, kỳ và điều khoản là bản chụp do hệ thống phát hành." className="bill-wide-drawer">
      {selectedId && selected.loading && !current && <SkeletonRows rows={4} label="Đang tải báo giá…" />}
      {selectedId && selected.error !== undefined && !current && <Alert tone="danger" title={noAccess(selected.error) ? "Không có quyền xem báo giá này" : "Không tải được báo giá"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={selected.reload}>Thử lại</Button>}>{billingErrorText(selected.error)}</Alert>}
      {current && <div className="ops-stack">
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

    <Drawer open={Boolean(serviceBuilding)} onOpenChange={(open) => { if (!open) setParams({ service: null }); }} title={`Dịch vụ: ${nameOf[serviceBuilding] ?? "công trình"}`} description="Kỳ hiện tại và sắp tới, học viên tối đa hiệu lực và suất đã dùng." className="bill-wide-drawer"
      footer={canPurchase && serviceBuilding ? <><Button variant="quiet" onClick={() => { setParams({ service: null }); openCreate("service", [serviceBuilding]); }}>Mua / gia hạn</Button><Button onClick={() => { setParams({ service: null }); openCreate("upgrade", [serviceBuilding]); }}>Nâng cấp học viên</Button></> : undefined}>
      {serviceBuilding && <ServiceCapacity accessToken={token} buildingId={serviceBuilding} refreshKey={settled} />}
    </Drawer>

    {canPurchase && <QuotationCreateDrawer
      open={create.open}
      onOpenChange={(open) => setCreate((state) => ({ ...state, open }))}
      accessToken={token}
      mode={create.mode}
      onModeChange={(mode) => setCreate((state) => ({ ...state, mode }))}
      preselect={create.preselect}
      onCreated={(result) => { setOverride(result); setParams({ tab: "quotes", quotation: result.data.id, payment: null }, "replace"); quotations.reload(); }}
    />}
  </div>;
}
