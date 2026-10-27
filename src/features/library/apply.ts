import { deepEqual, isObject, type Json, type JsonObject, type Path } from "@/features/scenario-editor/store/json";
import type { CapabilityOption } from "@/features/scenario-editor/v1/catalog";
import { LIMITS, MODE_LABEL, TRAINING_MODES, type TrainingMode } from "@/features/scenario-editor/v1/contract";
import { TEMPLATE_FIELDS, ignoredTemplateParts, templateFieldLabel, type TemplateField } from "./payload";
import type { LibraryVersion } from "./types";
import { capabilityName } from "@/configs/capability-labels";
import { metricName } from "@/configs/metric-labels";

/*
 * Planning how a PUBLISHED library version would change the open draft. Pure: it reads the draft and the version and returns
 * groups of fields with what the draft holds now, what the version brings and which actions are allowed. Nothing is written
 * here; the editor applies the chosen changes as ONE undoable command (see `setFieldsCommand`).
 *
 * Rules (FR-LIBRARY-01/02, BE docs/learn-library.md):
 *  - a template fills only the non-spatial fields of `fet3d.editor/1`; it never creates positions, objects, geometry or runtime;
 *  - a rubric sample fills `rubric`;
 *  - equipment gives display metadata for an Equipment object (`label`) and hints about capabilities; a capability is set only
 *    when the draft's runtime catalog itself publishes it for Equipment (library metadata never adds a runtime capability);
 *  - a field that already has content is never overwritten silently: the default for such a group is "keep".
 */

export type ApplyAction = "fill" | "replace" | "merge" | "keep";
export const actionLabel: Record<ApplyAction, string> = { fill: "Điền", replace: "Thay bằng mẫu", merge: "Hợp nhất", keep: "Giữ của tôi" };

export type GroupStatus = "new" | "same" | "different";

export type ApplyGroup = {
  id: string;
  label: string;
  /** `new`: the draft has nothing there; `same`: it already equals the sample; `different`: it has other content. */
  status: GroupStatus;
  current: string;
  incoming: string;
  /** Allowed actions; `keep` is always among them. */
  options: ApplyAction[];
  defaultAction: ApplyAction;
  /** What the draft would hold for each action that writes. */
  writes: Partial<Record<Exclude<ApplyAction, "keep">, Array<{ path: Path; value: Json | undefined }>>>;
  notes: string[];
  warnings: string[];
};

export type ApplyPlan = {
  groups: ApplyGroup[];
  /** Read-only metadata shown for reference (equipment description and properties). */
  reference: Array<{ label: string; value: string }>;
  /** Explanations that apply to the whole sample (what is not written and why). */
  notes: string[];
  /** Parts of the sample that are never applied (positions, geometry, runtime...). */
  ignored: string[];
  /** Why nothing can be applied right now (for example no Equipment object selected). */
  blocker: string | null;
};

export type ApplyContext = {
  metrics: ReadonlySet<string> | null;
  schemaVersions: readonly string[] | null;
  /** Equipment object currently selected in the editor, if any. */
  object: { index: number; kind: string | null; id: string; label: string; capability?: { id: string; version: string } } | null;
  /** Capabilities the draft's runtime publishes (null: no runtime chosen or catalog not loaded). */
  runtimeCapabilities: CapabilityOption[] | null;
};

const isEmpty = (value: unknown) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0) || (isObject(value) && Object.keys(value).length === 0);
const clip = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const NONE = "(trống)";

export function summarizeField(field: TemplateField, value: unknown): string {
  if (isEmpty(value)) return NONE;
  if (field === "learningObjectives") { const list = strings(value); return `${list.length} mục: ${clip(list.join("; "))}`; }
  if (field === "timeLimitSeconds") return `${String(value)} giây`;
  if (field === "modePolicy") return strings(isObject(value) ? value.allowedModes : []).map((mode) => MODE_LABEL[mode as TrainingMode] ?? mode).join(", ") || NONE;
  if (field === "rubric") return describeRubric(value);
  return clip(String(value), 120);
}

