"use client";

import { Hourglass, Lock, MessageCircleQuestion, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { ApiError } from "@/api/types/common";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { StateCard } from "./state-card";
import { formatDateTime, formatQuota } from "@/features/billing/format";
import { learnApi } from "@/features/learn/api";
import { isPostSlug } from "@/features/learn/slug";
import { traineeAiApi } from "@/features/org-ai/api";
import { CharCount } from "@/features/org-ai/components/limit-hint";
import { RequestPanel } from "@/features/org-ai/components/request-panel";
import { SubmitStatus } from "@/features/org-ai/components/submit-status";
import { aiErrorText, fieldIssue, statusLabel, statusTone } from "@/features/org-ai/labels";
import { urlId, type TraineeAiContext, type TraineeAiQuota } from "@/features/org-ai/types";
import { useAiSubmit, type SubmitAdapter } from "@/features/org-ai/use-ai-submit";
import styles from "@/features/org-ai/org-ai.module.css";

const HUB = "/learning-hub?view=questions";

/** Why a Trainee cannot ask now, from `GET /api/ai/trainee/quota`; null when a question can be sent. */
export function traineeBlock(quota: TraineeAiQuota): { title: string; text: string } | null {
  if (!quota.policyActive) return { title: "Hỏi đáp AI chưa được bật", text: "Hỏi đáp AI chưa được mở cho học viên nên câu hỏi chưa được gửi. Bạn vẫn đọc bài học bình thường." };
  if (quota.blockedByAssessment) return { title: "AI tạm khóa trong bài đánh giá", text: "Bạn đang có một bài đánh giá chưa kết thúc. AI không hỗ trợ trong lúc làm bài; hãy hoàn tất bài rồi hỏi lại." };
  if (!quota.canSubmit) return { title: "Đã hết lượt hỏi hôm nay", text: `Hạn mức hôm nay đã dùng hết. Lượt mới có lại lúc ${formatDateTime(quota.resetsAt)}.` };
  return null;
}

/** Longest delay `setTimeout` accepts; a later reset is re-armed when the page reloads the quota. */
const MAX_TIMER_MS = 2_147_483_647;

/** Milliseconds from `now` until the quota resets (plus a small margin so the server has rolled over), or null if not ahead. */
export function quotaResetDelay(resetsAt: string, now: number): number | null {
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at) || at <= now) return null;
  return Math.min(at - now + 1000, MAX_TIMER_MS);
}

/**
 * "Hỏi đáp" for the Trainee (`POST /api/ai/trainee/answer`, BE#77). A question may be tied to the Learn article the learner
 * came from (`?article=`), a Training (`?training=`) or one of their own results (`?session=`); the backend pins it and
 * never sends rubric, drafts or IFC to the AI. Daily allowance, idempotent retry and "find my request" work as for
 * organizations. Answers are reference material, not emergency guidance or a safety certification.
 */
export function AskPanel({ articleParam }: { articleParam: string | null }) {
  const { accessToken, ready, user } = useAuthSession();
  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 2 || !accessToken) {
    const other = user?.role === 1 ? { href: routes.workspaceAi, label: "Mở Trợ lý AI của tổ chức" } : user?.role === 0 ? { href: routes.adminAi, label: "Mở khu quản trị AI" } : null;
    return <Alert tone="info" title="Hỏi đáp AI ở đây dành cho tài khoản học viên" action={other ? <Link className="mt-3 inline-block underline" href={other.href}>{other.label}</Link> : undefined}>Tài khoản tổ chức và quản trị dùng trợ lý AI trong khu vực của mình.</Alert>;
  }
  return <TraineeAsk accessToken={accessToken} articleParam={articleParam} />;
}

