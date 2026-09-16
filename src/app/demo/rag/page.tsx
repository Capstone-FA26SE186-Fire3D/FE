import type { Metadata } from "next";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import { RagConsole } from "@/features/rag/components/rag-console";

export const metadata: Metadata = { title: "RAG demo" };

export default function RagPage() {
  return <div className="site-shell"><SiteHeader /><main className="page-main rag-shell"><section className="page-hero"><p className="kicker"><span className="kicker-line" /> Developer demo</p><h1>Hỏi trong<br /><em>tài liệu của bạn.</em></h1><p>Đây là màn hình RAG thử nghiệm giữ lại từ starter app. API được gọi trực tiếp theo contract `/chat` và `/documents`.</p></section><RagConsole /></main><SiteFooter /></div>;
}
