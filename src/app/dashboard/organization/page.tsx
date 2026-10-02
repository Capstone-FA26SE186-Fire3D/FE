import { RoleDashboard } from "@/features/dashboard/components/role-dashboard";
import { SiteHeader } from "@/layouts/site-header";

export const metadata = { title: "Không gian tổ chức" };

export default function OrganizationDashboardPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><RoleDashboard role="organization" /></main></div>;
}
