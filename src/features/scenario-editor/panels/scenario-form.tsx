"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

import { isObject, type JsonObject } from "../store/json";
import { listStrings, readNumber } from "../store/model";
import { issueMessage, issuesAt, type Issue } from "../store/validation";
import type { RuntimeCatalogEntry } from "../api";
import type { EditorActions } from "./actions";
import { NumberField, StringList, TextField } from "./fields";

const OPERATORS = [{ value: "gte", label: "≥ (gte)" }, { value: "lte", label: "≤ (lte)" }, { value: "eq", label: "= (eq)" }];

function Group({ title, description, children, testId }: { title: string; description?: string; children: React.ReactNode; testId?: string }) {
  return <fieldset className="ops-fieldset se-group" data-testid={testId}>
    <legend>{title}</legend>
    {description && <p className="ops-field-hint">{description}</p>}
    {children}
  </fieldset>;
}

export function ScenarioForm({ draft, issues, actions, catalog }: {
  draft: JsonObject;
  issues: Issue[];
  actions: EditorActions;
  catalog: { loading: boolean; error: boolean; items: RuntimeCatalogEntry[] | undefined };
}) {
  const objectives = listStrings(draft, "learningObjectives");
  const routes = isObject(draft.routingConfig) && Array.isArray(draft.routingConfig.evacuationRoutes) ? draft.routingConfig.evacuationRoutes.map((item) => (typeof item === "string" ? item : "")) : [];
  const rubric = isObject(draft.rubric) ? draft.rubric : undefined;
  const criteria = rubric && Array.isArray(rubric.criteria) ? rubric.criteria : [];
  const capabilities = listStrings(draft, "requiredCapabilities");
  const anchors = listStrings(draft, "objectAnchors");
  const runtimeVersion = typeof draft.runtimeVersion === "string" ? draft.runtimeVersion : "";
  const runtimes = catalog.items?.map((item) => item.runtimeVersion) ?? [];
  const listIssue = (path: string) => issueMessage(issues, path);

  return <div className="se-form" data-testid="scenario-form">
    <Group title="Mục tiêu và hướng dẫn" description="Nội dung này hiển thị cho người học; đây là phần mục tiêu RAG của kịch bản đã duyệt." testId="group-objectives">
      <StringList label="Mục tiêu học tập" items={objectives} maxLength={1000} placeholder="Ví dụ: Nhận biết lối thoát gần nhất" addLabel="Thêm mục tiêu" error={listIssue("$.learningObjectives")}
        onChange={(index, value) => actions.setField(["learningObjectives", index], value, "Sửa mục tiêu")}
        onAdd={() => actions.addItem(["learningObjectives"], "", "Thêm mục tiêu")}
        onRemove={(index) => actions.removeItem(["learningObjectives"], index, "Xóa mục tiêu")} testId="objectives" />
      <TextField label="Hướng dẫn cho người học" multiline rows={5} maxLength={10000} required value={typeof draft.learnerInstructions === "string" ? draft.learnerInstructions : ""}
        hint="1–10000 ký tự." error={listIssue("$.learnerInstructions")} data-testid="learner-instructions"
        onCommit={(value) => actions.setField(["learnerInstructions"], value, "Sửa hướng dẫn")} />
    </Group>

    <Group title="Rubric chấm điểm" description="Nhập đúng tiêu chí của tổ chức. Hệ thống không đặt sẵn ngưỡng đạt hay trọng số; chính sách chấm chưa được chốt." testId="group-rubric">
      {listIssue("$.rubric") && <span className="ops-field-error" role="alert">{listIssue("$.rubric")}</span>}
      <div className="se-coord-grid">
        <TextField label="Phiên bản schema rubric" value={typeof rubric?.schema_version === "string" ? rubric.schema_version : ""} data-testid="rubric-schema"
          onCommit={(value) => actions.setField(["rubric", "schema_version"], value, "Sửa schema rubric")} />
        <NumberField label="Ngưỡng đạt" data-testid="rubric-threshold" value={typeof rubric?.pass_threshold === "number" ? rubric.pass_threshold : undefined}
          onCommit={(value) => actions.setField(["rubric", "pass_threshold"], value, "Sửa ngưỡng đạt")} />
      </div>
      <ol className="se-criteria">
        {criteria.map((criterion, index) => {
          const c = isObject(criterion) ? criterion : {};
          const path = `$.rubric.criteria[${index}]`;
          const issue = listIssue(path);
          return <li key={index} className="se-criterion" data-testid={`criterion-${index}`}>
            <div className="se-criterion-head"><strong>Tiêu chí {index + 1}</strong>
              <Button type="button" variant="ghost" size="icon" aria-label={`Xóa tiêu chí ${index + 1}`} onClick={() => actions.removeItem(["rubric", "criteria"], index, "Xóa tiêu chí")}><Trash2 size={16} aria-hidden="true" /></Button></div>
            {issue && <span className="ops-field-error" role="alert">{issue}</span>}
            <div className="se-coord-grid">
              <TextField label="Mã tiêu chí" value={typeof c.id === "string" ? c.id : ""} onCommit={(value) => actions.setField(["rubric", "criteria", index, "id"], value, "Sửa mã tiêu chí")} />
              <TextField label="Chỉ số (metric)" value={typeof c.metric === "string" ? c.metric : ""} onCommit={(value) => actions.setField(["rubric", "criteria", index, "metric"], value, "Sửa chỉ số")} />
              <Field label="Toán tử">
                {(props) => <Select {...props} value={typeof c.operator === "string" ? c.operator : ""} onChange={(event) => actions.setField(["rubric", "criteria", index, "operator"], event.target.value || undefined, "Sửa toán tử", false)}>
                  <option value="">Chọn…</option>
                  {OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                </Select>}
              </Field>
              <NumberField label="Ngưỡng" value={typeof c.threshold === "number" ? c.threshold : undefined} onCommit={(value) => actions.setField(["rubric", "criteria", index, "threshold"], value, "Sửa ngưỡng")} />
              <NumberField label="Trọng số" hint="Không âm." value={typeof c.weight === "number" ? c.weight : undefined} onCommit={(value) => actions.setField(["rubric", "criteria", index, "weight"], value, "Sửa trọng số")} />
              <label className="se-check"><input type="checkbox" checked={c.mandatory === true} onChange={(event) => actions.setField(["rubric", "criteria", index, "mandatory"], event.target.checked, "Đổi cờ bắt buộc", false)} /> Tiêu chí bắt buộc</label>
            </div>
          </li>;
        })}
      </ol>
      <div><Button type="button" variant="quiet" size="sm" data-testid="add-criterion" onClick={() => actions.addItem(["rubric", "criteria"], { id: "", metric: "", mandatory: false }, "Thêm tiêu chí")}><Plus size={14} aria-hidden="true" /> Thêm tiêu chí</Button></div>
    </Group>

    <Group title="Chấm điểm và thời gian" description="Các số do tổ chức nhập; chưa có giá trị mặc định." testId="group-scoring">
      <div className="se-coord-grid">
        <NumberField label="Điểm cơ sở" data-testid="base-score" value={readNumber(draft, ["scoringConfig", "baseScore"])} error={listIssue("$.scoringConfig.baseScore")} onCommit={(value) => actions.setField(["scoringConfig", "baseScore"], value, "Sửa điểm cơ sở")} />
        <NumberField label="Thời gian tối đa" unit="giây" data-testid="time-limit" value={readNumber(draft, ["scoringConfig", "timeLimitSeconds"])} error={listIssue("$.scoringConfig.timeLimitSeconds")} onCommit={(value) => actions.setField(["scoringConfig", "timeLimitSeconds"], value, "Sửa thời gian tối đa")} />
        <NumberField label="Điểm trừ mỗi lỗi" data-testid="penalty" value={readNumber(draft, ["scoringConfig", "penaltyPerMistake"])} error={listIssue("$.scoringConfig.penaltyPerMistake")} onCommit={(value) => actions.setField(["scoringConfig", "penaltyPerMistake"], value, "Sửa điểm trừ")} />
      </div>
    </Group>

    <Group title="Tuyến thoát hiểm" description="Mô tả tuyến dưới dạng văn bản (BE lưu danh sách chuỗi); chưa có tuyến vẽ trên mô hình." testId="group-routes">
      <StringList label="Tuyến thoát hiểm" items={routes} addLabel="Thêm tuyến" placeholder="Ví dụ: Cầu thang bộ B → sảnh tầng 1" error={listIssue("$.routingConfig.evacuationRoutes")}
        onChange={(index, value) => actions.setField(["routingConfig", "evacuationRoutes", index], value, "Sửa tuyến")}
        onAdd={() => actions.addItem(["routingConfig", "evacuationRoutes"], "", "Thêm tuyến")}
        onRemove={(index) => actions.removeItem(["routingConfig", "evacuationRoutes"], index, "Xóa tuyến")} testId="routes" />
    </Group>

    <Group title="Tương thích runtime" description="Danh mục runtime do máy chủ cung cấp. BE kiểm tra năng lực bắt buộc theo runtime khi bấm Kiểm tra." testId="group-runtime">
      {catalog.loading ? <Skeleton style={{ height: 42 }} /> : <Field label="Phiên bản runtime" error={listIssue("$.runtimeVersion")} hint={catalog.error ? "Không tải được danh mục runtime; vẫn có thể nhập tay." : runtimes.length ? undefined : "Danh mục runtime đang trống."}>
        {(props) => runtimes.length ? <Select {...props} value={runtimeVersion} onChange={(event) => actions.setField(["runtimeVersion"], event.target.value || undefined, "Chọn runtime", false)}>
          <option value="">Chọn…</option>
          {runtimeVersion && !runtimes.includes(runtimeVersion) && <option value={runtimeVersion}>{runtimeVersion} (không có trong danh mục)</option>}
          {runtimes.map((version) => <option key={version} value={version}>{version}</option>)}
        </Select> : <input className="ops-input" {...props} value={runtimeVersion} onChange={(event) => actions.setField(["runtimeVersion"], event.target.value || undefined, "Nhập runtime")} />}
      </Field>}
      <StringList label="Năng lực runtime bắt buộc" items={capabilities} addLabel="Thêm năng lực" error={listIssue("$.requiredCapabilities")}
        onChange={(index, value) => actions.setField(["requiredCapabilities", index], value, "Sửa năng lực")}
        onAdd={() => actions.addItem(["requiredCapabilities"], "", "Thêm năng lực")}
        onRemove={(index) => actions.removeItem(["requiredCapabilities"], index, "Xóa năng lực")} testId="capabilities" />
      <StringList label="Neo đối tượng (IFC)" items={anchors} addLabel="Thêm neo" error={listIssue("$.objectAnchors")} hint="Mã neo phải tồn tại trong hình học đã được chấp nhận của revision; BE kiểm tra khi Kiểm tra."
        onChange={(index, value) => actions.setField(["objectAnchors", index], value, "Sửa neo")}
        onAdd={() => actions.addItem(["objectAnchors"], "", "Thêm neo")}
        onRemove={(index) => actions.removeItem(["objectAnchors"], index, "Xóa neo")} testId="anchors" />
    </Group>
    {issuesAt(issues, "$").length === 0 && <p className="ops-field-hint">Không có lỗi cấu trúc ở phía trình duyệt. Bấm “Kiểm tra” để máy chủ xác nhận.</p>}
  </div>;
}
