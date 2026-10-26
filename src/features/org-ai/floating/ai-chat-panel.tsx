"use client";

import { AlertCircle, Building2, History, Maximize2, Minimize2, MessageSquareText, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { SubTabs } from "@/components/ui/sub-tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { routes } from "@/configs/routes";
import { billingApi } from "@/features/billing/api";
import { formatQuota } from "@/features/billing/format";
import { buildingsApi } from "@/features/buildings/api";
import { cn } from "@/utils/cn";

import { orgAiApi } from "../api";
import { BILLING_AI_HREF } from "../components/request-view";
import { SubmitStatus } from "../components/submit-status";
import { fieldIssue, operationLabel } from "../labels";
import type { AiOperation, AiOperationLimit, AiRequest } from "../types";
import { canSubmitWith, limitOf } from "../use-ai-submit";
import { useAiBubble } from "./ai-bubble-context";
import { AssistantMessage, UserMessage } from "./chat-message";
import { MessageScroller } from "./message-scroller";
import type { PageContext } from "./use-page-context";

export const HISTORY_HREF = `${routes.workspaceAi}?tab=history`;

const MODES: Array<{ value: AiOperation; label: string; "data-testid": string }> = [
  { value: "Answer", label: "Hỏi đáp", "data-testid": "ai-mode-answer" },
  { value: "ScenarioDraft", label: "Đề xuất kịch bản", "data-testid": "ai-mode-draft" },
];

/** Figma 43:304: the composer is locked and the card offers the top-up. Shown when the limits say the balance does not cover one request. */
function QuotaOut({ limit, operation }: { limit: AiOperationLimit | null; operation: AiOperation }) {
  const noPolicy = !limit || !limit.policyActive;
  const unit = limit?.quotaUnit ?? undefined;
  return <div className="ai-quota-out" data-testid={noPolicy ? "ai-policy-blocked" : "ai-quota-blocked"}>
    <div className="ai-quota-out-card" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>{noPolicy ? "Chưa có chính sách AI cho thao tác này" : limit.availableUnits <= 0 ? "Hạn mức AI đã hết" : "Hạn mức AI không đủ cho một yêu cầu"}</strong>
        <p>{noPolicy
          ? `Quản trị FET3D chưa bật chính sách AI cho ${operationLabel(operation).toLowerCase()} nên yêu cầu chưa được gửi và không có hạn mức nào bị giữ.`
          : `Mỗi yêu cầu tạm trừ ${limit.estimatedReserve != null ? formatQuota(limit.estimatedReserve, unit) : "một phần hạn mức"}, tổ chức còn ${formatQuota(limit.availableUnits, unit)}. Hết hạn mức thì yêu cầu tính phí mới bị chặn; không có nợ trả sau. Nạp thêm hạn mức để tiếp tục.`}</p>
      </div>
    </div>
    {!noPolicy && <Button asChild><Link href={BILLING_AI_HREF} data-testid="ai-topup-link">Nạp thêm hạn mức</Link></Button>}
    <div className="ai-composer-box is-locked" aria-hidden="true"><span className="ai-composer-locked">{noPolicy ? "Chưa có chính sách — chưa nhập được" : "Đã hết hạn mức — chưa nhập được"}</span><span className="ai-send is-disabled"><Send size={14} aria-hidden="true" /></span></div>
  </div>;
}

/**
 * The conversation surface (Figma 43:255): header with the quota line, context strip, mode pill, messages that follow new
 * output, composer. The same component fills the desktop panel, the phone sheet and the expanded drawer.
 */
export function AiChatPanel({ context, variant, onClose, onToggleExpand, onApply, focusToken, onFocused }: {
  context: PageContext;
  variant: "panel" | "sheet" | "drawer";
  onClose: () => void;
  /** Desktop only: panel ⇄ drawer. */
  onToggleExpand?: () => void;
  onApply: (request: AiRequest) => void;
  /** Non-null when the composer should take focus (the panel was just opened); `onFocused` clears it. */
  focusToken: number | null;
  onFocused: () => void;
}) {
  const bubble = useAiBubble();
  const { accessToken, mode, setMode, messages, phase, working, ask, draft, retry, lookRecent, track, dismissPhase, settledCount, noteSettled } = bubble;
  const [text, setText] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  const quota = useAsyncData(`ai-bubble:quota:${settledCount}`, (signal) => billingApi.getAiQuota(accessToken, undefined, signal));
  const limits = useAsyncData(`ai-bubble:limits:${settledCount}`, (signal) => orgAiApi.limits(accessToken, signal));
  const limit = limits.data ? limitOf(limits.data.items, mode) : undefined;
  const needsBuilding = mode === "ScenarioDraft" && !context.buildingId;
  const buildings = useAsyncData("ai-bubble:buildings", (signal) => buildingsApi.list(accessToken, { isActive: true, page: 1, pageSize: 100 }, signal), needsBuilding);
  const buildingItems = buildings.data?.items ?? [];
  const targetBuilding = context.buildingId ?? (buildingItems.some((item) => item.id === buildingId) ? buildingId : buildingItems[0]?.id ?? "");

  useEffect(() => {
    if (focusToken === null) return;
    input.current?.focus();
    onFocused();
    // Collapsing the drawer mounts this panel while the closing drawer still traps focus; once it is gone focus would
    // sit on <body>, so it is handed to the composer again. Not cleared by `onFocused` resetting the token.
    window.setTimeout(() => { if (document.activeElement === document.body && input.current?.isConnected) input.current.focus(); }, 250);
  }, [focusToken, onFocused]);

  // The limits say no (balance under the reserve, or no policy) → the composer is replaced by the quota-out card (Figma 43:304).
  const blocked: AiOperationLimit | null | undefined = phase.kind === "blocked" && !phase.message ? phase.limit : limit !== undefined && !canSubmitWith(limit) ? limit : undefined;
  const units = quota.data?.units ?? [];
  const quotaLine = blocked !== undefined && blocked?.policyActive
    ? { text: blocked.availableUnits <= 0 ? "Hạn mức đã hết" : "Hạn mức không đủ cho một yêu cầu", tone: "danger" as const }
    : quota.data
      ? { text: units.length ? units.map((unit) => `Còn ${formatQuota(unit.available, unit.quotaUnit)}`).join(" · ") : "Chưa có hạn mức AI", tone: "dim" as const }
      : quota.error !== undefined ? { text: "Chưa đọc được hạn mức", tone: "dim" as const } : { text: "Đang đọc hạn mức…", tone: "dim" as const };

  const trimmed = text.trim();
  const maxChars = limit?.maxInputChars ?? null;
  const tooLong = maxChars !== null && trimmed.length > maxChars;
  const canSend = trimmed.length > 0 && !working && !tooLong && (mode === "Answer" || Boolean(targetBuilding));
  const send = () => {
    if (!canSend) return;
    if (mode === "Answer") ask(trimmed); else draft(trimmed, targetBuilding);
    setText("");
  };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); send(); };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } };
  const fieldError = tooLong ? `Dài hơn giới hạn ${maxChars} ký tự của chính sách AI hiện hành.` : phase.kind === "failed" ? fieldIssue(phase.error, mode === "Answer" ? "$.question" : "$.prompt") : undefined;
  const reserve = limit?.policyActive && limit.estimatedReserve != null ? formatQuota(limit.estimatedReserve, limit.quotaUnit ?? undefined) : null;

  const contextText = context.buildingId
    ? context.buildingName ? `${context.buildingName}${context.scenarioId ? ` › ${context.scenarioName ?? "Kịch bản"}` : ""}` : context.loading ? "Đang đọc công trình…" : "Công trình"
    : null;

  return <div className={cn("ai-panel", `ai-panel--${variant}`)} data-testid="ai-chat-panel" data-mode={mode}>
    <header className="ai-panel-head">
      <span className="ai-panel-icon" aria-hidden="true"><Sparkles size={16} /></span>
      <div className="ai-panel-titles">
        <strong id="ai-bubble-title">Trợ lý AI</strong>
        <span className={cn("ai-panel-quota", quotaLine.tone === "danger" && "is-danger")} data-testid="ai-chat-quota">{quotaLine.text}</span>
      </div>
      <div className="ai-panel-tools">
        <Tooltip content="Lịch sử hội thoại"><Link className="ops-icon-button ops-icon-button--sm" href={HISTORY_HREF} aria-label="Lịch sử hội thoại" data-testid="ai-chat-history" onClick={variant === "sheet" ? onClose : undefined}><History size={16} aria-hidden="true" /></Link></Tooltip>
        {onToggleExpand && <Tooltip content={variant === "drawer" ? "Thu nhỏ" : "Mở rộng"}><button type="button" className="ops-icon-button ops-icon-button--sm" aria-label={variant === "drawer" ? "Thu nhỏ trợ lý" : "Mở rộng trợ lý"} onClick={onToggleExpand} data-testid="ai-chat-expand">{variant === "drawer" ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}</button></Tooltip>}
        <Tooltip content="Đóng"><button type="button" className="ops-icon-button ops-icon-button--sm" aria-label="Đóng trợ lý" onClick={onClose} data-testid="ai-chat-close"><X size={16} aria-hidden="true" /></button></Tooltip>
      </div>
    </header>

    {contextText && <p className="ai-panel-context" data-testid="ai-chat-context"><Building2 size={14} aria-hidden="true" /><span>Đang xem · {contextText}</span></p>}

    <MessageScroller label="Hội thoại với Trợ lý AI" className="ai-panel-messages" data-testid="ai-chat-messages">
      <SubTabs size="sm" items={MODES} value={mode} onValueChange={(value) => setMode(value as AiOperation)} label="Chế độ trợ lý" className="ai-panel-modes" />
      <div className="ai-thread" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && <p className="ai-thread-empty"><MessageSquareText size={16} aria-hidden="true" />{mode === "Answer"
          ? "Hỏi về quy định thoát nạn, thiết bị PCCC hay kịch bản. Câu trả lời chỉ dựa trên nguồn đã duyệt của tổ chức và luôn kèm trích dẫn."
          : "Mô tả mục tiêu, người học và bối cảnh; AI đề xuất nội dung kịch bản cho công trình đã chọn. Đề xuất cần bạn xem và lưu, AI không tự sửa gì."}</p>}
        {messages.map((message) => (message.role === "user"
          ? <UserMessage key={message.id} message={message} />
          : <AssistantMessage key={message.id} message={message} accessToken={accessToken} onSettled={noteSettled} onApply={onApply} />))}
        {working && <div className="ai-msg ai-msg--assistant ai-msg--pending" data-testid="ai-chat-pending"><Spinner size={16} /><span>{phase.kind === "checking" ? "Đang kiểm tra hạn mức…" : "Đang gửi…"}</span></div>}
        {(phase.kind === "failed" || phase.kind === "unknown" || (phase.kind === "blocked" && phase.message)) && <div className="ai-system">
          <SubmitStatus phase={phase} operation={mode} onRetry={() => { if (phase.kind === "failed") { dismissPhase(); input.current?.focus(); } else retry(); }} onLook={lookRecent} onTrack={track} />
          <button type="button" className="ai-action" onClick={dismissPhase}>Bỏ qua</button>
        </div>}
      </div>
    </MessageScroller>

    {blocked !== undefined ? <QuotaOut limit={blocked} operation={mode} /> : <form className="ai-composer" onSubmit={onSubmit} aria-label={mode === "Answer" ? "Hỏi đáp AI" : "Đề xuất kịch bản AI"}>
      {needsBuilding && <Select aria-label="Công trình" className="ai-composer-building" value={targetBuilding} onChange={(event) => setBuildingId(event.target.value)} disabled={working || buildingItems.length === 0} data-testid="ai-chat-building">
        {buildingItems.length === 0 && <option value="">{buildings.loading ? "Đang tải công trình…" : "Chưa có công trình đang hoạt động"}</option>}
        {buildingItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>}
      <div className={cn("ai-composer-box", fieldError && "is-invalid")}>
        <textarea ref={input} className="ai-composer-input" rows={1} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} disabled={working}
          placeholder={mode === "Answer" ? "Hỏi về công trình, kịch bản, PCCC…" : "Ví dụ: Sơ tán khi báo cháy ở tầng 2 cho học sinh lớp 10"}
          aria-label={mode === "Answer" ? "Câu hỏi" : "Yêu cầu đề xuất"} aria-invalid={fieldError ? true : undefined} aria-describedby="ai-composer-note" data-testid="ai-chat-input" />
        <button type="submit" className="ai-send-target" disabled={!canSend} aria-label={working ? "Đang gửi" : "Gửi"} data-testid="ai-send"><span className={cn("ai-send", !canSend && "is-disabled")}><Send size={14} aria-hidden="true" /></span></button>
      </div>
      {fieldError && <p className="ai-composer-error" role="alert">{fieldError}</p>}
      <p className="ai-composer-note" id="ai-composer-note">
        <span>{reserve ? `Mỗi câu hỏi dùng khoảng ${reserve} · ` : ""}AI có thể sai, kiểm tra nguồn</span>
        {maxChars !== null && <span data-testid="ai-char-count" data-over={tooLong}>{trimmed.length}/{maxChars}</span>}
      </p>
    </form>}
  </div>;
}
