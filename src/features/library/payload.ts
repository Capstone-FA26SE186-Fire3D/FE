import { deepEqual, isObject, stableJson, type Json, type JsonObject } from "@/features/scenario-editor/store/json";
import { SCHEMA_VERSION } from "@/features/scenario-editor/v1/contract";
import { shapeIssues } from "@/features/scenario-editor/v1/state";
import type { LibraryIssue } from "./errors";
import { LIBRARY_LIMITS, type LibraryKind, type LibraryVersion, type VersionInput } from "./types";

/*
 * Payload per kind, from the BE validator (`LibraryContent.Validate`, ContentContracts.cs):
 *  - ScenarioTemplate `{state, description?}`: `state` is a `fet3d.editor/1` draft state (partial allowed).
 *  - RubricSample `{rubric, description?}`: the same rubric registry as the editor (`schema_version` is the string "1").
 *  - Equipment `{description?, properties?}`: up to 50 string/number/boolean properties; unknown fields are refused.
 * Version level: `name` (1-255) and `requiredCapabilities` (up to 50 distinct ids, NOT checked against Unity or the runtime catalog).
 * Nothing here seeds a value: a blank form stays blank.
 */

export type PropertyType = "string" | "number" | "boolean";
export type PropertyRow = { key: string; type: PropertyType; value: string };

/** Everything the admin form edits for one version. `doc` is the editable JSON document of the kind (state for a template, `{rubric}` for a rubric sample). */
export type VersionForm = {
  name: string;
  description: string;
  capabilities: string[];
  doc: JsonObject;
  properties: PropertyRow[];
};

export function emptyForm(kind: LibraryKind): VersionForm {
  return { name: "", description: "", capabilities: [], doc: kind === "ScenarioTemplate" ? { schemaVersion: SCHEMA_VERSION } : {}, properties: [] };
}

const rowOf = (key: string, value: Json): PropertyRow => (
  typeof value === "number" ? { key, type: "number", value: String(value) }
    : typeof value === "boolean" ? { key, type: "boolean", value: value ? "true" : "false" }
      : { key, type: "string", value: typeof value === "string" ? value : "" }
);

export function formFromVersion(version: Pick<LibraryVersion, "kind" | "name" | "payload" | "requiredCapabilities">): VersionForm {
  const payload = version.payload;
  const description = typeof payload.description === "string" ? payload.description : "";
  const base: VersionForm = { name: version.name, description, capabilities: [...version.requiredCapabilities], doc: {}, properties: [] };
  if (version.kind === "ScenarioTemplate") return { ...base, doc: isObject(payload.state) ? payload.state : { schemaVersion: SCHEMA_VERSION } };
  if (version.kind === "RubricSample") return { ...base, doc: payload.rubric === undefined ? {} : { rubric: payload.rubric } };
  const properties = isObject(payload.properties) ? Object.entries(payload.properties).map(([key, value]) => rowOf(key, value)) : [];
  return { ...base, properties };
}

/** The properties object a row list stands for; a row that cannot be a value yet (bad number) is left out and reported by `checkForm`. */
export function propertiesObject(rows: PropertyRow[]): JsonObject {
  const out: JsonObject = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    if (row.type === "boolean") out[key] = row.value === "true";
    else if (row.type === "number") { const value = Number(row.value.trim().replace(",", ".")); if (row.value.trim() !== "" && Number.isFinite(value)) out[key] = value; }
    else out[key] = row.value;
  }
  return out;
}

export function inputFromForm(kind: LibraryKind, form: VersionForm): VersionInput {
  const description = form.description.trim();
  const payload: JsonObject = {};
  if (kind === "ScenarioTemplate") payload.state = { ...form.doc, schemaVersion: SCHEMA_VERSION };
  else if (kind === "RubricSample") { if (form.doc.rubric !== undefined) payload.rubric = form.doc.rubric; }
  else if (form.properties.length > 0) payload.properties = propertiesObject(form.properties);
  if (description) payload.description = description;
  return { name: form.name.trim(), payload, requiredCapabilities: form.capabilities.map((item) => item.trim()) };
}

