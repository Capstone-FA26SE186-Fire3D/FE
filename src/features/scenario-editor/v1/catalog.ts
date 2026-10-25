import { isObject, type Json } from "../store/json";
import { ID_PATTERN, OBJECT_KINDS, SEMVER_PATTERN, type ObjectKind } from "./contract";

/**
 * Runtime capability catalog (`GET /api/scenario-interactions/catalog`) and rubric catalog
 * (`GET /api/scenario-rubrics/catalog`). The server publishes only contracts that pass the capability schema; this parser
 * still ignores anything malformed instead of guessing. Nothing is seeded: an empty catalog means the operator has not
 * published a runtime/capability yet, and the UI says so.
 */

export type ParameterType = "number" | "integer" | "string" | "boolean";

export type ParameterField = {
  name: string;
  type: ParameterType;
  required: boolean;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  enum?: Json[];
  description?: string;
};

export type CapabilityOption = {
  id: string;
  version: string;
  objectKinds: ObjectKind[];
  description?: string;
  /** Parameter fields of the closed schema; empty means the capability accepts no parameters. */
  fields: ParameterField[];
};

export type RuntimeOption = { runtimeVersion: string; protocolVersion: string; capabilities: CapabilityOption[] };

const isKind = (value: unknown): value is ObjectKind => typeof value === "string" && (OBJECT_KINDS as readonly string[]).includes(value);

function parseField(name: string, raw: unknown, required: boolean): ParameterField | null {
  if (!isObject(raw) || !ID_PATTERN.test(name)) return null;
  const type = raw.type;
  if (type !== "number" && type !== "integer" && type !== "string" && type !== "boolean") return null;
  const field: ParameterField = { name, type, required };
  if (typeof raw.minimum === "number") field.minimum = raw.minimum;
  if (typeof raw.maximum === "number") field.maximum = raw.maximum;
  if (typeof raw.maxLength === "number") field.maxLength = raw.maxLength;
  if (Array.isArray(raw.enum) && raw.enum.length > 0) field.enum = raw.enum as Json[];
  if (typeof raw.description === "string") field.description = raw.description;
  return field;
}

function parseCapability(id: string, raw: unknown): CapabilityOption | null {
  if (!ID_PATTERN.test(id) || !isObject(raw)) return null;
  if (typeof raw.version !== "string" || !SEMVER_PATTERN.test(raw.version)) return null;
  if (!Array.isArray(raw.objectKinds) || raw.objectKinds.length === 0 || !raw.objectKinds.every(isKind)) return null;
  const fields: ParameterField[] = [];
  if (raw.parameters !== undefined && raw.parameters !== null) {
    const schema = raw.parameters;
    if (!isObject(schema) || schema.type !== "object" || !isObject(schema.properties)) return null;
    const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
    for (const [name, prop] of Object.entries(schema.properties)) {
      const field = parseField(name, prop, required.has(name));
      if (!field) return null;
      fields.push(field);
    }
  }
  return { id, version: raw.version, objectKinds: raw.objectKinds as ObjectKind[], ...(typeof raw.description === "string" ? { description: raw.description } : {}), fields };
}

export function parseRuntimeCatalog(raw: unknown): RuntimeOption[] {
  if (!Array.isArray(raw)) return [];
  const runtimes: RuntimeOption[] = [];
  for (const entry of raw) {
    if (!isObject(entry) || typeof entry.runtimeVersion !== "string" || !SEMVER_PATTERN.test(entry.runtimeVersion)) continue;
    const listed = new Set(Array.isArray(entry.capabilities) ? entry.capabilities.filter((item): item is string => typeof item === "string") : []);
    const capabilities: CapabilityOption[] = [];
    if (isObject(entry.capabilityContracts)) {
      for (const [id, contract] of Object.entries(entry.capabilityContracts)) {
        if (!listed.has(id)) continue;
        const parsed = parseCapability(id, contract);
        if (parsed) capabilities.push(parsed);
      }
    }
    runtimes.push({ runtimeVersion: entry.runtimeVersion, protocolVersion: typeof entry.protocolVersion === "string" ? entry.protocolVersion : "", capabilities });
  }
  return runtimes;
}

export function findRuntime(runtimes: RuntimeOption[], version: string | undefined): RuntimeOption | undefined {
  return version ? runtimes.find((runtime) => runtime.runtimeVersion === version) : undefined;
}

/** Capabilities of a runtime that accept `kind` objects. */
export function capabilitiesForKind(runtime: RuntimeOption | undefined, kind: ObjectKind): CapabilityOption[] {
  return runtime ? runtime.capabilities.filter((capability) => capability.objectKinds.includes(kind)) : [];
}

export function findCapability(runtime: RuntimeOption | undefined, id: string | undefined): CapabilityOption | undefined {
  return runtime && id ? runtime.capabilities.find((capability) => capability.id === id) : undefined;
}

// ───────── parameter validation (advisory mirror of `ParameterSchema.ValidateValue`; the server is authoritative) ─────────

export type ParameterProblem = { code: string; name: string; message: string };

