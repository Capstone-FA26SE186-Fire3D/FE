"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { outcomeLabel, shortHash, statusLabel, statusTone } from "../format";
import type { ReviewReadiness, ReviewSummary } from "../types";

/** Hash shown short with a toggle to the full 64 characters (the full value is what the decision pins). */
export function HashValue({ value, label }: { value: string; label: string }) {
  const [full, setFull] = useState(false);
  return <span className="rev-hash-wrap">
    <code className="rev-hash" aria-label={label} data-testid={`hash-${label.toLowerCase().includes("rubric") ? "rubric" : "content"}`}>{full ? value : shortHash(value)}</code>
    <button type="button" className="rev-link-button" aria-expanded={full} onClick={() => setFull((current) => !current)}>{full ? "Thu gọn" : "Xem đầy đủ"}</button>
  </span>;
}

/** One-line readiness strip under the metadata (Figma "Readiness kỹ thuật đạt · 0 vấn đề chặn"). Information only. */
export function ReadinessStrip({ readiness }: { readiness: ReviewReadiness }) {
  const ready = readiness.technicalReady;
  const Icon = ready ? CircleCheck : TriangleAlert;
  return <p className="rev-ready" data-tone={ready ? "success" : "warning"} data-testid="readiness-strip">
    <Icon size={16} aria-hidden="true" />
    <span>{ready ? "Readiness kỹ thuật đạt" : "Readiness kỹ thuật chưa đạt"} · {readiness.blockerCount} lỗi chặn · {outcomeLabel(readiness.outcome)}</span>
  </p>;
}

/** Technical readiness, shown on its own and labelled as information only. It never gates the content decision here. */
export function ReadinessBlock({ readiness }: { readiness: ReviewReadiness }) {
  return <Panel
    title="Readiness kỹ thuật"
    description="Thông tin hiện tại về QA/IFC và xác nhận huấn luyện; chỉ để tham khảo khi duyệt."
    actions={<StatusBadge tone={readiness.technicalReady ? "success" : "warning"} data-testid="technical-ready">{readiness.technicalReady ? "Sẵn sàng kỹ thuật" : "Chưa sẵn sàng kỹ thuật"}</StatusBadge>}
    bodyClassName="ops-stack"
    data-testid="readiness-block"
  >
    <p className="rev-callout">Readiness kỹ thuật ≠ duyệt nội dung ≠ publish gate. Ba điều kiện này tách biệt: QA đạt không có nghĩa nội dung đã được duyệt, và nội dung được duyệt chưa có nghĩa phiên bản đã phát hành.</p>
    <dl className="rev-dl">
      <dt>Kết quả QA (validation)</dt><dd data-testid="readiness-outcome">{outcomeLabel(readiness.outcome)}</dd>
      <dt>Lỗi chặn (Error/Critical)</dt><dd data-testid="readiness-blockers">{readiness.blockerCount}</dd>
      <dt>Lần chạy QA</dt><dd className="rev-hash">{readiness.validationRunId ?? "Chưa có"}</dd>
      <dt>Xác nhận huấn luyện</dt><dd className="rev-hash" data-testid="readiness-confirmation">{readiness.confirmationReviewId ?? "Chưa xác nhận (confirm-for-training)"}</dd>
      <dt>Artifact runtime ứng viên</dt><dd className="rev-hash" data-testid="readiness-artifact">{readiness.candidateArtifactId ?? "Chưa có artifact runtime"}</dd>
    </dl>
  </Panel>;
}

/** Three separate gates, so the admin never reads one as another. */
export function GateSeparation({ summary, readiness }: { summary: ReviewSummary; readiness: ReviewReadiness }) {
  return <Panel title="Ba cổng tách biệt" bodyClassName="ops-stack" data-testid="gate-separation">
    <ol className="rev-gates">
      <li>
        <strong>1. Readiness kỹ thuật</strong>
        <StatusBadge tone={readiness.technicalReady ? "success" : "warning"}>{readiness.technicalReady ? "Sẵn sàng" : "Chưa sẵn sàng"}</StatusBadge>
        <span>QA, lỗi chặn, xác nhận huấn luyện và artifact runtime (khối bên dưới).</span>
      </li>
      <li>
        <strong>2. Duyệt nội dung</strong>
        <StatusBadge tone={statusTone(summary.status)} data-testid="review-status">{statusLabel(summary.status)}</StatusBadge>
        <span>Quyết định của PlatformAdmin cho đúng hash nội dung và hash rubric này.</span>
      </li>
      <li>
        <strong>3. Publish gate</strong>
        <StatusBadge tone="neutral">Không đánh giá ở màn này</StatusBadge>
        <span>Phát hành kiểm tra lại mọi điều kiện (release Built, entitlement, duyệt nội dung, readiness) khi tổ chức thực hiện.</span>
      </li>
    </ol>
  </Panel>;
}
