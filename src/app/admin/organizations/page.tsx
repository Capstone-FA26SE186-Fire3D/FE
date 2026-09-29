import { OrganizationsAdmin } from "@/features/organizations/components/organizations-admin";
import { SiteHeader } from "@/layouts/site-header";

export const metadata = { title: "Quản lý tổ chức" };

export default function OrganizationsPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><OrganizationsAdmin /></main></div>;
}
