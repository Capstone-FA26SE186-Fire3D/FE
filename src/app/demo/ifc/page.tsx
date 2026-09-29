import type { Metadata } from "next";
import { IfcDemoClient } from "@/features/ifc-scan/components/ifc-demo-client";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";

export const metadata: Metadata = { title: "IFC scan demo" };

export default function IfcDemoPage() {
  return <div className="site-shell"><SiteHeader /><main><IfcDemoClient /></main><SiteFooter /></div>;
}
