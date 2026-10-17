"use client";

import { Send, Sparkles } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { buildingsApi } from "@/features/buildings/api";

import { orgAiApi } from "../api";
import { aiErrorText, fieldIssue } from "../labels";
import { useAiSubmit } from "../use-ai-submit";
import type { AiEligibleSource, AiRequest } from "../types";
import styles from "../org-ai.module.css";
import { CharCount, LimitHint, useOperationLimit } from "./limit-hint";
import { RequestPanel } from "./request-panel";
import { ALL_SOURCES, SourcePicker, toSourceRefs, type SourceChoice } from "./source-picker";
import { SubmitStatus } from "./submit-status";

/** Revisions whose geometry the BE accepts for a draft pin (`ReadyForScenario`, `ConfirmedForTraining`). */
const DRAFT_READY = new Set(["ReadyForScenario", "ConfirmedForTraining"]);

/**
 * `POST /api/ai/organization/scenario-draft`: Building + prompt + sources, and optionally the revision to pin (otherwise the
 * BE pins the newest revision with accepted geometry). The proposal is displayed for reading; applying it to a draft is a
 * separate, confirmed editor action.
 */
export function DraftTab({ accessToken, requestId, onRequest, onApply }: { accessToken: string; requestId: string; onRequest: (requestId: string | null) => void; onApply: (request: AiRequest) => void }) {
  const [buildingId, setBuildingId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [choice, setChoice] = useState<SourceChoice>(ALL_SOURCES);
  const [available, setAvailable] = useState<AiEligibleSource[]>([]);
  const limits = useOperationLimit(accessToken, "ScenarioDraft");
  const reloadLimits = limits.reload;
  const tracked = useCallback((id: string) => { onRequest(id); reloadLimits(); }, [onRequest, reloadLimits]);
  const { phase, submit, retry, lookRecent, track, reset, working } = useAiSubmit(accessToken, "ScenarioDraft", tracked);
  const buildings = useAsyncData("org-ai:buildings", (signal) => buildingsApi.list(accessToken, { isActive: true, page: 1, pageSize: 100 }, signal));

  const items = buildings.data?.items ?? [];
  const selectedBuilding = buildingId || items[0]?.id || "";
  const revisions = useAsyncData(`org-ai:revisions:${selectedBuilding}`, (signal) => buildingsApi.listRevisions(accessToken, selectedBuilding, 1, 50, signal), Boolean(selectedBuilding), { keepPrevious: false });
  const ready = (revisions.data?.items ?? []).filter((revision) => DRAFT_READY.has(revision.status));
  const pinned = ready.some((revision) => revision.id === revisionId) ? revisionId : "";
  const noReadyRevision = Boolean(revisions.data) && ready.length === 0;
  const text = prompt.trim();
  const refs = toSourceRefs(choice, available);
  const noSourceChosen = choice.mode === "selected" && (refs?.length ?? 0) === 0;
  const maxChars = limits.limit?.maxInputChars ?? null;
  const tooLong = maxChars !== null && text.length > maxChars;
  const tooManySources = Boolean(limits.limit?.maxSources && refs && refs.length > limits.limit.maxSources);
  const canSend = Boolean(selectedBuilding) && text.length > 0 && !working && !noSourceChosen && !noReadyRevision && !tooLong && !tooManySources;

  const doSubmit = () => {
    if (!canSend) return;
    const body = { buildingId: selectedBuilding, prompt: text, ...(refs ? { sources: refs } : {}), ...(pinned ? { revisionId: pinned } : {}) };
    void submit({ operation: "ScenarioDraft", ...body }, (key, signal) => orgAiApi.submitScenarioDraft(accessToken, body, key, signal));
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    doSubmit();
  };

  const promptError = tooLong ? `Dài hơn giới hạn ${maxChars} ký tự của chính sách AI hiện hành.` : phase.kind === "failed" ? fieldIssue(phase.error, "$.prompt") : undefined;
  const showPanel = requestId !== "" && (phase.kind === "idle" || phase.kind === "tracking");

  return <div className={styles.stack}>
    <Panel title="Đề xuất kịch bản" description="AI đề xuất nội dung kịch bản cho một công trình của tổ chức. Đề xuất cần bạn xem, chỉnh sửa và lưu; AI không tự lưu, không tự phát hành.">
      <form className={styles.stack} onSubmit={send} aria-label="Đề xuất kịch bản AI">
        {buildings.loading && !buildings.data && <SkeletonRows rows={1} label="Đang tải công trình…" />}
        {buildings.error !== undefined && <Alert tone="danger" title="Không tải được danh sách công trình" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={buildings.reload}>Thử lại</Button>}>{aiErrorText(buildings.error)}</Alert>}
        {buildings.data && items.length === 0 && <Alert tone="warning" title="Chưa có công trình đang hoạt động">Tạo công trình (và mô hình IFC) trước khi nhờ AI đề xuất kịch bản.</Alert>}
        {items.length > 0 && <Field label="Công trình" required error={phase.kind === "failed" ? fieldIssue(phase.error, "$.buildingId") : undefined}>
          {(props) => <Select {...props} value={selectedBuilding} onChange={(event) => { setBuildingId(event.target.value); setRevisionId(""); }} disabled={working}>
            {items.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
          </Select>}
        </Field>}
        {selectedBuilding && revisions.error !== undefined && <Alert tone="danger" title="Không tải được revision mô hình" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={revisions.reload}>Thử lại</Button>}>{aiErrorText(revisions.error)}</Alert>}
        {noReadyRevision && <div data-testid="ai-no-ready-revision"><Alert tone="warning" title="Công trình chưa có mô hình sẵn sàng cho kịch bản">AI chỉ đề xuất trên revision đã được chấp nhận hình học và QA đạt (Sẵn sàng soạn kịch bản). Hoàn tất xử lý IFC của công trình này trước.</Alert></div>}
        {ready.length > 0 && <Field label="Revision mô hình" hint="AI chỉ neo đối tượng vào phần tử của revision được ghim. Mặc định máy chủ chọn revision mới nhất đủ điều kiện." error={phase.kind === "failed" ? fieldIssue(phase.error, "$.revisionId") : undefined}>
          {(props) => <Select {...props} value={pinned} onChange={(event) => setRevisionId(event.target.value)} disabled={working} data-testid="ai-revision">
            <option value="">Mới nhất đủ điều kiện (máy chủ chọn)</option>
            {ready.map((revision) => <option key={revision.id} value={revision.id}>{revision.versionLabel} · {revision.status === "ConfirmedForTraining" ? "Đã xác nhận cho tập huấn" : "Sẵn sàng soạn kịch bản"}</option>)}
          </Select>}
        </Field>}
        <Field label="Yêu cầu đề xuất" required error={promptError} hint="Mô tả mục tiêu, đối tượng người học và bối cảnh. Văn bản thuần.">
          {(props) => <Textarea {...props} rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={working} placeholder="Ví dụ: Tình huống sơ tán khi báo cháy ở tầng 2 cho học sinh lớp 10." />}
        </Field>
        <CharCount value={text} max={maxChars} />
        <SourcePicker accessToken={accessToken} value={choice} onChange={setChoice} disabled={working} onLoaded={setAvailable} />
        {tooManySources && <p className={styles.dim} role="alert">Chính sách hiện hành cho phép tối đa {limits.limit?.maxSources} nguồn; hãy bỏ bớt.</p>}
        <LimitHint limit={limits.limit} />
        <div className="ops-actions">
          <Button type="submit" disabled={!canSend} data-testid="ai-send"><Send size={16} aria-hidden="true" />{working ? "Đang gửi…" : "Gửi yêu cầu"}</Button>
          {requestId && <Button type="button" variant="quiet" onClick={() => { reset(); onRequest(null); }}>Đề xuất mới</Button>}
        </div>
        <SubmitStatus phase={phase} operation="ScenarioDraft" onRetry={() => void (phase.kind === "failed" ? doSubmit() : retry())} onLook={() => void lookRecent()} onTrack={track} />
      </form>
    </Panel>
    {showPanel && <Panel title="Kết quả đề xuất" description="Lấy từ máy chủ theo mã yêu cầu; tải lại trang vẫn mở lại được." actions={<Sparkles size={18} aria-hidden="true" />}>
      <RequestPanel accessToken={accessToken} requestId={requestId} onApply={onApply} />
    </Panel>}
  </div>;
}
