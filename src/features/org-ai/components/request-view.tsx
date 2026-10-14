"use client";

import { Check, Copy, ShieldAlert, SearchX } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { formatDateTime, formatNumber, formatQuota } from "@/features/billing/format";
import { isObject, type JsonObject } from "@/features/scenario-editor/store/json";
import { KIND_META, type ObjectKind } from "@/features/scenario-editor/v1/contract";

import { failureText, isInFlight, isSuccessfulDraft, operationLabel, sourceKindLabel, statusLabel, statusTone } from "../labels";
import { readProposalNotes, readProposalState } from "../apply-plan";
import type { AiCitation, AiRequest } from "../types";
import styles from "../org-ai.module.css";

export const BILLING_AI_HREF = `${routes.workspaceBilling}?tab=ai`;

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <span className={styles.mono}>{value}{" "}
    <button type="button" className="ops-icon-button" aria-label="Sao chép mã yêu cầu" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined); }}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button></span>;
}

export function Citations({ request }: { request: AiRequest }) {
  const citations: AiCitation[] = Array.isArray(request.result?.citations) ? request.result.citations : [];
  if (citations.length === 0) return null;
  const sources = request.sources ?? [];
  return <section className={styles.section} aria-label="Nguồn trích dẫn" data-testid="ai-citations">
    <h3>Nguồn trích dẫn ({citations.length})</h3>
    <p className={styles.dim}>Chỉ gồm nguồn đã được ghim khi gửi yêu cầu và còn đủ điều kiện lúc tính kết quả. Phiên bản là phiên bản đã ghim.</p>
    <ul className={styles.list}>
      {citations.map((citation, index) => {
        const source = sources.find((item) => item.kind === citation.kind && item.id === citation.id);
        return <li key={`${citation.kind}:${citation.id}:${index}`} className={styles.item} data-testid="ai-citation">
          <span className={styles.itemTitle}>{source?.title ?? `${sourceKindLabel(citation.kind)} · ${citation.id.slice(0, 8)}`}</span>
          <span className={styles.dim}>
            {sourceKindLabel(citation.kind)}{source?.versionLabel ? ` · phiên bản ${source.versionLabel}` : ""}{citation.locator ? ` · vị trí: ${citation.locator}` : ""}
          </span>
          {source?.contentHash && <span className={styles.dim}>Mã băm nội dung <span className={styles.mono}>{source.contentHash.slice(0, 16)}…</span></span>}
        </li>;
      })}
    </ul>
  </section>;
}

export function Usage({ request, admin }: { request: AiRequest; admin?: boolean }) {
  const unit = request.quotaUnit;
  return <section className={styles.section} aria-label="Sử dụng" data-testid="ai-usage">
    <h3>Sử dụng kỹ thuật</h3>
    <dl className={styles.meta}>
      <dt>Đơn vị</dt><dd>{unit ?? "—"} <span className={styles.dim}>(do máy chủ quy định; không quy đổi)</span></dd>
      <dt>Đã giữ chỗ</dt><dd>{request.reservedUnits !== undefined ? formatQuota(request.reservedUnits, unit) : "—"}</dd>
      <dt>Đã tính</dt><dd>{request.consumedUnits !== undefined ? formatQuota(request.consumedUnits, unit) : isInFlight(request.status) || request.status === "NeedsReconcile" ? "Chưa có (chưa chốt)" : "—"}</dd>
      {admin && request.allocations && request.allocations.length > 0 && <><dt>Theo đợt cấp</dt><dd>{request.allocations.map((allocation) => `${allocation.grantId.slice(0, 8)}: giữ ${formatNumber(allocation.reservedUnits)}, tính ${allocation.consumedUnits === null ? "—" : formatNumber(allocation.consumedUnits)} (${allocation.status})`).join(" · ")}</dd></>}
    </dl>
    {!admin && <p className={styles.dim}>Quota được giữ chỗ trước và chốt theo mức dùng thực tế; số dư và lịch sử nằm ở <Link href={BILLING_AI_HREF}>Quota AI</Link>.</p>}
  </section>;
}

