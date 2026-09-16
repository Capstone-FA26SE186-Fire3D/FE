import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import { HubView } from "@/features/learning-hub/components/hub-view";

export const metadata: Metadata = { title: "Góc học tập" };

export default function LearningHubPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><section className="page-hero"><p className="kicker"><span className="kicker-line" /> Khu vực cá nhân</p><h1>Góc học tập<br /><em>của bạn.</em></h1><p>Nơi bài đọc, câu hỏi và kết quả mô phỏng gặp nhau. Đây là phiên trải nghiệm với dữ liệu minh họa rõ ràng.</p></section><Suspense fallback={<div className="hub-card">Đang mở Góc học tập...</div>}><HubView /></Suspense></main><SiteFooter /></div>;
}
