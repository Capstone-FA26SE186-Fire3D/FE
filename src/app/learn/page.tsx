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
  return { title: "Bài học", description, ...(variant ? { robots: { index: false, follow: true } } : {}) };
}

export default function LearnPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main learn-page"><header className="learn-heading"><p className="kicker"><span className="kicker-line" /> Khám phá bài học</p><h1>Bài viết, mẹo và video về an toàn cháy nổ</h1><p>Công khai cho mọi người. Đăng nhập tài khoản học viên để lưu bài và hỏi Trợ lý AI về nội dung bài.</p></header><Suspense fallback={<p role="status">Đang mở thư viện bài học…</p>}><LearnBrowser /></Suspense></main><SiteFooter /></div>;
}
