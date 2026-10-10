"use client";

import { MousePointer2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";

import { HAZARD_TYPES, ROTATION_UNIT, readHazards, readSpawns, type Position, type Selection } from "../store/model";
import { issueMessage, type Issue } from "../store/validation";
import type { JsonObject } from "../store/json";
import type { EditorActions } from "./actions";
import { NumberField, TextField } from "./fields";

const AXES: Array<{ axis: keyof Position; label: string; unit: string }> = [
  { axis: "x", label: "X", unit: "m" },
  { axis: "y", label: "Y (cao)", unit: "m" },
  { axis: "z", label: "Z", unit: "m" },
  { axis: "rotation", label: "Hướng xoay", unit: ROTATION_UNIT === "degrees" ? "độ" : "rad" },
];

export function ObjectForm({ draft, selection, issues, actions }: { draft: JsonObject; selection: Selection; issues: Issue[]; actions: EditorActions }) {
  if (!selection) {
    return <EmptyState icon={MousePointer2} title="Chưa chọn đối tượng" description="Chọn một điểm xuất phát hoặc nguy cơ trong cây đối tượng hoặc trên khung nhìn để chỉnh tọa độ và thuộc tính. Dùng nút Thêm để đặt đối tượng mới." />;
  }
  const spawns = readSpawns(draft);
  const hazards = readHazards(draft);
  const { kind, index } = selection;
  const position = kind === "spawn" ? spawns[index] : hazards[index]?.position;
  const hazard = kind === "hazard" ? hazards[index] : undefined;
  if (!position) return null;
  const base = kind === "spawn" ? `$.spawnPoints[${index}]` : `$.hazards[${index}].position`;
  const posIssue = issueMessage(issues, base);
  const raw = kind === "spawn" ? (draft.spawnPoints as unknown[])[index] : ((draft.hazards as unknown[])[index] as { position?: unknown })?.position;
  const rawPos = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  return <div className="se-form" data-testid="object-form">
    <div className="se-form-head">
      <div>
        <h3>{kind === "spawn" ? `Điểm xuất phát #${index + 1}` : `Nguy cơ #${index + 1}`}</h3>
        <p>{kind === "spawn" ? "Nơi người học bắt đầu tình huống." : "Nguồn nguy cơ tồn tại độc lập với hình học mô hình."}</p>
      </div>
      <Button type="button" variant="quiet" size="sm" onClick={() => actions.remove(kind, index)}><Trash2 size={14} aria-hidden="true" /> Xóa</Button>
    </div>

    <fieldset className="ops-fieldset">
      <legend>Vị trí <StatusBadge>m · Y hướng lên</StatusBadge></legend>
      {posIssue && <span className="ops-field-error" role="alert">{posIssue}</span>}
      <div className="se-coord-grid">
        {AXES.map(({ axis, label, unit }) => (
          <NumberField key={`${kind}-${index}-${axis}`} label={label} unit={unit} data-testid={`coord-${axis}`}
            value={typeof rawPos[axis] === "number" ? (rawPos[axis] as number) : undefined}
            onCommit={(value) => { if (value !== undefined) actions.setCoordinate(kind, index, axis, value); }} />
        ))}
      </div>
      <p className="ops-field-hint">Hướng xoay giả định theo {ROTATION_UNIT === "degrees" ? "độ" : "radian"} quanh trục đứng; BE#54 chưa chốt đơn vị.</p>
    </fieldset>

    {hazard && <fieldset className="ops-fieldset">
      <legend>Nguy cơ</legend>
      <TextField label="Mã nguy cơ" required value={hazard.id} error={issueMessage(issues, `$.hazards[${index}].id`)} onCommit={(value) => actions.setField(["hazards", index, "id"], value, "Đổi mã nguy cơ")} data-testid="hazard-id" />
      <Field label="Loại" required error={issueMessage(issues, `$.hazards[${index}].type`)}>
        {(props) => <Select {...props} data-testid="hazard-type" value={hazard.type} onChange={(event) => actions.setField(["hazards", index, "type"], event.target.value, "Đổi loại nguy cơ", false)}>
          {!HAZARD_TYPES.some((type) => type === hazard.type) && <option value={hazard.type}>{hazard.type || "Chọn loại…"}</option>}
          {HAZARD_TYPES.map((type) => <option key={type} value={type}>{type === "Fire" ? "Lửa (Fire)" : type === "Smoke" ? "Khói (Smoke)" : "Gió (Wind)"}</option>)}
        </Select>}
      </Field>
      <div className="se-coord-grid">
        <NumberField label="Cường độ" hint="Số không âm; thang đo do runtime quy định." data-testid="hazard-intensity" value={typeof (draft.hazards as Array<Record<string, unknown>>)[index]?.intensity === "number" ? hazard.intensity : undefined} error={issueMessage(issues, `$.hazards[${index}].intensity`)} onCommit={(value) => actions.setField(["hazards", index, "intensity"], value, "Đổi cường độ")} />
        <NumberField label="Kích hoạt sau" unit="giây" hint="Thời điểm nguy cơ xuất hiện (activationTime)." data-testid="hazard-activation" value={typeof (draft.hazards as Array<Record<string, unknown>>)[index]?.activationTime === "number" ? hazard.activationTime : undefined} error={issueMessage(issues, `$.hazards[${index}].activationTime`)} onCommit={(value) => actions.setField(["hazards", index, "activationTime"], value, "Đổi thời điểm kích hoạt")} />
      </div>
    </fieldset>}
  </div>;
}
