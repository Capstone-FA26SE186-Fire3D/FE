"use client";

import { Check, Copy, ExternalLink, FileEdit, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/types/common";
import { usePolling } from "@/api/use-polling";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { routes } from "@/configs/routes";
import { isObject } from "@/features/scenario-editor/store/json";

import { readProposalNotes, readProposalState } from "../apply-plan";
import { orgAiApi, traineeAiApi } from "../api";
import { aiErrorText, failureText, hasResultType, isInFlight, isSuccessfulDraft, operationLabel, sourceKindLabel, statusLabel, statusTone } from "../labels";
import type { AiCitation, AiRequest } from "../types";
import { citationHref } from "../components/request-view";
import { traineeRequestHref } from "../trainee";
import type { ChatMessage } from "./ai-bubble-context";

const detailHref = (request: AiRequest, trainee?: boolean) => trainee ? traineeRequestHref(request.requestId) : `${routes.workspaceAi}?tab=${isSuccessfulDraft(request) ? "saved" : "history"}&request=${encodeURIComponent(request.requestId)}`;

/** v7 citations live on the request; `result.citations` only for answers from before BE#89. */
const citationsOf = (request: AiRequest): AiCitation[] => (Array.isArray(request.citations) ? request.citations : Array.isArray(request.result?.citations) ? request.result.citations : []);

/** "[1] QCVN 06:2022" chips under an answer: a link where the citation can be opened, plain text otherwise. */
export function CitationChips({ request }: { request: AiRequest }) {
  const citations = citationsOf(request);
  if (citations.length === 0) return null;
  const sources = request.sources ?? [];
  return <ul className="ai-chips" aria-label="Nguồn trích dẫn" data-testid="ai-chat-citations">
    {citations.map((citation, index) => {
      const source = sources.find((item) => item.kind === citation.kind && item.id === citation.id);
      const title = citation.title ?? source?.title ?? `${sourceKindLabel(citation.kind)} · ${citation.id.slice(0, 8)}`;
      const version = citation.versionLabel ?? source?.versionLabel;
      const target = citationHref(citation.link ?? source?.link);
      const label = `[${index + 1}] ${title}`;
      const hint = `${sourceKindLabel(citation.kind)}${version ? ` · phiên bản ${version}` : ""}${citation.locator ? ` · ${citation.locator}` : ""}`;
      return <li key={`${citation.kind}:${citation.id}:${index}`} data-testid="ai-chat-citation">
        {target
          ? target.external
            ? <a className="ops-badge" data-tone="info" href={target.href} target="_blank" rel="noopener noreferrer" title={hint}>{label}<ExternalLink size={11} aria-hidden="true" /><span className="ops-sr-only"> (mở tab mới)</span></a>
            : <Link className="ops-badge" data-tone="info" href={target.href} title={hint}>{label}</Link>
          : <StatusBadge tone="neutral" title={hint}>{label}</StatusBadge>}
      </li>;
    })}
  </ul>;
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="ai-action" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined); }} data-testid="ai-chat-copy">
    {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}{copied ? "Đã sao chép" : "Sao chép"}
  </button>;
}

/** Text a reader copies from a request: the answer, the draft name + objectives, or the message the AI gave instead. */
export function copyTextOf(request: AiRequest): string | null {
  const result = request.result;
  if (hasResultType(request, "KnowledgeAnswer") && typeof result?.answer === "string") return result.answer;
  if (isSuccessfulDraft(request)) {
    const state = readProposalState(result);
    if (!state) return null;
    const objectives = Array.isArray(state.learningObjectives) ? state.learningObjectives.filter((item): item is string => typeof item === "string") : [];
    return [typeof state.name === "string" ? state.name : "", ...objectives.map((item) => `• ${item}`), typeof state.learnerInstructions === "string" ? state.learnerInstructions : ""].filter(Boolean).join("\n");
  }
  if (typeof result?.message === "string" && result.message.trim()) return result.message;
  return null;
}

function Pending({ text }: { text: string }) {
  return <div className="ai-msg ai-msg--assistant ai-msg--pending" data-testid="ai-chat-pending"><Spinner size={16} /><span>{text}</span></div>;
}

