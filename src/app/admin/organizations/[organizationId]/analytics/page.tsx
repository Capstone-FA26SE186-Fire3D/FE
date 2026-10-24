import { AnalyticsWorkspace } from "@/features/analytics/components/analytics-workspace";

export const metadata = { title: "Báo cáo của tổ chức" };

// The page only hands the ids to client code (all data is fetched in the browser), so each URL is rendered once and
// then served from the CDN instead of running a server function on every visit.
export function generateStaticParams() {
  return [];
}

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
