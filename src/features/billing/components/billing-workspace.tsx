"use client";

import { FileText, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ApiError } from "@/api";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingsApi } from "@/features/buildings/api";
import { billingApi } from "../api";
import { EXPIRY_REMINDER_DAYS, hasPaidHistory, summarizeEntitlements } from "../entitlements";
import { billingErrorText } from "../errors";
import { formatDate, formatDateTime, formatVnd } from "../format";
import type { Entitlement, Quotation, QuotationItemInput, WithEtag } from "../types";
import { CheckoutPanel } from "./checkout-panel";
import { EnterpriseSection } from "./enterprise-section";
import { QuotationSnapshot, QuotationStatusBadge } from "./quotation-snapshot";
import "../billing.css";

const PAGE_SIZE = 20;
const MAX_LINES = 100;
const TABS = ["quotes", "services", "enterprise"] as const;
type TabId = (typeof TABS)[number];
type AddressState = "checking" | "ok" | "missing" | "error";

function summarizeBuildings(quotation: Quotation) {
  const names = quotation.items.map((line) => line.buildingName || "Công trình");
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/** Organization-level "Dịch vụ & thanh toán": quotations (one or many Buildings), service periods, bulk request. */
export function BillingWorkspace() {
  const toast = useToast();
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const pathname = usePathname();
  const search = useSearchParams();
  const createKey = useIdempotencyKey();
  const createLock = useRef(false);

  const tabParam = get("tab");
  const tab: TabId = (TABS as readonly string[]).includes(tabParam) ? (tabParam as TabId) : "quotes";
  const selectedId = get("quotation");
  const paymentId = get("payment");

  const enabled = ready && Boolean(accessToken) && (user?.role === 1 || user?.role === 0);
  const canPurchase = user?.role === 1;
  const token = accessToken as string;

  const quotations = useAsyncData(`billing:quotes:${page}`, (signal) => billingApi.listQuotations(token, page, PAGE_SIZE, signal), enabled);
  const entitlements = useAsyncData("billing:entitlements:all", (signal) => billingApi.listEntitlements(token, { pageSize: 100 }, signal), enabled);
  const buildings = useAsyncData("billing:buildings", (signal) => buildingsApi.list(token, { isActive: true, page: 1, pageSize: 100 }, signal), enabled);
  const packages = useAsyncData("billing:packages", (signal) => billingApi.listPackages(token, signal), enabled);
  const selected = useAsyncData(`billing:quotation:${selectedId}`, (signal) => billingApi.getQuotation(token, selectedId, signal), enabled && Boolean(selectedId));

  const [override, setOverride] = useState<WithEtag<Quotation> | null>(null);
  const current: WithEtag<Quotation> | null = override && override.data.id === selectedId ? override : selected.data ?? null;

  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [packageId, setPackageId] = useState("");
  const [addresses, setAddresses] = useState<Record<string, AddressState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<{ message: string; details: string[] } | null>(null);

  const buildingItems = useMemo(() => buildings.data?.items ?? [], [buildings.data]);
  const nameOf = useMemo(() => Object.fromEntries(buildingItems.map((item) => [item.id, item.name])), [buildingItems]);
  const entitlementsByBuilding = useMemo(() => {
    const map = new Map<string, Entitlement[]>();
    for (const item of entitlements.data?.items ?? []) map.set(item.buildingId, [...(map.get(item.buildingId) ?? []), item]);
    return map;
  }, [entitlements.data]);
  const sortedPackages = useMemo(() => [...(packages.data ?? [])].filter((item) => item.isActive).sort((a, b) => a.durationMonths - b.durationMonths || a.code.localeCompare(b.code)), [packages.data]);
  const reminders = useMemo(() => [...entitlementsByBuilding.entries()]
    .map(([buildingId, list]) => ({ buildingId, summary: summarizeEntitlements(list) }))
    .filter((item) => item.summary.state === "expiring" || item.summary.state === "expired"), [entitlementsByBuilding]);

  const returnTo = useMemo(() => {
    const next = new URLSearchParams(search.toString());
    next.delete("payment");
    return next.toString() ? `${pathname}?${next.toString()}` : pathname;
  }, [pathname, search]);

  const checkAddress = async (id: string) => {
    setAddresses((state) => ({ ...state, [id]: "checking" }));
    try {
      const detail = await buildingsApi.get(token, id);
      setAddresses((state) => ({ ...state, [id]: detail.location?.address?.trim() && detail.name.trim() ? "ok" : "missing" }));
    } catch {
      setAddresses((state) => ({ ...state, [id]: "error" }));
    }
  };

  const toggle = (id: string) => {
    setCreateError(null);
    if (picked.includes(id)) { setPicked(picked.filter((item) => item !== id)); return; }
    if (picked.length >= MAX_LINES) return;
    setPicked([...picked, id]);
    if (!addresses[id] || addresses[id] === "error") void checkAddress(id);
  };

  const openCreate = (preselect: string[] = []) => {
    setCreateError(null);
    setPicked(preselect);
    for (const id of preselect) void checkAddress(id);
    setCreating(true);
  };

  const missing = picked.filter((id) => addresses[id] === "missing");
  const checking = picked.some((id) => addresses[id] === "checking");
  const canSubmit = canPurchase && picked.length > 0 && Boolean(packageId) && missing.length === 0 && !checking && !submitting;

  const submitQuotation = async () => {
    if (createLock.current || !canSubmit) return;
    createLock.current = true;
    setSubmitting(true);
    setCreateError(null);
    try {
      const items: QuotationItemInput[] = [...picked].sort().map((buildingId) => ({
        buildingId,
        servicePackageId: packageId,
        purchaseAction: hasPaidHistory(entitlementsByBuilding.get(buildingId) ?? []) ? "Renewal" : "New",
      }));
      const result = await billingApi.createQuotation(token, items, createKey.keyFor({ items }));
      createKey.done();
      setOverride(result);
      setCreating(false);
      setPicked([]);
      setParams({ tab: "quotes", quotation: result.data.id, payment: null }, "replace");
      quotations.reload();
      toast.notify({ tone: "success", title: "Đã tạo báo giá nháp", description: "Giá do hệ thống tính. PlatformAdmin cần phát hành báo giá trước khi bạn chấp nhận." });
    } catch (cause) {
      setCreateError({ message: billingErrorText(cause), details: cause instanceof ApiError ? cause.fieldErrors.map((item) => item.message) : [] });
    } finally {
      createLock.current = false;
      setSubmitting(false);
    }
  };

  const reloadAll = () => { quotations.reload(); entitlements.reload(); };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!enabled) return <Alert tone="danger" title="Không có quyền truy cập">Khu này dành cho tài khoản tổ chức.</Alert>;

  const items = quotations.data?.items ?? [];
  const totalCount = quotations.data?.totalCount ?? 0;

  return <>
    <PageHeader
      title="Dịch vụ & thanh toán"
      description="Mua hoặc gia hạn dịch vụ theo công trình, chấp nhận báo giá, thanh toán qua PayOS và theo dõi kích hoạt."
      breadcrumbs={[{ label: "Không gian tổ chức", href: routes.workspaceBuildings }, { label: "Dịch vụ & thanh toán" }]}
      actions={<><Button variant="quiet" onClick={reloadAll} disabled={quotations.loading}><RefreshCw size={16} aria-hidden="true" />{quotations.loading ? "Đang tải…" : "Tải lại"}</Button>{canPurchase && <Button onClick={() => openCreate()}><Plus size={16} aria-hidden="true" />Tạo báo giá</Button>}</>}
    />

    {reminders.length > 0 && <Alert tone="warning" title={`${reminders.length} công trình cần gia hạn`} className="mb-4">
      {reminders.slice(0, 3).map((item) => `${nameOf[item.buildingId] ?? "Công trình"}: ${item.summary.state === "expired" ? `đã hết hạn ${formatDate(item.summary.latest?.endsAt)}` : `còn ${Math.max(item.summary.daysLeft ?? 0, 0)} ngày`}`).join("; ")}{reminders.length > 3 ? "…" : ""}. Nhắc trước {EXPIRY_REMINDER_DAYS} ngày; mở tab “Dịch vụ theo công trình” để gia hạn chọn lọc.
    </Alert>}

    <Tabs value={tab} onValueChange={(value) => setParams({ tab: value === "quotes" ? null : value, quotation: null, payment: null })}>
      <TabsList aria-label="Dịch vụ và thanh toán">
        <TabsTrigger value="quotes">Báo giá</TabsTrigger>
        <TabsTrigger value="services">Dịch vụ theo công trình</TabsTrigger>
        <TabsTrigger value="enterprise">Số lượng lớn</TabsTrigger>
      </TabsList>

      <TabsContent value="quotes" style={{ marginTop: 16 }}>
        {quotations.error !== undefined && <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={quotations.reload}>Thử lại</Button>}>{billingErrorText(quotations.error)}</Alert>}
        <Table className="bill-table" caption="Danh sách báo giá">
          <thead><tr><th>Báo giá</th><th>Công trình</th><th>Trạng thái</th><th>Hiệu lực đến</th><th className="bill-money">Tổng thanh toán</th><th aria-label="Thao tác" /></tr></thead>
          <tbody>
            {quotations.loading && !quotations.data && <TableMessage colSpan={6}><SkeletonRows rows={5} label="Đang tải báo giá…" /></TableMessage>}
            {items.map((item) => <tr key={item.id}>
              <td><span className="ops-cell-primary bill-wrap">{item.quotationNumber}</span></td>
              <td className="bill-wrap">{summarizeBuildings(item)}<span className="ops-cell-sub">{item.items.length} công trình</span></td>
              <td><QuotationStatusBadge status={item.status} /></td>
              <td>{formatDateTime(item.validUntil)}</td>
              <td className="bill-money">{formatVnd(item.totalAmount)}</td>
              <td className="ops-cell-actions"><Button size="sm" variant="quiet" onClick={() => { setOverride(null); setParams({ quotation: item.id, payment: null }); }} aria-label={`Xem báo giá ${item.quotationNumber}`}>Xem</Button></td>
            </tr>)}
            {quotations.data && !items.length && <TableMessage colSpan={6}><EmptyState icon={FileText} title="Chưa có báo giá" description="Chọn một hoặc nhiều công trình và thời hạn để tạo báo giá đầu tiên." action={canPurchase ? <Button onClick={() => openCreate()}><Plus size={16} aria-hidden="true" />Tạo báo giá</Button> : undefined} /></TableMessage>}
          </tbody>
        </Table>
        {totalCount > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={quotations.loading} />}
      </TabsContent>

      <TabsContent value="services" style={{ marginTop: 16 }}>
        {entitlements.error !== undefined && <Alert tone="danger" title="Không tải được dịch vụ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={entitlements.reload}>Thử lại</Button>}>{billingErrorText(entitlements.error)}</Alert>}
        <Table className="bill-table" caption="Kỳ dịch vụ của các công trình">
          <thead><tr><th>Công trình</th><th>Kỳ dịch vụ</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
          <tbody>
            {entitlements.loading && !entitlements.data && <TableMessage colSpan={4}><SkeletonRows rows={5} label="Đang tải dịch vụ…" /></TableMessage>}
            {[...entitlementsByBuilding.entries()].map(([buildingId, list]) => {
              const summary = summarizeEntitlements(list);
              const period = summary.current ?? summary.latest;
              return <tr key={buildingId}>
                <td><span className="ops-cell-primary bill-wrap">{nameOf[buildingId] ?? `Công trình ${buildingId.slice(0, 8)}`}</span></td>
                <td>{period ? `${formatDate(period.startsAt)} – ${formatDate(period.endsAt)}` : "—"}{summary.state === "expiring" && <span className="ops-cell-sub">Còn {Math.max(summary.daysLeft ?? 0, 0)} ngày</span>}</td>
                <td><StatusBadge tone={summary.state === "effective" ? "success" : summary.state === "expiring" ? "warning" : summary.state === "expired" ? "danger" : "neutral"}>{{ effective: "Đang hiệu lực", expiring: "Sắp hết hạn", expired: "Đã hết hạn", upcoming: "Chưa đến kỳ", none: "Chưa có dịch vụ" }[summary.state]}</StatusBadge></td>
                <td className="ops-cell-actions">{canPurchase && (summary.state === "expiring" || summary.state === "expired") && <Button size="sm" variant="secondary" onClick={() => { setParams({ tab: null }); openCreate([buildingId]); }} aria-label={`Gia hạn ${nameOf[buildingId] ?? "công trình"}`}>Gia hạn</Button>}</td>
              </tr>;
            })}
            {entitlements.data && entitlementsByBuilding.size === 0 && <TableMessage colSpan={4}><EmptyState icon={ShieldAlert} title="Chưa có dịch vụ nào" description="Tạo báo giá và thanh toán để kích hoạt dịch vụ cho công trình." action={canPurchase ? <Button onClick={() => openCreate()}>Tạo báo giá</Button> : undefined} /></TableMessage>}
          </tbody>
        </Table>
        <p className="bill-dim" style={{ marginTop: 10 }}>Chi tiết từng kỳ, báo giá và thanh toán nằm ở tab “Dịch vụ” của mỗi công trình.</p>
      </TabsContent>

      <TabsContent value="enterprise" style={{ marginTop: 16 }}>
        {tab === "enterprise" && <EnterpriseSection accessToken={token} defaultEmail={user?.email} defaultName={user?.fullName ?? undefined} />}
      </TabsContent>
    </Tabs>

    <Drawer open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) { setOverride(null); setParams({ quotation: null, payment: null }); } }} title="Chi tiết báo giá" description="Số tiền và điều khoản là bản chụp do hệ thống phát hành." className="bill-wide-drawer">
      {selectedId && selected.loading && !current && <SkeletonRows rows={4} label="Đang tải báo giá…" />}
      {selectedId && selected.error !== undefined && !current && <Alert tone="danger" title="Không tải được báo giá" action={<Button size="sm" variant="secondary" className="mt-3" onClick={selected.reload}>Thử lại</Button>}>{billingErrorText(selected.error)}</Alert>}
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

    <Drawer open={creating} onOpenChange={(open) => { if (!open && !submitting) setCreating(false); }} title="Tạo báo giá" description="Chọn công trình và gói. Giá, giảm giá và thuế do hệ thống tính ở báo giá." footer={<><Button variant="quiet" onClick={() => setCreating(false)} disabled={submitting}>Hủy</Button><Button onClick={() => void submitQuotation()} disabled={!canSubmit}>{submitting ? "Đang tạo…" : `Tạo báo giá (${picked.length})`}</Button></>}>
      <div className="ops-stack">
        <fieldset className="ops-fieldset"><legend>1. Công trình</legend>
          {buildings.loading && !buildings.data && <SkeletonRows rows={3} label="Đang tải công trình…" />}
          {buildings.error !== undefined && <Alert tone="danger" title="Không tải được công trình" action={<Button size="sm" variant="secondary" className="mt-3" onClick={buildings.reload}>Thử lại</Button>}>{billingErrorText(buildings.error)}</Alert>}
          {buildings.data && buildingItems.length === 0 && <EmptyState icon={FileText} title="Chưa có công trình" description="Tạo công trình (tên và địa chỉ) trước khi mua dịch vụ." />}
          {buildingItems.length > 0 && <div className="bill-picker" role="group" aria-label="Chọn công trình">
            {buildingItems.map((building) => {
              const state = addresses[building.id];
              const checked = picked.includes(building.id);
              const action = hasPaidHistory(entitlementsByBuilding.get(building.id) ?? []) ? "Gia hạn" : "Mua mới";
              return <label key={building.id} aria-disabled={!checked && picked.length >= MAX_LINES}>
                <input type="checkbox" checked={checked} onChange={() => toggle(building.id)} disabled={!checked && picked.length >= MAX_LINES} />
                <span><strong>{building.name}</strong> <span className="bill-dim">· {action}</span>
                  {checked && state === "checking" && <small className="bill-dim" style={{ display: "block" }}>Đang kiểm tra địa chỉ…</small>}
                  {checked && state === "missing" && <small style={{ display: "block", color: "var(--warning)" }}>Thiếu tên hoặc địa chỉ. Bổ sung trong thông tin công trình trước khi mua.</small>}
                  {checked && state === "error" && <small style={{ display: "block", color: "var(--danger)" }}>Không kiểm tra được địa chỉ. Bỏ chọn rồi chọn lại.</small>}
                </span>
              </label>;
            })}
          </div>}
          <p className="bill-dim" style={{ margin: 0 }}>Tối đa {MAX_LINES} công trình mỗi báo giá; nhiều hơn dùng tab “Số lượng lớn”.</p>
        </fieldset>
        <fieldset className="ops-fieldset"><legend>2. Gói và thời hạn</legend>
          {packages.error !== undefined && <Alert tone="danger" title="Không tải được gói" action={<Button size="sm" variant="secondary" className="mt-3" onClick={packages.reload}>Thử lại</Button>}>{billingErrorText(packages.error)}</Alert>}
          <Field label="Gói dịch vụ" required hint="Thời hạn do gói quy định. Áp dụng cho mọi công trình đã chọn.">{(p) => <Select {...p} value={packageId} onChange={(event) => { setPackageId(event.target.value); setCreateError(null); }}>
            <option value="">Chọn gói</option>
            {sortedPackages.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMonths} tháng · {formatVnd(item.unitPrice)}/tháng/công trình</option>)}
          </Select>}</Field>
        </fieldset>
        {createError && <Alert tone="danger" title="Chưa tạo được báo giá">{createError.message}{createError.details.length > 0 && <>{" "}{createError.details.join(" ")}</>}</Alert>}
      </div>
    </Drawer>
  </>;
}
