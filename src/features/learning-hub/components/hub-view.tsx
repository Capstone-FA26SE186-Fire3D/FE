"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, LogOut, RotateCcw, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { articles } from "@/features/learn/data/articles";
import { useDemoSession } from "@/store/demo-session";
import { useAuthSession } from "@/features/auth/auth-session";
import { demoAnswer } from "../demo-answer";

export function HubView() {
  const params = useSearchParams();
  const { ready, isAuthenticated, name, bookmarks, chat, askQuestion, reset, storageAvailable } = useDemoSession();
  const { logout } = useAuthSession();
  const articleSlug = params.get("article");
  const article = articles.find((item) => item.slug === articleSlug);
  const savedArticles = articles.filter((item) => bookmarks.includes(item.slug));
  const [question, setQuestion] = useState("");
  const contextSlug = article?.slug ?? null;
  const messages = chat.filter((item) => item.articleSlug === contextSlug);
  const next = `${routes.learningHub}${article ? `?article=${article.slug}` : ""}`;

  if (!ready) return <Card className="hub-card"><p role="status">Đang khôi phục phiên trải nghiệm…</p></Card>;
  if (!isAuthenticated) return <Card className="hub-card"><h2>Góc học tập đang chờ bạn.</h2><p className="mb-5 text-[var(--muted)]">Đăng nhập để xem bài lưu và hỏi đáp minh họa. Không kết nối AI thật.</p><Button asChild><Link href={`${routes.login}?next=${encodeURIComponent(next)}`}>Đăng nhập trải nghiệm <ArrowUpRight size={15} /></Link></Button></Card>;

  const send = () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    askQuestion(trimmed, contextSlug);
    setQuestion("");
  };

  return (
    <div className="hub-layout">
      <div className="hub-main min-w-0">
        <Card className="hub-card">
          <h2>Chào {name}.</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">Hỏi đáp minh họa: câu trả lời được soạn sẵn theo bài, không phân tích câu hỏi bằng AI. Không dùng cho tình huống khẩn cấp.</p>
          {articleSlug && !article && <p role="status">Không tìm thấy bài này. Đã mở hỏi đáp chung.</p>}
          <p data-testid="article-context">{article ? `Đang hỏi theo bài: ${article.title}` : "Hỏi đáp chung"}</p>
          <div role="log" aria-label="Hỏi đáp minh họa" aria-live="polite" className="max-h-[480px] overflow-y-auto break-words">
            {!messages.length && <p>Chưa có câu hỏi trong ngữ cảnh này. Bạn có thể thử: “Bài này nói về điều gì?”</p>}
            {messages.map((message) => {
              const answer = demoAnswer(message.articleSlug);
              return <div key={message.id} className="mb-5">
                <div className="chat-bubble user"><strong className="block text-xs">Bạn</strong>{message.question}</div>
                <div className="chat-bubble"><strong className="mb-2 block text-xs">Trích đoạn minh họa từ bài đọc</strong><p>{answer.text}</p><Link className="underline underline-offset-4" href={answer.source.href}>Nguồn bài mẫu: {answer.source.title}</Link><p className="mt-2 text-xs">{answer.source.publisher}</p></div>
              </div>;
            })}
          </div>
          <form className="chat-input" onSubmit={(event) => { event.preventDefault(); send(); }}>
            <input className="min-w-0" maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Đặt một câu hỏi về bài đọc…" aria-label="Câu hỏi trong Góc học tập" />
            <Button type="submit" disabled={!question.trim()} aria-label="Gửi câu hỏi"><Send size={16} /></Button>
          </form>
        </Card>
        <Card className="hub-card">
          <h3>Kết quả minh họa — không phải lượt tập của bạn</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">Ví dụ: Quan sát hành lang · 3 phút · 2 điểm mốc đã ghi nhận. Chưa kết nối kết quả từ ứng dụng.</p>
          <details><summary className="cursor-pointer py-3">Xem phản hồi mẫu</summary><p>Đã ghi nhận cửa và cầu thang trong mô hình. Ghi chú mẫu: giải thích vì sao mỗi điểm mốc ảnh hưởng tới lựa chọn. Đây không phải điểm an toàn hay chứng nhận.</p></details>
        </Card>
      </div>
      <aside className="hub-side min-w-0">
        <Card className="hub-card"><h3><Bookmark size={16} className="mr-2 inline" /> Bài đã lưu</h3>
          {savedArticles.length ? savedArticles.map((saved) => <Link className="saved-row" href={`/learn/${saved.slug}`} key={saved.slug}>{saved.title}<ArrowUpRight size={14} /></Link>) : <p>Chưa có bài đã lưu. <Link className="underline" href="/learn">Khám phá Learn</Link></p>}
        </Card>
        <Card className="hub-card"><h3>Lịch sử hỏi đáp</h3>
          {!chat.length && <p>Chưa có câu hỏi trong phiên.</p>}
          <ul className="max-h-64 list-none space-y-3 overflow-y-auto p-0">
            {chat.slice(-10).reverse().map((item) => <li key={item.id}><Link className="block break-words py-2 underline" onClick={() => setQuestion("")} href={item.articleSlug ? `/learning-hub?article=${item.articleSlug}` : "/learning-hub"}>{item.question}</Link><time className="text-xs text-[var(--muted)]" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("vi-VN")}</time></li>)}
          </ul>
        </Card>
        <Card className="hub-card"><h3>Phiên trải nghiệm</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">Lưu tối đa 50 câu hỏi trong tab này. Đặt lại hoặc đăng xuất sẽ xóa bài lưu và lịch sử mẫu.</p>
          {!storageAvailable && <p role="status">Trình duyệt không cho phép lưu phiên. Dữ liệu sẽ mất khi tải lại.</p>}
          <div className="flex flex-wrap gap-2"><Button onClick={reset} variant="quiet"><RotateCcw size={14} /> Đặt lại</Button><Button onClick={logout} variant="ghost"><LogOut size={14} /> Đăng xuất</Button></div>
        </Card>
      </aside>
    </div>
  );
}
