"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Iconsax, type IconsaxName } from "@/components/ui/iconsax";
import { FET3DLogo } from "@/components/brand/fet3d-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { AccountProfile } from "@/features/account/components/account-profile";
import { PublicOpsScope } from "@/features/account/components/public-ops-scope";
import { useAuthSession } from "@/features/auth/auth-session";
import { articles } from "@/features/learn/data/articles";
import { LearnBrowser } from "@/features/learn/components/learn-browser";
import { useDemoSession } from "@/store/demo-session";
import { demoAnswer } from "../demo-answer";

const views = [
  { key: "saved", label: "Bài đã lưu", icon: "archive-book" },
  { key: "questions", label: "Hỏi đáp", icon: "message-question" },
  { key: "history", label: "Lịch sử", icon: "clock" },
  { key: "profile", label: "Hồ sơ", icon: "user" },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: IconsaxName }>;

export function HubView() {
  const params = useSearchParams();
  const { ready: demoReady, bookmarks, chat, askQuestion, reset, storageAvailable } = useDemoSession();
  const { isAuthenticated, logout, ready: authReady, user } = useAuthSession();
  const ready = demoReady && authReady;
  const articleSlug = params.get("article");
  const article = articles.find((item) => item.slug === articleSlug);
  const requestedView = params.get("view");
  const view = views.find((item) => item.key === requestedView)?.key ?? (articleSlug ? "questions" : "saved");
  const selected = views.find((item) => item.key === view)!;
  const savedArticles = articles.filter((item) => bookmarks.includes(item.slug));
  const [question, setQuestion] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const contextSlug = article?.slug ?? null;
  const messages = chat.filter((item) => item.articleSlug === contextSlug);
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = conversationRef.current;
    if (log) {
      const exchange = document.getElementById(window.location.hash.slice(1));
      if (exchange && log.contains(exchange)) exchange.scrollIntoView({ block: "nearest" });
      else log.scrollTop = messages.length ? log.scrollHeight : 0;
    }
  }, [messages.length, contextSlug, ready, view]);

  useEffect(() => {
    if (!menuOpen) return;
    navigationRef.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => { setMenuOpen(false); menuButton.current?.focus(); };
  const next = "/learning-hub" + (params.size ? "?" + params.toString() : "");
  if (!ready) return <main className="page-main"><p role="status">Đang khôi phục phiên trải nghiệm…</p></main>;
  if (!isAuthenticated) return <main className="page-main"><Card className="hub-card"><h1>Thư viện cá nhân</h1><p className="mb-5 text-[var(--muted)]">Đăng nhập để xem bài đã lưu và hỏi đáp minh họa.</p><Button asChild><Link href={`${routes.login}?next=${encodeURIComponent(next)}`}>Đăng nhập</Link></Button></Card></main>;

  const send = () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    askQuestion(trimmed, contextSlug);
    setQuestion("");
  };

  return <div className="learning-workspace">
    <aside className="learning-sidebar">
      <Link className="learning-brand" href="/" aria-label="FET3D, về trang chủ"><FET3DLogo variant="mark" /><span>FET3D<small>Thư viện cá nhân</small></span></Link>
      <button ref={menuButton} type="button" className="learning-menu-toggle" aria-expanded={menuOpen} aria-controls="learning-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "Đóng menu" : "Mở menu học tập"}</button>
      <nav id="learning-navigation" ref={navigationRef} className={`learning-navigation ${menuOpen ? "is-open" : ""}`} aria-label="Quản lý học tập">
        <div className="learning-nav-items">{views.map((item) => <Link key={item.key} href={`/learning-hub?view=${item.key}`} aria-current={view === item.key ? "page" : undefined} onClick={closeMenu}><Iconsax name={item.icon} />{item.label}</Link>)}</div>
        <div className="learning-nav-bottom"><Link href="/learn" onClick={closeMenu}><Iconsax name="buildings" />Khám phá Learn</Link><button type="button" onClick={() => void logout()}><Iconsax name="logout" />Đăng xuất</button></div>
      </nav>
    </aside>
    <div className="learning-content">
      <header className="learning-topbar"><div><p>Thư viện cá nhân</p><h1>{selected.label}</h1></div><Link href="/learning-hub?view=profile" className="learning-account"><Iconsax name="user" size={18} /><span>{user?.fullName || user?.email}</span></Link></header>
      <main id="learning-main" className={`learning-main learning-view-${view}`}>
        {view === "saved" && (savedArticles.length ? <LearnBrowser articles={savedArticles} saved /> : <div className="learning-empty"><Iconsax name="archive-book" size={38} /><h2>Giữ lại những bài bạn muốn đọc tiếp.</h2><p>Chưa có bài đã lưu trong phiên trải nghiệm này.</p><Button asChild><Link href="/learn">Khám phá Learn</Link></Button></div>)}
        {view === "questions" && <>
        <Card className="hub-card hub-chat">
          <h2><Iconsax name="message-question" /> Hỏi đáp theo bài đọc</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">Câu trả lời soạn sẵn, chưa kết nối AI. Không dùng khi khẩn cấp.</p>
          {articleSlug && !article && <p role="status">Không tìm thấy bài này. Đã mở hỏi đáp chung.</p>}
          <div className="hub-context" data-testid="article-context">{article ? <><span>Đang hỏi theo bài: {article.title}</span><Link href={`/learn/${article.slug}`}>Đọc lại bài</Link><Link href="/learning-hub?view=questions">Hỏi đáp chung</Link></> : <><span>Hỏi đáp chung</span><Link href={routes.learn}>Chọn bài đọc</Link></>}</div>
          <div ref={conversationRef} role="log" aria-label="Hỏi đáp minh họa" aria-live="polite" className="hub-conversation">
            {!messages.length && <div className="hub-empty"><Iconsax name="message-question" size={32} /><h3>Bắt đầu từ một câu hỏi</h3><p>Chọn gợi ý để xem trích đoạn minh họa có nguồn.</p><div className="hub-suggestions">{["Bài này nói về điều gì?", "Tôi cần ghi nhớ những điểm nào?", "Tìm nguồn để đọc thêm ở đâu?"].map((suggestion) => <button key={suggestion} type="button" onClick={() => askQuestion(suggestion, contextSlug)}>{suggestion}</button>)}</div></div>}
            {messages.map((message) => {
              const answer = demoAnswer(message.articleSlug);
              return <div id={`exchange-${message.id}`} key={message.id} className="mb-5">
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

        <details className="hub-demo-results"><summary>Kết quả mô phỏng mẫu</summary><p>Ví dụ: Quan sát hành lang · 3 phút · 2 điểm mốc đã ghi nhận. Đây là dữ liệu minh họa, không phải lượt tập của bạn. Chưa kết nối kết quả từ ứng dụng.</p><p>Phản hồi mẫu: giải thích vì sao cửa và cầu thang ảnh hưởng tới lựa chọn. Đây không phải điểm an toàn hay chứng nhận.</p></details>
        </>}
        {view === "history" && <section className="learning-history"><p className="learning-note">Hỏi đáp minh họa · tối đa 50 câu hỏi trong tab này.</p>
          {!storageAvailable && <p role="status">Trình duyệt không cho phép lưu phiên. Dữ liệu sẽ mất khi tải lại.</p>}
          {chat.length ? <ul>{[...chat].reverse().map((item) => <li key={item.id}><Link href={`/learning-hub?view=questions${item.articleSlug ? "&article=" + item.articleSlug : ""}#exchange-${item.id}`} onClick={() => setQuestion("")}>{item.question}<span>{articles.find((entry) => entry.slug === item.articleSlug)?.title ?? "Hỏi đáp chung"}</span></Link><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("vi-VN")}</time></li>)}</ul> : <p>Chưa có câu hỏi trong phiên.</p>}
          <div className="learning-reset">{confirmReset ? <><p role="alert">Xóa toàn bộ bài đã lưu và lịch sử minh họa trong tab này?</p><Button variant="quiet" onClick={() => { reset(); setConfirmReset(false); }}>Xác nhận xóa dữ liệu demo</Button><Button variant="ghost" onClick={() => setConfirmReset(false)}>Hủy</Button></> : <Button variant="quiet" onClick={() => setConfirmReset(true)}>Xóa dữ liệu demo</Button>}</div>
        </section>}
        {view === "profile" && <PublicOpsScope><AccountProfile /></PublicOpsScope>}
      </main>
    </div>
  </div>;
}
