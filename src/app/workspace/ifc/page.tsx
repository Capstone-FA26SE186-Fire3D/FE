import type { Metadata } from "next";
import { OrganizationIfcClient } from "@/features/ifc-scan/components/organization-ifc-client";
import { SiteHeader } from "@/layouts/site-header";

export const metadata: Metadata = { title: "Mô hình IFC" };

export default function WorkspaceIfcPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><OrganizationIfcClient /></main></div>;
}
