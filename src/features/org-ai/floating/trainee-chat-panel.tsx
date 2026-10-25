"use client";

import { BookOpen, History, Hourglass, Lock, Maximize2, MessageSquareText, Minimize2, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { ApiError } from "@/api/types/common";
import { useAsyncData } from "@/api/use-async-data";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { routes } from "@/configs/routes";
import { formatQuota } from "@/features/billing/format";
import { learnApi } from "@/features/learn/api";
import { isPostSlug } from "@/features/learn/slug";
import { cn } from "@/utils/cn";

import { traineeAiApi } from "../api";
import { SubmitStatus } from "../components/submit-status";
import { aiErrorText, fieldIssue } from "../labels";
import { quotaResetDelay, TRAINEE_AI_HREF, traineeBlock } from "../trainee";
import { urlId, type TraineeAiContext } from "../types";
import { useAiBubble } from "./ai-bubble-context";
import { AssistantMessage, UserMessage } from "./chat-message";
import { MessageScroller } from "./message-scroller";

/**
 * The Trainee's conversation in the floating bubble (`POST /api/ai/trainee/answer`, BE#77). Same surface as the
 * organization panel, but one mode, the learner's own daily allowance, and an optional context handed over by the page:
 * the article they read, a Training, or one of their results. The backend pins that context and never sends rubric,
 * drafts or IFC to the AI. Answers are reference material, not emergency guidance or a safety certification.
 */
export function TraineeChatPanel({ variant, onClose, onToggleExpand, focusToken, onFocused }: {
  variant: "panel" | "sheet" | "drawer";
  onClose: () => void;
  onToggleExpand?: () => void;
  focusToken: number | null;
  onFocused: () => void;
}) {
  const bubble = useAiBubble();
  const { accessToken, messages, phase, working, askTrainee, retry, lookRecent, track, dismissPhase, settledCount, noteSettled, traineeTarget, setTraineeTarget, composerDraft, consumeDraft } = bubble;
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  const quota = useAsyncData(`trainee-bubble:quota:${settledCount}`, (signal) => traineeAiApi.quota(accessToken, signal));
  const sessionId = urlId(traineeTarget?.session ?? "");
  const trainingId = urlId(traineeTarget?.training ?? "");
  const articleParam = traineeTarget?.article ?? null;
  const slug = articleParam && isPostSlug(articleParam) ? articleParam : null;
  const article = useAsyncData(`trainee-bubble:article:${slug}`, (signal) => learnApi.post(slug ?? "", signal), !!slug, { keepPrevious: false });
  const loaded = slug && article.data?.slug === slug ? article.data : null;

  // A question handed over by a page ("Hỏi AI" shortcut) only fills the box; nothing is sent until the learner presses send.
  const [takenDraft, setTakenDraft] = useState<string | null>(null);
  if (composerDraft !== takenDraft) {
    setTakenDraft(composerDraft);
    if (composerDraft !== null) setText(composerDraft.slice(0, 2000));
  }
  useEffect(() => { if (composerDraft !== null) consumeDraft(); }, [composerDraft, consumeDraft]);

  useEffect(() => {
    if (focusToken === null) return;
    input.current?.focus();
    onFocused();
    window.setTimeout(() => { if (document.activeElement === document.body && input.current?.isConnected) input.current.focus(); }, 250);
  }, [focusToken, onFocused]);

  // The allowance changes outside the bubble (an Assessment ends, the daily reset): re-read it when the learner comes back to
  // the tab and at the reset time, so the send button is never left locked after the server allows it.
  const reloadQuota = quota.reload;
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") reloadQuota(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reloadQuota]);
  const resetsAt = quota.data?.resetsAt;
  useEffect(() => {
    if (!resetsAt) return;
    const delay = quotaResetDelay(resetsAt, Date.now());
    if (delay === null) return;
    const timer = window.setTimeout(reloadQuota, delay);
    return () => window.clearTimeout(timer);
  }, [resetsAt, reloadQuota]);

  // Only one context is sent: a result first (most specific), then a Training, then the article.
  const context: TraineeAiContext | undefined = useMemo(() => {
    if (sessionId) return { kind: "Result", sessionId };
    if (trainingId) return { kind: "Training", trainingId };
    if (loaded) return { kind: "Learn", postId: loaded.id, versionId: loaded.version.id };
    return undefined;
  }, [loaded, sessionId, trainingId]);
  const articlePending = !!slug && !loaded && article.error === undefined && !sessionId && !trainingId;
  const articleUnresolved = !!articleParam && !sessionId && !trainingId && (!slug || (article.error !== undefined && !loaded));
  // Only a missing article (or an invalid slug) is "gone"; another failure may heal and offers a retry. Either way the
  // question is never sent silently without the article: the learner picks "Hỏi chung" first.
  const articleGone = articleUnresolved && (!slug || (article.error instanceof ApiError && article.error.status === 404));

  const block = quota.data ? traineeBlock(quota.data) : null;
  const trimmed = text.trim();
  const maxChars = quota.data?.maxInputChars ?? null;
  const tooLong = maxChars !== null && trimmed.length > maxChars;
  const canSend = trimmed.length > 0 && !working && !tooLong && !articlePending && !articleUnresolved && !block;
  const send = () => {
    if (!canSend) return;
    askTrainee(trimmed, context);
    setText("");
  };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); send(); };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } };
  const fieldError = tooLong ? `Dài hơn giới hạn ${maxChars} ký tự.` : phase.kind === "failed" ? fieldIssue(phase.error, "$.question") : undefined;

  const unit = quota.data?.quotaUnit ?? undefined;
  const quotaText = quota.error !== undefined ? "Chưa kiểm tra được lượt hỏi hôm nay"
    : !quota.data ? "Đang kiểm tra lượt hỏi hôm nay…"
    : !quota.data.policyActive ? "Trợ lý AI chưa được bật"
    : `Hôm nay còn ${formatQuota(quota.data.remainingUnits, unit)}${quota.data.dailyUnits != null ? ` / ${formatQuota(quota.data.dailyUnits, unit)}` : ""}`;
  const reserve = quota.data?.policyActive && quota.data.estimatedReserve != null ? formatQuota(quota.data.estimatedReserve, unit) : null;

  const contextLine = sessionId
    ? <>Hỏi về <strong>một kết quả tập huấn của bạn</strong> · <Link href={`/learning-hub?view=history&session=${sessionId}`}>Xem kết quả</Link></>
    : trainingId ? <>Hỏi về <strong>bài tập huấn bạn đã chọn</strong> (không gồm đáp án hay cách chấm)</>
    : loaded ? <>Hỏi về bài <Link href={`${routes.learn}/${loaded.slug}`}>{loaded.version.title}</Link></>
    : null;

  return <div className={cn("ai-panel", `ai-panel--${variant}`)} data-testid="ai-chat-panel" data-mode="TraineeAnswer">
    <header className="ai-panel-head">
      <span className="ai-panel-icon" aria-hidden="true"><Sparkles size={16} /></span>
      <div className="ai-panel-titles">
        <strong id="ai-bubble-title">Trợ lý AI</strong>
        <span className={cn("ai-panel-quota", block && "is-danger")} data-testid="trainee-ai-quota">{quotaText}</span>
      </div>
      <div className="ai-panel-tools">
        <Tooltip content="Câu hỏi đã hỏi"><Link className="ops-icon-button ops-icon-button--sm" href={TRAINEE_AI_HREF} aria-label="Câu hỏi đã hỏi" data-testid="ai-chat-history" onClick={variant === "sheet" ? onClose : undefined}><History size={16} aria-hidden="true" /></Link></Tooltip>
        {onToggleExpand && <Tooltip content={variant === "drawer" ? "Thu nhỏ" : "Mở rộng"}><button type="button" className="ops-icon-button ops-icon-button--sm" aria-label={variant === "drawer" ? "Thu nhỏ trợ lý" : "Mở rộng trợ lý"} onClick={onToggleExpand} data-testid="ai-chat-expand">{variant === "drawer" ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}</button></Tooltip>}
        <Tooltip content="Đóng"><button type="button" className="ops-icon-button ops-icon-button--sm" aria-label="Đóng trợ lý" onClick={onClose} data-testid="ai-chat-close"><X size={16} aria-hidden="true" /></button></Tooltip>
      </div>
    </header>

    {contextLine && <div className="ai-panel-context" data-testid="trainee-ai-context">
      <BookOpen size={14} aria-hidden="true" /><span>{contextLine}</span>
      <button type="button" className="ai-action" onClick={() => setTraineeTarget(null)} disabled={working}>Hỏi chung</button>
    </div>}
    {articlePending && <p className="ai-panel-context" role="status">Đang mở thông tin bài…</p>}
    {articleUnresolved && <div className="ai-system" role="alert" data-testid="trainee-ai-article-missing">
      <strong>{articleGone ? "Không tìm thấy bài bạn mở từ thư viện bài học" : "Chưa tải được bài bạn mở từ thư viện bài học"}</strong>
      <p>{articleGone ? "Bài có thể đã bị ẩn hoặc gỡ." : aiErrorText(article.error)} Câu hỏi chưa được gửi: chọn &quot;Hỏi chung&quot; (không kèm bài) hoặc chọn bài khác.</p>
      <div className="ai-msg-actions">
        <button type="button" className="ai-action" onClick={() => setTraineeTarget(null)} disabled={working}>Hỏi chung</button>
        <Link className="ai-action" href={routes.learn}>Chọn bài khác</Link>
        {!articleGone && <button type="button" className="ai-action" onClick={article.reload}>Thử lại</button>}
      </div>
    </div>}

    <MessageScroller label="Hội thoại với Trợ lý AI" className="ai-panel-messages" data-testid="ai-chat-messages">
      <div className="ai-thread" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && <p className="ai-thread-empty"><MessageSquareText size={16} aria-hidden="true" />Hỏi về bài học, cách thoát nạn hay kết quả luyện tập của bạn. Câu trả lời dựa trên bài học và tài liệu chuẩn đã duyệt, luôn kèm nguồn.</p>}
        {messages.map((message) => (message.role === "user"
          ? <UserMessage key={message.id} message={message} />
          : <AssistantMessage key={message.id} message={message} accessToken={accessToken} onSettled={noteSettled} trainee />))}
        {working && <div className="ai-msg ai-msg--assistant ai-msg--pending" data-testid="ai-chat-pending"><Spinner size={16} /><span>{phase.kind === "checking" ? "Đang kiểm tra lượt hỏi…" : "Đang gửi…"}</span></div>}
        {(phase.kind === "failed" || phase.kind === "unknown" || (phase.kind === "blocked" && phase.message)) && <div className="ai-system">
          <SubmitStatus phase={phase} operation="TraineeAnswer" trainee onRetry={() => { if (phase.kind === "failed") { dismissPhase(); input.current?.focus(); } else retry(); }} onLook={lookRecent} onTrack={track} />
          <button type="button" className="ai-action" onClick={dismissPhase}>Bỏ qua</button>
        </div>}
      </div>
    </MessageScroller>

    {quota.error !== undefined && <div className="ai-system" role="alert"><p>{aiErrorText(quota.error)}</p><button type="button" className="ai-action" onClick={quota.reload}>Thử lại</button></div>}
    {block ? <div className="ai-quota-out" data-testid="trainee-ai-blocked">
      <div className="ai-quota-out-card" role="status">
        {quota.data?.blockedByAssessment ? <Lock size={18} aria-hidden="true" /> : <Hourglass size={18} aria-hidden="true" />}
        <div><strong>{block.title}</strong><p>{block.text}</p></div>
      </div>
      <Button asChild variant="secondary"><Link href={routes.learn}>Đọc bài học</Link></Button>
    </div> : <form className="ai-composer" onSubmit={onSubmit} aria-label="Hỏi Trợ lý AI">
      <div className={cn("ai-composer-box", fieldError && "is-invalid")}>
        <textarea ref={input} className="ai-composer-input" rows={1} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} disabled={working}
          placeholder="Ví dụ: Vì sao không nên dùng thang máy khi có cháy?" aria-label="Câu hỏi" aria-invalid={fieldError ? true : undefined} aria-describedby="ai-composer-note" data-testid="ai-chat-input" />
        <button type="submit" className="ai-send-target" disabled={!canSend} aria-label={working ? "Đang gửi" : "Gửi câu hỏi"} data-testid="ai-send"><span className={cn("ai-send", !canSend && "is-disabled")}><Send size={14} aria-hidden="true" /></span></button>
      </div>
      {fieldError && <p className="ai-composer-error" role="alert">{fieldError}</p>}
      <p className="ai-composer-note" id="ai-composer-note">
        <span>{reserve ? `Mỗi câu hỏi dùng khoảng ${reserve} · ` : ""}AI có thể sai, kiểm tra nguồn. Không thay hướng dẫn khẩn cấp.</span>
        {maxChars !== null && <span data-testid="ai-char-count" data-over={tooLong}>{trimmed.length}/{maxChars}</span>}
      </p>
    </form>}
  </div>;
}
