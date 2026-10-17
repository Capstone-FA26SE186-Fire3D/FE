"use client";

import { MessageCircleQuestion, Send, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type FormEvent } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { PublicOpsScope } from "@/features/account/components/public-ops-scope";
import { useAuthSession } from "@/features/auth/auth-session";
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
  if (!quota.policyActive) return { title: "Hỏi đáp AI chưa được bật", text: "Hệ thống chưa có chính sách AI cho học viên nên câu hỏi chưa được gửi. Bạn vẫn đọc bài trong Learn bình thường." };
  if (quota.blockedByAssessment) return { title: "AI tạm khóa trong bài đánh giá", text: "Bạn đang có một bài đánh giá (Assessment) chưa kết thúc. AI không hỗ trợ trong lúc làm bài; hãy hoàn tất bài rồi hỏi lại." };
  if (!quota.canSubmit) return { title: "Đã hết lượt hỏi hôm nay", text: `Hạn mức hôm nay đã dùng hết. Lượt mới có lại lúc ${formatDateTime(quota.resetsAt)}.` };
  return null;
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
    return <PublicOpsScope><Alert tone="info" title="Hỏi đáp AI ở đây dành cho tài khoản học viên" action={other ? <Link className="mt-3 inline-block underline" href={other.href}>{other.label}</Link> : undefined}>Tài khoản tổ chức và quản trị dùng trợ lý AI trong khu vực của mình.</Alert></PublicOpsScope>;
  }
  return <PublicOpsScope><TraineeAsk accessToken={accessToken} articleParam={articleParam} /></PublicOpsScope>;
}

function TraineeAsk({ accessToken, articleParam }: { accessToken: string; articleParam: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = urlId(params.get("session") ?? "");
  const trainingId = urlId(params.get("training") ?? "");
  const requestId = urlId(params.get("request") ?? "");
  const slug = articleParam && isPostSlug(articleParam) ? articleParam : null;
  const [question, setQuestion] = useState("");

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
  const articleMissing = !!articleParam && !sessionId && !trainingId && (!slug || (article.error !== undefined && !loaded));

  const go = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    next.set("view", "questions");
    router.push(`/learning-hub?${next.toString()}`);
  }, [params, router]);

  const reloadQuota = quota.reload;
  const reloadRecent = recent.reload;
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
  const canSend = text.length > 0 && !working && !tooLong && !articlePending && !block;

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
    <Panel title="Hỏi đáp AI" description="AI trả lời dựa trên bài Learn và tài liệu chuẩn đã duyệt, luôn kèm nguồn. Đây là thông tin tham khảo để học, không phải hướng dẫn khẩn cấp hay chứng nhận an toàn." actions={<MessageCircleQuestion size={18} aria-hidden="true" />}>
      <form className={styles.stack} onSubmit={send} aria-label="Hỏi đáp AI cho học viên">
        <QuotaLine quota={quota.data} error={quota.error} onRetry={quota.reload} />
        {block && <div data-testid="trainee-ai-blocked"><Alert tone="warning" title={block.title}>{block.text}</Alert></div>}
        {contextLine && <div className={styles.row} data-testid="trainee-ai-context">
          <p className={styles.muted}>{contextLine}</p>
          <Button type="button" size="sm" variant="quiet" onClick={() => go({ session: null, training: null, article: null })} disabled={working}><X size={14} aria-hidden="true" />Hỏi chung</Button>
        </div>}
        {articlePending && <p role="status" className={styles.dim}>Đang mở thông tin bài…</p>}
        {articleMissing && <p role="status" className={styles.dim} data-testid="trainee-ai-article-missing">Không tìm thấy bài bạn mở từ Learn (có thể đã bị ẩn hoặc gỡ). Câu hỏi sẽ không kèm bài.</p>}
        <Field label="Câu hỏi" required error={questionError} hint="Văn bản thuần. Không nhập thông tin cá nhân của người khác.">
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

    {requestId && (phase.kind === "idle" || phase.kind === "tracking") && <Panel title="Câu trả lời" description="Lấy từ máy chủ theo mã yêu cầu; tải lại trang vẫn mở lại được.">
      <RequestPanel accessToken={accessToken} requestId={requestId} trainee />
    </Panel>}

    <Panel title="Câu hỏi gần đây" description="Chỉ bạn xem được câu hỏi của mình.">
      {recent.error !== undefined && <Alert tone="danger" title="Không tải được câu hỏi gần đây" action={<Button size="sm" variant="secondary" className="mt-3" onClick={recent.reload}>Thử lại</Button>}>{aiErrorText(recent.error)}</Alert>}
      {recent.data && recent.data.items.length === 0 && <p className={styles.dim}>Bạn chưa hỏi câu nào.</p>}
      {recent.data && recent.data.items.length > 0 && <ul className={styles.list} data-testid="trainee-ai-recent">
        {recent.data.items.map((item) => <li key={item.requestId} className={styles.item}>
          <button type="button" className={styles.rowButton} onClick={() => go({ request: item.requestId })} aria-current={item.requestId === requestId ? "true" : undefined}>{item.input?.text?.slice(0, 120) || `Yêu cầu ${item.requestId.slice(0, 8)}…`}</button>
          <span className={styles.dim}><StatusBadge tone={statusTone(item.status, item.resultType)}>{statusLabel(item.status, item.resultType)}</StatusBadge> · {formatDateTime(item.createdAt)}</span>
        </li>)}
      </ul>}
    </Panel>
    <p className={styles.dim}><Link href={HUB.replace("questions", "saved")}>Bài đã lưu</Link> · <Link href={routes.learn}>Đọc thêm trong Learn</Link></p>
  </div>;
}

function QuotaLine({ quota, error, onRetry }: { quota: TraineeAiQuota | undefined; error: unknown; onRetry: () => void }) {
  if (error !== undefined) return <Alert tone="danger" title="Chưa kiểm tra được lượt hỏi hôm nay" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onRetry}>Thử lại</Button>}>{aiErrorText(error)}</Alert>;
  if (!quota) return <p role="status" className={styles.dim}>Đang kiểm tra lượt hỏi hôm nay…</p>;
  if (!quota.policyActive) return null;
  const unit = quota.quotaUnit ?? undefined;
  return <p className={styles.dim} data-testid="trainee-ai-quota">
    Hôm nay còn {formatQuota(quota.remainingUnits, unit)}{quota.dailyUnits != null ? ` / ${formatQuota(quota.dailyUnits, unit)}` : ""}
    {quota.estimatedReserve != null ? `; mỗi câu hỏi giữ chỗ khoảng ${formatQuota(quota.estimatedReserve, unit)}` : ""}. Làm mới lúc {formatDateTime(quota.resetsAt)}.
  </p>;
}
