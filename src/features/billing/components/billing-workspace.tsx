"use client";

import { CreditCard, FileText, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonDetail, SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubTabs } from "@/components/ui/sub-tabs";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "@/features/buildings/api";
import { billingApi } from "../api";
import { summarizeEntitlements, type EntitlementSummary, type ServiceState } from "../entitlements";
import { billingErrorText } from "../errors";
import { formatDate, formatDateTime, formatNumber, formatVnd, quotaUnitLabel } from "../format";
import type { Entitlement, Quotation, WithEtag } from "../types";
import { AiQuotaView } from "./ai-quota-view";
import { CheckoutPanel } from "./checkout-panel";
import { EnterpriseSection } from "./enterprise-section";
import { NotificationsPanel, ReminderBanner } from "./notifications-panel";
import { QuotationCreateModal, type CreateMode } from "./quotation-create-modal";
import { QuotationSnapshot, QuotationStatusBadge } from "./quotation-snapshot";
import { ServiceCapacity } from "./service-capacity";
import "../billing.css";
import { LoadingBlock } from "@/components/ui/spinner";

const PAGE_SIZE = 20;
const TABS = ["services", "quotes", "ai", "reminders", "enterprise"] as const;
type TabId = (typeof TABS)[number];
const TAB_ITEMS: Array<{ value: TabId; label: string }> = [
  { value: "services", label: "Dịch vụ theo công trình" },
  { value: "quotes", label: "Báo giá và thanh toán" },
  { value: "ai", label: "Hạn mức AI" },
  { value: "reminders", label: "Nhắc gia hạn" },
  { value: "enterprise", label: "Số lượng lớn" },
];

/** Figma "Quota AI trả trước": used of granted per quota unit, with a top-up action. The full ledger is the "Quota AI" tab. */
function QuotaSummary({ accessToken, refreshKey, onTopUp, onOpen }: { accessToken: string; refreshKey: number; onTopUp?: () => void; onOpen: () => void }) {
  const balance = useAsyncData(`quota:balance:me:${refreshKey}`, (signal) => billingApi.getAiQuota(accessToken, undefined, signal));
  const units = balance.data?.units ?? [];
  return <section className="org-card bill-quota-card" aria-labelledby="bill-quota-title">
    <div className="bill-row">
      <div style={{ minWidth: 0 }}><h2 id="bill-quota-title" className="org-card-title" style={{ margin: 0 }}>Hạn mức AI trả trước</h2><p className="bill-dim" style={{ margin: "4px 0 0" }}>Gộp từ các gói công trình và các lần nạp thêm đã thanh toán. Hết hạn mức thì chưa gửi được yêu cầu tính phí mới; không có nợ trả sau.</p></div>
      <div className="ops-actions">{onTopUp && <Button size="sm" variant="secondary" onClick={onTopUp}>Nạp hạn mức AI</Button>}<Button size="sm" variant="quiet" onClick={onOpen}>Chi tiết</Button></div>
    </div>
    {balance.error !== undefined && <p className="bill-dim" role="alert" style={{ margin: 0 }}>{billingErrorText(balance.error)}</p>}
    {balance.loading && !balance.data && <SkeletonRows rows={2} label="Đang tải số dư hạn mức…" />}
    {balance.data && units.length === 0 && <p className="bill-dim" style={{ margin: 0 }}>Tổ chức chưa có hạn mức AI còn hiệu lực.</p>}
    {units.map((unit) => {
      const used = unit.reserved + unit.consumed;
      const percent = unit.granted > 0 ? Math.min(100, Math.round((used / unit.granted) * 100)) : 100;
      return <div key={unit.quotaUnit} className="bill-quota-unit">
        <div className="bill-row"><span className="bill-muted">Đã dùng ({quotaUnitLabel(unit.quotaUnit)})</span><strong className="bill-quota-figure">{formatNumber(used)} / {formatNumber(unit.granted)}</strong></div>
        <div className="bill-meter" role="img" aria-label={`Đã dùng hoặc đang tạm trừ ${used} trên ${unit.granted} ${quotaUnitLabel(unit.quotaUnit)}`}><span style={{ width: `${percent}%` }} /></div>
        <span className="bill-dim">Còn dùng được {formatNumber(unit.available)} {quotaUnitLabel(unit.quotaUnit)}</span>
      </div>;
    })}
  </section>;
}

