"use client";

import { Plus } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SubTabs } from "@/components/ui/sub-tabs";
import { routes } from "@/configs/routes";
import { analyticsApi } from "@/features/analytics/api";
import { useAuthSession } from "@/features/auth/auth-session";
import { KpiRow, KpiTile } from "@/features/admin-overview/components/admin-kit";
import { formatCount } from "@/features/admin-overview/format";
import { adminAiApi } from "../api";

import { AdminPoliciesTab } from "./admin-policies-tab";
import { AdminRequestsTab } from "./admin-requests-tab";
import { AdminSourcesTab } from "./admin-sources-tab";
import "@/assets/styles/ops-v2.css";
import { LoadingBlock } from "@/components/ui/spinner";

const TABS = ["requests", "policies", "sources"] as const;
type TabKey = (typeof TABS)[number];
const isTab = (value: string): value is TabKey => (TABS as readonly string[]).includes(value);

/** Every URL parameter owned by a tab; switching tabs clears them so filters and the open item never leak across tabs. */
const TAB_PARAMS = ["page", "request", "status", "operation", "audience", "organizationId", "visibility", "q", "source", "create"];

/**
 * `/admin/ai` (Figma Admin v2 "AI & nguồn tri thức"): AI requests (reconcile), operation policies and the knowledge-source
 * registry as sub-tabs; every list is a DataTable whose row opens a drawer, every create form a modal. PlatformAdmin only.
 */
export function AdminAi() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "requests";

  // Headline figures come from the server: registry totals (page size 1, only `total` is read), the platform training
  // report (AI usage by request status, 30 days) and the NeedsReconcile request count. A failed read shows an em dash.
  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const token = accessToken as string;
  const sources = useAsyncData("admin-ai:total:sources", (signal) => adminAiApi.listKnowledgeSources(token, { page: 1, pageSize: 1 }, signal), enabled);
  const drafts = useAsyncData("admin-ai:total:draft", (signal) => adminAiApi.listKnowledgeSources(token, { status: "Draft", page: 1, pageSize: 1 }, signal), enabled);
  const reconcile = useAsyncData("admin-ai:total:reconcile", (signal) => adminAiApi.listRequests(token, { status: "NeedsReconcile", page: 1, pageSize: 1 }, signal), enabled);
  const usage = useAsyncData("admin-ai:usage", (signal) => analyticsApi.training(token, { kind: "platform" }, {}, signal), enabled);
  const requestsByStatus = usage.data?.aiUsage?.requests ?? null;
  const requestTotal = requestsByStatus ? Object.values(requestsByStatus).reduce((sum, value) => sum + value, 0) : null;

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin quản trị yêu cầu AI, chính sách và nguồn tri thức.</Alert>;

  const clearTabParams = () => Object.fromEntries(TAB_PARAMS.map((key) => [key, null]));
  const changeTab = (value: string) => {
    if (!isTab(value) || value === tab) return;
    setParams({ ...clearTabParams(), tab: value === "requests" ? null : value });
  };

  return <>
    <PageHeader
      eyebrow="Quản lý nội dung"
      title="AI và nguồn tri thức"
      description="Chính sách AI, nguồn tri thức đã duyệt và yêu cầu gần đây. RAG chỉ dùng nguồn đã duyệt."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "AI & nguồn tri thức" }]}
      actions={<Button onClick={() => setParams({ ...clearTabParams(), tab: "sources", create: "1" })}><Plus size={16} aria-hidden="true" />Đăng ký nguồn</Button>}
    />
    <KpiRow label="Tổng quan AI">
      <KpiTile label="Nguồn tri thức" value={formatCount(sources.data?.total)} loading={sources.loading && !sources.data} hint={drafts.data ? `${formatCount(drafts.data.total)} chưa duyệt` : "Từ máy chủ"} />
      <KpiTile label="Chưa duyệt" value={formatCount(drafts.data?.total)} loading={drafts.loading && !drafts.data} hint="Draft chờ phê duyệt" />
      <KpiTile label="Yêu cầu AI 30 ngày" value={formatCount(requestTotal)} loading={usage.loading && !usage.data} hint="Hỏi đáp · Đề xuất · Học viên" />
      <KpiTile label="Cần đối soát" value={formatCount(reconcile.data?.total)} loading={reconcile.loading && !reconcile.data} tone={(reconcile.data?.total ?? 0) > 0 ? "warning" : undefined} hint="Timeout chờ reconcile" />
    </KpiRow>
    <SubTabs label="Quản trị AI" value={tab} onValueChange={changeTab} items={[{ value: "requests", label: "Yêu cầu" }, { value: "policies", label: "Chính sách AI" }, { value: "sources", label: "Nguồn tri thức" }]}>
      <div className="ops-subtabs-content">
        {tab === "requests" && <AdminRequestsTab accessToken={accessToken} usage={{ data: requestsByStatus, loading: usage.loading && !usage.data, failed: usage.error !== undefined }} />}
        {tab === "policies" && <AdminPoliciesTab accessToken={accessToken} />}
        {tab === "sources" && <AdminSourcesTab accessToken={accessToken} />}
      </div>
    </SubTabs>
    <div style={{ marginTop: 18 }}>
      <Alert tone="info" title="Model production không chọn qua API">Model do dịch vụ AI quyết định và ghi trên từng yêu cầu (modelVersion). Giao diện này chỉ quản trị chính sách, nguồn tri thức và đối soát yêu cầu.</Alert>
    </div>
  </>;
}
