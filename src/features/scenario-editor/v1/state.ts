import { isObject, type Json, type JsonObject } from "../store/json";
import type { Issue } from "../store/validation";
import { findCapability, findRuntime, validateParameters, type RuntimeOption } from "./catalog";
import {
  CAPABILITY_REQUIRED_KINDS, ID_PATTERN, IFC_GLOBAL_ID_PATTERN, LIMITS, OBJECT_KINDS, RUBRIC_OPERATORS, SCHEMA_VERSION, SEMVER_PATTERN, SHA256_PATTERN,
  KIND_META, MODE_LABEL, TRAINING_MODES, UUID_PATTERN, type GeometryPin, type ObjectKind,
} from "./contract";
import type { GeometryInfo } from "./geometry";
import { quaternionLength, type Quat, type Vec3 } from "./matrix";

/**
 * Draft state of `fet3d.editor/1`. The editor keeps the document as the raw JSON the server returned and edits it only
 * through copy-on-write patches (store/commands.ts), so a field this UI does not know keeps its identity and is sent
 * back untouched. Reading helpers below are lenient views for display; they never write.
 */

export const isV1State = (state: unknown): boolean => isObject(state) && state.schemaVersion === SCHEMA_VERSION;

/** Smallest state a client can PUT back to a fresh draft: the versioned document with the pinned Geometry (never a position). */
export function initialStateV1(pin: GeometryPin, extras: JsonObject = {}): JsonObject {
  return { ...extras, schemaVersion: SCHEMA_VERSION, geometry: { artifactId: pin.artifactId, sha256Hash: pin.sha256Hash } };
}

// ───────── lenient read model ─────────

export type ObjectView = {
  index: number;
  id: string;
  kind: ObjectKind | null;
  label: string;
  floorId: string;
  position: Vec3;
  rotation: Quat;
  anchorId: string | undefined;
  capability: { id: string; version: string } | undefined;
  parameters: JsonObject;
};

const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export function readObjects(draft: JsonObject): ObjectView[] {
  const list = draft.objects;
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => {
    const source = isObject(item) ? item : {};
    const placement = isObject(source.placement) ? source.placement : {};
    const position = isObject(placement.position) ? placement.position : {};
    const rotation = isObject(placement.rotation) ? placement.rotation : {};
    const capability = isObject(source.capability) && typeof source.capability.id === "string" && typeof source.capability.version === "string"
      ? { id: source.capability.id, version: source.capability.version } : undefined;
    const kind = (OBJECT_KINDS as readonly string[]).includes(source.kind as string) ? (source.kind as ObjectKind) : null;
    return {
      index,
      id: typeof source.id === "string" ? source.id : "",
      kind,
      label: typeof source.label === "string" ? source.label : "",
      floorId: typeof placement.floorId === "string" ? placement.floorId : "",
      position: { x: num(position.x), y: num(position.y), z: num(position.z) },
      rotation: { x: num(rotation.x), y: num(rotation.y), z: num(rotation.z), w: num(rotation.w, 1) },
      anchorId: typeof source.anchorId === "string" ? source.anchorId : undefined,
      capability,
      parameters: isObject(source.parameters) ? source.parameters : {},
    };
  });
}

export function readGeometryPin(draft: JsonObject): GeometryPin | null {
  const geometry = draft.geometry;
  return isObject(geometry) && typeof geometry.artifactId === "string" && typeof geometry.sha256Hash === "string"
    ? { artifactId: geometry.artifactId, sha256Hash: geometry.sha256Hash } : null;
}

export const readString = (draft: JsonObject, key: string): string => (typeof draft[key] === "string" ? (draft[key] as string) : "");
export const readNumberField = (draft: JsonObject, key: string): number | undefined => (typeof draft[key] === "number" && Number.isFinite(draft[key]) ? (draft[key] as number) : undefined);

export function readModes(draft: JsonObject): string[] {
  const policy = draft.modePolicy;
  return isObject(policy) && Array.isArray(policy.allowedModes) ? policy.allowedModes.filter((item): item is string => typeof item === "string") : [];
}

export function readObjectives(draft: JsonObject): string[] {
  return Array.isArray(draft.learningObjectives) ? draft.learningObjectives.map((item) => (typeof item === "string" ? item : "")) : [];
}

