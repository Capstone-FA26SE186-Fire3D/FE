import { AccountProfile } from "@/features/account/components/account-profile";
import { SiteHeader } from "@/layouts/site-header";

export default function AccountPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><AccountProfile /></main></div>;
}
