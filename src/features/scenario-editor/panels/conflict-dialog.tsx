"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

import type { ConflictState } from "../use-scenario-editor";
import { defaultChoice, summarizeValue, type MergeChoice, type UnitStatus } from "../store/merge";

const STATUS_LABEL: Record<UnitStatus, { text: string; tone: "info" | "warning" | "success" | "neutral" }> = {
  conflict: { text: "Cả hai cùng sửa", tone: "warning" },
  mine: { text: "Chỉ bạn sửa", tone: "info" },
  theirs: { text: "Chỉ máy chủ sửa", tone: "neutral" },
  "both-equal": { text: "Giống nhau", tone: "success" },
  same: { text: "Giống nhau", tone: "success" },
};

const FIELD_NAME: Record<string, string> = {
  spawnPoints: "Điểm xuất phát", hazards: "Nguy cơ", scoringConfig: "Chấm điểm", routingConfig: "Tuyến thoát hiểm", rubric: "Rubric",
  learningObjectives: "Mục tiêu học tập", learnerInstructions: "Hướng dẫn người học", objectAnchors: "Neo đối tượng", requiredCapabilities: "Năng lực runtime",
  runtimeVersion: "Phiên bản runtime", goals: "Goal", npcs: "NPC", blockedElements: "Vùng chặn", modePolicy: "Chính sách chế độ", safetyThresholds: "Ngưỡng an toàn",
};

/**
 * Shown after a 412. The author's draft stays untouched in the editor; this dialog loads the server's version and lets the
 * author pick, per field, which side to keep. Applying adopts the server revision (new ETag) and leaves the result UNSAVED.
 */
export function ConflictDialog({ open, conflict, onLoad, onApply, onClose }: {
  open: boolean;
  conflict: ConflictState | null;
  onLoad: () => void;
  onApply: (choices: Record<string, MergeChoice>) => void;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, MergeChoice>>({});
  const units = conflict?.units ?? [];
  const choiceOf = (key: string, fallback: MergeChoice) => choices[key] ?? fallback;

  return <Modal open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Bản nháp đã được thay đổi ở nơi khác"
    description="Nội dung bạn đang nhập vẫn được giữ. Tải bản mới để đối chiếu rồi chọn phần nào giữ lại; chưa có gì bị ghi đè."
    className="se-conflict"
    footer={conflict?.theirs
      ? <>
        <Button type="button" variant="quiet" onClick={onClose}>Giữ bản của tôi, quyết định sau</Button>
        <Button type="button" data-testid="apply-merge" onClick={() => onApply(choices)}>Áp dụng lựa chọn (chưa lưu)</Button>
      </>
      : <Button type="button" variant="quiet" onClick={onClose}>Đóng</Button>}>
    {!conflict && <div className="ops-stack">
      <Alert tone="warning" title="Xung đột phiên bản (412)">Một người khác, hoặc một tab khác của bạn, đã lưu bản nháp này sau lần bạn tải gần nhất.</Alert>
      <div><Button type="button" onClick={onLoad} data-testid="load-theirs"><RefreshCw size={16} aria-hidden="true" /> Tải bản mới để đối chiếu</Button></div>
    </div>}
    {conflict?.loading && <div role="status" aria-live="polite"><Skeleton style={{ height: 120 }} /></div>}
    {conflict?.error && <div className="ops-stack"><Alert tone="danger" title="Không tải được bản mới">{conflict.error}</Alert><div><Button type="button" variant="secondary" onClick={onLoad}>Thử lại</Button></div></div>}
    {conflict?.theirs && (units.length === 0
      ? <Alert tone="success" title="Hai bản giống nhau">Máy chủ có cùng nội dung với bản của bạn. Áp dụng để lấy ETag mới rồi lưu tiếp.</Alert>
      : <ul className="se-merge" data-testid="merge-list">
        {units.map((unit) => {
          const current = choiceOf(unit.key, defaultChoice(unit));
          const meta = STATUS_LABEL[unit.status];
          return <li key={unit.key}>
            <fieldset>
              <legend><span>{FIELD_NAME[unit.key] ?? unit.key}</span> <StatusBadge tone={meta.tone}>{meta.text}</StatusBadge></legend>
              <ul className="se-merge-changes">
                {unit.changes.slice(0, 6).map((change) => <li key={change.path}><code>{change.path}</code><span>Bạn: {summarizeValue(change.mine)}</span><span>Máy chủ: {summarizeValue(change.theirs)}</span></li>)}
                {unit.changes.length > 6 && <li className="ops-field-hint">… và {unit.changes.length - 6} khác biệt nữa.</li>}
              </ul>
              <div className="se-merge-choice">
                <label><input type="radio" name={`merge-${unit.key}`} checked={current === "mine"} onChange={() => setChoices({ ...choices, [unit.key]: "mine" })} /> Giữ bản của tôi</label>
                <label><input type="radio" name={`merge-${unit.key}`} checked={current === "theirs"} onChange={() => setChoices({ ...choices, [unit.key]: "theirs" })} /> Lấy bản máy chủ</label>
              </div>
            </fieldset>
          </li>;
        })}
      </ul>)}
  </Modal>;
}
