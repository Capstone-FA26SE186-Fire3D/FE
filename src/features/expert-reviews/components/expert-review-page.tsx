"use client";

import { ArrowLeft, CircleCheck, CircleX, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { describeApiError } from "@/api/describe-error";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { LoadingBlock } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupportCode } from "@/components/ui/support-code";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { ReviewContent } from "@/features/admin-reviews/components/review-content";
import "@/features/admin-reviews/components/reviews.css";
import { useAuthSession } from "@/features/auth/auth-session";

import { assigneeName, describeDecisionError, expertReviewsApi, hasAssignment, KIND_LABEL, REASON_MAX, reviewTitle, statusOf, validateReason, type DecisionFailure, type ExpertAction } from "../api";
import { ReviewModel } from "./review-model";

/**
 * `/expert/reviews/[id]`: one item of the queue on its own page: who sent it, the frozen content (the 3D model large, then
 * as text) and the decision in a bar that stays at the bottom of the screen. The decision pins the revision this page read
 * (`If-Match`): when another expert decided first the server answers 412 and the page reloads to show that result. A
 * decision is final; the organization fixes by sending a new version.
 */
export function ExpertReviewPage({ reviewId }: { reviewId: string }) {
  const { accessToken, ready, user } = useAuthSession();
  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 3) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ Chuyên viên PCCC thẩm định được hạ tầng và tình huống.</Alert>;
  return <ExpertReviewDetail key={reviewId} reviewId={reviewId} accessToken={accessToken} />;
}

