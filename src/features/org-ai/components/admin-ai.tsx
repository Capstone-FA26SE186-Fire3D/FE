"use client";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { analyticsApi } from "@/features/analytics/api";
import { useAuthSession } from "@/features/auth/auth-session";
import { KpiRow, KpiTile } from "@/features/admin-overview/components/admin-kit";
import { formatCount } from "@/features/admin-overview/format";
import { adminAiApi } from "../api";

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

  // Headline figures come from the server: registry totals (page size 1, only `totalCount`/`total` is read), the platform
  // training report (AI usage by request status) and the NeedsReconcile request count. A failed read shows an em dash.
  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const token = accessToken as string;
  const sources = useAsyncData("admin-ai:total:sources", (signal) => adminAiApi.listKnowledgeSources(token, { page: 1, pageSize: 1 }, signal), enabled);
  const drafts = useAsyncData("admin-ai:total:draft", (signal) => adminAiApi.listKnowledgeSources(token, { status: "Draft", page: 1, pageSize: 1 }, signal), enabled);
  const reconcile = useAsyncData("admin-ai:total:reconcile", (signal) => adminAiApi.listRequests(token, { status: "NeedsReconcile", page: 1, pageSize: 1 }, signal), enabled);
  const usage = useAsyncData("admin-ai:usage", (signal) => analyticsApi.training(token, { kind: "platform" }, {}, signal), enabled);
  const requestTotal = usage.data?.aiUsage ? Object.values(usage.data.aiUsage.requests).reduce((sum, value) => sum + value, 0) : null;

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin quản trị yêu cầu AI, chính sách và nguồn tri thức.</Alert>;

  const changeTab = (value: string) => {
    if (!isTab(value) || value === tab) return;
    setParams({ ...Object.fromEntries(TAB_PARAMS.map((key) => [key, null])), tab: value === "requests" ? null : value });
  };

  return <>
    <PageHeader
      eyebrow="Quản lý nội dung"
      title="AI và nguồn tri thức"
      description="Quản lý nguồn tri thức, chính sách quota và yêu cầu AI. RAG chỉ dùng nguồn đã duyệt."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "AI & nguồn tri thức" }]}
    />
    <KpiRow label="Tổng quan AI">
      <KpiTile label="Nguồn tri thức" value={formatCount(sources.data?.total)} loading={sources.loading && !sources.data} hint="Từ máy chủ" />
      <KpiTile label="Chưa duyệt" value={formatCount(drafts.data?.total)} loading={drafts.loading && !drafts.data} hint="Trạng thái Draft" />
      <KpiTile label="Yêu cầu AI 30 ngày" value={formatCount(requestTotal)} loading={usage.loading && !usage.data} hint="Từ báo cáo sử dụng AI" />
      <KpiTile label="Cần đối soát" value={formatCount(reconcile.data?.total)} loading={reconcile.loading && !reconcile.data} tone={(reconcile.data?.total ?? 0) > 0 ? "warning" : undefined} hint="Yêu cầu NeedsReconcile" />
    </KpiRow>
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
    <div style={{ marginTop: 18 }}>
      <Alert tone="info" title="Model production không chọn qua API">Model do dịch vụ AI quyết định và ghi trên từng yêu cầu (modelVersion). Giao diện này chỉ quản trị chính sách, nguồn tri thức và đối soát yêu cầu.</Alert>
    </div>
  </>;
}
