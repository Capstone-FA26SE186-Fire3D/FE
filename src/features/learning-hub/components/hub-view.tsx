"use client";

import Link from "next/link";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { Iconsax } from "@/components/ui/iconsax";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { articles } from "@/features/learn/data/articles";
import { useDemoSession } from "@/store/demo-session";
import { demoAnswer } from "../demo-answer";

export function HubView() {
  const params = useSearchParams();
  const { ready: demoReady, bookmarks, chat, askQuestion, reset, storageAvailable } = useDemoSession();
  const { isAuthenticated, logout, ready: authReady, user } = useAuthSession();
  const ready = demoReady && authReady;
  const name = user?.fullName || user?.email || "bạn";
  const articleSlug = params.get("article");
  const article = articles.find((item) => item.slug === articleSlug);
  const savedArticles = articles.filter((item) => bookmarks.includes(item.slug));
  const [tab, setTab] = useState<"chat" | "saved" | "history">("chat");
  const [question, setQuestion] = useState("");
  const contextSlug = article?.slug ?? null;
  const messages = chat.filter((item) => item.articleSlug === contextSlug);
  const conversationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const log = conversationRef.current;
    if (log) log.scrollTop = messages.length ? log.scrollHeight : 0;
  }, [messages.length, contextSlug, ready, tab]);
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
    <>
    <div className="hub-greeting"><p>Chào {name}. Bạn muốn tìm hiểu điều gì hôm nay?</p><span className="hub-demo-label">Hỏi đáp minh họa</span></div>
    <nav className="hub-tabs" aria-label="Nội dung Góc học tập">{([['chat', 'Hỏi đáp', 'message-question'], ['saved', 'Bài đã lưu', 'archive-book'], ['history', 'Lịch sử', 'clock']] as const).map(([key, label, icon]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}><Iconsax name={icon} size={17} />{label}</button>)}</nav>
    <div className={`hub-layout hub-tab-${tab}`}>
      <div className="hub-main min-w-0">
        <Card className="hub-card hub-chat">
          <h2><Iconsax name="message-question" /> Hỏi đáp theo bài đọc</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">Câu trả lời soạn sẵn, chưa kết nối AI. Không dùng khi khẩn cấp.</p>
          {articleSlug && !article && <p role="status">Không tìm thấy bài này. Đã mở hỏi đáp chung.</p>}
          <div className="hub-context" data-testid="article-context">{article ? <><span>Đang hỏi theo bài: {article.title}</span><Link href={`/learn/${article.slug}`}>Đọc lại bài</Link><Link href={routes.learningHub}>Hỏi đáp chung</Link></> : <><span>Hỏi đáp chung</span><Link href={routes.learn}>Chọn bài đọc</Link></>}</div>
          <div ref={conversationRef} role="log" aria-label="Hỏi đáp minh họa" aria-live="polite" className="hub-conversation">
            {!messages.length && <div className="hub-empty"><Iconsax name="message-question" size={32} /><h3>Bắt đầu từ một câu hỏi</h3><p>Chọn gợi ý để xem trích đoạn minh họa có nguồn.</p><div className="hub-suggestions">{["Bài này nói về điều gì?", "Tôi cần ghi nhớ những điểm nào?", "Tìm nguồn để đọc thêm ở đâu?"].map((suggestion) => <button key={suggestion} type="button" onClick={() => askQuestion(suggestion, contextSlug)}>{suggestion}</button>)}</div></div>}
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
            <Button type="submit" disabled={!question.trim()} aria-label="Gửi câu hỏi"><Iconsax name="send-2" size={18} /></Button>
          </form>
        </Card>
      </div>
      <aside className="hub-side min-w-0">
        <Card className="hub-card hub-saved"><h3><Iconsax name="archive-book" size={18} /> Bài đã lưu</h3>
          {savedArticles.length ? savedArticles.map((saved) => <Link className="saved-row" href={`/learn/${saved.slug}`} key={saved.slug}>{saved.title}<ArrowUpRight size={14} /></Link>) : <p>Chưa có bài đã lưu. <Link className="underline" href="/learn">Khám phá Learn</Link></p>}
        </Card>
        <Card className="hub-card hub-history"><h3><Iconsax name="clock" size={18} /> Lịch sử hỏi đáp</h3>
          {!chat.length && <p>Chưa có câu hỏi trong phiên.</p>}
          <ul className="max-h-64 list-none space-y-3 overflow-y-auto p-0">
            {chat.slice(-10).reverse().map((item) => <li key={item.id}><Link className="block break-words py-2 underline" onClick={() => { setQuestion(""); setTab("chat"); }} href={item.articleSlug ? `/learning-hub?article=${item.articleSlug}` : "/learning-hub"}>{item.question}</Link><time className="text-xs text-[var(--muted)]" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("vi-VN")}</time></li>)}
          </ul>
        </Card>
        <Card className="hub-card hub-session"><h3>Phiên trải nghiệm</h3>
          <p className="text-sm leading-6 text-[var(--muted)]">Lưu tối đa 50 câu hỏi trong tab này. Đặt lại hoặc đăng xuất sẽ xóa bài lưu và lịch sử mẫu.</p>
          {!storageAvailable && <p role="status">Trình duyệt không cho phép lưu phiên. Dữ liệu sẽ mất khi tải lại.</p>}
          <div className="flex flex-wrap gap-2"><Button onClick={reset} variant="quiet"><RotateCcw size={14} /> Đặt lại</Button><Button onClick={logout} variant="ghost"><Iconsax name="logout" size={16} /> Đăng xuất</Button></div>
        </Card>
      </aside>
    </div>
    <details className="hub-demo-results"><summary>Kết quả mô phỏng mẫu</summary><p>Ví dụ: Quan sát hành lang · 3 phút · 2 điểm mốc đã ghi nhận. Đây là dữ liệu minh họa, không phải lượt tập của bạn. Chưa kết nối kết quả từ ứng dụng.</p><p>Phản hồi mẫu: giải thích vì sao cửa và cầu thang ảnh hưởng tới lựa chọn. Đây không phải điểm an toàn hay chứng nhận.</p></details>
    </>
  );
}
