"use client";

import { Check, Copy, ExternalLink, ShieldAlert, SearchX } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SupportCode } from "@/components/ui/support-code";
import { capabilityLabel } from "@/configs/capability-labels";
import { routes } from "@/configs/routes";
import { modeLabel } from "@/features/training-history/labels";
import { formatDateTime, formatNumber, formatQuota } from "@/features/billing/format";
import { isObject, type JsonObject } from "@/features/scenario-editor/store/json";
import { KIND_META, type ObjectKind } from "@/features/scenario-editor/v1/contract";

import { confidenceLabel, failureText, hasResultType, isInFlight, isSuccessfulDraft, operationLabel, sourceKindLabel, statusLabel, statusTone } from "../labels";
import { readProposalNotes, readProposalState } from "../apply-plan";
import type { AiCitation, AiRequest, AiSourceLink } from "../types";
import styles from "../org-ai.module.css";

export const BILLING_AI_HREF = `${routes.workspaceBilling}?tab=ai`;

const ALLOCATION_STATUS: Record<string, string> = { Reserved: "đang giữ", Consumed: "đã tính", Released: "đã trả lại" };

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <span className={styles.mono}>{value}{" "}
    <button type="button" className="ops-icon-button" aria-label="Sao chép mã yêu cầu" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined); }}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button></span>;
}

/** v7 returns citations on the request; `result.citations` is read only for responses from before BE#89. */
const citationsOf = (request: AiRequest): AiCitation[] => (Array.isArray(request.citations) ? request.citations : Array.isArray(request.result?.citations) ? request.result.citations : []);

/**
 * Where a citation opens: a Learn post (public page), the organization Library item, or the knowledge source document.
 * Only an https `sourceUri` is linked; anything else is shown as text, never as a link.
 */
