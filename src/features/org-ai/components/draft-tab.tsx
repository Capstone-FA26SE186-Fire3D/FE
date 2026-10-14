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
import { RequestPanel } from "./request-panel";
import { ALL_SOURCES, SourcePicker, toSourceRefs, type SourceChoice } from "./source-picker";
import { SubmitStatus } from "./submit-status";

/**
 * `POST /api/ai/organization/scenario-draft`: the request schema is only Building + prompt + sources (there is no revision
 * or draft in it). The proposal is displayed for reading; applying it to a draft is a separate, confirmed editor action.
 */
export function DraftTab({ accessToken, requestId, onRequest, onApply }: { accessToken: string; requestId: string; onRequest: (requestId: string | null) => void; onApply: (request: AiRequest) => void }) {
  const [buildingId, setBuildingId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [choice, setChoice] = useState<SourceChoice>(ALL_SOURCES);
  const [available, setAvailable] = useState<AiEligibleSource[]>([]);
  const tracked = useCallback((id: string) => onRequest(id), [onRequest]);
  const { phase, submit, retry, lookRecent, track, reset, working } = useAiSubmit(accessToken, "ScenarioDraft", tracked);
  const buildings = useAsyncData("org-ai:buildings", (signal) => buildingsApi.list(accessToken, { isActive: true, page: 1, pageSize: 100 }, signal));

  const items = buildings.data?.items ?? [];
  const selectedBuilding = buildingId || items[0]?.id || "";
  const text = prompt.trim();
  const refs = toSourceRefs(choice, available);
  const noSourceChosen = choice.mode === "selected" && (refs?.length ?? 0) === 0;
  const canSend = Boolean(selectedBuilding) && text.length > 0 && !working && !noSourceChosen;

  const doSubmit = () => {
    if (!canSend) return;
    const body = { buildingId: selectedBuilding, prompt: text, ...(refs ? { sources: refs } : {}) };
    void submit({ operation: "ScenarioDraft", ...body }, (key, signal) => orgAiApi.submitScenarioDraft(accessToken, body, key, signal));
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    doSubmit();
  };

  const promptError = phase.kind === "failed" ? fieldIssue(phase.error, "$.prompt") : undefined;
  const showPanel = requestId !== "" && (phase.kind === "idle" || phase.kind === "tracking");

  return <div className={styles.stack}>
    <Panel title="Đề xuất kịch bản" description="AI đề xuất nội dung kịch bản cho một công trình của tổ chức. Đề xuất cần bạn xem, chỉnh sửa và lưu; AI không tự lưu, không tự phát hành.">
      <form className={styles.stack} onSubmit={send} aria-label="Đề xuất kịch bản AI">
        {buildings.loading && !buildings.data && <SkeletonRows rows={1} label="Đang tải công trình…" />}
        {buildings.error !== undefined && <Alert tone="danger" title="Không tải được danh sách công trình" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={buildings.reload}>Thử lại</Button>}>{aiErrorText(buildings.error)}</Alert>}
        {buildings.data && items.length === 0 && <Alert tone="warning" title="Chưa có công trình đang hoạt động">Tạo công trình (và mô hình IFC) trước khi nhờ AI đề xuất kịch bản.</Alert>}
        {items.length > 0 && <Field label="Công trình" required error={phase.kind === "failed" ? fieldIssue(phase.error, "$.buildingId") : undefined}>
          {(props) => <Select {...props} value={selectedBuilding} onChange={(event) => setBuildingId(event.target.value)} disabled={working}>
            {items.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
          </Select>}
        </Field>}
        <Field label="Yêu cầu đề xuất" required error={promptError} hint="Mô tả mục tiêu, đối tượng người học và bối cảnh. Văn bản thuần.">
          {(props) => <Textarea {...props} rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={working} placeholder="Ví dụ: Tình huống sơ tán khi báo cháy ở tầng 2 cho học sinh lớp 10." />}
        </Field>
        <SourcePicker accessToken={accessToken} value={choice} onChange={setChoice} disabled={working} onLoaded={setAvailable} />
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
