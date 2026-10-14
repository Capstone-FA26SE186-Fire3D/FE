"use client";

import { Send, Snowflake } from "lucide-react";
import { useState } from "react";

import { useIdempotencyKey } from "@/api";
import type { AsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import { approvalGate, describeError, type DescribedError } from "../../version-readiness";
import type { ScenarioVersionDetail, VersionReview } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { formatDateTime } from "./version-content";

/**
 * Submit the frozen version to PlatformAdmin for content review. The review state, the frozen hashes and a rejection
 * reason all come from the server (`reviewStatus` on the version, `GET .../review`), so they survive a reload or another
 * machine. The submit response only triggers a re-read.
 */
export function ReviewPanel({ accessToken, version, review, canSubmit, onSubmitted }: {
  accessToken: string;
  version: ScenarioVersionDetail;
  review: AsyncData<VersionReview>;
  canSubmit: boolean;
  onSubmitted: () => void;
}) {
  const toast = useToast();
  const { keyFor, done } = useIdempotencyKey();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DescribedError | null>(null);

  const gate = approvalGate(version.reviewStatus, version.rejectReason);
  const submitted = Boolean(version.reviewStatus) && version.reviewStatus?.toLowerCase() !== "notsubmitted";
  const frozen = review.data?.review;
  const alreadySubmitted = error?.code === "CONTENT_REVIEW_ALREADY_EXISTS";

  const submit = async () => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await scenarioVersionsApi.submitForReview(accessToken, version.id, keyFor({ versionId: version.id }));
      done();
      setConfirming(false);
      onSubmitted();
      toast.notify({ tone: "success", title: "Đã gửi duyệt", description: "Nội dung và rubric của version này đã được đóng băng để duyệt." });
    } catch (cause) {
      const described = describeError(cause, "Không gửi duyệt được.");
      setError(described);
      // Another tab/machine already submitted it: show what the server holds instead of leaving a stale "not submitted".
      if (described.code === "CONTENT_REVIEW_ALREADY_EXISTS") onSubmitted();
    } finally {
      setBusy(false);
    }
  };

  return <div className="ops-stack">
    <Panel title="Gửi duyệt nội dung" description="PlatformAdmin duyệt đúng hash nội dung và rubric của phiên bản này." bodyClassName="ops-stack">
      <ul className="ver-list">
        <li>Khi gửi, hệ thống <strong>đóng băng hash</strong> nội dung và rubric của version này.</li>
        <li>Nếu bạn sửa nội dung, hệ thống tạo <strong>version mới</strong> và version đó <strong>phải được duyệt lại</strong>; duyệt cũ không áp dụng.</li>
        <li>Duyệt nội dung <strong>tách biệt</strong> với kết quả kỹ thuật và xác nhận kỹ thuật: cái này không thay cái kia.</li>
        <li>Mỗi version chỉ gửi duyệt một lần.</li>
      </ul>
      <dl className="ver-dl">
        <dt>Hash nội dung sẽ gửi</dt><dd className="ver-hash">{version.scenarioHash}</dd>
      </dl>
      {error && !confirming && !alreadySubmitted && <Alert tone="danger" title={error.message} action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void submit()} disabled={busy}>Thử lại (cùng khóa)</Button>}>
        {error.code && <>Mã lỗi: {error.code}. </>}Thử lại dùng cùng Idempotency-Key nên không gửi trùng.
      </Alert>}
      {alreadySubmitted && !confirming && <Alert tone="warning" title={error?.message}>Phiên bản này đã được gửi trước đó (có thể từ phiên làm việc hoặc máy khác). Trạng thái hiện tại được tải lại từ máy chủ.</Alert>}
      <div className="ver-actions-row">
        <Button onClick={() => setConfirming(true)} disabled={!canSubmit || submitted || busy}><Send size={16} aria-hidden="true" />Gửi duyệt</Button>
        {!canSubmit && <span className="ver-note">Chỉ tài khoản OrganizationUser gửi duyệt được.</span>}
        {submitted && <span className="ver-note">Phiên bản này đã được gửi duyệt.</span>}
      </div>
    </Panel>

    <Panel title="Kết quả gửi duyệt" description="Trạng thái do máy chủ báo; tải lại trang vẫn giữ nguyên." bodyClassName="ops-stack">
      <div className="ver-actions-row"><StatusBadge tone={gate.tone}>{gate.label}</StatusBadge><span className="ver-note">{gate.detail}</span></div>
      {submitted && review.loading && !review.data && <SkeletonRows rows={2} label="Đang tải chi tiết gửi duyệt…" />}
      {submitted && review.error !== undefined && <Alert tone="danger" title="Không tải được chi tiết gửi duyệt" action={<Button size="sm" variant="secondary" className="mt-3" onClick={review.reload}>Thử lại</Button>}>{describeError(review.error).message}</Alert>}
      {frozen && <dl className="ver-dl">
        <dt>Mã review</dt><dd className="ver-hash" data-testid="review-id">{frozen.reviewId}</dd>
        <dt>Trạng thái</dt><dd data-testid="review-status">{frozen.status}</dd>
        <dt>Gửi lúc</dt><dd>{formatDateTime(frozen.submittedAt)}</dd>
        {frozen.decidedAt && <><dt>Quyết định lúc</dt><dd>{formatDateTime(frozen.decidedAt)}</dd></>}
        {frozen.reason && <><dt>Lý do</dt><dd data-testid="review-reason">{frozen.reason}</dd></>}
        <dt>Hash nội dung</dt><dd className="ver-hash">{frozen.contentHash} {frozen.contentHash === version.scenarioHash ? "(khớp phiên bản)" : "(KHÔNG khớp phiên bản)"}</dd>
        <dt>Hash rubric</dt><dd className="ver-hash">{frozen.rubricHash}</dd>
      </dl>}
      {!submitted && <p className="ver-note">Phiên bản này chưa được gửi duyệt.</p>}
      <p className="ver-note"><Snowflake size={14} aria-hidden="true" style={{ display: "inline", marginRight: 4 }} />Release chỉ tạo được khi PlatformAdmin đã duyệt đúng hash nội dung và hash rubric đã gửi.</p>
    </Panel>

    <Modal
      open={confirming}
      onOpenChange={(open) => { if (!busy) setConfirming(open); }}
      title="Gửi phiên bản này để duyệt?"
      description={`v${version.versionNumber} · ${version.name}`}
      footer={<><Button variant="quiet" onClick={() => setConfirming(false)} disabled={busy}>Hủy</Button><Button onClick={() => void submit()} disabled={busy}>{busy ? "Đang gửi…" : "Gửi duyệt"}</Button></>}
    >
      <div className="ops-stack">
        <p className="ver-note">Hash nội dung và rubric sẽ được đóng băng. Muốn thay đổi sau khi gửi, bạn cần tạo version mới và gửi duyệt lại.</p>
        {error && <Alert tone="danger" title={error.message}>{error.code && <>Mã lỗi: {error.code}.</>}</Alert>}
      </div>
    </Modal>
  </div>;
}
