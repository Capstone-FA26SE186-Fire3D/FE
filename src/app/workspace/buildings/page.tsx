import { BuildingsWorkspace } from "@/features/buildings/components/buildings-workspace";
import { SiteHeader } from "@/layouts/site-header";

export const metadata = { title: "Công trình" };

export default function BuildingsPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><BuildingsWorkspace /></main></div>;
}
