import type { Metadata } from "next";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import { articles } from "@/features/learn/data/articles";
import { LearnBrowser } from "@/features/learn/components/learn-browser";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main"><section className="page-hero"><p className="kicker"><span className="kicker-line" /> Learn / thư viện mở</p><h1>Hiểu thêm.<br /><em>Chủ động hơn.</em></h1><p>Những bài đọc ngắn, có nguồn và được viết để nối kiến thức với trải nghiệm. Đọc công khai; lưu và hỏi về bài khi bạn sẵn sàng bước vào Góc học tập.</p></section><div className="learn-layout"><section><LearnBrowser articles={articles} /></section><aside className="article-side"><BadgeText title="Điểm bắt đầu" body="Chọn một bài gần với câu hỏi của bạn. Không cần tài khoản để đọc." /><BadgeText title="Khi muốn đi xa hơn" body="Đăng nhập trải nghiệm để lưu bài, hỏi AI theo ngữ cảnh và xem lịch sử học mẫu." /></aside></div></main><SiteFooter /></div>;
}

function BadgeText({ title, body }: { title: string; body: string }) {
  return <div className="mb-7 border-l border-[var(--ember)] pl-4"><h2 className="mb-2 text-sm font-semibold">{title}</h2><p className="m-0 text-[13px] leading-7 text-[var(--muted)]">{body}</p></div>;
}
