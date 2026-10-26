"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { NO_CAPABILITY_NOTICE } from "@/features/library/components/version-preview";
import { ignoredTemplateParts, type PropertyRow, type PropertyType, type VersionForm } from "@/features/library/payload";
import { LIBRARY_LIMITS, type LibraryKind } from "@/features/library/types";
import { NumberField, StringList, TextField } from "@/features/scenario-editor/panels/fields";
import { Group, RubricGroup, type RubricCatalogState } from "@/features/scenario-editor/panels/v1/v1-scenario-form";
import { insertAt, isObject, removeAt, setIn, type Json, type Path } from "@/features/scenario-editor/store/json";
import { messageAt } from "@/features/scenario-editor/v1/issues";
import { LIMITS, MODE_LABEL, TRAINING_MODES } from "@/features/scenario-editor/v1/contract";
import type { Issue } from "@/features/scenario-editor/store/validation";

export type FormIssues = Issue[];

/** Same surface as the editor's command-backed actions, backed by plain state: the Library form has no undo stack. */
export function useFormActions(setForm: (update: (form: VersionForm) => VersionForm) => void) {
  return useMemo(() => ({
    setField: (path: Path, value: Json | undefined) => setForm((form) => ({ ...form, doc: setIn(form.doc, path, value) })),
    addItem: (path: Path, value: Json) => setForm((form) => ({ ...form, doc: insertAt(form.doc, path, Number.MAX_SAFE_INTEGER, value) })),
    removeItem: (path: Path, index: number) => setForm((form) => ({ ...form, doc: removeAt(form.doc, path, index) })),
  }), [setForm]);
}
export type FormActions = ReturnType<typeof useFormActions>;

/** Server and client issues share paths such as `$.payload.state.name`; a form field asks for its own. */
export const issuesFrom = (list: ReadonlyArray<{ code: string; path: string; message: string }>): FormIssues => list.map((item) => ({ ...item, source: "client" as const }));

function CapabilitiesField({ capabilities, onChange, error, disabled, kind }: { capabilities: string[]; onChange: (next: string[]) => void; error?: string; disabled?: boolean; kind: LibraryKind }) {
  return <StringList label="Năng lực yêu cầu" items={capabilities} maxLength={128} disabled={disabled} testId="capabilities" error={error} addLabel="Thêm năng lực" placeholder="Ví dụ: door.exit (Cửa thoát)"
    hint={kind === "Equipment"
      ? "Chỉ là khai báo yêu cầu, chưa được kiểm tra với ứng dụng FET3D và KHÔNG thêm năng lực vào ứng dụng. Năng lực chỉ có khi ứng dụng đã hỗ trợ."
      : "Khai báo tùy chọn, chưa được kiểm tra với ứng dụng FET3D."}
    onChange={(index, value) => onChange(capabilities.map((item, at) => (at === index ? value : item)))}
    onAdd={() => onChange([...capabilities, ""])}
    onRemove={(index) => onChange(capabilities.filter((_, at) => at !== index))} />;
}

