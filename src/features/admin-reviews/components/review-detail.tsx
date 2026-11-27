"use client";

import { RefreshCw } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/utils/date-range";
import { describeReadError, reviewsApi } from "../api";
import { shortId, statusLabel, statusTone } from "../format";
import type { ReviewSummary } from "../types";
import { ReviewContent } from "./review-content";
import { GateSeparation, HashValue, ReadinessBlock, ReadinessStrip } from "./review-parts";

/** Shows the resolved display name (`submittedByName`/`decidedByName`) with the role, or just the role; the id stays in the support line. */
function AccountRef({ id, role, name }: { id: string | null; role: string; name?: string | null }) {
  if (!id) return <>—</>;
  return <span title={id}>{name ? `${name} · ${role}` : role}</span>;
}

/**
 * Review drawer for PlatformAdmin: status and version chips, the scenario name, the frozen content with hashes and
 * readiness, and the result once there is one. Read-only since BE#211: a Chuyên viên PCCC thẩm định in the expert area,
 * and PlatformAdmin never decides in their place. Mounted per review id (the caller keys it).
 */
export function ReviewDrawer({ open, reviewId, accessToken, summary, onClose }: {
  open: boolean;
  reviewId: string;
  accessToken: string | null;
  /** Row of the current page, if the review is on it: names the drawer before the detail arrives. */
  summary?: ReviewSummary;
  onClose: () => void;
}) {
  const detail = useAsyncData(`review:${reviewId}`, (signal) => reviewsApi.detail(accessToken as string, reviewId, signal), open && Boolean(reviewId) && Boolean(accessToken));

  const data = detail.data;
  const review = data?.review ?? summary ?? null;
  const readFailure = !data && detail.error !== undefined ? describeReadError(detail.error, "detail") : null;
  const staleReadFailure = data && detail.error !== undefined ? describeReadError(detail.error, "detail") : null;
  const pending = data?.review.status === "Submitted";

  const title = review ? review.scenarioName : readFailure ? readFailure.title : "Đang tải…";
  const description = review ? `${review.organizationName} · ${review.buildingName}` : undefined;
  const eyebrow = review ? <><StatusBadge tone={statusTone(review.status)}>{statusLabel(review.status)}</StatusBadge><StatusBadge tone="neutral">v{review.versionNumber}</StatusBadge></> : undefined;

  return <Drawer
    open={open}
    onOpenChange={(next) => { if (!next) onClose(); }}
    side="right"
    size="xl"
    className="rev-drawer"
    title={title}
    description={description}
    eyebrow={eyebrow}
    footer={data ? <><p className="rev-note rev-foot-note" data-testid="review-readonly">Chuyên viên PCCC thẩm định nội dung này. Quản trị FET3D chỉ theo dõi.</p><Button variant="secondary" onClick={onClose}>Đóng</Button></> : undefined}
    headerExtra={<Button size="icon" variant="ghost" onClick={detail.reload} disabled={detail.loading} aria-label="Làm mới chi tiết"><RefreshCw size={16} aria-hidden="true" className={detail.loading ? "rev-spin" : undefined} /></Button>}
    data-testid="review-drawer"
  >
    {readFailure
      ? <Alert tone="danger" title={readFailure.title} action={readFailure.denied ? <Button size="sm" variant="secondary" className="mt-3" onClick={onClose}>Về danh sách</Button> : <Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{readFailure.message}</Alert>
      : !data
        ? <div role="status" aria-live="polite"><span className="ops-sr-only">Đang tải chi tiết…</span><SkeletonDetail rows={6} /></div>
        : <div className="ops-stack rev-body" data-testid="review-detail" data-review-status={data.review.status}>
          {staleReadFailure && <Alert tone="warning" title="Dữ liệu có thể đã cũ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{staleReadFailure.message}</Alert>}

          <section aria-label="Thông tin bản gửi thẩm định">
            <dl className="rev-dl">
              <dt>Người gửi</dt><dd><AccountRef id={data.review.submittedBy} role="Tài khoản tổ chức" name={data.review.submittedByName} /></dd>
              <dt>Gửi lúc</dt><dd>{formatDateTime(data.review.submittedAt)}</dd>
            </dl>
            {/* The exact hashes the decision pins, and the ids, are for support: folded so the reader sees content, not codes. */}
            <details className="support-code" data-testid="review-support">
              <summary>Thông tin cho bộ phận hỗ trợ</summary>
              <dl className="rev-dl">
                <dt>Mã nội dung kịch bản</dt><dd><HashValue value={data.review.contentHash} label="Mã nội dung kịch bản" /></dd>
                <dt>Mã nội dung tiêu chí chấm</dt><dd><HashValue value={data.review.rubricHash} label="Mã nội dung tiêu chí chấm" /></dd>
                <dt>Mã phiên bản</dt><dd className="rev-hash" title={data.review.scenarioVersionId}>{shortId(data.review.scenarioVersionId)}</dd>
                <dt>Mã bản gửi</dt><dd className="rev-hash" title={data.review.reviewId}>{shortId(data.review.reviewId)}</dd>
                <dt>Tài khoản gửi</dt><dd className="rev-hash">{data.review.submittedBy ?? "—"}</dd>
                {data.review.decidedBy && <><dt>Tài khoản thẩm định</dt><dd className="rev-hash">{data.review.decidedBy}</dd></>}
              </dl>
            </details>
          </section>

          <ReadinessStrip readiness={data.readiness} />
          <GateSeparation summary={data.review} readiness={data.readiness} />
          <ReviewContent detail={data} />
          <ReadinessBlock readiness={data.readiness} />

          {!pending && <section className="rev-decision" aria-label="Kết quả thẩm định">
            <h3>Kết quả thẩm định</h3>
            <p className="rev-note" data-testid="decision-result">{data.review.status === "Approved" ? "Nội dung và tiêu chí chấm điểm của phiên bản này đã đạt thẩm định." : data.review.status === "Rejected" ? "Phiên bản này chưa đạt thẩm định. Tổ chức cần sửa và gửi phiên bản mới." : "Đang cập nhật trạng thái từ máy chủ…"} Kết quả không đổi được nữa.</p>
            {data.review.decidedAt && <dl className="rev-dl" style={{ marginTop: 10 }}>
              <dt>Người thẩm định</dt><dd><AccountRef id={data.review.decidedBy} role="Chuyên viên PCCC" name={data.review.decidedByName} /></dd>
              <dt>Thời điểm</dt><dd>{formatDateTime(data.review.decidedAt)}</dd>
            </dl>}
            {data.review.status === "Rejected" && <div className="rev-reason" style={{ marginTop: 10 }} data-testid="reject-reason"><strong>Lý do chưa đạt</strong><p>{data.review.reason || "Không có lý do được lưu."}</p></div>}
          </section>}
        </div>}
  </Drawer>;
}
