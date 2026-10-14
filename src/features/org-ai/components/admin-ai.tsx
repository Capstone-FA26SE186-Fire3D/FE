"use client";

import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";

import { AdminPoliciesTab } from "./admin-policies-tab";
import { AdminRequestsTab } from "./admin-requests-tab";
import { AdminSourcesTab } from "./admin-sources-tab";

const TABS = ["requests", "policies", "sources"] as const;
type TabKey = (typeof TABS)[number];
const isTab = (value: string): value is TabKey => (TABS as readonly string[]).includes(value);

/** Every URL parameter owned by a tab; switching tabs clears them so filters and the open item never leak across tabs. */
const TAB_PARAMS = ["page", "request", "status", "organizationId", "visibility", "q", "source"];

/** `/admin/ai`: AI requests (reconcile), operation policies and the knowledge-source registry. PlatformAdmin only. */
export function AdminAi() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "requests";

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin quản trị yêu cầu AI, chính sách và nguồn tri thức.</Alert>;

  const changeTab = (value: string) => {
    if (!isTab(value) || value === tab) return;
    setParams({ ...Object.fromEntries(TAB_PARAMS.map((key) => [key, null])), tab: value === "requests" ? null : value });
  };

  return <>
    <PageHeader
      title="AI & nguồn tri thức"
      description="Theo dõi và đối soát yêu cầu AI của các tổ chức, đặt chính sách giữ chỗ quota và duyệt nguồn tri thức mà AI được phép trích dẫn."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "AI & nguồn tri thức" }]}
    />
    <Tabs value={tab} onValueChange={changeTab}>
      <TabsList aria-label="Quản trị AI">
        <TabsTrigger value="requests">Yêu cầu</TabsTrigger>
        <TabsTrigger value="policies">Chính sách AI</TabsTrigger>
        <TabsTrigger value="sources">Nguồn tri thức</TabsTrigger>
      </TabsList>
      <TabsContent value="requests" style={{ marginTop: 16 }}>{tab === "requests" && <AdminRequestsTab accessToken={accessToken} />}</TabsContent>
      <TabsContent value="policies" style={{ marginTop: 16 }}>{tab === "policies" && <AdminPoliciesTab accessToken={accessToken} />}</TabsContent>
      <TabsContent value="sources" style={{ marginTop: 16 }}>{tab === "sources" && <AdminSourcesTab accessToken={accessToken} />}</TabsContent>
    </Tabs>
  </>;
}
