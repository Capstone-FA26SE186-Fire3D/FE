import type { Metadata } from "next";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import { articles } from "@/features/learn/data/articles";
import { LearnBrowser } from "@/features/learn/components/learn-browser";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main learn-page"><header className="learn-heading"><p className="kicker"><span className="kicker-line" /> Learn / thư viện mở</p><h1>Hiểu thêm. Chủ động hơn.</h1><p>Bài đọc ngắn để làm quen, đặt câu hỏi và nối kiến thức với trải nghiệm.</p></header><LearnBrowser articles={articles} /></main><SiteFooter /></div>;
}