/** Read-only view of the `fet3d.editor/1` proposal: no field here is editable, nothing reaches the editor until the author applies it. */
export function DraftPreview({ state, notes }: { state: JsonObject; notes: string | null }) {
  const objects = Array.isArray(state.objects) ? state.objects.filter(isObject) : [];
  const objectives = Array.isArray(state.learningObjectives) ? state.learningObjectives.filter((item): item is string => typeof item === "string") : [];
  const rubric = isObject(state.rubric) ? state.rubric : null;
  const criteria = rubric && Array.isArray(rubric.criteria) ? rubric.criteria.length : 0;
  const geometry = isObject(state.geometry) ? state.geometry : null;
  return <div className={styles.stack} data-testid="ai-draft">
    <dl className={styles.meta}>
      <dt>Tên</dt><dd>{typeof state.name === "string" ? state.name : "Chưa có"}</dd>
      {typeof state.timeLimitSeconds === "number" && <><dt>Giới hạn thời gian</dt><dd>{formatNumber(state.timeLimitSeconds)} giây</dd></>}
      {typeof state.runtimeVersion === "string" && <><dt>Runtime</dt><dd>{state.runtimeVersion}</dd></>}
      {isObject(state.modePolicy) && Array.isArray(state.modePolicy.allowedModes) && <><dt>Chế độ cho phép</dt><dd>{state.modePolicy.allowedModes.join(", ")}</dd></>}
      {rubric && <><dt>Rubric</dt><dd>{criteria} tiêu chí{typeof rubric.pass_threshold === "number" ? ` · ngưỡng đạt ${rubric.pass_threshold}` : ""} <span className={styles.dim}>(đề xuất của AI, chưa phải quyết định của tổ chức)</span></dd></>}
      {geometry && <><dt>Geometry ghim</dt><dd className={styles.mono}>{typeof geometry.artifactId === "string" ? geometry.artifactId : "?"}</dd></>}
    </dl>
    {objectives.length > 0 && <div><strong>Mục tiêu học tập</strong><ul className={styles.list}>{objectives.map((item, index) => <li key={index} className={styles.quote}>{item}</li>)}</ul></div>}
    {typeof state.learnerInstructions === "string" && <div><strong>Hướng dẫn cho người học</strong><p className={styles.quote}>{state.learnerInstructions}</p></div>}
    {notes && <div><strong>Ghi chú của AI</strong><p className={styles.quote} data-testid="ai-draft-notes">{notes}</p></div>}
    <div>
      <strong>Đối tượng không gian đề xuất ({objects.length})</strong>
      {objects.length === 0 ? <p className={styles.dim}>Đề xuất không có đối tượng không gian.</p>
        : <ul className={styles.list} data-testid="ai-draft-objects">{objects.map((object, index) => {
          const placement = isObject(object.placement) ? object.placement : {};
          const kind = typeof object.kind === "string" ? object.kind : "?";
          return <li key={index} className={styles.item}>
            <span className={styles.itemTitle}>{typeof object.id === "string" ? object.id : "?"} · {KIND_META[kind as ObjectKind]?.label ?? kind}{typeof object.label === "string" && object.label ? ` · ${object.label}` : ""}</span>
            <span className={styles.dim}>Tầng {typeof placement.floorId === "string" ? placement.floorId : "?"}{typeof object.anchorId === "string" ? ` · Neo BIM (IFC GlobalId) ${object.anchorId}` : ""}{isObject(object.capability) && typeof object.capability.id === "string" ? ` · năng lực ${object.capability.id}` : ""}</span>
          </li>;
        })}</ul>}
    </div>
  </div>;
}

/**
 * One AI request as the server describes it. Status and content come from the BE only: nothing is inferred from the
 * absence of a field. `onApply` is offered only for a successful scenario draft and only opens the apply flow.
 */