function PropertyRows({ rows, onChange, issues, disabled }: { rows: PropertyRow[]; onChange: (rows: PropertyRow[]) => void; issues: FormIssues; disabled?: boolean }) {
  const update = (index: number, patch: Partial<PropertyRow>) => onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  return <Group title="Thuộc tính thiết bị" description={`Tối đa ${LIBRARY_LIMITS.propertiesMax} thuộc tính; mỗi giá trị là chuỗi, số hoặc đúng/sai. Hiển thị cho tổ chức, không phải thiết lập trong ứng dụng.`} testId="group-properties">
    {messageAt(issues, "$.payload.properties") && <span className="ops-field-error" role="alert">{messageAt(issues, "$.payload.properties")}</span>}
    <ul className="se-list" style={{ gap: 10 }}>
      {rows.map((row, index) => {
        const base = `$.payload.properties[${index}]`;
        return <li key={index} style={{ gridTemplateColumns: "minmax(0,1fr)", border: "1px solid var(--line)", borderRadius: 10, padding: 10 }} data-testid={`property-${index}`}>
          <div className="se-coord-grid">
            <Field label="Tên thuộc tính" error={messageAt(issues, `${base}.key`)}>{(props) => <Input {...props} disabled={disabled} value={row.key} onChange={(event) => update(index, { key: event.target.value })} data-testid={`property-${index}-key`} />}</Field>
            <Field label="Kiểu giá trị">{(props) => <Select {...props} disabled={disabled} value={row.type} onChange={(event) => update(index, { type: event.target.value as PropertyType, value: event.target.value === "boolean" ? "true" : "" })}>
              <option value="string">Chuỗi</option><option value="number">Số</option><option value="boolean">Đúng/sai</option>
            </Select>}</Field>
          </div>
          {row.type === "boolean"
            ? <Field label="Giá trị">{(props) => <Select {...props} disabled={disabled} value={row.value} onChange={(event) => update(index, { value: event.target.value })}><option value="true">Đúng</option><option value="false">Sai</option></Select>}</Field>
            : <Field label="Giá trị" error={messageAt(issues, `${base}.value`)}>{(props) => <Input {...props} disabled={disabled} value={row.value} onChange={(event) => update(index, { value: event.target.value })} data-testid={`property-${index}-value`} />}</Field>}
          <div><Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Xóa thuộc tính ${index + 1}`} onClick={() => onChange(rows.filter((_, at) => at !== index))}><Trash2 size={14} aria-hidden="true" /> Xóa thuộc tính</Button></div>
        </li>;
      })}
    </ul>
    <div><Button type="button" variant="quiet" size="sm" disabled={disabled || rows.length >= LIBRARY_LIMITS.propertiesMax} onClick={() => onChange([...rows, { key: "", type: "string", value: "" }])} data-testid="add-property"><Plus size={14} aria-hidden="true" /> Thêm thuộc tính</Button></div>
  </Group>;
}

/** Non-spatial fields of a `fet3d.editor/1` state: the only part of a template the Library edits and an organization can receive. */
function TemplateFields({ form, actions, issues, rubricCatalog }: { form: VersionForm; actions: FormActions; issues: FormIssues; rubricCatalog: RubricCatalogState }) {
  const state = form.doc;
  const at = (path: string) => messageAt(issues, `$.payload.state${path.slice(1)}`);
  const modes = isObject(state.modePolicy) && Array.isArray(state.modePolicy.allowedModes) ? state.modePolicy.allowedModes.filter((item): item is string => typeof item === "string") : [];
  const objectives = Array.isArray(state.learningObjectives) ? state.learningObjectives.map((item) => (typeof item === "string" ? item : "")) : [];
  const optional = (key: string) => (value: string) => actions.setField([key], value === "" ? undefined : value);
  const ignored = ignoredTemplateParts(state);
  const toggleMode = (mode: (typeof TRAINING_MODES)[number], on: boolean) => {
    const next = TRAINING_MODES.filter((item) => (item === mode ? on : modes.includes(item)));
    if (next.length === 0) actions.setField(["modePolicy"], undefined);
    else actions.setField(["modePolicy", "allowedModes"], [...next]);
  };
  return <>
    <Alert tone="info" title="Kịch bản mẫu chỉ mang phần nội dung, không có vị trí">Tên, mục tiêu, hướng dẫn, thời gian, chế độ và tiêu chí chấm điểm (rubric). Mẫu không tạo vị trí hay đối tượng trong công trình; tổ chức tự đặt đối tượng trên mô hình của mình.</Alert>
    {ignored.length > 0 && <Alert tone="warning" title="Phiên bản này còn mang phần không chỉnh sửa được ở đây">Có {ignored.join(", ")} từ trước. Biểu mẫu này giữ nguyên chúng khi lưu nhưng tổ chức không nhận chúng khi áp dụng.</Alert>}
    {at("$") && <span className="ops-field-error" role="alert">{at("$")}</span>}
    <Group title="Thông tin kịch bản" testId="group-info">
      <TextField label="Tên kịch bản" maxLength={LIMITS.nameMax} value={typeof state.name === "string" ? state.name : ""} error={at("$.name")} data-testid="tpl-name" hint="1–255 ký tự." onCommit={optional("name")} />
      <NumberField label="Thời gian tối đa" unit="giây" hint={`Số nguyên ${LIMITS.timeLimit.min}–${LIMITS.timeLimit.max}; để trống nếu mẫu không đặt.`} data-testid="tpl-time-limit" value={typeof state.timeLimitSeconds === "number" ? state.timeLimitSeconds : undefined} error={at("$.timeLimitSeconds")} onCommit={(value) => actions.setField(["timeLimitSeconds"], value)} />
    </Group>
    <Group title="Chế độ huấn luyện" description="Không chọn chế độ nào thì mẫu không đặt chính sách chế độ." testId="group-modes">
      {at("$.modePolicy.allowedModes") && <span className="ops-field-error" role="alert">{at("$.modePolicy.allowedModes")}</span>}
      <div className="ops-stack">{TRAINING_MODES.map((mode) => <label key={mode} className="se-check"><input type="checkbox" checked={modes.includes(mode)} onChange={(event) => toggleMode(mode, event.target.checked)} data-testid={`tpl-mode-${mode}`} /> {MODE_LABEL[mode]}</label>)}</div>
    </Group>
    <Group title="Mục tiêu và hướng dẫn" description="Tối đa 50 mục tiêu, mỗi mục 1–1000 ký tự và khác nhau." testId="group-objectives">
      <StringList label="Mục tiêu học tập" items={objectives} maxLength={LIMITS.objectiveMax} addLabel="Thêm mục tiêu" error={at("$.learningObjectives")} testId="tpl-objectives"
        onChange={(index, value) => actions.setField(["learningObjectives", index], value)}
        onAdd={() => actions.addItem(["learningObjectives"], "")}
        onRemove={(index) => actions.removeItem(["learningObjectives"], index)} />
      {objectives.map((_, index) => at(`$.learningObjectives[${index}]`) && <span key={index} className="ops-field-error" role="alert">Mục tiêu {index + 1}: {at(`$.learningObjectives[${index}]`)}</span>)}
      <TextField label="Hướng dẫn cho người học" multiline rows={5} maxLength={LIMITS.instructionsMax} value={typeof state.learnerInstructions === "string" ? state.learnerInstructions : ""} hint="1–10000 ký tự." error={at("$.learnerInstructions")} data-testid="tpl-instructions" onCommit={optional("learnerInstructions")} />
    </Group>
    <RubricGroup draft={state} issues={issues} actions={{ setField: (path, value) => actions.setField(path, value), addItem: (path, value) => actions.addItem(path, value), removeItem: (path, index) => actions.removeItem(path, index) }} catalog={rubricCatalog} pathPrefix="$.payload.state" />
  </>;
}

function RubricFields({ form, actions, issues, rubricCatalog }: { form: VersionForm; actions: FormActions; issues: FormIssues; rubricCatalog: RubricCatalogState }) {
  return <RubricGroup draft={form.doc} issues={issues} actions={{ setField: (path, value) => actions.setField(path, value), addItem: (path, value) => actions.addItem(path, value), removeItem: (path, index) => actions.removeItem(path, index) }} catalog={rubricCatalog} pathPrefix="$.payload" />;
}

/**
 * Kind-specific payload form. Every field starts blank; nothing is pre-filled from a guess. `issues` use the server's
 * `$.payload...` paths so a 422 from the API lands on the field it names.
 */
export function PayloadFields({ kind, form, setForm, issues, rubricCatalog, disabled }: {
  kind: LibraryKind;
  form: VersionForm;
  setForm: (update: (form: VersionForm) => VersionForm) => void;
  issues: FormIssues;
  rubricCatalog: RubricCatalogState;
  disabled?: boolean;
}) {
  const actions = useFormActions(setForm);
  return <fieldset className="ops-stack se-form" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} disabled={disabled}>
    <Group title="Phiên bản" testId="group-version">
      <TextField label="Tên phiên bản" required maxLength={LIBRARY_LIMITS.nameMax} value={form.name} error={messageAt(issues, "$.name")} data-testid="version-name" hint="1–255 ký tự; tổ chức thấy tên này khi chọn mẫu." onCommit={(value) => setForm((current) => ({ ...current, name: value }))} />
      <TextField label={kind === "Equipment" ? "Mô tả thiết bị" : "Mô tả (tùy chọn)"} required={kind === "Equipment"} multiline rows={3} maxLength={LIBRARY_LIMITS.descriptionMax} value={form.description} error={messageAt(issues, "$.payload.description")} data-testid="version-description" hint="1–2000 ký tự." onCommit={(value) => setForm((current) => ({ ...current, description: value }))} />
      <CapabilitiesField kind={kind} capabilities={form.capabilities} error={messageAt(issues, "$.requiredCapabilities")} onChange={(next) => setForm((current) => ({ ...current, capabilities: next }))} />
    </Group>
    {kind === "Equipment" && <>
      <Alert tone="info" title="Không thêm năng lực cho ứng dụng"><span data-testid="no-capability-notice">{NO_CAPABILITY_NOTICE}</span></Alert>
      <PropertyRows rows={form.properties} issues={issues} onChange={(rows) => setForm((current) => ({ ...current, properties: rows }))} />
    </>}
    {kind === "ScenarioTemplate" && <TemplateFields form={form} actions={actions} issues={issues} rubricCatalog={rubricCatalog} />}
    {kind === "RubricSample" && <RubricFields form={form} actions={actions} issues={issues} rubricCatalog={rubricCatalog} />}
  </fieldset>;
}