/** Stable text of what a save would send, used to tell unsaved edits apart from the saved version. */
export const fingerprint = (kind: LibraryKind, form: VersionForm) => stableJson(inputFromForm(kind, form));

export type CheckContext = {
  /** Server-computed metrics from the rubric catalog, or null while it is not loaded (no guess). */
  metrics: ReadonlySet<string> | null;
  /** `supportedSchemaVersions` of the rubric catalog, or null while it is not loaded. */
  schemaVersions: readonly string[] | null;
};

export type FormChecks = {
  /** Problems the server would refuse with 422: saving is held back. */
  blocking: LibraryIssue[];
  /** Differences from the server's catalogs. The server decides, so these inform but never block. */
  advisory: LibraryIssue[];
};

const issue = (code: string, path: string, message: string): LibraryIssue => ({ code, path, message });
const reroot = (issues: Array<{ code: string; path: string; message: string }>, prefix: string): LibraryIssue[] => issues.map((item) => issue(item.code, `${prefix}${item.path.slice(1)}`, item.message));

/** Mirror of `LibraryContent.Validate` with the BE's codes and `$.payload...` paths. The server stays authoritative. */
export function checkForm(kind: LibraryKind, form: VersionForm, context: CheckContext): FormChecks {
  const blocking: LibraryIssue[] = [];
  const advisory: LibraryIssue[] = [];
  const name = form.name.trim();
  if (!name || name.length > LIBRARY_LIMITS.nameMax) blocking.push(issue("STRING_INVALID", "$.name", `Tên phiên bản dùng 1–${LIBRARY_LIMITS.nameMax} ký tự.`));

  const caps = form.capabilities.map((item) => item.trim());
  if (caps.length > LIBRARY_LIMITS.capabilitiesMax || new Set(caps).size !== caps.length || caps.some((item) => !LIBRARY_LIMITS.capabilityPattern.test(item))) {
    blocking.push(issue("CAPABILITIES_INVALID", "$.requiredCapabilities", "Tối đa 50 mã năng lực, khác nhau, mỗi mã gồm chữ, số và _ . : - (tối đa 128 ký tự)."));
  }

  const description = form.description.trim();
  if (description.length > LIBRARY_LIMITS.descriptionMax) blocking.push(issue("STRING_INVALID", "$.payload.description", `Mô tả dùng 1–${LIBRARY_LIMITS.descriptionMax} ký tự.`));
  if (kind === "Equipment" && !description) blocking.push(issue("FIELD_REQUIRED", "$.payload.description", "Nhập mô tả để tổ chức biết thiết bị này là gì."));

  if (kind === "ScenarioTemplate") {
    blocking.push(...reroot(shapeIssues({ ...form.doc, schemaVersion: SCHEMA_VERSION }), "$.payload.state"));
    const rubric = form.doc.rubric;
    if (isObject(rubric)) rubricCatalogNotes(rubric, "$.payload.state.rubric", context, advisory);
  } else if (kind === "RubricSample") {
    const rubric = form.doc.rubric;
    if (!isObject(rubric)) blocking.push(issue("FIELD_REQUIRED", "$.payload.rubric", "Cần một rubric: thêm rubric rồi nhập tiêu chí."));
    else {
      blocking.push(...reroot(shapeIssues({ schemaVersion: SCHEMA_VERSION, rubric }), "$.payload"));
      if (rubric.schema_version === undefined) blocking.push(issue("FIELD_REQUIRED", "$.payload.rubric.schema_version", "Chọn schema_version của rubric."));
      if (Array.isArray(rubric.criteria) && rubric.criteria.length === 0) blocking.push(issue("FIELD_REQUIRED", "$.payload.rubric.criteria", "Cần ít nhất một tiêu chí."));
      rubricCatalogNotes(rubric, "$.payload.rubric", context, advisory);
    }
  } else {
    const seen = new Set<string>();
    if (form.properties.length > LIBRARY_LIMITS.propertiesMax) blocking.push(issue("PROPERTIES_INVALID", "$.payload.properties", "Tối đa 50 thuộc tính."));
    form.properties.forEach((row, index) => {
      const path = `$.payload.properties[${index}]`;
      const key = row.key.trim();
      if (!key) blocking.push(issue("PROPERTIES_INVALID", `${path}.key`, "Nhập tên thuộc tính."));
      else if (seen.has(key)) blocking.push(issue("ID_DUPLICATE", `${path}.key`, "Tên thuộc tính bị trùng."));
      else seen.add(key);
      if (row.type === "number" && (row.value.trim() === "" || !Number.isFinite(Number(row.value.trim().replace(",", "."))))) blocking.push(issue("PROPERTIES_INVALID", `${path}.value`, "Nhập một số."));
    });
  }

  if (JSON.stringify(inputFromForm(kind, form).payload).length > LIBRARY_LIMITS.payloadBytesMax) blocking.push(issue("CONTENT_TOO_LARGE", "$.payload", "Nội dung tối đa 256 KB."));
  return { blocking, advisory };
}