export function describeRubric(value: unknown): string {
  if (!isObject(value)) return NONE;
  const criteria = Array.isArray(value.criteria) ? value.criteria : [];
  const ids = criteria.flatMap((item) => (isObject(item) && typeof item.id === "string" ? [item.id] : []));
  const parts = [typeof value.schema_version === "string" ? `phiên bản tiêu chí "${value.schema_version}"` : "chưa có phiên bản tiêu chí", typeof value.pass_threshold === "number" ? `ngưỡng đạt ${value.pass_threshold}` : "chưa có ngưỡng đạt", `${criteria.length} tiêu chí${ids.length ? ` (${clip(ids.join(", "), 60)})` : ""}`];
  return parts.join(" · ");
}

function rubricWarnings(rubric: unknown, context: Pick<ApplyContext, "metrics" | "schemaVersions">): string[] {
  const out: string[] = [];
  if (!isObject(rubric)) return out;
  if (context.schemaVersions && typeof rubric.schema_version === "string" && !context.schemaVersions.includes(rubric.schema_version)) out.push(`Phiên bản tiêu chí "${rubric.schema_version}" không còn được hỗ trợ; hệ thống có thể từ chối khi lưu hoặc kiểm tra.`);
  if (context.metrics && Array.isArray(rubric.criteria)) {
    const unknown = rubric.criteria.flatMap((item) => (isObject(item) && typeof item.metric === "string" && !context.metrics!.has(item.metric) ? [item.metric] : []));
    if (unknown.length > 0) out.push(`Chỉ số không có trong danh mục của hệ thống: ${[...new Set(unknown)].map(metricName).join(", ")}.`);
  }
  return out;
}

/** Union that keeps the author's items first and appends only what is missing. */
const unionStrings = (mine: string[], theirs: string[]) => [...mine, ...theirs.filter((item) => !mine.includes(item))];

function mergedRubric(mine: unknown, theirs: JsonObject): { value: JsonObject; added: number; skipped: number } | null {
  if (!isObject(mine)) return null;
  const mineCriteria = Array.isArray(mine.criteria) ? mine.criteria : [];
  const theirCriteria = Array.isArray(theirs.criteria) ? theirs.criteria : [];
  const ids = new Set(mineCriteria.flatMap((item) => (isObject(item) && typeof item.id === "string" ? [item.id] : [])));
  const fresh = theirCriteria.filter((item) => !(isObject(item) && typeof item.id === "string" && ids.has(item.id)));
  if (fresh.length === 0 || mineCriteria.length + fresh.length > LIMITS.criteriaMax) return null;
  const value: JsonObject = { ...mine, criteria: [...mineCriteria, ...fresh] };
  if (value.schema_version === undefined && theirs.schema_version !== undefined) value.schema_version = theirs.schema_version;
  return { value, added: fresh.length, skipped: theirCriteria.length - fresh.length };
}

type Base = { id: string; label: string; field: TemplateField; path: Path; current: Json | undefined; incoming: Json };

/** One group for one field: status, allowed actions and what each writes. `merged` is the value for "Hợp nhất" when the field supports it. */
function group(base: Base, merged: { value: Json; note: string } | null, warnings: string[]): ApplyGroup {
  const status: GroupStatus = isEmpty(base.current) ? "new" : deepEqual(base.current, base.incoming) ? "same" : "different";
  const writes: ApplyGroup["writes"] = {};
  const notes: string[] = [];
  let options: ApplyAction[];
  let defaultAction: ApplyAction;
  if (status === "new") { writes.fill = [{ path: base.path, value: base.incoming }]; options = ["fill", "keep"]; defaultAction = "fill"; }
  else if (status === "same") { options = ["keep"]; defaultAction = "keep"; notes.push("Bản nháp đã giống mẫu."); }
  else {
    writes.replace = [{ path: base.path, value: base.incoming }];
    options = ["keep", "replace"];
    if (merged) { writes.merge = [{ path: base.path, value: merged.value }]; options.push("merge"); notes.push(merged.note); }
    defaultAction = "keep";
  }
  return { id: base.id, label: base.label, status, current: summarizeField(base.field, base.current), incoming: summarizeField(base.field, base.incoming), options, defaultAction, writes, notes, warnings };
}

