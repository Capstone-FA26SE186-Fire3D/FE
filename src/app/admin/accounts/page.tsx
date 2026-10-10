import { AccountsAdmin } from "@/features/accounts/components/accounts-admin";

export const metadata = { title: "Quản lý tài khoản" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ organizationId?: string | string[] }> }) {
  const requestedOrganizationId = (await searchParams).organizationId;
  const initialOrganizationId = typeof requestedOrganizationId === "string" ? requestedOrganizationId : "";
  return <AccountsAdmin initialOrganizationId={initialOrganizationId} />;
}
