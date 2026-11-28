"use client";

import { RefreshCw } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { assigneeLabel } from "@/features/expert-reviews/api";
import { ReviewModel } from "@/features/expert-reviews/components/review-model";
import { formatDateTime } from "@/utils/date-range";
import { describeReadError, reviewsApi } from "../api";
import { statusLabel, statusTone } from "../format";
import type { AssignedReview } from "../types";

/**
 * Hạ tầng PCCC of one IFC revision as the admin sees it (BE#247): who sent it, who holds or decided it, the reason when it
 * did not pass, and every exit, assembly point, fixed device and water source on the read-only 3D model (the same view
 * the Chuyên viên PCCC reviews on). Read-only: the admin never decides (BE#245). Mounted per review id (the caller keys it).
 */
export function InfrastructureReviewDrawer({ open, reviewId, accessToken, summary, onClose }: {
  open: boolean;
  reviewId: string;
  accessToken: string | null;
  /** Row of the current page, if the item is on it: names the drawer before the detail arrives. */
  summary?: AssignedReview;
  onClose: () => void;
}) {
  const detail = useAsyncData(`admin-infrastructure-review:${reviewId}`, (signal) => reviewsApi.reviewDetail(accessToken as string, reviewId, signal), open && Boolean(reviewId) && Boolean(accessToken));
  const data = detail.data;
  const review = data?.review ?? summary ?? null;
  const failure = !data && detail.error !== undefined ? describeReadError(detail.error, "detail") : null;

  const title = review ? `Hạ tầng PCCC · ${review.buildingName}` : failure ? failure.title : "Đang tải…";
  const eyebrow = review ? <><StatusBadge tone={statusTone(review.status)}>{statusLabel(review.status)}</StatusBadge><StatusBadge tone="neutral">Phiên bản {review.versionNumber}</StatusBadge></> : undefined;
  const pending = data?.review.status === "Submitted";

  return <Drawer
    open={open}
    onOpenChange={(next) => { if (!next) onClose(); }}
    side="right"
    size="xl"
    className="rev-drawer"
    title={title}
    description={review?.organizationName}
    eyebrow={eyebrow}
    footer={data ? <><p className="rev-note rev-foot-note">Chuyên viên PCCC thẩm định hạ tầng này. Quản trị FET3D chỉ theo dõi và gán lại mục đang chờ.</p><Button variant="secondary" onClick={onClose}>Đóng</Button></> : undefined}
    headerExtra={<Button size="icon" variant="ghost" onClick={detail.reload} disabled={detail.loading} aria-label="Làm mới chi tiết"><RefreshCw size={16} aria-hidden="true" className={detail.loading ? "rev-spin" : undefined} /></Button>}
    data-testid="infrastructure-review-drawer"
  >
    {failure
      ? <Alert tone="danger" title={failure.title} action={failure.denied ? <Button size="sm" variant="secondary" className="mt-3" onClick={onClose}>Về danh sách</Button> : <Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{failure.message}</Alert>
      : !data
        ? <div role="status" aria-live="polite"><span className="ops-sr-only">Đang tải chi tiết…</span><SkeletonDetail rows={6} /></div>
        : <div className="ops-stack rev-body" data-testid="infrastructure-review-detail" data-review-status={data.review.status}>
          <section aria-label="Thông tin bản gửi thẩm định">
            <dl className="rev-dl">
              <dt>Người gửi</dt><dd>{data.review.submittedByName ? `${data.review.submittedByName} · Tài khoản tổ chức` : "Tài khoản tổ chức"}</dd>
              <dt>Gửi lúc</dt><dd>{formatDateTime(data.review.submittedAt)}</dd>
              {pending
                ? <><dt>Người được giao</dt><dd>{data.review.assigneeId ? assigneeLabel(data.review) : "Chưa giao"}</dd></>
                : <>
                  <dt>Người thẩm định</dt><dd>{data.review.decidedByName?.trim() || "Chuyên viên PCCC"}</dd>
                  {data.review.decidedAt && <><dt>Kết quả lúc</dt><dd>{formatDateTime(data.review.decidedAt)}</dd></>}
                </>}
            </dl>
            {data.review.status === "Rejected" && data.review.reason && <Alert tone="danger" title="Lý do chưa đạt" className="mt-3">{data.review.reason}</Alert>}
          </section>
          {accessToken && <ReviewModel accessToken={accessToken} detail={data} previewKey="admin-preview" loadPreview={(signal) => reviewsApi.reviewPreview(accessToken, reviewId, signal)} />}
        </div>}
  </Drawer>;
}