function TraineeAsk({ accessToken, articleParam }: { accessToken: string; articleParam: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = urlId(params.get("session") ?? "");
  const trainingId = urlId(params.get("training") ?? "");
  const requestId = urlId(params.get("request") ?? "");
  const slug = articleParam && isPostSlug(articleParam) ? articleParam : null;
  // `q` is a draft handed over by the overview shortcut: it only fills the box, nothing is sent until the learner presses send.
  const [question, setQuestion] = useState(() => (params.get("q") ?? "").slice(0, 2000));

  const quota = useAsyncData("trainee-ai:quota", (signal) => traineeAiApi.quota(accessToken, signal));
  const article = useAsyncData(`trainee-ai:article:${slug}`, (signal) => learnApi.post(slug ?? "", signal), !!slug, { keepPrevious: false });
  const recent = useAsyncData("trainee-ai:recent", (signal) => traineeAiApi.listRequests(accessToken, { page: 1, pageSize: 5 }, signal));
  const loaded = slug && article.data?.slug === slug ? article.data : null;

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
  // question is never sent silently without the article: the learner must pick "Hỏi chung" or another article first.
  const articleGone = articleUnresolved && (!slug || (article.error instanceof ApiError && article.error.status === 404));

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    next.delete("q");
    next.set("view", "questions");
    router.push(`/learning-hub?${next.toString()}`);
  }, [params, router]);

  const reloadQuota = quota.reload;
  const reloadRecent = recent.reload;
  // The quota changes outside this page (an Assessment ends, the daily reset, a request settles): re-read it when the learner
  // comes back to the tab/window and at the reset time, so a send button is never left locked after the server allows it.
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
  const settled = useCallback(() => { reloadQuota(); reloadRecent(); }, [reloadQuota, reloadRecent]);
  const tracked = useCallback((id: string) => { go({ request: id }); reloadQuota(); reloadRecent(); }, [go, reloadQuota, reloadRecent]);
  const adapter: SubmitAdapter = useMemo(() => ({
    check: async (signal) => {
      const fresh = await traineeAiApi.quota(accessToken, signal);
      const block = traineeBlock(fresh);
      return block ? { kind: "blocked", limit: null, message: block } : null;
    },
    recent: async () => (await traineeAiApi.listRequests(accessToken, { page: 1, pageSize: 5 })).items,
  }), [accessToken]);
  const { phase, submit, retry, lookRecent, track, reset, working } = useAiSubmit(accessToken, "TraineeAnswer", tracked, adapter);

  const text = question.trim();
  const maxChars = quota.data?.maxInputChars ?? null;
  const tooLong = maxChars !== null && text.length > maxChars;
  const block = quota.data ? traineeBlock(quota.data) : null;
  const canSend = text.length > 0 && !working && !tooLong && !articlePending && !articleUnresolved && !block;

  const doSubmit = () => {
    if (!canSend) return;
    const body = { question: text, ...(context ? { context } : {}) };
    void submit({ operation: "TraineeAnswer", ...body }, (key, signal) => traineeAiApi.submit(accessToken, body, key, signal));
  };
  const send = (event: FormEvent) => { event.preventDefault(); doSubmit(); };
  const questionError = tooLong ? `Dài hơn giới hạn ${maxChars} ký tự.` : phase.kind === "failed" ? fieldIssue(phase.error, "$.question") : undefined;

  const contextLine = sessionId
    ? <>Câu hỏi về <strong>một kết quả tập huấn của bạn</strong> (chế độ, kết quả, điểm và tiêu chí). <Link href={`/learning-hub?view=history&session=${sessionId}`}>Xem kết quả</Link></>
    : trainingId ? <>Câu hỏi về <strong>bài tập huấn bạn đã chọn</strong> (tên, mục tiêu, hướng dẫn; không gồm đáp án hay cách chấm).</>
    : loaded ? <>Câu hỏi về bài <Link href={`${routes.learn}/${loaded.slug}`}>{loaded.version.title}</Link> (đúng phiên bản đang đăng).</>
    : null;

  return <div className={styles.stack} data-testid="trainee-ai">
    <Panel title="Hỏi đáp AI" description="AI trả lời dựa trên bài học và tài liệu chuẩn đã duyệt, luôn kèm nguồn. Đây là thông tin tham khảo để học, không phải hướng dẫn khẩn cấp hay chứng nhận an toàn." actions={<MessageCircleQuestion size={18} aria-hidden="true" />}>
      <form className={styles.stack} onSubmit={send} aria-label="Hỏi đáp AI cho học viên">
        <QuotaLine quota={quota.data} error={quota.error} onRetry={quota.reload} />
        {block && <div data-testid="trainee-ai-blocked"><StateCard
          icon={quota.data?.blockedByAssessment ? Lock : Hourglass}
          tone="warning"
          role="status"
          kicker={quota.data?.blockedByAssessment ? "Hỏi đáp · đang ở chế độ Đánh giá" : !quota.data?.policyActive ? "Hỏi đáp · chưa bật" : "Hỏi đáp · hết lượt hôm nay"}
          title={block.title}
          actions={<>
            <Link className={buttonVariants({ variant: "primary" })} href={routes.learn}>{quota.data?.blockedByAssessment ? "Mở thư viện bài học" : "Quay lại thư viện bài học"}</Link>
            {quota.data?.blockedByAssessment && <Link className={buttonVariants({ variant: "secondary" })} href="/learning-hub?view=history">Xem lịch sử</Link>}
          </>}>{block.text}</StateCard></div>}
        {contextLine && <div className={styles.row} data-testid="trainee-ai-context">
          <p className={styles.muted}>{contextLine}</p>
          <Button type="button" size="sm" variant="quiet" onClick={() => go({ session: null, training: null, article: null })} disabled={working}><X size={14} aria-hidden="true" />Hỏi chung</Button>
        </div>}
        {articlePending && <p role="status" className={styles.dim}>Đang mở thông tin bài…</p>}
        {articleUnresolved && <div data-testid="trainee-ai-article-missing">
          <Alert tone="warning" title={articleGone ? "Không tìm thấy bài bạn mở từ thư viện bài học" : "Chưa tải được bài bạn mở từ thư viện bài học"}
            action={<div className="ops-actions mt-3">
              <Button type="button" size="sm" variant="secondary" onClick={() => go({ article: null })} disabled={working}>Hỏi chung</Button>
              <Link className="underline" href={routes.learn}>Chọn bài khác</Link>
              {!articleGone && <Button type="button" size="sm" variant="quiet" onClick={article.reload}>Thử lại</Button>}
            </div>}>
            {articleGone ? "Bài có thể đã bị ẩn hoặc gỡ." : aiErrorText(article.error)} Câu hỏi chưa được gửi: hãy chọn &quot;Hỏi chung&quot; (không kèm bài) hoặc chọn bài khác.
          </Alert>
        </div>}
        <Field label="Câu hỏi" required error={questionError} hint="Chỉ nhập chữ. Không nhập thông tin cá nhân của người khác.">
          {(props) => <Textarea {...props} rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={working} placeholder="Ví dụ: Vì sao không nên dùng thang máy khi có cháy?" />}
        </Field>
        <CharCount value={text} max={maxChars} />
        <div className="ops-actions">
          <Button type="submit" disabled={!canSend} data-testid="ai-send"><Send size={16} aria-hidden="true" />{working ? "Đang gửi…" : "Gửi câu hỏi"}</Button>
          {requestId && <Button type="button" variant="quiet" onClick={() => { reset(); setQuestion(""); go({ request: null }); }}>Hỏi câu khác</Button>}
        </div>
        <SubmitStatus phase={phase} operation="TraineeAnswer" trainee onRetry={() => void (phase.kind === "failed" ? doSubmit() : retry())} onLook={() => void lookRecent()} onTrack={track} />
      </form>
    </Panel>

    {requestId && (phase.kind === "idle" || phase.kind === "tracking") && <Panel title="Câu trả lời" description="Câu trả lời được lưu lại; tải lại trang vẫn xem được.">
      <RequestPanel accessToken={accessToken} requestId={requestId} trainee onSettled={settled} />
    </Panel>}

    <Panel title="Câu hỏi gần đây" description="Chỉ bạn xem được câu hỏi của mình.">
      {recent.error !== undefined && <Alert tone="danger" title="Không tải được câu hỏi gần đây" action={<Button size="sm" variant="secondary" className="mt-3" onClick={recent.reload}>Thử lại</Button>}>{aiErrorText(recent.error)}</Alert>}
      {recent.data && recent.data.items.length === 0 && <p className={styles.dim}>Bạn chưa hỏi câu nào.</p>}
      {recent.data && recent.data.items.length > 0 && <ul className={styles.list} data-testid="trainee-ai-recent">
        {recent.data.items.map((item) => <li key={item.requestId} className={styles.item}>
          <button type="button" className={styles.rowButton} onClick={() => go({ request: item.requestId })} aria-current={item.requestId === requestId ? "true" : undefined}>{item.input?.text?.slice(0, 120) || "Câu hỏi không có nội dung xem trước"}</button>
          <span className={styles.dim}><StatusBadge tone={statusTone(item.status, item.resultType)}>{statusLabel(item.status, item.resultType)}</StatusBadge> · {formatDateTime(item.createdAt)}</span>
        </li>)}
      </ul>}
    </Panel>
    <p className={styles.dim}><Link href={HUB.replace("questions", "saved")}>Bài đã lưu</Link> · <Link href={routes.learn}>Đọc thêm bài học</Link></p>
  </div>;
}

function QuotaLine({ quota, error, onRetry }: { quota: TraineeAiQuota | undefined; error: unknown; onRetry: () => void }) {
  if (error !== undefined) return <Alert tone="danger" title="Chưa kiểm tra được lượt hỏi hôm nay" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onRetry}>Thử lại</Button>}>{aiErrorText(error)}</Alert>;
  if (!quota) return <p role="status" className={styles.dim}>Đang kiểm tra lượt hỏi hôm nay…</p>;
  if (!quota.policyActive) return null;
  const unit = quota.quotaUnit ?? undefined;
  return <p className={styles.dim} data-testid="trainee-ai-quota">
    Hôm nay còn {formatQuota(quota.remainingUnits, unit)}{quota.dailyUnits != null ? ` / ${formatQuota(quota.dailyUnits, unit)}` : ""}
    {quota.estimatedReserve != null ? `; mỗi câu hỏi dùng khoảng ${formatQuota(quota.estimatedReserve, unit)}` : ""}. Làm mới lúc {formatDateTime(quota.resetsAt)}.
  </p>;
}