function rubricCatalogNotes(rubric: JsonObject, base: string, context: CheckContext, out: LibraryIssue[]) {
  const version = rubric.schema_version;
  if (context.schemaVersions && version !== undefined && !(typeof version === "string" && context.schemaVersions.includes(version))) {
    out.push(issue("RUBRIC_SCHEMA_VERSION_UNSUPPORTED", `${base}.schema_version`, `Danh mục rubric chỉ hỗ trợ: ${context.schemaVersions.map((item) => `"${item}"`).join(", ") || "(chưa có)"}.`));
  }
  if (context.metrics && Array.isArray(rubric.criteria)) {
    rubric.criteria.forEach((criterion, index) => {
      if (isObject(criterion) && typeof criterion.metric === "string" && criterion.metric !== "" && !context.metrics!.has(criterion.metric)) {
        out.push(issue("RUBRIC_METRIC_UNSUPPORTED", `${base}.criteria[${index}].metric`, "Chỉ số không có trong danh mục rubric của máy chủ."));
      }
    });
  }
}

/** What differs between the form and a version the server holds, for the 412 comparison. */
export function describeDifferences(kind: LibraryKind, form: VersionForm, server: Pick<LibraryVersion, "kind" | "name" | "payload" | "requiredCapabilities">): string[] {
  const mine = inputFromForm(kind, form);
  const theirs = inputFromForm(kind, formFromVersion(server));
  const content = (payload: JsonObject): JsonObject => Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "description"));
  const out: string[] = [];
  if (mine.name !== theirs.name) out.push("tên phiên bản");
  if (mine.payload.description !== theirs.payload.description) out.push("mô tả");
  if (!deepEqual(mine.requiredCapabilities, theirs.requiredCapabilities)) out.push("năng lực yêu cầu");
  if (!deepEqual(content(mine.payload), content(theirs.payload))) out.push(kind === "ScenarioTemplate" ? "nội dung template" : kind === "RubricSample" ? "rubric" : "thuộc tính thiết bị");
  return out;
}

// ───────── what a template carries ─────────

/** Non-spatial fields of `fet3d.editor/1` that a template can fill. Everything else (geometry, objects, runtime, seed) is never applied. */
export const TEMPLATE_FIELDS = ["name", "learningObjectives", "learnerInstructions", "timeLimitSeconds", "modePolicy", "rubric"] as const;
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export const templateFieldLabel: Record<TemplateField, string> = {
  name: "Tên kịch bản",
  learningObjectives: "Mục tiêu học tập",
  learnerInstructions: "Hướng dẫn cho người học",
  timeLimitSeconds: "Thời gian tối đa",
  modePolicy: "Chế độ huấn luyện",
  rubric: "Rubric chấm điểm",
};

/** Spatial or runtime parts a stored template state carries that this UI neither edits nor applies. */
export function ignoredTemplateParts(state: JsonObject): string[] {
  const out: string[] = [];
  if (state.geometry !== undefined) out.push("ghim Geometry");
  if (Array.isArray(state.objects) && state.objects.length > 0) out.push(`${state.objects.length} đối tượng đặt trong không gian`);
  for (const key of ["runtimeVersion", "randomSeed", "replanIntervalSeconds"]) if (state[key] !== undefined) out.push(key);
  return out;
}