/** Smallest unused `<kind>-N` id for a new object. */
export function nextObjectId(draft: JsonObject, kind: ObjectKind, prefixes: Record<ObjectKind, string>): string {
  const used = new Set(readObjects(draft).map((object) => object.id));
  for (let n = 1; ; n++) {
    const candidate = `${prefixes[kind]}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

// ───────── issues ─────────

const issue = (code: string, path: string, message: string): Issue => ({ code, path, message, source: "client" });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
// Mirrors StrictReader.Text: non-blank, within the limit and free of control characters.
const printable = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

function unique(list: unknown, path: string, max: number, check: (item: unknown) => boolean, out: Issue[], itemMessage: string) {
  if (!Array.isArray(list)) { out.push(issue("TYPE_INVALID", path, "Phải là một danh sách.")); return; }
  if (list.length > max) { out.push(issue("ARRAY_TOO_LARGE", path, `Tối đa ${max} mục.`)); return; }
  const seen = new Set<string>();
  list.forEach((item, index) => {
    if (!check(item)) { out.push(issue("STRING_INVALID", `${path}[${index}]`, itemMessage)); return; }
    const key = String(item);
    if (seen.has(key)) out.push(issue("ID_DUPLICATE", `${path}[${index}]`, "Các giá trị phải khác nhau."));
    seen.add(key);
  });
}

const ROOT_KEYS = new Set(["schemaVersion", "name", "geometry", "runtimeVersion", "objects", "timeLimitSeconds", "rubric", "learningObjectives", "learnerInstructions", "modePolicy", "randomSeed", "replanIntervalSeconds"]);
const OBJECT_KEYS = new Set(["id", "kind", "placement", "anchorId", "capability", "parameters", "label"]);
const CRITERION_KEYS = new Set(["id", "metric", "mandatory", "weight", "threshold", "operator", "description"]);

function unknownKeys(value: JsonObject, allowed: Set<string>, path: string, out: Issue[]) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) out.push(issue("FIELD_UNKNOWN", `${path}.${key}`, "Trường này không có trong định dạng bản nháp."));
}

/**
 * What `PUT /api/scenario-drafts/{id}` checks for a versioned body (BE `ScenarioStateV1Validator.ValidateShape`): types,
 * unknown fields, finite numbers, enums, duplicate ids and limits. Partial drafts pass. Used to explain why a body would be
 * refused with 422 `EDITOR_SCHEMA_INVALID` before sending it; the server stays authoritative.
 */
export function shapeIssues(draft: JsonObject): Issue[] {
  const out: Issue[] = [];
  if (draft.schemaVersion !== SCHEMA_VERSION) return [issue("VALUE_UNSUPPORTED", "$.schemaVersion", "Định dạng bản nháp chưa được hỗ trợ.")];
  unknownKeys(draft, ROOT_KEYS, "$", out);
  if (draft.name !== undefined && !printable(draft.name, LIMITS.nameMax)) out.push(issue("STRING_INVALID", "$.name", `Dùng 1–${LIMITS.nameMax} ký tự.`));
  if (draft.geometry !== undefined) {
    const geometry = draft.geometry;
    if (!isObject(geometry)) out.push(issue("TYPE_INVALID", "$.geometry", "Phải là một đối tượng."));
    else {
      unknownKeys(geometry, new Set(["artifactId", "sha256Hash"]), "$.geometry", out);
      if (typeof geometry.artifactId !== "string" || !UUID_PATTERN.test(geometry.artifactId)) out.push(issue("STRING_FORMAT_INVALID", "$.geometry.artifactId", "Cần mã của mô hình 3D đã đạt kiểm tra."));
      if (typeof geometry.sha256Hash !== "string" || !SHA256_PATTERN.test(geometry.sha256Hash)) out.push(issue("STRING_FORMAT_INVALID", "$.geometry.sha256Hash", "Mã nội dung của mô hình 3D không hợp lệ."));
    }
  }
  if (draft.runtimeVersion !== undefined && (typeof draft.runtimeVersion !== "string" || !SEMVER_PATTERN.test(draft.runtimeVersion))) out.push(issue("STRING_FORMAT_INVALID", "$.runtimeVersion", "Phiên bản ứng dụng có dạng x.y.z (ví dụ 1.2.0)."));
  const range = (key: "timeLimitSeconds" | "replanIntervalSeconds", min: number, max: number) => {
    const value = draft[key];
    if (value === undefined) return;
    if (!integer(value)) out.push(issue("INTEGER_INVALID", `$.${key}`, "Phải là số nguyên."));
    else if (value < min || value > max) out.push(issue("NUMBER_OUT_OF_RANGE", `$.${key}`, `Phải từ ${min} đến ${max}.`));
  };
  range("timeLimitSeconds", LIMITS.timeLimit.min, LIMITS.timeLimit.max);
  range("replanIntervalSeconds", LIMITS.replanInterval.min, LIMITS.replanInterval.max);
  if (draft.randomSeed !== undefined && !integer(draft.randomSeed)) out.push(issue("INTEGER_INVALID", "$.randomSeed", "Phải là số nguyên."));

  if (draft.modePolicy !== undefined) {
    const policy = draft.modePolicy;
    if (!isObject(policy)) out.push(issue("TYPE_INVALID", "$.modePolicy", "Phải là một đối tượng."));
    else {
      unknownKeys(policy, new Set(["allowedModes"]), "$.modePolicy", out);
      if (policy.allowedModes === undefined) out.push(issue("FIELD_REQUIRED", "$.modePolicy.allowedModes", "Cần danh sách chế độ."));
      else {
        unique(policy.allowedModes, "$.modePolicy.allowedModes", TRAINING_MODES.length, (item) => typeof item === "string" && (TRAINING_MODES as readonly string[]).includes(item), out, `Dùng một trong: ${TRAINING_MODES.map((mode) => MODE_LABEL[mode]).join(", ")}.`);
        if (Array.isArray(policy.allowedModes) && policy.allowedModes.length === 0) out.push(issue("FIELD_REQUIRED", "$.modePolicy.allowedModes", "Cần ít nhất một chế độ."));
      }
    }
  }
  if (draft.learningObjectives !== undefined) unique(draft.learningObjectives, "$.learningObjectives", LIMITS.objectivesMax, (item) => printable(item, LIMITS.objectiveMax), out, `Mỗi mục dùng 1–${LIMITS.objectiveMax} ký tự, không để trống.`);
  if (draft.learnerInstructions !== undefined && !printable(draft.learnerInstructions, LIMITS.instructionsMax)) out.push(issue("STRING_INVALID", "$.learnerInstructions", `Dùng 1–${LIMITS.instructionsMax} ký tự.`));
  if (draft.rubric !== undefined) rubricShape(draft.rubric, out);
  if (draft.objects !== undefined) objectsShape(draft.objects, out);
  return out;
}

function rubricShape(rubric: Json, out: Issue[]) {
  if (!isObject(rubric)) { out.push(issue("TYPE_INVALID", "$.rubric", "Phải là một đối tượng.")); return; }
  unknownKeys(rubric, new Set(["schema_version", "pass_threshold", "criteria"]), "$.rubric", out);
  if (rubric.schema_version !== undefined && rubric.schema_version !== "1") out.push(issue("RUBRIC_SCHEMA_VERSION_UNSUPPORTED", "$.rubric.schema_version", "Phiên bản định dạng rubric chưa được hỗ trợ."));
  if (!finite(rubric.pass_threshold)) out.push(issue(rubric.pass_threshold === undefined ? "FIELD_REQUIRED" : "NUMBER_INVALID", "$.rubric.pass_threshold", "Cần ngưỡng đạt (số)."));
  if (!Array.isArray(rubric.criteria)) { out.push(issue(rubric.criteria === undefined ? "FIELD_REQUIRED" : "TYPE_INVALID", "$.rubric.criteria", "Cần danh sách tiêu chí.")); return; }
  if (rubric.criteria.length > LIMITS.criteriaMax) { out.push(issue("ARRAY_TOO_LARGE", "$.rubric.criteria", `Tối đa ${LIMITS.criteriaMax} tiêu chí.`)); return; }
  const ids = new Set<string>();
  rubric.criteria.forEach((criterion, index) => {
    const path = `$.rubric.criteria[${index}]`;
    if (!isObject(criterion)) { out.push(issue("TYPE_INVALID", path, "Phải là một đối tượng.")); return; }
    unknownKeys(criterion, CRITERION_KEYS, path, out);
    if (typeof criterion.id !== "string" || !ID_PATTERN.test(criterion.id)) out.push(issue(criterion.id === undefined ? "FIELD_REQUIRED" : "STRING_FORMAT_INVALID", `${path}.id`, "Mã tiêu chí gồm chữ, số và _ . : - (tối đa 128 ký tự)."));
    else if (ids.has(criterion.id)) out.push(issue("ID_DUPLICATE", `${path}.id`, "Mã tiêu chí phải duy nhất."));
    else ids.add(criterion.id);
    if (typeof criterion.metric !== "string" || !ID_PATTERN.test(criterion.metric)) out.push(issue(criterion.metric === undefined ? "FIELD_REQUIRED" : "STRING_FORMAT_INVALID", `${path}.metric`, "Chọn một chỉ số do máy chủ tính."));
    if (typeof criterion.mandatory !== "boolean") out.push(issue(criterion.mandatory === undefined ? "FIELD_REQUIRED" : "TYPE_INVALID", `${path}.mandatory`, "Cần cờ bắt buộc đúng/sai."));
    if (!finite(criterion.weight) || criterion.weight < 0) out.push(issue(criterion.weight === undefined ? "FIELD_REQUIRED" : "NUMBER_OUT_OF_RANGE", `${path}.weight`, "Trọng số là số không âm."));
    if (!finite(criterion.threshold)) out.push(issue(criterion.threshold === undefined ? "FIELD_REQUIRED" : "NUMBER_INVALID", `${path}.threshold`, "Ngưỡng là một số."));
    if (typeof criterion.operator !== "string" || !(RUBRIC_OPERATORS as readonly string[]).includes(criterion.operator)) out.push(issue(criterion.operator === undefined ? "FIELD_REQUIRED" : "VALUE_UNSUPPORTED", `${path}.operator`, "Chọn phép so sánh ≥, ≤ hoặc =."));
    if (criterion.description !== undefined && !printable(criterion.description, LIMITS.criterionDescriptionMax)) out.push(issue("STRING_INVALID", `${path}.description`, `Mô tả dùng 1–${LIMITS.criterionDescriptionMax} ký tự.`));
  });
}

function objectsShape(objects: Json, out: Issue[]) {
  if (!Array.isArray(objects)) { out.push(issue("TYPE_INVALID", "$.objects", "Phải là một danh sách.")); return; }
  if (objects.length > LIMITS.objectsMax) { out.push(issue("ARRAY_TOO_LARGE", "$.objects", `Tối đa ${LIMITS.objectsMax} đối tượng.`)); return; }
  const ids = new Set<string>();
  objects.forEach((item, index) => {
    const path = `$.objects[${index}]`;
    if (!isObject(item)) { out.push(issue("TYPE_INVALID", path, "Phải là một đối tượng.")); return; }
    unknownKeys(item, OBJECT_KEYS, path, out);
    if (typeof item.id !== "string" || !ID_PATTERN.test(item.id)) out.push(issue(item.id === undefined ? "FIELD_REQUIRED" : "STRING_FORMAT_INVALID", `${path}.id`, "Mã đối tượng gồm chữ, số và _ . : - (tối đa 128 ký tự)."));
    else if (ids.has(item.id)) out.push(issue("ID_DUPLICATE", `${path}.id`, "Mã đối tượng phải duy nhất trong bản nháp."));
    else ids.add(item.id);
    if (typeof item.kind !== "string" || !(OBJECT_KINDS as readonly string[]).includes(item.kind)) out.push(issue(item.kind === undefined ? "FIELD_REQUIRED" : "VALUE_UNSUPPORTED", `${path}.kind`, `Loại phải là một trong: ${OBJECT_KINDS.map((kind) => KIND_META[kind].label).join(", ")}.`));
    if (item.label !== undefined && !printable(item.label, LIMITS.labelMax)) out.push(issue("STRING_INVALID", `${path}.label`, `Nhãn dùng 1–${LIMITS.labelMax} ký tự.`));
    placementShape(item.placement, `${path}.placement`, out);
    if (item.anchorId !== undefined && (typeof item.anchorId !== "string" || !IFC_GLOBAL_ID_PATTERN.test(item.anchorId))) out.push(issue("STRING_FORMAT_INVALID", `${path}.anchorId`, "Neo là IFC GlobalId gồm 22 ký tự."));
    if (item.capability !== undefined) {
      const capability = item.capability;
      if (!isObject(capability)) out.push(issue("TYPE_INVALID", `${path}.capability`, "Phải là một đối tượng."));
      else {
        unknownKeys(capability, new Set(["id", "version"]), `${path}.capability`, out);
        if (typeof capability.id !== "string" || !ID_PATTERN.test(capability.id)) out.push(issue("STRING_FORMAT_INVALID", `${path}.capability.id`, "Mã khả năng không hợp lệ."));
        if (typeof capability.version !== "string" || !SEMVER_PATTERN.test(capability.version)) out.push(issue("STRING_FORMAT_INVALID", `${path}.capability.version`, "Phiên bản khả năng có dạng x.y.z."));
      }
    }
    if (item.parameters !== undefined && !isObject(item.parameters)) out.push(issue("TYPE_INVALID", `${path}.parameters`, "Tham số phải là một đối tượng."));
  });
}

function placementShape(placement: Json | undefined, path: string, out: Issue[]) {
  if (placement === undefined) { out.push(issue("FIELD_REQUIRED", path, "Cần vị trí đặt.")); return; }
  if (!isObject(placement)) { out.push(issue("TYPE_INVALID", path, "Phải là một đối tượng.")); return; }
  unknownKeys(placement, new Set(["floorId", "position", "rotation"]), path, out);
  if (typeof placement.floorId !== "string" || !ID_PATTERN.test(placement.floorId)) out.push(issue(placement.floorId === undefined ? "FIELD_REQUIRED" : "STRING_FORMAT_INVALID", `${path}.floorId`, "Cần mã tầng."));
  const vector = (value: Json | undefined, name: string, keys: readonly string[], min: number, max: number): boolean => {
    if (value === undefined) { out.push(issue("FIELD_REQUIRED", `${path}.${name}`, "Bắt buộc.")); return false; }
    if (!isObject(value)) { out.push(issue("TYPE_INVALID", `${path}.${name}`, "Phải là một đối tượng.")); return false; }
    unknownKeys(value, new Set(keys), `${path}.${name}`, out);
    let ok = true;
    for (const key of keys) {
      const component = value[key];
      if (!finite(component)) { out.push(issue(component === undefined ? "FIELD_REQUIRED" : "NUMBER_INVALID", `${path}.${name}.${key}`, "Phải là số hữu hạn.")); ok = false; }
      else if (component < min || component > max) { out.push(issue("NUMBER_OUT_OF_RANGE", `${path}.${name}.${key}`, `Phải từ ${min} đến ${max}.`)); ok = false; }
    }
    return ok;
  };
  vector(placement.position, "position", ["x", "y", "z"], -LIMITS.positionAbs, LIMITS.positionAbs);
  if (vector(placement.rotation, "rotation", ["x", "y", "z", "w"], -1, 1)) {
    const q = placement.rotation as unknown as Quat;
    if (Math.abs(quaternionLength(q) - 1) > 1e-3) out.push(issue("QUATERNION_NOT_NORMALIZED", `${path}.rotation`, "Quaternion phải có độ dài 1 (sai số 0,001)."));
  }
}

// ───────── completeness / references (advisory mirror of validate; the server is authoritative) ─────────

export type ReferenceContext = {
  geometry: GeometryInfo | null;
  /** Active runtimes of the catalog, or null while it is not loaded (capability checks are then skipped, not guessed). */
  runtimes: RuntimeOption[] | null;
  /** Server-computed rubric metrics, or null while the rubric catalog is not loaded. */
  metrics: ReadonlySet<string> | null;
};

/**
 * What validate/snapshot additionally require and what can be checked against data the editor already holds (floors,
 * semantic mapping, runtime catalog, rubric metrics). Same codes and paths as the BE. Items the client cannot know
 * (whether the pinned artifact is still the accepted one) are left to `validate-state`.
 */
export function completenessIssues(draft: JsonObject, context: ReferenceContext): Issue[] {
  const out: Issue[] = [];
  const need = (key: string, present: boolean, message: string) => { if (!present) out.push(issue("FIELD_REQUIRED", `$.${key}`, message)); };
  need("geometry", readGeometryPin(draft) !== null, "Cần gắn bản nháp với mô hình 3D đã đạt kiểm tra.");
  need("runtimeVersion", typeof draft.runtimeVersion === "string", "Chọn phiên bản ứng dụng từ danh sách.");
  need("timeLimitSeconds", draft.timeLimitSeconds !== undefined, "Nhập thời gian tối đa (giây).");
  need("learningObjectives", Array.isArray(draft.learningObjectives) && draft.learningObjectives.length > 0, "Nhập ít nhất một mục tiêu học tập.");
  need("learnerInstructions", typeof draft.learnerInstructions === "string", "Nhập hướng dẫn cho người học.");
  const rubric = draft.rubric;
  if (!isObject(rubric)) out.push(issue("FIELD_REQUIRED", "$.rubric", "Cần rubric chấm điểm."));
  else if (Array.isArray(rubric.criteria)) {
    if (rubric.criteria.length === 0) out.push(issue("FIELD_REQUIRED", "$.rubric.criteria", "Cần ít nhất một tiêu chí."));
    rubric.criteria.forEach((criterion, index) => {
      if (context.metrics && isObject(criterion) && typeof criterion.metric === "string" && !context.metrics.has(criterion.metric)) out.push(issue("RUBRIC_METRIC_UNSUPPORTED", `$.rubric.criteria[${index}].metric`, "Chọn chỉ số có trong danh mục rubric của hệ thống."));
    });
  }

  const objects = readObjects(draft);
  const runtime = context.runtimes && typeof draft.runtimeVersion === "string" ? findRuntime(context.runtimes, draft.runtimeVersion) : undefined;
  if (!objects.some((object) => object.kind === "Spawn")) out.push(issue("SPAWN_REQUIRED", "$.objects", "Cần ít nhất một điểm xuất phát."));
  if (!objects.some((object) => object.kind === "Goal")) out.push(issue("GOAL_REQUIRED", "$.objects", "Cần ít nhất một điểm đến."));
  const geometry = context.geometry;
  for (const object of objects) {
    const base = `$.objects[${object.index}]`;
    if (object.kind === null) continue;
    if (object.kind === "BlockedElement" && !object.anchorId) out.push(issue("ANCHOR_REQUIRED", `${base}.anchorId`, "Cấu kiện bị chặn phải chọn một cấu kiện IFC."));
    if ((CAPABILITY_REQUIRED_KINDS as readonly string[]).includes(object.kind) && !object.capability) out.push(issue("CAPABILITY_REQUIRED", `${base}.capability`, "Chọn khả năng trong ứng dụng cho đối tượng này."));
    if (geometry) {
      if (!geometry.floors.some((floor) => floor.id === object.floorId)) out.push(issue("FLOOR_NOT_FOUND", `${base}.placement.floorId`, "Tầng không có trong mô hình 3D đã gắn."));
      if (object.anchorId) {
        const entry = geometry.semantic.find((item) => item.ifcGlobalId === object.anchorId);
        if (!entry) out.push(issue("ANCHOR_NOT_FOUND", `${base}.anchorId`, "Cấu kiện neo không có trong mô hình 3D."));
        else if (entry.floorId !== object.floorId) out.push(issue("ANCHOR_FLOOR_MISMATCH", `${base}.anchorId`, "Cấu kiện neo nằm ở tầng khác."));
      }
    }
    if (object.capability && runtime) {
      const capability = findCapability(runtime, object.capability.id);
      if (!capability) out.push(issue("CAPABILITY_NOT_SUPPORTED", `${base}.capability.id`, "Phiên bản ứng dụng đã chọn không có khả năng này."));
      else if (capability.version !== object.capability.version) out.push(issue("CAPABILITY_VERSION_MISMATCH", `${base}.capability.version`, `Ứng dụng đang có phiên bản ${capability.version} của khả năng này.`));
      else if (!capability.objectKinds.includes(object.kind)) out.push(issue("CAPABILITY_KIND_UNSUPPORTED", `${base}.capability.id`, "Khả năng này không dùng được cho loại đối tượng này."));
      else for (const problem of validateParameters(capability, object.parameters)) out.push(issue(problem.code, problem.name ? `${base}.parameters.${problem.name}` : `${base}.parameters`, problem.message));
    } else if (!object.capability && Object.keys(object.parameters).length > 0) {
      out.push(issue("PARAMETERS_NOT_ALLOWED", `${base}.parameters`, "Chưa chọn khả năng thì không nhập tham số."));
    }
  }
  if (typeof draft.runtimeVersion === "string" && context.runtimes && !runtime) {
    out.push(issue("RUNTIME_NOT_SUPPORTED", "$.runtimeVersion", "Phiên bản ứng dụng không còn trong danh sách đang dùng."));
  }
  return out;
}
