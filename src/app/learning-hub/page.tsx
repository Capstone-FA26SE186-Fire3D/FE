import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import { HubView } from "@/features/learning-hub/components/hub-view";

export const metadata: Metadata = { title: "Góc học tập" };

export default function LearningHubPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main learning-hub-main"><header className="hub-heading"><h1>Góc học tập</h1></header><Suspense fallback={<div className="hub-card">Đang mở Góc học tập...</div>}><HubView /></Suspense></main><SiteFooter /></div>;
}
