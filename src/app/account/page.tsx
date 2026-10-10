import { AccountProfile } from "@/features/account/components/account-profile";
import { PublicOpsScope } from "@/features/account/components/public-ops-scope";
import { SiteHeader } from "@/layouts/site-header";

export default function AccountPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><PublicOpsScope><AccountProfile /></PublicOpsScope></main></div>;
}
