import { AccountsAdmin } from "@/features/accounts/components/accounts-admin";
import { SiteHeader } from "@/layouts/site-header";

export const metadata = { title: "Quản lý tài khoản" };

export default function AccountsPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><AccountsAdmin /></main></div>;
}
