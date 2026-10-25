"use client";

import { useState } from "react";
import { SupportCode } from "@/components/ui/support-code";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { describeDecisionError, normalizeDecisionInput, REASON_MAX, reviewsApi, validateReason, type DecisionFailure } from "../api";
import { shortHash } from "../format";
import type { ContentReviewDecision, ReviewAction, ReviewDetail } from "../types";

/**
 * Confirmation for approve / reject (Figma "Duyệt · Từ chối (modal)"). The hashes and the version id come from the
 * detail the server returned (never typed). One Idempotency-Key per intent: while the payload is unchanged a retry
 * after a lost response reuses the same key; a different reason or different server hashes mint a new key.
 */
export function DecisionDialog({ action, detail, accessToken, idempotency, reason, onReasonChange, onClose, onDecided, onStale }: {
  action: ReviewAction;
  detail: ReviewDetail;
  accessToken: string;
  /** Owned by the drawer so closing and reopening the dialog with the same payload still replays the same key. */
  idempotency: { keyFor: (payload: unknown) => string; done: () => void };
  reason: string;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onDecided: (result: ContentReviewDecision) => void;
  /** The server state is the truth (409/401/403/404): the caller closes the dialog and reloads the detail. */
  onStale: (failure: DecisionFailure) => void;
}) {
  const { keyFor, done } = idempotency;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DecisionFailure | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const { review, readiness } = detail;
  const rejecting = action === "reject";
  const trimmedLength = reason.trim().length;

  const submit = async () => {
    if (busy) return;
    if (rejecting) {
      const error = validateReason(reason);
      setReasonError(error);
      if (error) return;
    }
    const input = normalizeDecisionInput(action, { contentHash: review.contentHash, rubricHash: review.rubricHash, reason });
    const key = keyFor({ versionId: review.scenarioVersionId, action, ...input });
    setBusy(true);
    setFailure(null);
    try {
      const result = await reviewsApi.decide(accessToken, action, review.scenarioVersionId, input, key);
      done();
      onDecided(result);
    } catch (cause) {
      const described = describeDecisionError(cause);
      if (described.kind === "reload") {
        done();
        onStale(described);
      } else {
        if (described.kind === "fix" && described.reason) setReasonError(described.reason);
        setFailure(described);
      }
    } finally {
      setBusy(false);
    }
  };

  const retrying = failure?.kind === "retry";
  return <Modal
    open
    onOpenChange={(open) => { if (!open && !busy) onClose(); }}
    title={rejecting ? `Từ chối phiên bản v${review.versionNumber}?` : `Duyệt nội dung phiên bản v${review.versionNumber}?`}
    description={rejecting ? `${review.scenarioName} · ${review.organizationName}. Tổ chức sẽ thấy lý do và phải tạo phiên bản mới để gửi duyệt lại.` : `${review.scenarioName} · ${review.organizationName}`}
    className={rejecting ? "ops-dialog--danger" : undefined}
    footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
      <Button variant={rejecting ? "secondary" : "primary"} className={rejecting ? "rev-btn-danger" : undefined} onClick={() => void submit()} disabled={busy} data-testid="confirm-decision">
        {busy ? "Đang ghi…" : retrying ? "Thử lại" : rejecting ? "Từ chối phiên bản" : "Duyệt nội dung"}
      </Button>
    </>}
  >
    <div className="ops-stack">
      {rejecting
        ? <p className="rev-note">Từ chối là <strong>quyết định cuối cùng của phiên bản này</strong> và không đổi được. Để tiếp tục, tổ chức phải sửa bản nháp, tạo <strong>phiên bản mới</strong> và gửi duyệt lại.</p>
        : <p className="rev-note">Bạn duyệt <strong>đúng nội dung và tiêu chí chấm điểm (rubric) đã khóa, có mã nội dung dưới đây</strong>. Quyết định không đổi được; nếu nội dung thay đổi, tổ chức phải tạo phiên bản mới và gửi duyệt lại. Duyệt nội dung <strong>không phải</strong> là phát hành.</p>}
      <dl className="rev-dl">
        <dt>Mã nội dung kịch bản</dt><dd className="rev-hash" data-testid="dialog-content-hash" title={review.contentHash}>{shortHash(review.contentHash)}</dd>
        <dt>Mã nội dung tiêu chí chấm</dt><dd className="rev-hash" data-testid="dialog-rubric-hash" title={review.rubricHash}>{shortHash(review.rubricHash)}</dd>
      </dl>
      {!rejecting && !readiness.technicalReady && <Alert tone="warning" title="Chưa đủ điều kiện kỹ thuật">Bạn vẫn có thể duyệt nội dung, nhưng phiên bản chưa đủ điều kiện kỹ thuật để phát hành.</Alert>}
      {rejecting && <Field label="Lý do từ chối" required hint={`${trimmedLength}/${REASON_MAX} ký tự · 1–${REASON_MAX} ký tự. Tổ chức đọc được lý do này.`} error={reasonError}>
        {(props) => <Textarea {...props} rows={5} value={reason} onChange={(event) => { onReasonChange(event.target.value); if (reasonError) setReasonError(undefined); }} disabled={busy} />}
      </Field>}
      {failure && <Alert tone={retrying ? "warning" : "danger"} title={retrying ? "Chưa xác nhận được quyết định" : "Không ghi được quyết định"}>{failure.message}<SupportCode code={failure.code} /></Alert>}
    </div>
  </Modal>;
}
