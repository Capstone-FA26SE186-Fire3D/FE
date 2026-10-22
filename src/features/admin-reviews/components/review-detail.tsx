"use client";

import { CircleCheck, CircleX, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/utils/date-range";
import { describeReadError, reviewsApi, type DecisionFailure } from "../api";
import { shortId, statusLabel, statusTone } from "../format";
import type { ContentReviewDecision, ReviewAction } from "../types";
import { DecisionDialog } from "./decision-dialog";
import { ReviewContent } from "./review-content";
import { GateSeparation, HashValue, ReadinessBlock } from "./review-parts";

/** The review API returns account ids only (no display names), so submitter and decider are shown as short ids. */
function AccountRef({ id }: { id: string | null }) {
  if (!id) return <>—</>;
  return <span title={id} className="adm-mono">{shortId(id)}</span>;
}

type Notice = { tone: "success" | "warning"; title: string; text: string };

/**
 * One review loaded from the server. The decision always uses the version id and hashes of THIS detail response;
 * after any decision (or any 409/401/403/404) the detail is reloaded so the screen shows the server's current state.
 */
export function ReviewDetailView({ reviewId, accessToken, onChanged, onClose }: {
  reviewId: string;
  accessToken: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const idempotency = useIdempotencyKey();
  const detail = useAsyncData(`review:${reviewId}`, (signal) => reviewsApi.detail(accessToken, reviewId, signal));
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [decidedHere, setDecidedHere] = useState(false);

  if (!detail.data) {
    if (detail.error !== undefined) {
      const failure = describeReadError(detail.error, "detail");
      return <Alert tone="danger" title={failure.title} action={failure.denied ? <Button size="sm" variant="secondary" className="mt-3" onClick={onClose}>Về hàng chờ</Button> : <Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{failure.message}</Alert>;
    }
    return <SkeletonRows rows={8} label="Đang tải chi tiết bản duyệt…" />;
  }

  const data = detail.data;
  const { review, readiness } = data;
  const pending = review.status === "Submitted";
  const canDecide = pending && !decidedHere && !detail.loading && detail.error === undefined;
  const staleReadFailure = detail.error !== undefined ? describeReadError(detail.error, "detail") : null;

  const handleDecided = (result: ContentReviewDecision) => {
    setAction(null);
    setDecidedHere(true);
    setNotice(null);
    toast.notify({ tone: "success", title: result.status === "Approved" ? "Đã duyệt nội dung" : "Đã từ chối phiên bản", description: `${review.scenarioName} · v${review.versionNumber}` });
    detail.reload();
    onChanged();
  };

  const handleStale = (failure: DecisionFailure) => {
    setAction(null);
    setNotice({ tone: "warning", title: "Quyết định chưa được ghi", text: failure.message });
    detail.reload();
    onChanged();
  };

  return <div className="ops-stack" data-testid="review-detail" data-review-status={review.status}>
    <header className="rev-detail-head">
      <div>
        <h3>{review.scenarioName} · v{review.versionNumber}</h3>
        <p>{review.organizationName} · {review.buildingName} · gửi lúc {formatDateTime(review.submittedAt)}</p>
      </div>
      <div className="ops-actions">
        <StatusBadge tone={statusTone(review.status)}>{statusLabel(review.status)}</StatusBadge>
        <Button size="sm" variant="quiet" onClick={detail.reload} disabled={detail.loading}><RefreshCw size={14} aria-hidden="true" />{detail.loading ? "Đang tải…" : "Tải lại"}</Button>
      </div>
    </header>

    {notice && <Alert tone={notice.tone} title={notice.title}>{notice.text}</Alert>}
    {decidedHere && !notice && <Alert tone="success" title="Quyết định đã được ghi">{detail.loading ? "Đang cập nhật trạng thái từ máy chủ…" : "Trạng thái bên dưới lấy lại từ máy chủ. Quyết định không đổi được."}</Alert>}
    {staleReadFailure && <Alert tone="warning" title="Dữ liệu có thể đã cũ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{staleReadFailure.message} Các nút quyết định bị khóa cho tới khi tải lại được.</Alert>}

    <section aria-label="Thông tin bản duyệt">
      <dl className="rev-dl">
        <dt>Hash nội dung</dt><dd><HashValue value={review.contentHash} label="Hash nội dung" /></dd>
        <dt>Hash rubric</dt><dd><HashValue value={review.rubricHash} label="Hash rubric" /></dd>
        <dt>Tổ chức</dt><dd>{review.organizationName}</dd>
        <dt>Công trình</dt><dd>{review.buildingName}</dd>
        <dt>Kịch bản</dt><dd>{review.scenarioName}</dd>
        <dt>Phiên bản</dt><dd>v{review.versionNumber}</dd>
        <dt>Người gửi</dt><dd><AccountRef id={review.submittedBy} /></dd>
        <dt>Gửi lúc</dt><dd>{formatDateTime(review.submittedAt)}</dd>
        <dt>Mã phiên bản</dt><dd className="rev-hash">{review.scenarioVersionId}</dd>
        <dt>Mã bản duyệt</dt><dd className="rev-hash">{review.reviewId}</dd>
      </dl>
    </section>

    <GateSeparation summary={review} readiness={readiness} />
    <ReviewContent detail={data} />
    <ReadinessBlock readiness={readiness} />

    <section className="adm-decision" aria-label="Quyết định nội dung">
      <h3>Quyết định</h3>
      {pending && !decidedHere
        ? <>
          <p className="rev-note">Quyết định áp dụng cho đúng hash nội dung và hash rubric ở trên. Duyệt hoặc từ chối đều <strong>không đổi được</strong>; sửa nội dung luôn tạo phiên bản mới. Sau khi xử lý, bản này chỉ còn đọc.</p>
          <div className="ops-actions" style={{ marginTop: 12 }}>
            <Button onClick={() => setAction("approve")} disabled={!canDecide}><CircleCheck size={16} aria-hidden="true" />Duyệt nội dung</Button>
            <Button variant="danger" onClick={() => setAction("reject")} disabled={!canDecide}><CircleX size={16} aria-hidden="true" />Từ chối</Button>
          </div>
        </>
        : <>
          <p className="rev-note" data-testid="decision-result">{review.status === "Approved" ? "Nội dung và rubric của phiên bản này đã được duyệt." : review.status === "Rejected" ? "Phiên bản này đã bị từ chối. Tổ chức cần sửa và gửi phiên bản mới." : "Đang cập nhật trạng thái từ máy chủ…"} Quyết định đã bất biến.</p>
          {review.decidedAt && <dl className="rev-dl" style={{ marginTop: 10 }}>
            <dt>Người quyết định</dt><dd><AccountRef id={review.decidedBy} /></dd>
            <dt>Thời điểm quyết định</dt><dd>{formatDateTime(review.decidedAt)}</dd>
          </dl>}
          {review.status === "Rejected" && <div className="rev-reason" style={{ marginTop: 10 }} data-testid="reject-reason"><strong>Lý do từ chối</strong><p>{review.reason || "Không có lý do được lưu."}</p></div>}
        </>}
    </section>

    {action && <DecisionDialog
      key={action}
      action={action}
      detail={data}
      accessToken={accessToken}
      idempotency={idempotency}
      reason={reason}
      onReasonChange={setReason}
      onClose={() => setAction(null)}
      onDecided={handleDecided}
      onStale={handleStale}
    />}
  </div>;
}