function summarizeQuotation(quotation: Quotation) {
  if (quotation.purpose === "AIQuotaTopUp") return "Nạp thêm hạn mức AI";
  const names = quotation.items.map((line) => line.buildingName || "Công trình");
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

const quotationKind = (quotation: Quotation) => quotation.purpose === "AIQuotaTopUp" ? "Hạn mức AI trả trước" : quotation.items.some((line) => line.purchaseAction === "Upgrade") ? `Nâng cấp · ${quotation.items.length} công trình` : `${quotation.items.length} công trình`;

const stateLabel: Record<ServiceState, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  effective: { label: "Đang hiệu lực", tone: "success" },
  expiring: { label: "Sắp hết hạn", tone: "warning" },
  expired: { label: "Đã hết hạn", tone: "danger" },
  upcoming: { label: "Chưa đến kỳ", tone: "info" },
  none: { label: "Chưa có dịch vụ", tone: "neutral" },
};
const stateOptions = (Object.keys(stateLabel) as ServiceState[]).map((value) => ({ value, label: stateLabel[value].label }));
const StateBadge = ({ state }: { state: ServiceState }) => <StatusBadge tone={stateLabel[state].tone}>{stateLabel[state].label}</StatusBadge>;

type ServiceRow = { buildingId: string; name: string; summary: EntitlementSummary };

