"use client";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlParams } from "@/api/use-url-params";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { DiscountsSection, PackagesSection } from "./admin-catalog";
import { EnterpriseAdminSection, PaymentsSection, QuotationsSection } from "./admin-sales";
import { V7PendingBlock } from "./v7-pending";

const TABS = ["packages", "discounts", "quotes", "payments", "enterprise", "v7"] as const;
type TabId = (typeof TABS)[number];

/** PlatformAdmin "Thương mại": catalog, discounts, quotations, payments lookup, enterprise requests. Tab lives in the URL. */
export function CommerceAdmin() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabId = (TABS as readonly string[]).includes(tabParam) ? (tabParam as TabId) : "packages";

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể quản lý thương mại.</Alert>;

  return <>
    <PageHeader title="Thương mại" description="Gói dịch vụ, quy tắc giảm giá, báo giá, thanh toán và yêu cầu liên hệ doanh nghiệp. Số tiền và điều khoản là bản chụp do hệ thống trả." breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Thương mại" }]} />
    <Tabs value={tab} onValueChange={(value) => setParams({ tab: value === "packages" ? null : value, quotation: null, page: null })}>
      <TabsList aria-label="Thương mại">
        <TabsTrigger value="packages">Gói dịch vụ</TabsTrigger>
        <TabsTrigger value="discounts">Giảm giá</TabsTrigger>
        <TabsTrigger value="quotes">Báo giá</TabsTrigger>
        <TabsTrigger value="payments">Thanh toán</TabsTrigger>
        <TabsTrigger value="enterprise">Liên hệ doanh nghiệp</TabsTrigger>
        <TabsTrigger value="v7">Chờ BE (v7)</TabsTrigger>
      </TabsList>
      <TabsContent value="packages" style={{ marginTop: 16 }}>{tab === "packages" && <PackagesSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="discounts" style={{ marginTop: 16 }}>{tab === "discounts" && <DiscountsSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="quotes" style={{ marginTop: 16 }}>{tab === "quotes" && <QuotationsSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="payments" style={{ marginTop: 16 }}>{tab === "payments" && <PaymentsSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="enterprise" style={{ marginTop: 16 }}>{tab === "enterprise" && <EnterpriseAdminSection accessToken={accessToken} />}</TabsContent>
      <TabsContent value="v7" style={{ marginTop: 16 }}>{tab === "v7" && <V7PendingBlock scope="admin" />}</TabsContent>
    </Tabs>
  </>;
}
