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
    <span>{ready ? "Đủ điều kiện kỹ thuật" : "Chưa đủ điều kiện kỹ thuật"} · {readiness.blockerCount} lỗi chặn · {outcomeLabel(readiness.outcome)}</span>
  </p>;
}

/** Technical readiness, shown on its own and labelled as information only. It never gates the content decision here. */
export function ReadinessBlock({ readiness }: { readiness: ReviewReadiness }) {
  return <Panel
    title="Điều kiện kỹ thuật"
    description="Kết quả kiểm tra mô hình IFC và xác nhận dùng cho huấn luyện hiện tại; chỉ để tham khảo khi duyệt."
    actions={<StatusBadge tone={readiness.technicalReady ? "success" : "warning"} data-testid="technical-ready">{readiness.technicalReady ? "Sẵn sàng kỹ thuật" : "Chưa sẵn sàng kỹ thuật"}</StatusBadge>}
    bodyClassName="ops-stack"
    data-testid="readiness-block"
  >
    <p className="rev-callout">Điều kiện kỹ thuật, duyệt nội dung và điều kiện phát hành là ba việc tách biệt: kiểm tra tự động đạt không có nghĩa nội dung đã được duyệt, và nội dung được duyệt chưa có nghĩa phiên bản đã phát hành.</p>
    <dl className="rev-dl">
      <dt>Kết quả kiểm tra tự động</dt><dd data-testid="readiness-outcome">{outcomeLabel(readiness.outcome)}</dd>
      <dt>Lỗi chặn (lỗi và lỗi nghiêm trọng)</dt><dd data-testid="readiness-blockers">{readiness.blockerCount}</dd>
      <dt>Lần kiểm tra</dt><dd title={readiness.validationRunId ?? undefined}>{readiness.validationRunId ? "Đã chạy" : "Chưa có"}</dd>
      <dt>Xác nhận huấn luyện</dt><dd data-testid="readiness-confirmation" title={readiness.confirmationReviewId ?? undefined}>{readiness.confirmationReviewId ? "Đã xác nhận dùng cho huấn luyện" : "Chưa xác nhận dùng cho huấn luyện"}</dd>
      <dt>Tệp cho ứng dụng</dt><dd data-testid="readiness-artifact" title={readiness.candidateArtifactId ?? undefined}>{readiness.candidateArtifactId ? "Đã có tệp đã xử lý" : "Chưa có tệp cho ứng dụng"}</dd>
    </dl>
  </Panel>;
}

/** Three separate gates, so the admin never reads one as another. */
export function GateSeparation({ summary, readiness }: { summary: ReviewSummary; readiness: ReviewReadiness }) {
  return <Panel title="Ba điều kiện tách biệt" bodyClassName="ops-stack" data-testid="gate-separation">
    <ol className="rev-gates">
      <li>
        <strong>1. Điều kiện kỹ thuật</strong>
        <StatusBadge tone={readiness.technicalReady ? "success" : "warning"}>{readiness.technicalReady ? "Sẵn sàng" : "Chưa sẵn sàng"}</StatusBadge>
        <span>Kiểm tra tự động, lỗi chặn, xác nhận huấn luyện và tệp cho ứng dụng (khối bên dưới).</span>
      </li>
      <li>
        <strong>2. Duyệt nội dung</strong>
        <StatusBadge tone={statusTone(summary.status)} data-testid="review-status">{statusLabel(summary.status)}</StatusBadge>
        <span>Quyết định của quản trị FET3D cho đúng nội dung kịch bản và tiêu chí chấm điểm đang xem.</span>
      </li>
      <li>
        <strong>3. Điều kiện phát hành</strong>
        <StatusBadge tone="neutral">Không đánh giá ở màn này</StatusBadge>
        <span>Khi tổ chức phát hành, hệ thống kiểm tra lại mọi điều kiện (gói đã dựng xong, quyền sử dụng, duyệt nội dung, điều kiện kỹ thuật).</span>
      </li>
    </ol>
  </Panel>;
}