/**
 * Organization-level "Dịch vụ & thanh toán" (Figma 48:2559 / 54:11537): quotations (New/Renewal/Upgrade/AI top-up), service
 * periods with learner capacity, prepaid AI quota, expiry reminders and bulk requests. Lists are DataTables whose rows open
 * the `?service=` / `?quotation=` / `?request=` drawers; every create form is a Modal. Everything shown is the BE's snapshot.
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
  const stateFilter = get("state");
  const urlSearch = get("q");
  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);

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
  const serviceRows = useMemo<ServiceRow[]>(() => {
    const ids = new Set<string>([...buildingItems.map((item) => item.id), ...entitlementsByBuilding.keys()]);
    return [...ids].map((buildingId) => ({ buildingId, name: nameOf[buildingId] ?? "Công trình không còn trong danh sách", summary: summarizeEntitlements(entitlementsByBuilding.get(buildingId) ?? []) }));
  }, [buildingItems, entitlementsByBuilding, nameOf]);
  const needle = urlSearch.trim().toLowerCase();
  const shownServices = serviceRows.filter((row) => (!needle || row.name.toLowerCase().includes(needle)) && (!stateFilter || row.summary.state === stateFilter));

  const returnTo = useMemo(() => {
    const next = new URLSearchParams(search.toString());
    next.delete("payment");
    return next.toString() ? `${pathname}?${next.toString()}` : pathname;
  }, [pathname, search]);

  const openCreate = (mode: CreateMode, preselect: string[] = []) => setCreate({ open: true, mode, preselect });
  const reloadAll = () => { quotations.reload(); entitlements.reload(); setSettled((value) => value + 1); };
  const openQuotation = (id: string) => { setOverride(null); setParams({ tab: "quotes", quotation: id, payment: null }); };

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (!enabled) return <Alert tone="danger" title="Không có quyền truy cập">Khu này dành cho tài khoản tổ chức.</Alert>;

  const items = quotations.data?.items ?? [];
  const totalCount = quotations.data?.totalCount ?? 0;
  const shownQuotes = tab === "quotes" && needle ? items.filter((item) => `${item.quotationNumber} ${summarizeQuotation(item)}`.toLowerCase().includes(needle)) : items;
  const noAccess = (error: unknown) => (error as { status?: number } | undefined)?.status === 403;

  const serviceColumns: DataColumn<ServiceRow>[] = [
    { key: "name", header: "Công trình", primary: true, render: (row) => <CellTitle title={row.name} /> },
    { key: "state", header: "Trạng thái", width: 150, render: (row) => <StateBadge state={row.summary.state} /> },
    { key: "period", header: "Kỳ dịch vụ", width: 220, render: (row) => {
      const period = row.summary.current ?? row.summary.latest;
      if (!period) return "—";
      return <CellTitle title={<span style={{ fontWeight: 400 }}>{formatDate(period.startsAt)} – {formatDate(period.endsAt)}</span>} sub={row.summary.state === "expiring" ? `Còn ${Math.max(row.summary.daysLeft ?? 0, 0)} ngày` : undefined} />;
    } },
    { key: "learners", header: "Học viên / kỳ", width: 140, hideBelow: 900, render: (row) => { const period = row.summary.current ?? row.summary.latest; return period?.learnerLimit != null ? `${formatNumber(period.learnerLimit)} học viên` : "—"; } },
    { key: "actions", header: "Hành động", width: 220, align: "right", cardHidden: !canPurchase, render: (row) => {
      if (!canPurchase) return <span className="bill-dim">Chỉ xem</span>;
      const state = row.summary.state;
      return <span className="ops-actions bill-row-actions">
        {state === "none" && <Button size="sm" onClick={() => openCreate("service", [row.buildingId])} aria-label={`Mua dịch vụ ${row.name}`}><CreditCard size={14} aria-hidden="true" />Mua gói</Button>}
        {(state === "expiring" || state === "expired" || state === "upcoming") && <Button size="sm" variant="secondary" onClick={() => openCreate("service", [row.buildingId])} aria-label={`Gia hạn ${row.name}`}>Gia hạn</Button>}
        {(state === "effective" || state === "expiring") && <Button size="sm" variant={state === "effective" ? "secondary" : "quiet"} onClick={() => openCreate("upgrade", [row.buildingId])} aria-label={`Nâng cấp ${row.name}`}>Nâng cấp</Button>}
      </span>;
    } },
  ];

  const quoteColumns: DataColumn<Quotation>[] = [
    { key: "number", header: "Mã đơn", primary: true, render: (item) => <CellTitle title={<span className="bill-mono">{item.quotationNumber}</span>} sub={quotationKind(item)} /> },
    { key: "content", header: "Nội dung", width: 220, render: (item) => <span className="bill-wrap">{summarizeQuotation(item)}</span> },
    { key: "amount", header: "Số tiền", width: 150, align: "right", render: (item) => <span className="bill-money">{formatVnd(item.totalAmount)}{item.taxAmount === null && <span className="ops-dt-title-sub" style={{ display: "block" }}>ước tính, chưa thuế</span>}</span> },
    { key: "status", header: "Trạng thái", width: 200, render: (item) => <QuotationStatusBadge status={item.status} /> },
    { key: "valid", header: "Hiệu lực đến", width: 170, hideBelow: 1100, render: (item) => formatDateTime(item.validUntil) },
  ];
  const quotationsError = quotations.error !== undefined && <Alert tone="danger" className="mb-4" title={noAccess(quotations.error) ? "Không có quyền xem báo giá" : "Không tải được báo giá"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={quotations.reload}>Thử lại</Button>}>{billingErrorText(quotations.error)}</Alert>;

  return <div className="org">
    <PageHeader
      title="Dịch vụ và thanh toán"
      description="Gói công trình, hạn mức AI trả trước và lịch sử thanh toán qua PayOS. Mua, gia hạn hoặc nâng cấp theo công trình."
      eyebrow="Quản lý" breadcrumbs={[{ label: "Dịch vụ & thanh toán" }]}
      actions={<><Button variant="quiet" size="icon" onClick={reloadAll} disabled={quotations.loading} aria-label="Tải lại" title="Tải lại"><RefreshCw size={16} aria-hidden="true" /></Button>{canPurchase && <><Button variant="secondary" onClick={() => openCreate("topup")}>Nạp hạn mức AI</Button><Button onClick={() => openCreate("service")}><Plus size={16} aria-hidden="true" />Mua gói công trình</Button></>}</>}
    />

    {canPurchase && <ReminderBanner accessToken={token} refreshKey={settled} onOpen={() => setParams({ tab: "reminders", quotation: null, payment: null })} />}

    <SubTabs label="Dịch vụ và thanh toán" value={tab} items={TAB_ITEMS} onValueChange={(value) => setParams({ tab: value === "services" ? null : value, quotation: null, payment: null, service: null, request: null, q: null, state: null, page: null })}>
      <div className="ops-subtabs-content">
        {tab === "services" && <div className="org-stack">
          {entitlements.error !== undefined && <Alert tone="danger" title="Không tải được dịch vụ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={entitlements.reload}>Thử lại</Button>}>{billingErrorText(entitlements.error)}</Alert>}
          <QuotaSummary accessToken={token} refreshKey={settled} onOpen={() => setParams({ tab: "ai" })} />
          <DataTable
            caption="Dịch vụ theo công trình"
            data-testid="services-table"
            columns={serviceColumns}
            rows={shownServices}
            rowKey={(row) => row.buildingId}
            loading={(entitlements.loading && !entitlements.data) || (buildings.loading && !buildings.data)}
            onRowClick={(row) => setParams({ service: row.buildingId })}
            toolbar={<>
              <TableSearch value={searchText} onChange={setSearchText} label="Tìm công trình" placeholder="Tìm công trình" />
              <FilterChips label="Bộ lọc dịch vụ"><FilterChip label="Trạng thái" value={stateFilter} onChange={(value) => setParams({ state: value })} options={stateOptions} /></FilterChips>
            </>}
            empty={needle || stateFilter ? <EmptyState icon={ShieldAlert} title="Không có công trình khớp bộ lọc" description="Thử đổi từ khóa hoặc trạng thái." /> : <EmptyState icon={ShieldAlert} title="Chưa có công trình" description="Tạo công trình (tên và địa chỉ) rồi mua gói dịch vụ để kích hoạt." />}
          />
          <p className="bill-dim" style={{ margin: "-6px 0 0" }}>Bấm một hàng để mở chi tiết dịch vụ; Mua / Gia hạn / Nâng cấp mở hộp thoại báo giá. Học viên tối đa hiệu lực và suất đã dùng nằm trong chi tiết.</p>

          <section aria-labelledby="bill-recent-title" className="org-stack">
            <div className="bill-row"><h2 id="bill-recent-title" className="org-card-title" style={{ margin: 0 }}>Báo giá và thanh toán gần đây</h2><Button size="sm" variant="quiet" onClick={() => setParams({ tab: "quotes" })}>Xem tất cả</Button></div>
            {quotationsError}
            <DataTable
              caption="Báo giá gần đây"
              data-testid="recent-quotations"
              columns={quoteColumns}
              rows={items.slice(0, 5)}
              rowKey={(item) => item.id}
              loading={quotations.loading && !quotations.data}
              onRowClick={(item) => openQuotation(item.id)}
              empty={<EmptyState icon={FileText} title="Chưa có báo giá" description="Mua gói công trình hoặc nạp hạn mức AI để tạo báo giá đầu tiên. Giá, hạn mức và chính sách nâng cấp theo cấu hình của hệ thống." />}
            />
          </section>
        </div>}

        {tab === "quotes" && <div className="org-stack">
          {quotationsError}
          <DataTable
            caption="Danh sách báo giá"
            data-testid="quotations-table"
            columns={quoteColumns}
            rows={shownQuotes}
            rowKey={(item) => item.id}
            loading={quotations.loading && !quotations.data}
            onRowClick={(item) => openQuotation(item.id)}
            toolbar={<TableSearch value={searchText} onChange={setSearchText} label="Tìm mã đơn" placeholder="Tìm mã đơn hoặc công trình" />}
            empty={<EmptyState icon={FileText} title={needle ? "Không có báo giá khớp" : "Chưa có báo giá"} description={needle ? "Thử từ khóa khác." : "Chọn một hoặc nhiều công trình và gói 6/12 tháng để tạo báo giá đầu tiên."} />}
            pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined}
          />
          <p className="bill-dim" style={{ margin: "-6px 0 0" }}>Bấm một hàng để xem báo giá, chấp nhận, thanh toán và theo dõi kích hoạt trong ngăn bên phải.</p>
        </div>}

        {tab === "ai" && <AiQuotaView accessToken={token} refreshKey={settled} headerTopUp onTopUp={canPurchase ? () => openCreate("topup") : undefined} onOpenQuotation={openQuotation} />}
        {tab === "reminders" && <NotificationsPanel accessToken={token} onChanged={() => setSettled((value) => value + 1)} onRenew={canPurchase ? (buildingId) => openCreate("service", [buildingId]) : undefined} />}
        {tab === "enterprise" && <EnterpriseSection accessToken={token} defaultEmail={user?.email} defaultName={user?.fullName ?? undefined} onOpenQuotation={openQuotation} />}
      </div>
    </SubTabs>

    <Drawer open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) { setOverride(null); setParams({ quotation: null, payment: null }); } }} size="xl" title="Chi tiết báo giá" description="Số tiền, kỳ và điều khoản giữ đúng như lúc phát hành." eyebrow={current ? <><span className="bill-mono">{current.data.quotationNumber}</span><QuotationStatusBadge status={current.data.status} /></> : undefined} data-testid="quotation-drawer">
      {selectedId && selected.loading && !current && <SkeletonDetail rows={6} label="Đang tải báo giá…" />}
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

    <Drawer open={Boolean(serviceBuilding)} onOpenChange={(open) => { if (!open) setParams({ service: null }); }} size="md" title={nameOf[serviceBuilding] ?? "Dịch vụ công trình"} description="Kỳ hiện tại và sắp tới, học viên tối đa hiệu lực và suất đã dùng." data-testid="service-drawer"
      eyebrow={serviceBuilding ? <StateBadge state={serviceRows.find((row) => row.buildingId === serviceBuilding)?.summary.state ?? "none"} /> : undefined}
      footer={canPurchase && serviceBuilding ? <><Button variant="quiet" onClick={() => { setParams({ service: null }); openCreate("service", [serviceBuilding]); }}>Mua / gia hạn</Button><Button onClick={() => { setParams({ service: null }); openCreate("upgrade", [serviceBuilding]); }}>Nâng cấp học viên</Button></> : undefined}>
      {serviceBuilding && <ServiceCapacity accessToken={token} buildingId={serviceBuilding} refreshKey={settled} />}
    </Drawer>

    {canPurchase && <QuotationCreateModal
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