function planTemplate(version: LibraryVersion, draft: JsonObject, context: ApplyContext): ApplyPlan {
  const state = isObject(version.payload.state) ? version.payload.state : {};
  const groups: ApplyGroup[] = [];
  for (const field of TEMPLATE_FIELDS) {
    const incoming = state[field];
    if (isEmpty(incoming)) continue;
    const current = draft[field];
    const base: Base = { id: `template:${field}`, label: templateFieldLabel[field], field, path: [field], current, incoming };
    let merged: { value: Json; note: string } | null = null;
    let warnings: string[] = [];
    if (field === "learningObjectives" && Array.isArray(current) && !isEmpty(current)) {
      const union = unionStrings(strings(current), strings(incoming));
      const added = union.length - strings(current).length;
      if (added > 0 && union.length <= LIMITS.objectivesMax) merged = { value: union, note: `Hợp nhất giữ mục tiêu của bạn và thêm ${added} mục chưa có.` };
    } else if (field === "modePolicy" && isObject(current) && isObject(incoming)) {
      const union = unionStrings(strings(current.allowedModes), strings(incoming.allowedModes)).sort((a, b) => TRAINING_MODES.indexOf(a as TrainingMode) - TRAINING_MODES.indexOf(b as TrainingMode));
      if (union.length > strings(current.allowedModes).length) merged = { value: { ...current, allowedModes: union }, note: "Hợp nhất giữ chế độ của bạn và thêm các chế độ chưa có." };
    } else if (field === "rubric" && isObject(current) && isObject(incoming)) {
      const result = mergedRubric(current, incoming);
      if (result) merged = { value: result.value, note: `Hợp nhất giữ tiêu chí của bạn và thêm ${result.added} tiêu chí chưa có${result.skipped > 0 ? `; ${result.skipped} tiêu chí trùng mã giữ bản của bạn` : ""}.` };
    }
    if (field === "rubric") warnings = rubricWarnings(incoming, context);
    groups.push(group(base, merged, warnings));
  }
  const ignored = ignoredTemplateParts(state);
  return { groups, reference: [], notes: [], ignored, blocker: groups.length === 0 ? "Kịch bản mẫu này không có trường nào áp dụng được cho bản nháp." : null };
}

function planRubric(version: LibraryVersion, draft: JsonObject, context: ApplyContext): ApplyPlan {
  const incoming = version.payload.rubric;
  if (!isObject(incoming)) return { groups: [], reference: [], notes: [], ignored: [], blocker: "Mẫu tiêu chí chấm điểm này không có nội dung áp dụng được." };
  const current = draft.rubric;
  const result = isObject(current) ? mergedRubric(current, incoming) : null;
  const merged = result ? { value: result.value as Json, note: `Hợp nhất giữ tiêu chí của bạn và thêm ${result.added} tiêu chí chưa có${result.skipped > 0 ? `; ${result.skipped} tiêu chí trùng mã giữ bản của bạn` : ""}.` } : null;
  return { groups: [group({ id: "rubric", label: templateFieldLabel.rubric, field: "rubric", path: ["rubric"], current, incoming }, merged, rubricWarnings(incoming, context))], reference: [], notes: [], ignored: [], blocker: null };
}

