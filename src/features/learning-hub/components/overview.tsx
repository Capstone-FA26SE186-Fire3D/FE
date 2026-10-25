"use client";

import { useOptionalAiBubble } from "@/features/org-ai/floating/ai-bubble-context";
import { Bookmark, ChevronRight, History, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { ApiError } from "@/api/types/common";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { learnApi } from "@/features/learn/api";
import { KIND_ART, KIND_ART_SIZE, KIND_TONE } from "@/features/learn/kind-art";
import { kindLabel } from "@/features/learn/types";
import { trainingHistoryApi } from "@/features/training-history/api";
import { formatWhen, modeLabel, resultCellView, sessionStatusView, trainingTitle } from "@/features/training-history/labels";
import { useLocalPreference } from "@/utils/local-preference";
import { IntroTour } from "./intro-tour";
import { StateCard } from "./state-card";

const INTRO_KEY = "fire3d-trainee-intro";
const isIntroState = (value: string): value is "shown" | "dismissed" => value === "shown" || value === "dismissed";
/** Longest question the shortcut hands to the Q&A view (the view still checks the server limit). */
export const ASK_PREFILL_MAX = 2000;

/** "Lưu 2 ngày trước" from the bookmark timestamp; falls back to the date after a month. */
export function savedAgo(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const days = Math.floor((now - time) / 86_400_000);
  if (days <= 0) return "Lưu hôm nay";
  if (days === 1) return "Lưu hôm qua";
  if (days < 31) return `Lưu ${days} ngày trước`;
  return `Lưu ngày ${new Date(time).toLocaleDateString("vi-VN")}`;
}

function failureLine(error: unknown): string {
  if (error instanceof ApiError && error.isRateLimited) return error.retryAfterSeconds ? `Máy chủ đang bận. Thử lại sau ${error.retryAfterSeconds} giây.` : "Máy chủ đang bận. Thử lại sau ít phút.";
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return "Phiên đăng nhập không còn quyền xem mục này. Hãy đăng nhập lại.";
  return "Hãy kiểm tra kết nối rồi thử lại. Nội dung đã tải trước đó vẫn được giữ.";
}

function Hero() {
  return <section className="learning-hero" aria-labelledby="ov-hero-title">
    <div className="learning-hero-copy">
      <h2 id="ov-hero-title">Sẵn sàng cho buổi luyện tập tiếp theo</h2>
      <p>Mở ứng dụng Android để vào công trình và luyện tập. Bạn cũng có thể đọc bài Học trước, nhưng không bắt buộc.</p>
      <div className="learning-hero-actions">
        <Link className={buttonVariants({ variant: "primary" })} href={routes.download}>Luyện tập trên ứng dụng</Link>
        <Link className={buttonVariants({ variant: "ghost" })} href={routes.learn}>Đọc bài Học</Link>
      </div>
    </div>
    <figure className="learning-hero-art" aria-hidden="true">
      {/* Decorative render (transparent WebP, fixed ratio): no layout shift. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/trainee/hero-v1.webp" alt="" width={1100} height={614} decoding="async" />
    </figure>
  </section>;
}

/** Skippable first-visit intro: nothing in it is a prerequisite, and a dismissal is remembered only in this browser. */
function Intro() {
  const [state, setState] = useLocalPreference<"shown" | "dismissed">(INTRO_KEY, "shown", isIntroState);
  const [tourOpen, setTourOpen] = useState(false);
  if (state === "dismissed") return null;
  return <section className="ov-intro" aria-labelledby="ov-intro-title" data-testid="trainee-intro">
    <div className="ov-intro-head">
      <span className="ov-tag">Giới thiệu ngắn · bỏ qua được</span>
      <h2 id="ov-intro-title">Làm quen trong ba bước</h2>
      <p>Không cần đọc trước mới được luyện tập. Bạn có thể bắt đầu ở bất kỳ bước nào.</p>
    </div>
    <ol className="ov-steps">
      <li><span className="ov-step-no" aria-hidden="true">1</span><div><strong>Đọc bài học</strong><span>Bài viết, mẹo và video công khai.</span></div></li>
      <li><span className="ov-step-no" aria-hidden="true">2</span><div><strong>Luyện tập trên ứng dụng</strong><span>Quét mã công trình trên Android.</span></div></li>
      <li><span className="ov-step-no" aria-hidden="true">3</span><div><strong>Xem kết quả</strong><span>Kết quả đánh giá tách khỏi hoàn thành phiên.</span></div></li>
    </ol>
    <div className="ov-intro-actions">
      <Button type="button" onClick={() => setTourOpen(true)} aria-haspopup="dialog">Xem hướng dẫn</Button>
      <Button type="button" variant="ghost" onClick={() => setState("dismissed")}>Bỏ qua</Button>
    </div>
    <IntroTour open={tourOpen} onOpenChange={setTourOpen} />
  </section>;
}

function SavedPreview({ accessToken, userId }: { accessToken: string; userId: string }) {
  const saved = useAsyncData("hub:overview:saved", (signal) => learnApi.bookmarks(accessToken, { page: 1, pageSize: 3 }, signal), true, { scope: userId });
  const items = saved.data?.items ?? [];
  let body;
  if (saved.error !== undefined) {
    body = <StateCard icon={Bookmark} tone="danger" role="alert" kicker="Bài đã lưu · lỗi tải" title="Không tải được bài đã lưu" actions={<Button variant="secondary" onClick={saved.reload}><RefreshCw size={16} aria-hidden="true" />Thử lại</Button>}>{failureLine(saved.error)}</StateCard>;
  } else if (!saved.data) {
    body = <div className="ov-saved-grid" role="status" aria-label="Đang tải bài đã lưu">{Array.from({ length: 3 }, (_, index) => <div key={index} className="ov-skeleton" aria-hidden="true"><span /><span /><span /></div>)}</div>;
  } else if (items.length === 0) {
    body = <StateCard icon={Bookmark} kicker="Bài đã lưu · chưa có bài" title="Bạn chưa lưu bài nào" actions={<Link className={buttonVariants({ variant: "primary" })} href={routes.learn}>Khám phá bài học</Link>}>Mở Khám phá bài học, bấm Lưu trên bài bạn muốn đọc lại.</StateCard>;
  } else {
    body = <div className="ov-saved-grid">{items.map((item) => item.available
      ? <article key={item.postId} className="ov-card" data-testid="overview-saved">
        <Link className="ov-thumb" href={`/learn/${item.slug}`} tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={KIND_ART[item.kind]} alt="" width={KIND_ART_SIZE.width} height={KIND_ART_SIZE.height} loading="lazy" decoding="async" />
        </Link>
        <StatusBadge tone={KIND_TONE[item.kind]} className="self-start">{kindLabel[item.kind]}</StatusBadge>
        <h3><Link href={`/learn/${item.slug}`}>{item.title}</Link></h3>
        <p className="ov-card-meta">{savedAgo(item.bookmarkedAt)}</p>
        <Link className="ov-card-link" href={`/learn/${item.slug}`} aria-label={`Đọc bài: ${item.title}`}>Đọc bài<ChevronRight size={16} aria-hidden="true" /></Link>
      </article>
      : <article key={item.postId} className="ov-card" data-testid="overview-saved-unavailable">
        <div className="ov-thumb" data-neutral aria-hidden="true" />
        <StatusBadge tone="warning" className="self-start">Không còn hiển thị</StatusBadge>
        <h3>Bài này không còn công khai</h3>
        <p className="ov-card-meta">{savedAgo(item.bookmarkedAt)} · bài đã bị ẩn hoặc gỡ</p>
        <Link className="ov-card-link" href="/learning-hub?view=saved">Bỏ lưu trong Bài đã lưu<ChevronRight size={16} aria-hidden="true" /></Link>
      </article>)}</div>;
  }
  return <section aria-labelledby="ov-saved-title">
    <div className="learning-section-head"><h2 id="ov-saved-title">Bài đã lưu</h2><Link className="learning-more" href="/learning-hub?view=saved">Xem tất cả<ChevronRight size={16} aria-hidden="true" /></Link></div>
    {body}
  </section>;
}

/** Shortcut to the floating assistant. The text is only carried over as a draft; nothing is sent to the AI from here. */
function AskShortcut() {
  const router = useRouter();
  const bubble = useOptionalAiBubble();
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const draft = text.trim().slice(0, ASK_PREFILL_MAX);
    if (bubble?.enabled) bubble.openWith(null, draft || undefined);
    else router.push(`/learning-hub?view=questions${draft ? `&q=${encodeURIComponent(draft)}` : ""}`);
  };
  return <section className="ov-card ov-ask" aria-labelledby="ov-ask-title">
    <h3 id="ov-ask-title"><Sparkles size={20} aria-hidden="true" />Hỏi AI</h3>
    <p>Câu trả lời kèm nguồn trích dẫn. Trong chế độ Đánh giá, AI bị tắt.</p>
    <form onSubmit={submit}>
      <input type="text" aria-label="Câu hỏi cho AI" placeholder="Hỏi về nội dung bài viết…" value={text} maxLength={ASK_PREFILL_MAX} onChange={(event) => setText(event.target.value)} />
      <Button type="submit">Hỏi Trợ lý AI</Button>
    </form>
  </section>;
}

function RecentResults({ accessToken, userId }: { accessToken: string; userId: string }) {
  const recent = useAsyncData("hub:overview:history", (signal) => trainingHistoryApi.list(accessToken, { status: "", mode: "", buildingId: "", from: "", to: "", page: 1, pageSize: 3 }, signal), true, { scope: userId });
  const items = recent.data?.items ?? [];
  let body;
  if (recent.error !== undefined) {
    body = <StateCard icon={History} tone="danger" role="alert" kicker="Lịch sử · lỗi tải" title="Không tải được kết quả gần đây" actions={<Button variant="secondary" onClick={recent.reload}><RefreshCw size={16} aria-hidden="true" />Thử lại</Button>}>{failureLine(recent.error)}</StateCard>;
  } else if (!recent.data) {
    body = <div className="ov-skeleton" role="status" aria-label="Đang tải kết quả gần đây"><span style={{ height: 18 }} /><span style={{ height: 18 }} /><span style={{ height: 18 }} /></div>;
  } else if (items.length === 0) {
    body = <StateCard icon={History} kicker="Lịch sử · chưa có phiên" title="Chưa có phiên luyện tập" actions={<Link className={buttonVariants({ variant: "primary" })} href={routes.download}>Xem hướng dẫn</Link>}>Phiên xuất hiện ở đây sau khi bạn luyện tập trên ứng dụng Android.</StateCard>;
  } else {
    body = <ul className="ov-result-list" aria-label="Phiên luyện tập gần đây">{items.map((item) => {
      const { title } = trainingTitle(item);
      const session = sessionStatusView(item.status);
      const result = resultCellView(item);
      return <li key={item.sessionId}>
        <Link className="ov-result" href={`/learning-hub?view=history&session=${encodeURIComponent(item.sessionId)}`} data-testid="overview-result" aria-label={`Xem kết quả: ${title}, ${modeLabel(item.mode)}`}>
          <span className="ov-result-copy"><strong>{title} · {modeLabel(item.mode)}</strong><span>{item.building.name || "—"} · {formatWhen(item.startedAt)}</span></span>
          <span className="ov-result-badges">
            <span className="sr-only">Trạng thái phiên:</span><StatusBadge tone={session.tone}>{session.label}</StatusBadge>
            <span className="sr-only">Kết quả đánh giá:</span><StatusBadge tone={result.tone}>{result.label}</StatusBadge>
          </span>
        </Link>
      </li>;
    })}</ul>;
  }
  return <section className={items.length > 0 ? "ov-card ov-results" : undefined} aria-labelledby="ov-results-title">
    <div className={items.length > 0 ? "ov-results-head" : "learning-section-head"}><h2 id="ov-results-title">Kết quả gần đây</h2><Link className="learning-more" href="/learning-hub?view=history">Mở lịch sử<ChevronRight size={16} aria-hidden="true" /></Link></div>
    {body}
  </section>;
}

/** "Tổng quan" of a Trainee: where to start, the three latest bookmarks, the Q&A shortcut and the three latest sessions. */
export function Overview() {
  const { accessToken, ready, user } = useAuthSession();
  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 2 || !accessToken) {
    const other = user?.role === 1 ? { href: routes.workspaceBuildings, label: "Mở không gian tổ chức" } : user?.role === 0 ? { href: routes.adminOverview, label: "Mở khu quản trị" } : null;
    return <Alert tone="info" title="Tổng quan này dành cho tài khoản học viên" action={other ? <Link className="mt-3 inline-block underline" href={other.href}>{other.label}</Link> : undefined}>Tài khoản tổ chức và quản trị làm việc trong khu vực của mình.</Alert>;
  }
  return <div className="ov" data-testid="trainee-overview">
    <Hero />
    <Intro />
    <div className="ov-split">
      <SavedPreview accessToken={accessToken} userId={user.id} />
      <AskShortcut />
    </div>
    <RecentResults accessToken={accessToken} userId={user.id} />
  </div>;
}
