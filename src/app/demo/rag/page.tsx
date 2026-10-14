import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/layouts/site-footer";
import { SiteHeader } from "@/layouts/site-header";
import { RagConsole } from "@/features/rag/components/rag-console";

export const metadata: Metadata = { title: "RAG demo" };

/*
 * Developer prototype that talks to the FastAPI service directly. The production AI path goes through the .NET API, so
 * a production build answers 404 here (NODE_ENV is fixed at build time, so the page is not even generated).
 */
export default function RagPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <div className="site-shell"><SiteHeader /><main className="page-main rag-shell"><section className="page-hero"><p className="kicker"><span className="kicker-line" /> Developer demo · Prototype, không phải tích hợp production</p><h1>Hỏi trong<br /><em>tài liệu của bạn.</em></h1><p>Đây là màn hình RAG thử nghiệm giữ lại từ starter app. API được gọi trực tiếp theo contract `/chat` và `/documents`.</p></section><RagConsole /></main><SiteFooter /></div>;
}
