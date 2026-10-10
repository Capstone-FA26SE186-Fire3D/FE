"use client";

import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { AdminFeedbackTab } from "./admin-feedback-tab";
import { AdminTicketsTab } from "./admin-tickets-tab";
import { AuditLogTab } from "./audit-log-tab";

const TABS = ["tickets", "feedback", "audit"] as const;
type TabKey = (typeof TABS)[number];
const isTab = (value: string): value is TabKey => (TABS as readonly string[]).includes(value);

/** Every URL parameter owned by a tab; switching tabs clears them so filters never leak across tabs. */
const TAB_PARAMS = ["page", "ticket", "status", "priority", "assignedTo", "organizationId", "fbStatus", "fbOrganizationId", "actorId", "action", "targetId", "correlationId", "from", "to"];

export function AdminSupport() {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const tabParam = get("tab");
  const tab: TabKey = isTab(tabParam) ? tabParam : "tickets";

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0 || !accessToken) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể xem hộp thư hỗ trợ và nhật ký audit.</Alert>;

  const changeTab = (value: string) => {
    if (!isTab(value) || value === tab) return;
    setParams({ ...Object.fromEntries(TAB_PARAMS.map((key) => [key, null])), tab: value === "tickets" ? null : value });
  };

  return <>
    <PageHeader
      title="Hỗ trợ & audit"
      description="Xử lý ticket và phản hồi của người dùng, đối soát hành động qua nhật ký audit."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Hỗ trợ & audit" }]}
    />
    <Tabs value={tab} onValueChange={changeTab}>
      <TabsList aria-label="Hỗ trợ và audit">
        <TabsTrigger value="tickets">Ticket</TabsTrigger>
        <TabsTrigger value="feedback">Phản hồi</TabsTrigger>
        <TabsTrigger value="audit">Nhật ký audit</TabsTrigger>
      </TabsList>
      <TabsContent value="tickets"><AdminTicketsTab accessToken={accessToken} myId={user.id} /></TabsContent>
      <TabsContent value="feedback"><AdminFeedbackTab accessToken={accessToken} /></TabsContent>
      <TabsContent value="audit"><AuditLogTab accessToken={accessToken} /></TabsContent>
    </Tabs>
  </>;
}
