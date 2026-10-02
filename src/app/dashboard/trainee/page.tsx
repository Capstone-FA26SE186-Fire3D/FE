import { RoleDashboard } from "@/features/dashboard/components/role-dashboard";
import { SiteHeader } from "@/layouts/site-header";

export const metadata = { title: "Không gian học tập" };

export default function TraineeDashboardPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><RoleDashboard role="trainee" /></main></div>;
}
