import { AccountsAdmin } from "@/features/accounts/components/accounts-admin";
import { SiteHeader } from "@/layouts/site-header";

export const metadata = { title: "Quản lý tài khoản" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ organizationId?: string | string[] }> }) {
  const requestedOrganizationId = (await searchParams).organizationId;
  const initialOrganizationId = typeof requestedOrganizationId === "string" ? requestedOrganizationId : "";
  return <div className="site-shell"><SiteHeader /><main className="page-main"><AccountsAdmin initialOrganizationId={initialOrganizationId} /></main></div>;
}
