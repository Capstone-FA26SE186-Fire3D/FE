import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnBrowser } from "@/features/learn/components/learn-browser";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";

const description = "Bài viết, mẹo và video ngắn để làm quen, đặt câu hỏi và nối kiến thức với trải nghiệm luyện tập.";
const FILTER_PARAMS = ["search", "situation", "kind", "page"];

/**
 * The bare list is indexable. A URL that carries a search, filters or a page is one of endless combinations, so it stays out of
 * search indexes (its links are still followed to the posts).
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await searchParams;
  const variant = FILTER_PARAMS.some((name) => params[name] !== undefined);
  return { title: "Learn", description, ...(variant ? { robots: { index: false, follow: true } } : {}) };
}

export default function LearnPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main learn-page"><header className="learn-heading"><p className="kicker"><span className="kicker-line" /> Learn / thư viện mở</p><h1>Hiểu thêm. Chủ động hơn.</h1><p>Bài đọc ngắn để làm quen, đặt câu hỏi và nối kiến thức với trải nghiệm.</p></header><Suspense fallback={<p role="status">Đang mở thư viện Learn…</p>}><LearnBrowser /></Suspense></main><SiteFooter /></div>;
}
