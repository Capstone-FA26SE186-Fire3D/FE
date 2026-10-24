"use client";

import { Send, Snowflake } from "lucide-react";
import { useState } from "react";

import { useIdempotencyKey } from "@/api";
import type { AsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
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

  const status = version.reviewStatus?.toLowerCase();
  const steps: Array<{ title: string; when: string; state: "done" | "current" | "failed" | "todo" }> = [
    { title: "Phiên bản đã đóng băng", when: formatDateTime(version.createdAt), state: "done" },
    { title: "Đã gửi duyệt", when: submitted ? (frozen ? formatDateTime(frozen.submittedAt) : "Đã gửi") : "Chưa gửi", state: submitted ? "done" : "todo" },
    status === "approved" ? { title: "Đã duyệt", when: frozen?.decidedAt ? formatDateTime(frozen.decidedAt) : "PlatformAdmin", state: "done" }
      : status === "rejected" ? { title: "Bị từ chối", when: frozen?.decidedAt ? formatDateTime(frozen.decidedAt) : "PlatformAdmin", state: "failed" }
      : { title: "PlatformAdmin duyệt", when: submitted ? "Đang chờ" : "Sau khi gửi", state: submitted ? "current" : "todo" },
  ];

  return <div className="ops-stack">
    <section className="ver-card" aria-labelledby="ver-review-title">
      <div className="ver-card-head">
        <div>
          <h2 id="ver-review-title" className="ver-card-title">Duyệt nội dung bởi PlatformAdmin</h2>
          <p className="ver-card-sub">Cổng độc lập với build: có thể gửi duyệt trước khi package build xong.</p>
        </div>
        <StatusBadge tone={gate.tone}>{gate.label}</StatusBadge>
      </div>
      <ol className="ver-review-steps" aria-label="Tiến trình duyệt">
        {steps.map((step) => <li key={step.title} data-state={step.state}>
          <span className="ver-step-node" aria-hidden="true" />
          <strong>{step.title}</strong>
          <span>{step.when}</span>
        </li>)}
      </ol>
      <p className="ver-note">Gửi duyệt đóng băng hash nội dung và rubric; mỗi phiên bản chỉ gửi một lần. Sửa nội dung sẽ tạo <strong>version mới</strong> và version đó <strong>phải được duyệt lại</strong>. Duyệt nội dung tách biệt với kết quả kỹ thuật.</p>
      <div className="ver-card-foot">
        {error && !confirming && !alreadySubmitted && <Alert tone="danger" title={error.message} action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void submit()} disabled={busy}>Thử lại (cùng khóa)</Button>}>
          {error.code && <>Mã lỗi: {error.code}. </>}Thử lại dùng cùng Idempotency-Key nên không gửi trùng.
        </Alert>}
        {alreadySubmitted && !confirming && <Alert tone="warning" title={error?.message}>Phiên bản này đã được gửi trước đó (có thể từ phiên làm việc hoặc máy khác). Trạng thái hiện tại được tải lại từ máy chủ.</Alert>}
        <div className="ver-actions-row">
          <Button onClick={() => setConfirming(true)} disabled={!canSubmit || submitted || busy}><Send size={16} aria-hidden="true" />Gửi duyệt</Button>
          {!canSubmit && <span className="ver-note">Chỉ tài khoản OrganizationUser gửi duyệt được.</span>}
          {canSubmit && submitted && <span className="ver-note">v{version.versionNumber} đã được gửi duyệt nên không gửi lại. Tạo phiên bản mới để gửi nội dung khác.</span>}
        </div>
      </div>
    </section>

    <div className="ver-two">
      <section className="ver-card" aria-labelledby="ver-frozen-title">
        <div>
          <h2 id="ver-frozen-title" className="ver-card-title">Nội dung đã đóng băng</h2>
          <p className="ver-card-sub">Admin duyệt đúng những hash này.</p>
        </div>
        <dl className="ver-hash-list">
          <div><dt>Nội dung (mục tiêu, hướng dẫn, đối tượng)</dt><dd className="ver-hash">{frozen?.contentHash ?? version.scenarioHash}{frozen && (frozen.contentHash === version.scenarioHash ? " (khớp phiên bản)" : " (KHÔNG khớp phiên bản)")}</dd></div>
          <div><dt>Rubric</dt><dd className="ver-hash">{frozen?.rubricHash ?? "Tính khi gửi duyệt"}</dd></div>
        </dl>
      </section>

      <section className="ver-card" aria-labelledby="ver-decision-title">
        <div>
          <h2 id="ver-decision-title" className="ver-card-title">Quyết định</h2>
          <p className="ver-card-sub">Do máy chủ ghi nhận; tải lại trang vẫn giữ nguyên.</p>
        </div>
        {submitted && review.loading && !review.data && <SkeletonRows rows={2} label="Đang tải chi tiết gửi duyệt…" />}
        {submitted && review.error !== undefined && <Alert tone="danger" title="Không tải được chi tiết gửi duyệt" action={<Button size="sm" variant="secondary" className="mt-3" onClick={review.reload}>Thử lại</Button>}>{describeError(review.error).message}</Alert>}
        {frozen && <dl className="ver-meta ver-meta--3">
          <div><dt>Trạng thái</dt><dd data-testid="review-status">{frozen.status}</dd></div>
          <div><dt>Gửi lúc</dt><dd>{formatDateTime(frozen.submittedAt)}</dd></div>
          <div><dt>Quyết định lúc</dt><dd>{frozen.decidedAt ? formatDateTime(frozen.decidedAt) : "Chưa có"}</dd></div>
          <div><dt>Mã review</dt><dd className="ver-hash" data-testid="review-id">{frozen.reviewId}</dd></div>
        </dl>}
        {frozen?.reason && <div className="ver-reason"><p>Lý do từ chối</p><p data-testid="review-reason">{frozen.reason}</p></div>}
        {status === "approved" && <Alert tone="success" title="Nội dung đã được duyệt">Cổng duyệt đạt. Phát hành vẫn cần kết quả kỹ thuật và dịch vụ đang hiệu lực.</Alert>}
        {!submitted && <p className="ver-note">Phiên bản này chưa được gửi duyệt.</p>}
        <p className="ver-note"><Snowflake size={14} aria-hidden="true" style={{ display: "inline", marginRight: 4 }} />Release chỉ tạo được khi PlatformAdmin đã duyệt đúng hash nội dung và hash rubric đã gửi.</p>
      </section>
    </div>

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
