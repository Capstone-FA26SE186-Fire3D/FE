"use client";

import { Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

import { isObject, type JsonObject } from "../../store/json";
import type { Issue } from "../../store/validation";
import type { RubricCatalogView } from "../../v1/catalog";
import { LIMITS, MODE_LABEL, RUBRIC_OPERATORS, TRAINING_MODES } from "../../v1/contract";
import { messageAt } from "../../v1/issues";
import { readModes, readNumberField, readObjectives, readString } from "../../v1/state";
import { NumberField, StringList, TextField } from "../fields";
import type { V1Actions } from "./actions";
import type { CatalogView } from "./v1-object-form";

export type RubricCatalogState = { loading: boolean; error: boolean; reload: () => void; view: RubricCatalogView | null };

function Group({ title, description, children, testId }: { title: string; description?: string; children: React.ReactNode; testId?: string }) {
  return <fieldset className="ops-fieldset se-group" data-testid={testId}>
    <legend>{title}</legend>
    {description && <p className="ops-field-hint">{description}</p>}
    {children}
  </fieldset>;
}

export function V1ScenarioForm({ draft, issues, actions, catalog, rubricCatalog }: { draft: JsonObject; issues: Issue[]; actions: V1Actions; catalog: CatalogView; rubricCatalog: RubricCatalogState }) {
  const at = (path: string) => messageAt(issues, path);
  const runtimeVersion = readString(draft, "runtimeVersion");
  const versions = catalog.runtimes.map((runtime) => runtime.runtimeVersion);
  const modes = readModes(draft);
  const objectives = readObjectives(draft);
  const optionalText = (key: string, label: string) => (value: string) => actions.setField([key], value === "" ? undefined : value, label);

  const toggleMode = (mode: (typeof TRAINING_MODES)[number], on: boolean) => {
    const next = TRAINING_MODES.filter((item) => (item === mode ? on : modes.includes(item)));
    // An empty list is not valid on the server; with no mode chosen the whole policy is simply absent.
    if (next.length === 0) actions.setField(["modePolicy"], undefined, "Bỏ chính sách chế độ", false);
    else actions.setField(["modePolicy", "allowedModes"], next, "Đổi chế độ huấn luyện", false);
  };

  return <div className="se-form" data-testid="scenario-form-v1">
    <Group title="Thông tin kịch bản" testId="group-info">
      <TextField label="Tên kịch bản" maxLength={LIMITS.nameMax} value={readString(draft, "name")} error={at("$.name")} data-testid="field-name" hint="1–255 ký tự." onCommit={optionalText("name", "Sửa tên")} />
      {catalog.loading ? <Skeleton style={{ height: 42 }} /> : catalog.error
        ? <Alert tone="danger" title="Không tải được danh mục runtime" action={<Button type="button" size="sm" variant="secondary" onClick={catalog.reload}>Thử lại</Button>} />
        : versions.length === 0
          ? <Alert tone="warning" title="Danh mục runtime đang trống"><span data-testid="runtime-empty">Chưa có runtime nào được công bố nên chưa chọn được phiên bản runtime. Quản trị viên cần cấu hình runtime và capabilityContracts; editor không tự tạo.</span></Alert>
          : <Field label="Phiên bản runtime" required error={at("$.runtimeVersion")} hint="Chọn từ danh mục do máy chủ công bố; năng lực của đối tượng lấy theo runtime này.">
            {(props) => <Select {...props} data-testid="field-runtime" value={runtimeVersion} onChange={(event) => actions.setField(["runtimeVersion"], event.target.value || undefined, "Chọn runtime", false)}>
              <option value="">Chọn…</option>
              {runtimeVersion && !versions.includes(runtimeVersion) && <option value={runtimeVersion}>{runtimeVersion} (không có trong danh mục)</option>}
              {versions.map((version) => <option key={version} value={version}>{version}</option>)}
            </Select>}
          </Field>}
      <div className="se-coord-grid">
        <NumberField label="Thời gian tối đa" unit="giây" required hint={`Số nguyên ${LIMITS.timeLimit.min}–${LIMITS.timeLimit.max}.`} data-testid="field-time-limit" value={readNumberField(draft, "timeLimitSeconds")} error={at("$.timeLimitSeconds")} onCommit={(value) => actions.setField(["timeLimitSeconds"], value, "Sửa thời gian tối đa")} />
        <NumberField label="Hạt giống ngẫu nhiên" hint="Số nguyên; để trống nếu không cần." data-testid="field-seed" value={readNumberField(draft, "randomSeed")} error={at("$.randomSeed")} onCommit={(value) => actions.setField(["randomSeed"], value, "Sửa hạt giống")} />
        <NumberField label="Chu kỳ lập lại kế hoạch" unit="giây" hint={`Số nguyên ${LIMITS.replanInterval.min}–${LIMITS.replanInterval.max}.`} data-testid="field-replan" value={readNumberField(draft, "replanIntervalSeconds")} error={at("$.replanIntervalSeconds")} onCommit={(value) => actions.setField(["replanIntervalSeconds"], value, "Sửa chu kỳ lập kế hoạch")} />
      </div>
    </Group>

    <Group title="Chế độ huấn luyện" description="Chế độ người học được phép dùng. Không chọn chế độ nào thì chính sách không được lưu." testId="group-modes">
      {at("$.modePolicy.allowedModes") && <span className="ops-field-error" role="alert">{at("$.modePolicy.allowedModes")}</span>}
      <div className="ops-stack">
        {TRAINING_MODES.map((mode) => <label key={mode} className="se-check"><input type="checkbox" checked={modes.includes(mode)} onChange={(event) => toggleMode(mode, event.target.checked)} data-testid={`mode-${mode}`} /> {MODE_LABEL[mode]}</label>)}
      </div>
    </Group>

    <Group title="Mục tiêu và hướng dẫn" description="Hiển thị cho người học. Tối đa 50 mục tiêu, mỗi mục 1–1000 ký tự và khác nhau." testId="group-objectives">
      <StringList label="Mục tiêu học tập" items={objectives} maxLength={LIMITS.objectiveMax} placeholder="Ví dụ: Nhận biết lối thoát gần nhất" addLabel="Thêm mục tiêu" error={at("$.learningObjectives")} testId="objectives"
        onChange={(index, value) => actions.setField(["learningObjectives", index], value, "Sửa mục tiêu")}
        onAdd={() => actions.addItem(["learningObjectives"], "", "Thêm mục tiêu")}
        onRemove={(index) => actions.removeItem(["learningObjectives"], index, "Xóa mục tiêu")} />
      {objectives.map((_, index) => at(`$.learningObjectives[${index}]`) && <span key={index} className="ops-field-error" role="alert">Mục tiêu {index + 1}: {at(`$.learningObjectives[${index}]`)}</span>)}
      <TextField label="Hướng dẫn cho người học" multiline rows={5} maxLength={LIMITS.instructionsMax} required value={readString(draft, "learnerInstructions")} hint="1–10000 ký tự."
        error={at("$.learnerInstructions")} data-testid="learner-instructions" onCommit={optionalText("learnerInstructions", "Sửa hướng dẫn")} />
    </Group>

    <RubricGroup draft={draft} issues={issues} actions={actions} catalog={rubricCatalog} />
  </div>;
}

function RubricGroup({ draft, issues, actions, catalog }: { draft: JsonObject; issues: Issue[]; actions: V1Actions; catalog: RubricCatalogState }) {
  const at = (path: string) => messageAt(issues, path);
  const rubric = isObject(draft.rubric) ? draft.rubric : undefined;
  const criteria = rubric && Array.isArray(rubric.criteria) ? rubric.criteria : [];
  const view = catalog.view;

  return <Group title="Rubric chấm điểm" description="Chỉ số lấy từ danh mục máy chủ (do máy chủ tính từ dữ liệu người học). Hệ thống không đặt sẵn ngưỡng đạt, trọng số hay tiêu chí." testId="group-rubric">
    {catalog.loading && <Skeleton style={{ height: 42 }} />}
    {!catalog.loading && catalog.error && <Alert tone="danger" title="Không tải được danh mục rubric" action={<Button type="button" size="sm" variant="secondary" onClick={catalog.reload}>Thử lại</Button>}>Cần danh mục để chọn chỉ số đúng; hiện chưa thêm được tiêu chí.</Alert>}
    {at("$.rubric") && <span className="ops-field-error" role="alert">{at("$.rubric")}</span>}
    {!rubric && view && <div><Button type="button" variant="secondary" size="sm" data-testid="add-rubric" onClick={() => actions.setField(["rubric"], { schema_version: view.defaultSchemaVersion, criteria: [] }, "Thêm rubric", false)}><Plus size={14} aria-hidden="true" /> Thêm rubric</Button></div>}
    {rubric && <>
      <div className="se-coord-grid">
        <Field label="Phiên bản schema rubric" hint="Cố định theo danh mục máy chủ.">{(props) => <input className="ops-input" {...props} value={typeof rubric.schema_version === "string" ? rubric.schema_version : ""} readOnly data-testid="rubric-schema" />}</Field>
        <NumberField label="Ngưỡng đạt" required data-testid="rubric-threshold" value={typeof rubric.pass_threshold === "number" ? rubric.pass_threshold : undefined} error={at("$.rubric.pass_threshold")} onCommit={(value) => actions.setField(["rubric", "pass_threshold"], value, "Sửa ngưỡng đạt")} />
      </div>
      <ol className="se-criteria">
        {criteria.map((criterion, index) => {
          const c = isObject(criterion) ? criterion : {};
          const path = `$.rubric.criteria[${index}]`;
          const metric = typeof c.metric === "string" ? c.metric : "";
          const known = view?.metrics.find((item) => item.id === metric);
          return <li key={index} className="se-criterion" data-testid={`criterion-${index}`}>
            <div className="se-criterion-head"><strong>Tiêu chí {index + 1}</strong>
              <Button type="button" variant="ghost" size="icon" aria-label={`Xóa tiêu chí ${index + 1}`} onClick={() => actions.removeItem(["rubric", "criteria"], index, "Xóa tiêu chí")}><Trash2 size={16} aria-hidden="true" /></Button></div>
            {at(path) && <span className="ops-field-error" role="alert">{at(path)}</span>}
            <div className="se-coord-grid">
              <TextField label="Mã tiêu chí" required value={typeof c.id === "string" ? c.id : ""} maxLength={view?.idMaxLength} error={at(`${path}.id`)} data-testid={`criterion-${index}-id`} onCommit={(value) => actions.setField(["rubric", "criteria", index, "id"], value, "Sửa mã tiêu chí")} />
              <Field label="Chỉ số (metric)" required error={at(`${path}.metric`)} hint={known?.description}>
                {(props) => <Select {...props} data-testid={`criterion-${index}-metric`} value={metric} onChange={(event) => actions.setField(["rubric", "criteria", index, "metric"], event.target.value || undefined, "Chọn chỉ số", false)}>
                  <option value="">Chọn…</option>
                  {metric && !known && <option value={metric}>{metric} (không có trong danh mục)</option>}
                  {view?.metrics.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                </Select>}
              </Field>
              <Field label="Toán tử" required error={at(`${path}.operator`)}>
                {(props) => <Select {...props} data-testid={`criterion-${index}-operator`} value={typeof c.operator === "string" ? c.operator : ""} onChange={(event) => actions.setField(["rubric", "criteria", index, "operator"], event.target.value || undefined, "Sửa toán tử", false)}>
                  <option value="">Chọn…</option>
                  {(view?.operators.length ? view.operators : [...RUBRIC_OPERATORS]).map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                </Select>}
              </Field>
              <NumberField label="Ngưỡng" required data-testid={`criterion-${index}-threshold`} value={typeof c.threshold === "number" ? c.threshold : undefined} error={at(`${path}.threshold`)} onCommit={(value) => actions.setField(["rubric", "criteria", index, "threshold"], value, "Sửa ngưỡng")} />
              <NumberField label="Trọng số" required hint="Không âm." data-testid={`criterion-${index}-weight`} value={typeof c.weight === "number" ? c.weight : undefined} error={at(`${path}.weight`)} onCommit={(value) => actions.setField(["rubric", "criteria", index, "weight"], value, "Sửa trọng số")} />
              <label className="se-check"><input type="checkbox" checked={c.mandatory === true} onChange={(event) => actions.setField(["rubric", "criteria", index, "mandatory"], event.target.checked, "Đổi cờ bắt buộc", false)} /> Tiêu chí bắt buộc</label>
            </div>
            <TextField label="Mô tả (tùy chọn)" maxLength={view?.descriptionMaxLength} value={typeof c.description === "string" ? c.description : ""} error={at(`${path}.description`)} onCommit={(value) => actions.setField(["rubric", "criteria", index, "description"], value === "" ? undefined : value, "Sửa mô tả tiêu chí")} />
          </li>;
        })}
      </ol>
      <div className="ops-actions">
        <Button type="button" variant="quiet" size="sm" data-testid="add-criterion" disabled={!view || criteria.length >= (view?.maxCriteria ?? 100)} onClick={() => actions.addItem(["rubric", "criteria"], { id: "", metric: "", mandatory: false }, "Thêm tiêu chí")}><Plus size={14} aria-hidden="true" /> Thêm tiêu chí</Button>
        <Button type="button" variant="quiet" size="sm" onClick={() => actions.setField(["rubric"], undefined, "Xóa rubric", false)}><Trash2 size={14} aria-hidden="true" /> Xóa rubric</Button>
      </div>
    </>}
  </Group>;
}