/** A short read-only summary of a `fet3d.editor/1` proposal; the full preview and the apply flow live on the AI page / editor. */
function DraftSummary({ request }: { request: AiRequest }) {
  const state = readProposalState(request.result);
  const notes = readProposalNotes(request.result);
  if (!state) return <p className="ai-msg-text">Máy chủ báo hoàn tất nhưng đề xuất không đúng định dạng của trình soạn thảo nên không áp dụng được.</p>;
  const objectives = Array.isArray(state.learningObjectives) ? state.learningObjectives.filter((item): item is string => typeof item === "string") : [];
  const objects = Array.isArray(state.objects) ? state.objects.filter(isObject).length : 0;
  return <div className="ai-msg-draft" data-testid="ai-chat-draft">
    <p className="ai-msg-text"><strong>{typeof state.name === "string" ? state.name : "Đề xuất kịch bản"}</strong></p>
    {objectives.length > 0 && <ul className="ai-msg-list">{objectives.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    {typeof state.learnerInstructions === "string" && <p className="ai-msg-text">{state.learnerInstructions}</p>}
    {notes && <p className="ai-msg-note">Ghi chú của AI: {notes}</p>}
    <p className="ai-msg-note">{objects} đối tượng không gian đề xuất · AI chỉ đề xuất, chưa có gì được lưu.</p>
  </div>;
}

/**
 * One assistant line: follows its request on the server (`GET /api/ai/requests/{id}`, polled while Accepted/Processing)
 * and renders the outcome the way the full `RequestView` does, in chat size: answer + citation chips, draft summary,
 * or the InsufficientEvidence / RejectedBySafetyGate / Failed / NeedsReconcile explanation. Nothing is inferred locally.
 */
export function AssistantMessage({ message, accessToken, onSettled, onApply, trainee }: { message: Extract<ChatMessage, { role: "assistant" }>; accessToken: string; onSettled: (request: AiRequest) => void; onApply?: (request: AiRequest) => void; trainee?: boolean }) {
  const requestId = message.requestId;
  const fetcher = useCallback((signal: AbortSignal) => (trainee ? traineeAiApi.getRequest(accessToken, requestId, signal) : orgAiApi.getRequest(accessToken, requestId, signal)), [accessToken, requestId, trainee]);
  const isDone = useCallback((request: AiRequest) => !isInFlight(request.status), []);
  const polling = usePolling<AiRequest>({ fetcher, isDone, resetKey: `bubble:${requestId}` });
  const gone = polling.error instanceof ApiError && (polling.error.status === 404 || polling.error.status === 403 || polling.error.status === 401);
  const request = !gone && polling.data?.requestId === requestId ? polling.data : undefined;
  const settled = polling.finished && request ? request : undefined;
  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; });
  useEffect(() => { if (settled) onSettledRef.current(settled); }, [settled]);

  if (!request && polling.error === undefined) return <Pending text="Đang xử lý…" />;
  if (!request) {
    return <div className="ai-msg ai-msg--assistant" data-testid="ai-chat-error" role="alert">
      <p className="ai-msg-text">{gone ? "Không mở được yêu cầu này (không còn trong phạm vi của bạn)." : aiErrorText(polling.error, "Chưa tải được kết quả. Hãy kiểm tra kết nối.")}</p>
      {!gone && <div className="ai-msg-actions"><button type="button" className="ai-action" onClick={polling.refresh}><RefreshCw size={12} aria-hidden="true" />Thử lại</button></div>}
    </div>;
  }
  if (isInFlight(request.status)) return <Pending text={request.status === "Accepted" ? "Đang chờ xử lý…" : "Đang xử lý…"} />;

  const failure = failureText(request.failureCode);
  const copy = copyTextOf(request);
  const draft = isSuccessfulDraft(request);
  return <div className="ai-msg ai-msg--assistant" data-testid="ai-chat-answer" data-status={request.status} data-result-type={request.resultType ?? undefined}>
    {request.status === "Failed" && <p className="ai-msg-text"><StatusBadge tone="danger">{statusLabel(request.status)}</StatusBadge> {failure ?? "Dịch vụ AI không trả được kết quả."} {trainee ? "Lượt hỏi đã tạm trừ được hoàn lại." : "Phần hạn mức đã tạm trừ được hoàn lại (xem lịch sử sử dụng)."}</p>}
    {request.status === "NeedsReconcile" && <p className="ai-msg-text"><StatusBadge tone="warning">{statusLabel(request.status)}</StatusBadge> {failure ?? "Hệ thống chưa xác nhận được kết quả từ dịch vụ AI."} Không gửi lại câu hỏi này để tránh trừ trùng; quản trị FET3D sẽ đối soát.</p>}
    {hasResultType(request, "InsufficientEvidence") && <p className="ai-msg-text" data-testid="ai-chat-insufficient"><StatusBadge tone="warning">{statusLabel(request.status, request.resultType)}</StatusBadge> {request.result?.message?.trim() || "Các nguồn đã chọn chưa đủ thông tin để trả lời có trích dẫn. Hãy hỏi cụ thể hơn."}</p>}
    {hasResultType(request, "RejectedBySafetyGate") && <p className="ai-msg-text" data-testid="ai-chat-rejected"><StatusBadge tone="danger">{statusLabel(request.status, request.resultType)}</StatusBadge> {request.result?.message?.trim() || "Yêu cầu hoặc kết quả bị chặn bởi cổng an toàn nên không có nội dung để hiển thị."}</p>}
    {hasResultType(request, "KnowledgeAnswer") && (typeof request.result?.answer === "string"
      ? <p className="ai-msg-text" data-testid="ai-chat-answer-text">{request.result.answer}</p>
      : <p className="ai-msg-text">Máy chủ báo hoàn tất nhưng không kèm nội dung câu trả lời.</p>)}
    {draft && <DraftSummary request={request} />}
    {request.status === "Succeeded" && <CitationChips request={request} />}
    <div className="ai-msg-actions">
      {copy && <CopyAction text={copy} />}
      {draft && onApply && readProposalState(request.result) && <button type="button" className="ai-action" onClick={() => onApply(request)} data-testid="ai-chat-apply"><FileEdit size={12} aria-hidden="true" />Dùng làm bản nháp</button>}
      <Link className="ai-action" href={detailHref(request, trainee)} data-testid="ai-chat-detail">Xem chi tiết</Link>
      <span className="ai-msg-meta" title={`${operationLabel(request.operation)} · ${requestId}`}><StatusBadge tone={statusTone(request.status, request.resultType)} data-testid="ai-chat-status">{statusLabel(request.status, request.resultType)}</StatusBadge></span>
    </div>
  </div>;
}

export function UserMessage({ message }: { message: Extract<ChatMessage, { role: "user" }> }) {
  return <div className="ai-msg-row ai-msg-row--user"><p className="ai-msg ai-msg--user" data-testid="ai-chat-user"><span className="ops-sr-only">{message.operation === "ScenarioDraft" ? "Bạn yêu cầu đề xuất: " : "Bạn hỏi: "}</span>{message.text}</p></div>;
}