export function RequestView({ request, admin, onApply, extra }: { request: AiRequest; admin?: boolean; onApply?: (request: AiRequest) => void; extra?: ReactNode }) {
  const result = request.result;
  const state = isSuccessfulDraft(request.operation, request.status) ? readProposalState(result) : null;
  const notes = readProposalNotes(result);
  const failure = failureText(request.failureCode);

  return <article className={styles.stack} data-testid="ai-request" data-status={request.status} data-operation={request.operation}>
    <div className={styles.row}>
      <div className="ops-actions"><strong>{operationLabel(request.operation)}</strong><StatusBadge tone={statusTone(request.status)} data-testid="ai-status">{statusLabel(request.status)}</StatusBadge>
        {isSuccessfulDraft(request.operation, request.status) && <StatusBadge tone="info">Cần bạn chỉnh sửa trước khi dùng</StatusBadge>}</div>
      <span className={styles.dim}>{formatDateTime(request.createdAt)}</span>
    </div>
    <dl className={styles.meta}>
      <dt>Mã yêu cầu</dt><dd><CopyId value={request.requestId} /></dd>
      {request.completedAt && <><dt>Hoàn tất lúc</dt><dd>{formatDateTime(request.completedAt)}</dd></>}
    </dl>

    {isInFlight(request.status) && <Alert tone="info" title={request.status === "Queued" ? "Yêu cầu đang chờ xử lý" : "Dịch vụ AI đang xử lý"}>Đây là xử lý bất đồng bộ; trang tự cập nhật khi có kết quả. Không cần gửi lại.</Alert>}

    {request.status === "NeedsReconcile" && <Alert tone="warning" title="Chưa rõ kết quả, đang chờ đối soát">
      {failure ?? "Hệ thống chưa xác nhận được kết quả từ dịch vụ AI."} Quota của yêu cầu này đang được giữ chỗ và không bị tính hay hoàn lại tự động; PlatformAdmin sẽ đối soát. Không gửi lại câu hỏi này để tránh trừ trùng.
    </Alert>}

    {request.status === "Failed" && <Alert tone="danger" title="Yêu cầu thất bại">{failure ?? "Dịch vụ AI không trả được kết quả."} Xem phần hoàn lại quota ở lịch sử sử dụng của Quota AI.</Alert>}

    {request.status === "InsufficientEvidence" && <div data-testid="ai-insufficient"><Alert tone="warning" title="Chưa đủ căn cứ để trả lời">{result?.message?.trim() || "Các nguồn đã chọn chưa đủ thông tin để trả lời có trích dẫn. Hãy mở rộng phạm vi nguồn hoặc hỏi cụ thể hơn."}</Alert></div>}

    {request.status === "SafetyRejected" && <div data-testid="ai-rejected"><Alert tone="danger" title="Bị cổng an toàn từ chối">{result?.message?.trim() || "Yêu cầu hoặc kết quả bị chặn bởi cổng an toàn nên không có nội dung để hiển thị."}</Alert></div>}

    {request.status === "Succeeded" && request.operation === "Answer" && (typeof result?.answer === "string"
      ? <section className={styles.section} aria-label="Câu trả lời"><h3>Câu trả lời</h3><p className={styles.answer} data-testid="ai-answer">{result.answer}</p></section>
      : <Alert tone="warning" title="Chưa có nội dung câu trả lời">Máy chủ báo hoàn tất nhưng không kèm nội dung. Hãy tải lại.</Alert>)}

    {request.status === "Succeeded" && request.operation === "ScenarioDraft" && (state
      ? <section className={styles.section} aria-label="Đề xuất kịch bản">
        <h3>Đề xuất kịch bản (chỉ xem)</h3>
        <Alert tone="info" title="AI chỉ đề xuất">Không có gì được lưu, đưa vào bản nháp hay phát hành cho tới khi bạn xem trước, xác nhận và lưu trong trình soạn thảo.</Alert>
        <DraftPreview state={state} notes={notes} />
        {onApply && <div><Button type="button" onClick={() => onApply(request)} data-testid="ai-apply"><ShieldAlert size={16} aria-hidden="true" />Áp dụng vào bản nháp…</Button></div>}
      </section>
      : <Alert tone="warning" title="Không đọc được đề xuất">Máy chủ báo hoàn tất nhưng nội dung không theo fet3d.editor/1, nên không thể áp dụng.</Alert>)}

    {request.status === "Succeeded" && <Citations request={request} />}
    {request.status === "Succeeded" && (request.result?.citations?.length ?? 0) === 0 && request.operation === "Answer" && <p className={styles.dim}><SearchX size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />Kết quả không kèm trích dẫn.</p>}

    <Usage request={request} admin={admin} />
    {extra}
  </article>;
}