function ExpertReviewDetail({ reviewId, accessToken }: { reviewId: string; accessToken: string | null }) {
  const toast = useToast();
  const { keyFor, done } = useIdempotencyKey();
  const loaded = useAsyncData(`expert-review:${reviewId}`, (signal) => expertReviewsApi.detail(accessToken as string, reviewId, signal), Boolean(accessToken));
  const [action, setAction] = useState<ExpertAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DecisionFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const detail = loaded.data?.detail;
  const etag = loaded.data?.etag ?? null;
  const review = detail?.review ?? null;
  const pending = detail?.review.status === "Submitted";
  // BE#242: an item assigned to another expert is read-only here. Absent fields (today's server) keep the shared queue.
  const heldBy = review && hasAssignment(review) && review.assignedToMe === false ? review.assignedTo ?? null : undefined;
  const readOnly = heldBy !== undefined;
  const canDecide = Boolean(detail) && pending && !readOnly && Boolean(etag) && !loaded.loading && loaded.error === undefined;
  const isInfrastructure = review?.kind === "Infrastructure";

  const decide = async () => {
    if (!detail || !etag || !action || busy) return;
    if (action === "reject") {
      const error = validateReason(reason);
      setReasonError(error);
      if (error) return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const sent = action === "reject" ? reason.trim() : undefined;
      await expertReviewsApi.decide(accessToken as string, action, reviewId, etag, keyFor({ reviewId, action, etag, reason: sent }), sent);
      done();
      toast.notify({ tone: "success", title: action === "approve" ? "Đã ghi: Đạt thẩm định" : "Đã ghi: Chưa đạt", description: reviewTitle(detail.review) });
      setAction(null);
      loaded.reload();
    } catch (cause) {
      const described = describeDecisionError(cause);
      if (described.kind === "reload") {
        done();
        setAction(null);
        setNotice(described.message);
        loaded.reload();
      } else {
        if (described.kind === "fix") setReasonError(described.message);
        setFailure(described);
      }
    } finally {
      setBusy(false);
    }
  };

  const status = review ? statusOf(review.status) : null;

  return <div className="ops-stack" data-testid="expert-review-page">
    <div><Button asChild variant="quiet" size="sm"><Link href={routes.expertReviews}><ArrowLeft size={16} aria-hidden="true" />Hàng chờ thẩm định</Link></Button></div>
    <PageHeader eyebrow={review ? `${KIND_LABEL[review.kind] ?? "Nội dung"} · phiên bản ${review.versionNumber}` : "Thẩm định"}
      title={review ? reviewTitle(review) : loaded.error !== undefined ? "Không mở được mục này" : "Đang tải…"}
      description={review ? `${review.organizationName} · ${review.buildingName}` : undefined}
      actions={<Button variant="quiet" onClick={loaded.reload} disabled={loaded.loading} aria-label="Làm mới chi tiết"><RefreshCw size={16} aria-hidden="true" className={loaded.loading ? "rev-spin" : undefined} />{loaded.loading ? "Đang tải…" : "Tải lại"}</Button>} />

    {!detail
      ? loaded.error !== undefined
        ? <Alert tone="danger" title="Không mở được mục này" action={<Button size="sm" variant="secondary" className="mt-3" onClick={loaded.reload}>Thử lại</Button>}>{describeApiError(loaded.error, "Hãy thử lại sau.")}</Alert>
        : <div role="status" aria-live="polite"><span className="ops-sr-only">Đang tải chi tiết…</span><SkeletonDetail rows={6} /></div>
      : <div className="ops-stack rev-body" data-testid="expert-review-detail" data-review-status={detail.review.status}>
        <p className="rev-page-meta">
          {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
          <span>Người gửi: <strong>{detail.review.submittedByName ?? "Tài khoản tổ chức"}</strong></span>
          <span>Gửi lúc: <time dateTime={detail.review.submittedAt}>{formatDateTime(detail.review.submittedAt)}</time></span>
        </p>
        {notice && <Alert tone="warning" title="Kết quả của bạn chưa được ghi">{notice}</Alert>}
        {loaded.error !== undefined && <Alert tone="warning" title="Dữ liệu có thể đã cũ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={loaded.reload}>Thử lại</Button>}>{describeApiError(loaded.error, "Hãy thử lại sau.")} Các nút thẩm định bị khoá cho tới khi tải lại được.</Alert>}
        {pending && readOnly && <div data-testid="expert-readonly"><Alert tone="info">{heldBy ? `Mục này đang giao cho ${assigneeName(heldBy)}. Bạn chỉ xem được.` : "Mục này chưa giao cho Chuyên viên nào. Bạn chỉ xem được."}</Alert></div>}
        {pending && !readOnly && <p className="rev-note">Bạn thẩm định <strong>đúng nội dung đang xem</strong>. Kết quả không đổi được; nếu cần sửa, tổ chức tạo phiên bản mới và gửi lại. Thẩm định trên mô phỏng không thay việc người đứng đầu cơ sở phê duyệt phương án PC06.</p>}

        <ReviewModel accessToken={accessToken as string} detail={detail} />
        {!isInfrastructure && <ReviewContent detail={detail} />}

        {!pending && <section className="rev-decision" aria-label="Kết quả thẩm định">
          <h3>Kết quả</h3>
          <p className="rev-note" data-testid="expert-result">{detail.review.status === "Approved" ? (isInfrastructure ? "Hạ tầng đạt thẩm định và đã khoá. Tổ chức tạo được tình huống trên phiên bản này." : "Tình huống đạt thẩm định.") : "Chưa đạt thẩm định. Tổ chức cần sửa và gửi phiên bản mới."}</p>
          {detail.review.decidedAt && <dl className="rev-dl" style={{ marginTop: 10 }}>
            <dt>Chuyên viên PCCC</dt><dd>{detail.review.decidedByName ?? "—"}</dd>
            <dt>Thời điểm</dt><dd>{formatDateTime(detail.review.decidedAt)}</dd>
          </dl>}
          {detail.review.status === "Rejected" && <div className="rev-reason" style={{ marginTop: 10 }} data-testid="expert-reason"><strong>Lý do chưa đạt</strong><p>{detail.review.reason || "Không có lý do được lưu."}</p></div>}
        </section>}

        <SupportCode id={detail.review.reviewId} />

        {pending && !readOnly && <div className="rev-actionbar" role="group" aria-label="Kết quả thẩm định">
          <p className="rev-foot-note">Kết quả không đổi được sau khi ghi.</p>
          <Button variant="secondary" className="rev-btn-danger" onClick={() => { setFailure(null); setAction("reject"); }} disabled={!canDecide} data-testid="expert-reject"><CircleX size={16} aria-hidden="true" />Chưa đạt</Button>
          <Button onClick={() => { setFailure(null); setAction("approve"); }} disabled={!canDecide} data-testid="expert-approve"><CircleCheck size={16} aria-hidden="true" />Đạt thẩm định</Button>
        </div>}
      </div>}

    {action && detail && <Modal open onOpenChange={(next) => { if (!next && !busy) setAction(null); }}
      title={action === "reject" ? "Ghi kết quả: Chưa đạt?" : "Ghi kết quả: Đạt thẩm định?"}
      description={`${reviewTitle(detail.review)} · ${detail.review.organizationName}`}
      className={action === "reject" ? "ops-dialog--danger" : undefined}
      footer={<>
        <Button variant="ghost" onClick={() => setAction(null)} disabled={busy}>Hủy</Button>
        <Button variant={action === "reject" ? "secondary" : "primary"} className={action === "reject" ? "rev-btn-danger" : undefined} onClick={() => void decide()} disabled={busy} data-testid="expert-confirm">
          {busy ? "Đang ghi…" : failure?.kind === "retry" ? "Thử lại" : action === "reject" ? "Ghi: Chưa đạt" : "Ghi: Đạt thẩm định"}
        </Button>
      </>}>
      <div className="ops-stack">
        <p className="rev-note">{action === "reject"
          ? "Tổ chức sẽ đọc được lý do và phải tạo phiên bản mới để gửi lại. Kết quả này không đổi được."
          : isInfrastructure ? "Hạ tầng sẽ được khoá: mọi tình huống của bản IFC này dùng chung lối thoát, điểm tập kết và thiết bị của nó. Kết quả này không đổi được." : "Tình huống được ghi là đạt thẩm định. Kết quả này không đổi được."}</p>
        {action === "reject" && <Field label="Lý do chưa đạt" required hint={`${reason.trim().length}/${REASON_MAX} ký tự. Nêu rõ cần sửa gì.`} error={reasonError}>
          {(props) => <Textarea {...props} rows={5} value={reason} disabled={busy} data-testid="expert-reason-input" onChange={(event) => { setReason(event.target.value); if (reasonError) setReasonError(undefined); }} />}
        </Field>}
        {failure && <Alert tone={failure.kind === "retry" ? "warning" : "danger"} title="Chưa ghi được kết quả">{failure.message}<SupportCode code={failure.code} /></Alert>}
      </div>
    </Modal>}
  </div>;
}