/**
 * Checks a `parameters` object against a capability's closed schema, with the BE's codes: `FIELD_REQUIRED`,
 * `FIELD_UNKNOWN`, `TYPE_INVALID`/`NUMBER_INVALID`/`INTEGER_INVALID`, `STRING_INVALID`, `PARAMETER_OUT_OF_RANGE`,
 * `PARAMETER_NOT_ALLOWED`, `PARAMETERS_NOT_ALLOWED` (no capability schema but values present).
 */
export function validateParameters(capability: CapabilityOption | undefined, value: unknown): ParameterProblem[] {
  const out: ParameterProblem[] = [];
  const values = isObject(value) ? value : {};
  if (value !== undefined && value !== null && !isObject(value)) return [{ code: "TYPE_INVALID", name: "", message: "Tham số phải là một đối tượng." }];
  if (!capability || capability.fields.length === 0) {
    if (Object.keys(values).length > 0) out.push({ code: "PARAMETERS_NOT_ALLOWED", name: "", message: "Đối tượng này không có lược đồ tham số; hãy xóa các tham số." });
    return out;
  }
  const known = new Map(capability.fields.map((field) => [field.name, field]));
  for (const key of Object.keys(values)) if (!known.has(key)) out.push({ code: "FIELD_UNKNOWN", name: key, message: "Tham số không có trong khả năng đã chọn." });
  for (const field of capability.fields) {
    const item = values[field.name];
    if (item === undefined) {
      if (field.required) out.push({ code: "FIELD_REQUIRED", name: field.name, message: "Năng lực này yêu cầu tham số." });
      continue;
    }
    if (field.type === "number" || field.type === "integer") {
      if (typeof item !== "number" || !Number.isFinite(item)) { out.push({ code: field.type === "integer" ? "INTEGER_INVALID" : "NUMBER_INVALID", name: field.name, message: field.type === "integer" ? "Phải là số nguyên." : "Phải là số hữu hạn." }); continue; }
      if (field.type === "integer" && !Number.isInteger(item)) { out.push({ code: "INTEGER_INVALID", name: field.name, message: "Phải là số nguyên." }); continue; }
      if ((field.minimum !== undefined && item < field.minimum) || (field.maximum !== undefined && item > field.maximum)) {
        out.push({ code: "PARAMETER_OUT_OF_RANGE", name: field.name, message: rangeMessage(field) });
        continue;
      }
    } else if (field.type === "string") {
      if (typeof item !== "string") { out.push({ code: "TYPE_INVALID", name: field.name, message: "Phải là chuỗi." }); continue; }
      if (item.trim().length === 0 || item.length > (field.maxLength ?? 10_000)) { out.push({ code: "STRING_INVALID", name: field.name, message: `Dùng 1–${field.maxLength ?? 10_000} ký tự.` }); continue; }
    } else if (typeof item !== "boolean") {
      out.push({ code: "TYPE_INVALID", name: field.name, message: "Phải là đúng/sai." });
      continue;
    }
    if (field.enum && !field.enum.some((option) => option === item)) out.push({ code: "PARAMETER_NOT_ALLOWED", name: field.name, message: "Giá trị không nằm trong danh sách khả năng này cho phép." });
  }
  return out;
}

export function rangeMessage(field: Pick<ParameterField, "minimum" | "maximum">): string {
  if (field.minimum !== undefined && field.maximum !== undefined) return `Phải từ ${field.minimum} đến ${field.maximum}.`;
  if (field.minimum !== undefined) return `Phải từ ${field.minimum} trở lên.`;
  return `Phải không quá ${field.maximum}.`;
}

// ───────── rubric catalog ─────────

export type RubricMetric = { id: string; description: string };
export type RubricCatalogView = {
  supportedSchemaVersions: string[];
  defaultSchemaVersion: string;
  metrics: RubricMetric[];
  operators: string[];
  maxCriteria: number;
  idMaxLength: number;
  descriptionMaxLength: number;
};

export function parseRubricCatalog(raw: unknown): RubricCatalogView | null {
  if (!isObject(raw) || !Array.isArray(raw.metrics) || !Array.isArray(raw.supportedSchemaVersions) || typeof raw.defaultSchemaVersion !== "string") return null;
  const metrics = raw.metrics.flatMap((item): RubricMetric[] => (isObject(item) && typeof item.id === "string" && ID_PATTERN.test(item.id) ? [{ id: item.id, description: typeof item.description === "string" ? item.description : "" }] : []));
  const criterion = isObject(raw.criterion) ? raw.criterion : {};
  return {
    supportedSchemaVersions: raw.supportedSchemaVersions.filter((item): item is string => typeof item === "string"),
    defaultSchemaVersion: raw.defaultSchemaVersion,
    metrics,
    operators: Array.isArray(raw.operators) ? raw.operators.filter((item): item is string => typeof item === "string") : [],
    maxCriteria: typeof raw.maxCriteria === "number" ? raw.maxCriteria : 100,
    idMaxLength: typeof criterion.idMaxLength === "number" ? criterion.idMaxLength : 128,
    descriptionMaxLength: typeof criterion.descriptionMaxLength === "number" ? criterion.descriptionMaxLength : 1_000,
  };
}
