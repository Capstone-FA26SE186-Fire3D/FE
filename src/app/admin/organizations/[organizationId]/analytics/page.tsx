import { AnalyticsWorkspace } from "@/features/analytics/components/analytics-workspace";

export const metadata = { title: "Báo cáo của tổ chức" };

export default async function OrganizationAnalyticsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <AnalyticsWorkspace
    variant="admin-organization"
    organizationId={organizationId}
    title="Báo cáo của tổ chức"
    description="Huấn luyện và vận hành của một tổ chức, không gồm tài khoản, doanh thu của tổ chức khác."
    breadcrumbs={[{ label: "Quản trị", href: "/admin/overview" }, { label: "Tổ chức", href: "/admin/organizations" }, { label: "Báo cáo" }]}
  />;
}