export function citationHref(link: AiSourceLink | null | undefined, library: "workspace" | "admin" = "workspace"): { href: string; external: boolean } | null {
  if (!link) return null;
  if (link.learnSlug) return { href: `${routes.learn}/${encodeURIComponent(link.learnSlug)}`, external: false };
  if (link.libraryItemId) return { href: `${library === "admin" ? routes.adminLibrary : routes.workspaceLibrary}?item=${encodeURIComponent(link.libraryItemId)}`, external: false };
  if (link.sourceUri && /^https:\/\//i.test(link.sourceUri)) return { href: link.sourceUri, external: true };
  return null;
}

export function Citations({ request, admin }: { request: AiRequest; admin?: boolean }) {
  const citations = citationsOf(request);
  if (citations.length === 0) return null;
  const sources = request.sources ?? [];
  return <section className={styles.section} aria-label="Nguồn trích dẫn" data-testid="ai-citations">
    <h3>Nguồn trích dẫn ({citations.length})</h3>
    <p className={styles.dim}>Chỉ gồm nguồn đã được ghim khi gửi yêu cầu và còn đủ điều kiện lúc tính kết quả. Phiên bản là phiên bản đã ghim.</p>
    <ul className={styles.list}>
      {citations.map((citation, index) => {
        const source = sources.find((item) => item.kind === citation.kind && item.id === citation.id);
        const title = citation.title ?? source?.title ?? `${sourceKindLabel(citation.kind)} (chưa có tên)`;
        const version = citation.versionLabel ?? source?.versionLabel;
        const target = citationHref(citation.link ?? source?.link, admin ? "admin" : "workspace");
        return <li key={`${citation.kind}:${citation.id}:${index}`} className={styles.item} data-testid="ai-citation">
          <span className={styles.itemTitle}>{target
            ? target.external
              ? <a href={target.href} target="_blank" rel="noopener noreferrer" data-testid="ai-citation-link">{title} <ExternalLink size={12} aria-hidden="true" /><span className="sr-only"> (mở tab mới)</span></a>
              : <Link href={target.href} data-testid="ai-citation-link">{title}</Link>
            : title}</span>
          <span className={styles.dim}>
            {sourceKindLabel(citation.kind)}{version ? ` · phiên bản ${version}` : ""}{citation.locator ? ` · vị trí: ${citation.locator}` : ""}{typeof citation.relevance === "number" ? ` · độ liên quan ${Math.round(citation.relevance * 100)}%` : ""}
          </span>
          {source?.contentHash && <SupportCode id={source.contentHash} />}
        </li>;
      })}
    </ul>
  </section>;
}

/** Confidence, assumptions and limitations the AI stated: shown so the reader can judge the answer, never as a verdict. */
export function ResultNotes({ request }: { request: AiRequest }) {
  const result = request.result;
  const assumptions = (result?.assumptions ?? []).filter((item) => typeof item === "string" && item.trim());
  const limitations = (result?.limitations ?? []).filter((item) => typeof item === "string" && item.trim());
  if (!result?.confidence && assumptions.length === 0 && limitations.length === 0) return null;
  return <section className={styles.section} aria-label="Độ tin cậy và giới hạn" data-testid="ai-notes">
    {result?.confidence && <p><strong>Độ tin cậy AI tự đánh giá:</strong> {confidenceLabel(result.confidence)}</p>}
    {assumptions.length > 0 && <div><strong>Giả định</strong><ul className={styles.list}>{assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {limitations.length > 0 && <div><strong>Giới hạn</strong><ul className={styles.list}>{limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
  </section>;
}

export function Usage({ request, admin, trainee }: { request: AiRequest; admin?: boolean; trainee?: boolean }) {
  const unit = request.quotaUnit;
  return <section className={styles.section} aria-label="Sử dụng" data-testid="ai-usage">
    <h3>Mức sử dụng</h3>
    <dl className={styles.meta}>
      <dt>Đơn vị</dt><dd>{unit ?? "—"} <span className={styles.dim}>(do hệ thống quy định)</span></dd>
      <dt>Đã tạm trừ</dt><dd>{request.reservedUnits !== undefined ? formatQuota(request.reservedUnits, unit) : "—"}</dd>
      <dt>Đã tính</dt><dd>{request.consumedUnits != null ? formatQuota(request.consumedUnits, unit) : isInFlight(request.status) || request.status === "NeedsReconcile" ? "Chưa có (chưa chốt)" : "—"}</dd>
      {admin && request.allocations && request.allocations.length > 0 && <><dt>Theo đợt cấp</dt><dd>{request.allocations.map((allocation, index) => `Đợt ${index + 1}: giữ ${formatNumber(allocation.reservedUnits)}, tính ${allocation.consumedUnits === null ? "—" : formatNumber(allocation.consumedUnits)} (${ALLOCATION_STATUS[allocation.status] ?? "khác"})`).join(" · ")}</dd></>}
    </dl>
    {!admin && !trainee && <p className={styles.dim}>Hạn mức được tạm trừ trước và chốt theo mức dùng thực tế; số dư và lịch sử nằm ở <Link href={BILLING_AI_HREF}>Hạn mức AI</Link>.</p>}
    {trainee && <p className={styles.dim}>Mỗi câu hỏi tạm trừ trong hạn mức hôm nay của bạn và chốt theo mức dùng thực tế; phần không dùng được trả lại.</p>}
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
      {typeof state.runtimeVersion === "string" && <><dt>Phiên bản ứng dụng</dt><dd>{state.runtimeVersion}</dd></>}
      {isObject(state.modePolicy) && Array.isArray(state.modePolicy.allowedModes) && <><dt>Chế độ cho phép</dt><dd>{state.modePolicy.allowedModes.map((mode) => modeLabel(String(mode))).join(", ")}</dd></>}
      {rubric && <><dt>Tiêu chí chấm điểm</dt><dd>{criteria} tiêu chí{typeof rubric.pass_threshold === "number" ? ` · ngưỡng đạt ${rubric.pass_threshold}` : ""} <span className={styles.dim}>(đề xuất của AI, chưa phải quyết định của tổ chức)</span></dd></>}
      {geometry && <><dt>Mô hình đã ghim</dt><dd>{typeof geometry.artifactId === "string" ? "Có" : "Không rõ"}</dd></>}
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
            <span className={styles.itemTitle}>{KIND_META[kind as ObjectKind]?.label ?? "Đối tượng khác"}{typeof object.label === "string" && object.label ? ` · ${object.label}` : ""}</span>
            <span className={styles.dim}>{typeof placement.floorId === "string" ? `Tầng ${/(-?\d+)$/.exec(placement.floorId)?.[1] !== undefined ? Number(/(-?\d+)$/.exec(placement.floorId)![1]) : placement.floorId}` : "Chưa chọn tầng"}{typeof object.anchorId === "string" ? " · gắn vào cấu kiện IFC" : ""}{isObject(object.capability) && typeof object.capability.id === "string" ? ` · ${capabilityLabel(object.capability.id)}` : ""}</span>
          </li>;
        })}</ul>}
    </div>
  </div>;
}

/**
 * One AI request as the server describes it. Status and content come from the BE only: nothing is inferred from the
 * absence of a field. `onApply` is offered only for a successful scenario draft and only opens the apply flow.
 */
export function RequestView({ request, admin, trainee, onApply, extra }: { request: AiRequest; admin?: boolean; trainee?: boolean; onApply?: (request: AiRequest) => void; extra?: ReactNode }) {
  const result = request.result;
  const state = isSuccessfulDraft(request) ? readProposalState(result) : null;
  const notes = readProposalNotes(result);
  const failure = failureText(request.failureCode);

  return <article className={styles.stack} data-testid="ai-request" data-status={request.status} data-operation={request.operation}>
    <div className={styles.row}>
      <div className="ops-actions"><strong>{trainee ? "Câu hỏi của bạn" : operationLabel(request.operation)}</strong><StatusBadge tone={statusTone(request.status, request.resultType)} data-testid="ai-status">{statusLabel(request.status, request.resultType)}</StatusBadge>
        {isSuccessfulDraft(request) && <StatusBadge tone="info">Cần bạn chỉnh sửa trước khi dùng</StatusBadge>}</div>
      <span className={styles.dim}>{formatDateTime(request.createdAt)}</span>
    </div>
    <dl className={styles.meta}>
      <dt>Mã yêu cầu (gửi khi cần hỗ trợ)</dt><dd><CopyId value={request.requestId} /></dd>
      {request.completedAt && <><dt>Hoàn tất lúc</dt><dd>{formatDateTime(request.completedAt)}</dd></>}
      {request.input?.buildingName && <><dt>Công trình</dt><dd>{request.input.buildingName}</dd></>}
      {request.input?.revisionId && <><dt>Bản IFC</dt><dd title={request.input.revisionId}>Bản đang dùng lúc gửi yêu cầu</dd></>}
    </dl>
    {request.input?.text && <section className={styles.section} aria-label="Nội dung đã gửi" data-testid="ai-input">
      <h3>{request.operation === "ScenarioDraft" ? "Yêu cầu đã gửi" : "Câu hỏi đã gửi"}</h3>
      <p className={styles.quote}>{request.input.text}</p>
    </section>}

    {isInFlight(request.status) && <Alert tone="info" title={request.status === "Accepted" ? "Yêu cầu đang chờ xử lý" : "Dịch vụ AI đang xử lý"}>Trang tự cập nhật khi có kết quả. Không cần gửi lại.</Alert>}

    {request.status === "NeedsReconcile" && <Alert tone="warning" title="Chưa rõ kết quả, đang chờ đối soát">
      {failure ?? "Hệ thống chưa xác nhận được kết quả từ dịch vụ AI."} {trainee ? "Phần lượt hỏi" : "Hạn mức"} của yêu cầu này đang được tạm trừ và không bị tính hay hoàn lại tự động; quản trị FET3D sẽ đối soát. Không gửi lại câu hỏi này để tránh trừ trùng.
      {!admin && <SupportCode code={request.failureCode ?? undefined} id={request.requestId} />}
    </Alert>}

    {request.status === "Failed" && <Alert tone="danger" title="Yêu cầu thất bại">{failure ?? "Dịch vụ AI không trả được kết quả."} {trainee ? "Phần lượt hỏi đã tạm trừ được trả lại." : "Xem phần hoàn lại hạn mức ở lịch sử sử dụng của Hạn mức AI."}{!admin && <SupportCode code={request.failureCode ?? undefined} id={request.requestId} />}</Alert>}

    {request.resultWithheld && <div data-testid="ai-withheld"><Alert tone="info" title="Không còn hiển thị câu trả lời">Bài tập huấn hoặc bài học bạn hỏi kèm không còn truy cập được (đã hết quyền, bị gỡ hoặc ẩn), nên câu trả lời và trích dẫn không còn được hiển thị.</Alert></div>}

    {hasResultType(request, "InsufficientEvidence") && <div data-testid="ai-insufficient"><Alert tone="warning" title="Chưa đủ căn cứ để trả lời">{result?.message?.trim() || "Các nguồn đã chọn chưa đủ thông tin để trả lời có trích dẫn. Hãy mở rộng phạm vi nguồn hoặc hỏi cụ thể hơn."}</Alert></div>}

    {hasResultType(request, "RejectedBySafetyGate") && <div data-testid="ai-rejected"><Alert tone="danger" title="Bị cổng an toàn từ chối">{result?.message?.trim() || "Yêu cầu hoặc kết quả bị chặn bởi cổng an toàn nên không có nội dung để hiển thị."}</Alert></div>}

    {hasResultType(request, "KnowledgeAnswer") && (typeof result?.answer === "string"
      ? <section className={styles.section} aria-label="Câu trả lời"><h3>Câu trả lời</h3><p className={styles.answer} data-testid="ai-answer">{result.answer}</p></section>
      : <Alert tone="warning" title="Chưa có nội dung câu trả lời">Máy chủ báo hoàn tất nhưng không kèm nội dung. Hãy tải lại.</Alert>)}

    {isSuccessfulDraft(request) && (state
      ? <section className={styles.section} aria-label="Đề xuất kịch bản">
        <h3>Đề xuất kịch bản (chỉ xem)</h3>
        <Alert tone="info" title="AI chỉ đề xuất">Không có gì được lưu, đưa vào bản nháp hay phát hành cho tới khi bạn xem trước, xác nhận và lưu trong trình soạn thảo.</Alert>
        <DraftPreview state={state} notes={notes} />
        {onApply && <div><Button type="button" onClick={() => onApply(request)} data-testid="ai-apply"><ShieldAlert size={16} aria-hidden="true" />Áp dụng vào bản nháp…</Button></div>}
      </section>
      : <Alert tone="warning" title="Không đọc được đề xuất">Máy chủ báo hoàn tất nhưng nội dung không đúng định dạng của trình soạn thảo, nên không thể áp dụng.</Alert>)}

    {request.status === "Succeeded" && <ResultNotes request={request} />}
    {request.status === "Succeeded" && <Citations request={request} admin={admin} />}
    {hasResultType(request, "KnowledgeAnswer") && citationsOf(request).length === 0 && <p className={styles.dim}><SearchX size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />Kết quả không kèm trích dẫn.</p>}

    <Usage request={request} admin={admin} trainee={trainee} />
    {extra}
  </article>;
}