function planEquipment(version: LibraryVersion, context: ApplyContext): ApplyPlan {
  const payload = version.payload;
  const reference: ApplyPlan["reference"] = [];
  if (typeof payload.description === "string") reference.push({ label: "Mô tả", value: payload.description });
  if (isObject(payload.properties)) for (const [key, value] of Object.entries(payload.properties)) reference.push({ label: key, value: String(value) });
  const object = context.object;
  if (!object || object.kind !== "Equipment") return { groups: [], reference, notes: [], ignored: [], blocker: "Chọn một đối tượng Thiết bị trong cây đối tượng hoặc khung nhìn để áp dụng thông tin thiết bị." };

  const groups: ApplyGroup[] = [];
  const labelBase = { id: "equipment:label", label: `Nhãn của ${object.id}`, path: ["objects", object.index, "label"] as Path };
  const labelStatus: GroupStatus = isEmpty(object.label) ? "new" : object.label === version.name ? "same" : "different";
  const labelWrites = labelStatus === "same" ? {} : labelStatus === "new" ? { fill: [{ path: labelBase.path, value: version.name }] } : { replace: [{ path: labelBase.path, value: version.name }] };
  groups.push({ ...labelBase, status: labelStatus, current: object.label || NONE, incoming: version.name, options: labelStatus === "new" ? ["fill", "keep"] : labelStatus === "same" ? ["keep"] : ["keep", "replace"], defaultAction: labelStatus === "new" ? "fill" : "keep", writes: labelWrites, notes: labelStatus === "same" ? ["Nhãn đã giống mẫu."] : [], warnings: [] });

  const notes: string[] = ["Mô tả và thuộc tính của thiết bị chỉ để tham khảo: kịch bản không có chỗ lưu các thông tin này."];
  const required = version.requiredCapabilities;
  if (required.length > 0) {
    const offered = context.runtimeCapabilities;
    if (!offered) notes.push(`Thiết bị yêu cầu: ${required.map(capabilityName).join(", ")}. Chọn phiên bản ứng dụng (thẻ Kịch bản) để kiểm tra.`);
    else {
      const usable = required.flatMap((id) => offered.filter((item) => item.id === id && item.objectKinds.includes("Equipment")));
      const missing = required.filter((id) => !offered.some((item) => item.id === id));
      if (missing.length > 0) notes.push(`Phiên bản ứng dụng của bản nháp chưa có: ${missing.map(capabilityName).join(", ")}. Mẫu không tự thêm tính năng cho ứng dụng.`);
      const candidate = usable[0];
      if (candidate) {
        const status: GroupStatus = !object.capability ? "new" : object.capability.id === candidate.id && object.capability.version === candidate.version ? "same" : "different";
        const writes: Array<{ path: Path; value: Json | undefined }> = [{ path: ["objects", object.index, "capability"], value: { id: candidate.id, version: candidate.version } }];
        // Parameters belong to one capability: a different capability starts with none (same as the capability picker).
        if (object.capability?.id !== candidate.id) writes.push({ path: ["objects", object.index, "parameters"], value: undefined });
        groups.push({
          id: "equipment:capability", label: "Tính năng (gợi ý)", status,
          current: object.capability ? capabilityName(object.capability.id) : NONE, incoming: `${capabilityName(candidate.id)} (từ danh mục của ứng dụng)`,
          options: status === "new" ? ["fill", "keep"] : status === "same" ? ["keep"] : ["keep", "replace"], defaultAction: "keep",
          writes: status === "same" ? {} : status === "new" ? { fill: writes } : { replace: writes },
          notes: ["Chỉ chọn tính năng mà ứng dụng đã có cho Thiết bị; thông số nhập sau ở thẻ Đối tượng."], warnings: [],
        });
      }
    }
  }
  return { groups, reference, notes, ignored: [], blocker: null };
}

export function planApply(version: LibraryVersion, draft: JsonObject, context: ApplyContext): ApplyPlan {
  if (version.kind === "ScenarioTemplate") return planTemplate(version, draft, context);
  if (version.kind === "RubricSample") return planRubric(version, draft, context);
  return planEquipment(version, context);
}

export type Choices = Record<string, ApplyAction | undefined>;

export const chosenAction = (item: ApplyGroup, choices: Choices): ApplyAction => (choices[item.id] && item.options.includes(choices[item.id]!) ? choices[item.id]! : item.defaultAction);

export type Change = { groupId: string; path: Path; value: Json | undefined };

/** The writes the current choices stand for. Groups kept or already equal write nothing. */
export function changesFor(plan: ApplyPlan, choices: Choices): Change[] {
  const out: Change[] = [];
  for (const item of plan.groups) {
    const action = chosenAction(item, choices);
    if (action === "keep") continue;
    for (const write of item.writes[action] ?? []) out.push({ groupId: item.id, ...write });
  }
  return out;
}

export type ApplySummary = { filled: string[]; replaced: string[]; merged: string[]; kept: string[] };

export function summarizeChoices(plan: ApplyPlan, choices: Choices): ApplySummary {
  const summary: ApplySummary = { filled: [], replaced: [], merged: [], kept: [] };
  for (const item of plan.groups) {
    if (item.status === "same") continue;
    const action = chosenAction(item, choices);
    (action === "fill" ? summary.filled : action === "replace" ? summary.replaced : action === "merge" ? summary.merged : summary.kept).push(item.label);
  }
  return summary;
}
