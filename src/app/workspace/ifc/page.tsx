import type { Metadata } from "next";
import { OrganizationIfcClient } from "@/features/ifc-scan/components/organization-ifc-client";

export const metadata: Metadata = { title: "Mô hình IFC" };

export default function WorkspaceIfcPage() {
  return <OrganizationIfcClient />;
}
