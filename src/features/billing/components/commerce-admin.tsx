"use client";

import { useMemo } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/api/use-async-data";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlParams } from "@/api/use-url-params";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { KpiRow, KpiTile } from "@/features/admin-overview/components/admin-kit";
import { formatCount } from "@/features/admin-overview/format";
import { billingApi } from "../api";
import { DiscountsSection, PackagesSection } from "./admin-catalog";
import { EnterpriseAdminSection } from "./admin-enterprise";
import { PaymentsSection } from "./admin-payments";
import { PoliciesSection } from "./admin-policies";
import { AdminQuotaSection } from "./admin-quota";
import { QuotationsSection } from "./admin-sales";

const TABS = ["payments", "packages", "policies", "discounts", "quotes", "enterprise", "quota"] as const;
type TabId = (typeof TABS)[number];

/**
 * PlatformAdmin "Dịch vụ và thanh toán" (Figma "Thương mại"): payment ledger with reconcile first, then the catalog (packages,
 * quota policies, discounts), quotations, enterprise requests and per-organization AI quota. Tab, filters and selection
 * live in the URL. Headline figures are ledger totals read with page size 1.
 */
export function CommerceAdmin() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabId = (TABS as readonly string[]).includes(tabParam) ? (tabParam as TabId) : "payments";

  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const token = accessToken as string;
  const since = useMemo(() => new Date(Date.now() - 30 * 86_400_000).toISOString(), []);
  const orders = useAsyncData("commerce:total:orders30", (signal) => billingApi.listLedger(token, "checkouts", { from: since, page: 1, pageSize: 1 }, signal), enabled);
  const paid = useAsyncData("commerce:total:paid30", (signal) => billingApi.listLedger(token, "requests", { status: "Paid", from: since, page: 1, pageSize: 1 }, signal), enabled);
  const stuck = useAsyncData("commerce:total:reconcile", (signal) => billingApi.listLedger(token, "checkouts", { status: "NeedsReconcile", page: 1, pageSize: 1 }, signal), enabled);
  const stuckCount = stuck.data?.totalCount ?? 0;

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể quản lý thương mại.</Alert>;

  return <>
    <PageHeader eyebrow="Thương mại" title="Dịch vụ và thanh toán" description="Đối soát đơn, kích hoạt dịch vụ và theo dõi gói của tổ chức. Số tiền, kỳ và điều khoản là bản chụp do hệ thống trả." breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Thương mại" }]} />
    {stuckCount > 0 && <div className="adm-banner"><Alert tone="warning" title={`${formatCount(stuckCount)} thanh toán cần đối soát`} action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => setParams({ tab: null, kind: null, status: "NeedsReconcile", page: null })}>Xem đơn cần đối soát</Button>}>Chỉ webhook hợp lệ từ nhà cung cấp mới cấp dịch vụ. Trang trả về chỉ điều hướng người dùng, không cấp quyền.</Alert></div>}
    <KpiRow label="Tổng quan thanh toán">
      <KpiTile label="Đơn 30 ngày" value={formatCount(orders.data?.totalCount)} loading={orders.loading && !orders.data} hint="Tổng checkout từ máy chủ" />
      <KpiTile label="Đã nhận tiền 30 ngày" value={formatCount(paid.data?.totalCount)} loading={paid.loading && !paid.data} hint="Yêu cầu thanh toán Paid" />
      <KpiTile label="Cần đối soát" value={formatCount(stuck.data?.totalCount)} loading={stuck.loading && !stuck.data} tone={stuckCount > 0 ? "warning" : undefined} hint="Checkout NeedsReconcile" />
    </KpiRow>
    <Tabs value={tab} onValueChange={(value) => setParams({ tab: value === "payments" ? null : value, quotation: null, request: null, checkout: null, payment: null, page: null })}>
      <TabsList aria-label="Thương mại">
        <TabsTrigger value="payments">Thanh toán</TabsTrigger>
        <TabsTrigger value="packages">Gói dịch vụ</TabsTrigger>
        <TabsTrigger value="policies">Chính sách quota</TabsTrigger>
        <TabsTrigger value="discounts">Giảm giá</TabsTrigger>
        <TabsTrigger value="quotes">Báo giá</TabsTrigger>
        <TabsTrigger value="enterprise">Liên hệ doanh nghiệp</TabsTrigger>
        <TabsTrigger value="quota">Quota AI theo tổ chức</TabsTrigger>
      </TabsList>
      <TabsContent value="packages" style={{ marginTop: 16 }}>{tab === "packages" && <PackagesSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="policies" style={{ marginTop: 16 }}>{tab === "policies" && <PoliciesSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="discounts" style={{ marginTop: 16 }}>{tab === "discounts" && <DiscountsSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="quotes" style={{ marginTop: 16 }}>{tab === "quotes" && <QuotationsSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="payments" style={{ marginTop: 16 }}>{tab === "payments" && <PaymentsSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="enterprise" style={{ marginTop: 16 }}>{tab === "enterprise" && <EnterpriseAdminSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="quota" style={{ marginTop: 16 }}>{tab === "quota" && <AdminQuotaSection accessToken={accessToken} />}</TabsContent>
    </Tabs>
  </>;
}
