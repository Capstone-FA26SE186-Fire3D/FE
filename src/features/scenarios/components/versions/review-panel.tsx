"use client";

import { Send, Snowflake } from "lucide-react";
import { useState } from "react";

import { useIdempotencyKey } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import type { VersionMemory } from "../../use-version-memory";
import { approvalGate, describeError, type DescribedError } from "../../version-readiness";
import type { ScenarioVersionDetail } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";

const BE52 = "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/52";

/**
 * Submit the frozen version to PlatformAdmin for content review. Approval status and rejection reasons cannot be read
 * back yet (BE#52); only the response of this tab's own submit command is shown, labelled as such.
 */
export function ReviewPanel({ accessToken, version, memory, remember, canSubmit }: {
  accessToken: string;
  version: ScenarioVersionDetail;
  memory: VersionMemory;
  remember: (patch: VersionMemory) => void;
  canSubmit: boolean;
}) {
  const toast = useToast();
  const { keyFor, done } = useIdempotencyKey();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DescribedError | null>(null);

  const submission = memory.submission;
  const gate = approvalGate(submission);
  const alreadySubmitted = error?.code === "CONTENT_REVIEW_ALREADY_EXISTS";

  const submit = async () => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await scenarioVersionsApi.submitForReview(accessToken, version.id, keyFor({ versionId: version.id }));
      done();
      remember({ submission: result });
      setConfirming(false);
      toast.notify({ tone: "success", title: "Đã gửi duyệt", description: "Nội dung và rubric của version này đã được đóng băng để duyệt." });
    } catch (cause) {
      setError(describeError(cause, "Không gửi duyệt được."));
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
      {alreadySubmitted && !confirming && <Alert tone="warning" title={error?.message}>Phiên bản này đã được gửi trước đó, có thể từ phiên làm việc khác. Trạng thái duyệt hiện tại chưa đọc lại được (BE#52).</Alert>}
      <div className="ver-actions-row">
        <Button onClick={() => setConfirming(true)} disabled={!canSubmit || Boolean(submission) || busy}><Send size={16} aria-hidden="true" />Gửi duyệt</Button>
        {!canSubmit && <span className="ver-note">Chỉ tài khoản OrganizationUser gửi duyệt được.</span>}
        {submission && <span className="ver-note">Đã gửi trong phiên này.</span>}
      </div>
    </Panel>

    <Panel title="Kết quả gửi duyệt" description="Hiển thị theo phản hồi của lệnh gửi duyệt trong phiên này." bodyClassName="ops-stack">
      {submission
        ? <>
          <div className="ver-actions-row"><StatusBadge tone={gate.tone}>{gate.label}</StatusBadge><span className="ver-note">{gate.detail}</span></div>
          <dl className="ver-dl">
            <dt>Mã review</dt><dd className="ver-hash" data-testid="review-id">{submission.reviewId}</dd>
            <dt>Trạng thái lúc gửi</dt><dd>{submission.status}</dd>
            <dt>Hash nội dung</dt><dd className="ver-hash">{submission.contentHash} {submission.contentHash === version.scenarioHash ? "(khớp phiên bản)" : "(KHÔNG khớp phiên bản)"}</dd>
            <dt>Hash rubric</dt><dd className="ver-hash">{submission.rubricHash}</dd>
          </dl>
        </>
        : <p className="ver-note">Chưa có lệnh gửi duyệt nào trong phiên này.</p>}
      <div className="ver-pending" data-testid="be52-pending">
        <strong>Chờ BE #52: xem lại sau khi tải lại trang</strong>
        Backend chưa có API đọc trạng thái duyệt hay lý do từ chối của một phiên bản. Vì vậy sau khi tải lại, trạng thái duyệt hiển thị là &quot;Chưa có dữ liệu (chờ BE)&quot; và không được suy đoán. Việc duyệt/từ chối do PlatformAdmin thực hiện ở màn Duyệt kịch bản.{" "}
        <a href={BE52} target="_blank" rel="noreferrer" style={{ color: "var(--ember)" }}>Issue BE #52</a>
      </div>
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
