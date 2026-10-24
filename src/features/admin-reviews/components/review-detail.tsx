"use client";

import { CircleCheck, CircleX, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/utils/date-range";
import { describeReadError, reviewsApi, type DecisionFailure } from "../api";
import { shortId, statusLabel, statusTone } from "../format";
import type { ContentReviewDecision, ReviewAction, ReviewSummary } from "../types";
import { DecisionDialog } from "./decision-dialog";
import { ReviewContent } from "./review-content";
import { GateSeparation, HashValue, ReadinessBlock, ReadinessStrip } from "./review-parts";

/** The review API returns account ids only (no display names), so submitter and decider are shown as short ids. */
function AccountRef({ id }: { id: string | null }) {
  if (!id) return <>—</>;
  return <span title={id} className="adm-mono">{shortId(id)}</span>;
}

type Notice = { tone: "success" | "warning"; title: string; text: string };

/**
 * Review drawer (Figma "Duyệt · chi tiết (drawer 720)"): status and version chips, the scenario name, the frozen
 * content with hashes and readiness, and the decision in the footer. The decision always uses the version id and hashes
 * of THIS detail response; after any decision (or any 409/401/403/404) the detail is reloaded so the drawer shows the
 * server's current state. Mounted per review id (the caller keys it), so state never leaks between reviews.
 */
export function ReviewDrawer({ open, reviewId, accessToken, summary, onChanged, onClose }: {
  open: boolean;
  reviewId: string;
  accessToken: string | null;
  /** Row of the current page, if the review is on it: names the drawer before the detail arrives. */
  summary?: ReviewSummary;
  onChanged: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const idempotency = useIdempotencyKey();
  const detail = useAsyncData(`review:${reviewId}`, (signal) => reviewsApi.detail(accessToken as string, reviewId, signal), open && Boolean(reviewId) && Boolean(accessToken));
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [decidedHere, setDecidedHere] = useState(false);

  const data = detail.data;
  const review = data?.review ?? summary ?? null;
  const readFailure = !data && detail.error !== undefined ? describeReadError(detail.error, "detail") : null;
  const staleReadFailure = data && detail.error !== undefined ? describeReadError(detail.error, "detail") : null;
  const pending = data?.review.status === "Submitted";
  const canDecide = Boolean(data) && pending && !decidedHere && !detail.loading && detail.error === undefined;

  const handleDecided = (result: ContentReviewDecision) => {
    setAction(null);
    setDecidedHere(true);
    setNotice(null);
    if (data) toast.notify({ tone: "success", title: result.status === "Approved" ? "Đã duyệt nội dung" : "Đã từ chối phiên bản", description: `${data.review.scenarioName} · v${data.review.versionNumber}` });
    detail.reload();
    onChanged();
  };

  const handleStale = (failure: DecisionFailure) => {
    setAction(null);
    setNotice({ tone: "warning", title: "Quyết định chưa được ghi", text: failure.message });
    detail.reload();
    onChanged();
  };

  const title = review ? review.scenarioName : readFailure ? readFailure.title : "Đang tải bản duyệt…";
  const description = review ? `${review.organizationName} · ${review.buildingName}` : undefined;
  const eyebrow = review ? <><StatusBadge tone={statusTone(review.status)}>{statusLabel(review.status)}</StatusBadge><StatusBadge tone="neutral">v{review.versionNumber}</StatusBadge></> : undefined;

  const footer = data
    ? pending && !decidedHere
      ? <>
        <Button variant="secondary" className="rev-btn-danger" onClick={() => setAction("reject")} disabled={!canDecide}><CircleX size={16} aria-hidden="true" />Từ chối</Button>
        <Button onClick={() => setAction("approve")} disabled={!canDecide}><CircleCheck size={16} aria-hidden="true" />Duyệt nội dung</Button>
      </>
      : <>
        <p className="rev-note rev-foot-note">Quyết định đã được ghi và không đổi được.</p>
        <Button variant="secondary" onClick={onClose}>Đóng</Button>
      </>
    : undefined;

  return <Drawer
    open={open}
    onOpenChange={(next) => { if (!next && !action) onClose(); }}
    side="right"
    size="xl"
    className="rev-drawer"
    title={title}
    description={description}
    eyebrow={eyebrow}
    footer={footer}
    headerExtra={<Button size="icon" variant="ghost" onClick={detail.reload} disabled={detail.loading} aria-label="Làm mới chi tiết"><RefreshCw size={16} aria-hidden="true" className={detail.loading ? "rev-spin" : undefined} /></Button>}
    data-testid="review-drawer"
  >
    {readFailure
      ? <Alert tone="danger" title={readFailure.title} action={readFailure.denied ? <Button size="sm" variant="secondary" className="mt-3" onClick={onClose}>Về hàng chờ</Button> : <Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{readFailure.message}</Alert>
      : !data
        ? <div role="status" aria-live="polite"><span className="ops-sr-only">Đang tải chi tiết bản duyệt…</span><SkeletonDetail rows={6} /></div>
        : <div className="ops-stack rev-body" data-testid="review-detail" data-review-status={data.review.status}>
          {notice && <Alert tone={notice.tone} title={notice.title}>{notice.text}</Alert>}
          {decidedHere && !notice && <Alert tone="success" title="Quyết định đã được ghi">{detail.loading ? "Đang cập nhật trạng thái từ máy chủ…" : "Trạng thái lấy lại từ máy chủ. Quyết định không đổi được."}</Alert>}
          {staleReadFailure && <Alert tone="warning" title="Dữ liệu có thể đã cũ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{staleReadFailure.message} Các nút quyết định bị khóa cho tới khi tải lại được.</Alert>}

          <section aria-label="Thông tin bản duyệt">
            <dl className="rev-dl">
              <dt>Người gửi</dt><dd><AccountRef id={data.review.submittedBy} /></dd>
              <dt>Gửi lúc</dt><dd>{formatDateTime(data.review.submittedAt)}</dd>
              <dt>Hash nội dung</dt><dd><HashValue value={data.review.contentHash} label="Hash nội dung" /></dd>
              <dt>Hash rubric</dt><dd><HashValue value={data.review.rubricHash} label="Hash rubric" /></dd>
              <dt>Mã phiên bản</dt><dd className="rev-hash">{data.review.scenarioVersionId}</dd>
              <dt>Mã bản duyệt</dt><dd className="rev-hash">{data.review.reviewId}</dd>
            </dl>
          </section>

          <ReadinessStrip readiness={data.readiness} />
          {pending && !decidedHere && <p className="rev-note">Quyết định áp dụng cho đúng hash nội dung và hash rubric ở trên. Duyệt hoặc từ chối đều <strong>không đổi được</strong>; sửa nội dung luôn tạo phiên bản mới.</p>}

          <GateSeparation summary={data.review} readiness={data.readiness} />
          <ReviewContent detail={data} />
          <ReadinessBlock readiness={data.readiness} />

          {(!pending || decidedHere) && <section className="rev-decision" aria-label="Quyết định nội dung">
            <h3>Quyết định</h3>
            <p className="rev-note" data-testid="decision-result">{data.review.status === "Approved" ? "Nội dung và rubric của phiên bản này đã được duyệt." : data.review.status === "Rejected" ? "Phiên bản này đã bị từ chối. Tổ chức cần sửa và gửi phiên bản mới." : "Đang cập nhật trạng thái từ máy chủ…"} Quyết định đã bất biến.</p>
            {data.review.decidedAt && <dl className="rev-dl" style={{ marginTop: 10 }}>
              <dt>Người quyết định</dt><dd><AccountRef id={data.review.decidedBy} /></dd>
              <dt>Thời điểm quyết định</dt><dd>{formatDateTime(data.review.decidedAt)}</dd>
            </dl>}
            {data.review.status === "Rejected" && <div className="rev-reason" style={{ marginTop: 10 }} data-testid="reject-reason"><strong>Lý do từ chối</strong><p>{data.review.reason || "Không có lý do được lưu."}</p></div>}
          </section>}

          {action && <DecisionDialog
            key={action}
            action={action}
            detail={data}
            accessToken={accessToken as string}
            idempotency={idempotency}
            reason={reason}
            onReasonChange={setReason}
            onClose={() => setAction(null)}
            onDecided={handleDecided}
            onStale={handleStale}
          />}
        </div>}
  </Drawer>;
}
