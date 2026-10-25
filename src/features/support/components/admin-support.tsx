"use client";

import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { SubTabs } from "@/components/ui/sub-tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { AdminFeedbackTab } from "./admin-feedback-tab";
import { AdminTicketsTab } from "./admin-tickets-tab";
import { AuditLogTab } from "./audit-log-tab";
import "@/assets/styles/ops-v2.css";
import { LoadingBlock } from "@/components/ui/spinner";

const TABS = ["tickets", "feedback", "audit"] as const;
type TabKey = (typeof TABS)[number];
const isTab = (value: string): value is TabKey => (TABS as readonly string[]).includes(value);

/** Every URL parameter owned by a tab; switching tabs clears them so filters never leak across tabs. */
const TAB_PARAMS = ["page", "q", "ticket", "status", "priority", "assignedTo", "organizationId", "fbStatus", "fbOrganizationId", "feedback", "log", "actorId", "action", "targetId", "correlationId", "from", "to"];

/**
 * `/admin/support` (Figma Admin v2 "Hỗ trợ & audit"): three sub-tabs — the ticket queue, product feedback and the
 * audit log. The audit log lives only here; each list is a DataTable whose row opens a drawer.
 */
export function AdminSupport() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "tickets";

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ quản trị FET3D xem được hộp thư hỗ trợ và nhật ký thao tác.</Alert>;

  const changeTab = (value: string) => {
    if (!isTab(value) || value === tab) return;
    setParams({ ...Object.fromEntries(TAB_PARAMS.map((key) => [key, null])), tab: value === "tickets" ? null : value });
  };

  return <>
    <PageHeader
      eyebrow="Xử lý công việc"
      title="Hỗ trợ và nhật ký"
      description="Yêu cầu hỗ trợ, phản hồi và nhật ký các thao tác quan trọng."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Hỗ trợ & nhật ký" }]}
    />
    <SubTabs label="Hỗ trợ và nhật ký" value={tab} onValueChange={changeTab} items={[{ value: "tickets", label: "Yêu cầu hỗ trợ" }, { value: "feedback", label: "Phản hồi" }, { value: "audit", label: "Nhật ký thao tác" }]}>
      <div className="ops-subtabs-content">
        {tab === "tickets" && <AdminTicketsTab accessToken={accessToken} myId={user.id} />}
        {tab === "feedback" && <AdminFeedbackTab accessToken={accessToken} />}
        {tab === "audit" && <AuditLogTab accessToken={accessToken} />}
      </div>
    </SubTabs>
  </>;
}
