import { ApiError } from "@/api/types/common";
import { capabilityName } from "@/configs/capability-labels";

/**
 * View model of the PlatformAdmin runtime catalog (`/api/admin/runtime-catalog`). A row is one registered version of the
 * training program inside the app ("runtime"): its capabilities and their contracts. A registered row never changes
 * except `isActive`. Everything here is pure so it can be tested without a page.
 */

export type RuntimeEvent = { type: string; description: string | null; metric: string | null };
export type RuntimeAction = { id: string; event: string | null };
export type CapabilityContract = { version: string; objectKinds: string[]; description: string | null; events: RuntimeEvent[]; actions: RuntimeAction[] };

export type RuntimeCatalogEntry = {
  id: string;
  runtimeVersion: string;
  protocolVersion: string;
  manifestSchemaVersion: string;
  capabilities: string[];
  capabilityContracts: Record<string, CapabilityContract>;
  isActive: boolean;
  createdAt: string;
};

/** POST body: the same shape as `Tools/RuntimeCatalog/runtime-<version>.json` of the Unity repo. */
export type RuntimeRegistration = {
  runtimeVersion: string;
  protocolVersion: string;
  manifestSchemaVersion: string;
  capabilities: string[];
  capabilityContracts?: Record<string, unknown>;
  isActive: boolean;
};

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown) => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

function parseContract(raw: unknown): CapabilityContract | null {
  if (!isRecord(raw)) return null;
  const events = (Array.isArray(raw.events) ? raw.events : []).flatMap((item): RuntimeEvent[] => (isRecord(item) && str(item.type) ? [{ type: str(item.type), description: strOrNull(item.description), metric: strOrNull(item.metric) }] : []));
  const actions = (Array.isArray(raw.actions) ? raw.actions : []).flatMap((item): RuntimeAction[] => (isRecord(item) && str(item.id) ? [{ id: str(item.id), event: strOrNull(item.event) }] : []));
  return { version: str(raw.version), objectKinds: strings(raw.objectKinds), description: strOrNull(raw.description), events, actions };
}

export function parseRuntimeEntry(raw: unknown): RuntimeCatalogEntry | null {
  if (!isRecord(raw) || !str(raw.id) || !str(raw.runtimeVersion)) return null;
  const contracts: Record<string, CapabilityContract> = {};
  if (isRecord(raw.capabilityContracts)) for (const [id, value] of Object.entries(raw.capabilityContracts)) { const contract = parseContract(value); if (contract) contracts[id] = contract; }
  return {
    id: str(raw.id), runtimeVersion: str(raw.runtimeVersion), protocolVersion: str(raw.protocolVersion), manifestSchemaVersion: str(raw.manifestSchemaVersion),
    capabilities: strings(raw.capabilities), capabilityContracts: contracts, isActive: raw.isActive === true, createdAt: str(raw.createdAt),
  };
}

const semverParts = (version: string) => version.split(".").map((part) => Number(part));

/** Newest first, as the API already sends them; sorted again so a reload never shuffles rows (registration time, then version). */
export function sortEntries(entries: RuntimeCatalogEntry[]): RuntimeCatalogEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
    if (byDate) return byDate;
    const [x, y] = [semverParts(a.runtimeVersion), semverParts(b.runtimeVersion)];
    for (let i = 0; i < 3; i++) if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    return 0;
  });
}

// Same rules the server applies (runtime_catalog_gate), so most mistakes are shown before anything is sent.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CAPABILITY_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

export type RuntimeFileSummary = { runtimeVersion: string; protocolVersion: string; manifestSchemaVersion: string; capabilityCount: number; contractCount: number; fileAsksActive: boolean };
export type RuntimeFileResult =
  | { ok: true; payload: RuntimeRegistration; summary: RuntimeFileSummary }
  | { ok: false; problems: string[] };

/**
 * Reads a dropped payload file. The switch "Kích hoạt ngay" is separate from the file: whatever `isActive` the file has,
 * the registration starts OFF until the admin turns it on (`withActive`).
 */
export function parseRuntimeFile(text: string): RuntimeFileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, problems: ["Tệp không đọc được. Hãy chọn đúng tệp phiên bản (runtime-<phiên bản>.json) xuất từ dự án Unity, không sửa tay."] };
  }
  if (!isRecord(raw)) return { ok: false, problems: ["Tệp không có nội dung phiên bản. Hãy chọn đúng tệp runtime-<phiên bản>.json."] };

  const problems: string[] = [];
  const runtimeVersion = str(raw.runtimeVersion).trim();
  const protocolVersion = str(raw.protocolVersion).trim();
  const manifestSchemaVersion = str(raw.manifestSchemaVersion).trim();
  if (!SEMVER.test(runtimeVersion) || runtimeVersion.length > 32) problems.push("Số phiên bản phải có dạng 3 số cách nhau bằng dấu chấm, ví dụ 2.2.0.");
  if (!protocolVersion || protocolVersion.length > 50) problems.push("Thiếu phiên bản giao thức kết nối (tối đa 50 ký tự).");
  if (!manifestSchemaVersion || manifestSchemaVersion.length > 50) problems.push("Thiếu phiên bản định dạng gói bài (tối đa 50 ký tự).");

  const capabilities: string[] = [];
  if (!Array.isArray(raw.capabilities)) problems.push("Thiếu danh sách năng lực.");
  else {
    const bad = raw.capabilities.filter((item) => typeof item !== "string" || !CAPABILITY_ID.test(item));
    if (bad.length) problems.push(`${bad.length} năng lực có mã không hợp lệ (chỉ gồm chữ không dấu, số và . _ : -, tối đa 128 ký tự).`);
    for (const item of raw.capabilities) if (typeof item === "string") capabilities.push(item);
    const seen = new Set<string>();
    const dup = capabilities.filter((item) => (seen.has(item) ? true : (seen.add(item), false)));
    if (dup.length) problems.push(`Năng lực bị lặp: ${[...new Set(dup)].map(capabilityName).join(", ")}.`);
  }

  let capabilityContracts: Record<string, unknown> | undefined;
  if (raw.capabilityContracts !== undefined && raw.capabilityContracts !== null) {
    if (!isRecord(raw.capabilityContracts)) problems.push("Phần mô tả năng lực phải là một nhóm theo từng năng lực.");
    else {
      capabilityContracts = raw.capabilityContracts;
      const orphans = Object.keys(capabilityContracts).filter((id) => !capabilities.includes(id));
      if (orphans.length) problems.push(`Có mô tả cho năng lực không nằm trong danh sách: ${orphans.map(capabilityName).join(", ")}.`);
    }
  }
  if (raw.isActive !== undefined && typeof raw.isActive !== "boolean") problems.push("Trường bật/tắt trong tệp phải là đúng hoặc sai.");

  if (problems.length) return { ok: false, problems };
  const payload: RuntimeRegistration = { runtimeVersion, protocolVersion, manifestSchemaVersion, capabilities, ...(capabilityContracts ? { capabilityContracts } : {}), isActive: false };
  return {
    ok: true, payload,
    summary: { runtimeVersion, protocolVersion, manifestSchemaVersion, capabilityCount: capabilities.length, contractCount: capabilityContracts ? Object.keys(capabilityContracts).length : 0, fileAsksActive: raw.isActive === true },
  };
}

export const withActive = (payload: RuntimeRegistration, isActive: boolean): RuntimeRegistration => ({ ...payload, isActive });

const PART_NAMES: Record<string, string> = {
  runtimeVersion: "Số phiên bản", protocolVersion: "Phiên bản giao thức", manifestSchemaVersion: "Phiên bản định dạng gói bài", capabilities: "Danh sách năng lực",
  capabilityContracts: "Mô tả năng lực", version: "Phiên bản mô tả", objectKinds: "Loại đối tượng", description: "Mô tả", parameters: "Thông số",
  events: "Sự kiện", actions: "Thao tác", payload: "Dữ liệu sự kiện", type: "Tên sự kiện", metric: "Chỉ số chấm điểm", isActive: "Bật/tắt",
};

/**
 * Plain name of a server JSONPath. Capability ids contain dots (`alarm.call_point`), so the id is matched against the
 * capabilities of the payload (longest first) instead of splitting on dots:
 * `$.capabilityContracts.alarm.call_point.events[0].metric` → "Nút báo cháy · Sự kiện 1 · Chỉ số chấm điểm".
 */
export function runtimeFieldLabel(path: string, capabilities: string[] = []): string {
  let rest = path.replace(/^\$\.?/, "");
  const parts: string[] = [];
  if (rest.startsWith("capabilityContracts.")) {
    rest = rest.slice("capabilityContracts.".length);
    const id = [...capabilities].sort((a, b) => b.length - a.length).find((candidate) => rest === candidate || rest.startsWith(`${candidate}.`) || rest.startsWith(`${candidate}[`));
    if (id) { parts.push(`Năng lực “${capabilityName(id)}”`); rest = rest.slice(id.length).replace(/^\./, ""); }
    else { parts.push("Mô tả năng lực"); rest = ""; }
  }
  for (const match of rest.matchAll(/([A-Za-z_]+)(?:\[(\d+)\])?/g)) {
    const [, name, index] = match;
    const label = PART_NAMES[name];
    if (label) parts.push(index !== undefined ? `${label} ${Number(index) + 1}` : label);
  }
  if (parts.length === 0) return "Nội dung tệp";
  return parts.slice(0, 1).concat(parts.slice(1).slice(-2)).join(" · ");
}

/** The server writes these messages in English; the common ones are said again in plain Vietnamese. */
function plainMessage(serverMessage: string, translated: string): string {
  const text = serverMessage.trim();
  if (/^Required\.?$/i.test(text) || /is required/i.test(text)) return "Bắt buộc phải có.";
  if (/must belong to a capability listed/i.test(text)) return "Mô tả này thuộc một năng lực không có trong danh sách năng lực.";
  if (/must be unique/i.test(text)) return "Không được lặp lại.";
  if (/core metric|counts .* events|is declared by/i.test(text)) return "Chỉ số chấm điểm này trùng với một chỉ số đã có của hệ thống hoặc của năng lực khác.";
  if (/conflict/i.test(text)) return "Mâu thuẫn với một năng lực khác trong cùng phiên bản.";
  return translated;
}

export type RuntimeIssue = { field: string; message: string };
export type RuntimeErrorView = { kind: "exists" | "invalid" | "notFound" | "denied" | "retry"; title: string; message: string; issues: RuntimeIssue[] };

/** A failed register/activate call as the screen says it. `capabilities` lets field paths name the capability. */
export function describeRuntimeError(error: unknown, capabilities: string[] = []): RuntimeErrorView {
  if (!(error instanceof ApiError)) return { kind: "retry", title: "Không kết nối được tới máy chủ", message: "Chưa có gì được ghi. Kiểm tra mạng rồi thử lại.", issues: [] };
  if (error.status === 409 || error.code === "RUNTIME_VERSION_EXISTS") return { kind: "exists", title: "Phiên bản này đã đăng ký rồi", message: "Mỗi phiên bản chỉ đăng ký một lần và không sửa được. Nếu cần thay đổi, hãy xuất tệp với số phiên bản mới.", issues: [] };
  if (error.status === 400 || error.status === 422) {
    const raw = isRecord(error.payload?.errors) ? (error.payload!.errors as Json) : {};
    const issues: RuntimeIssue[] = [];
    error.fieldErrors.forEach((field, index) => {
      const serverMessages = raw[field.path];
      const server = Array.isArray(serverMessages) ? serverMessages.filter((item) => typeof item === "string") : [];
      const count = error.fieldErrors.slice(0, index).filter((item) => item.path === field.path).length;
      issues.push({ field: runtimeFieldLabel(field.path, capabilities), message: plainMessage(String(server[count] ?? ""), field.message) });
    });
    return { kind: "invalid", title: "Nội dung tệp chưa hợp lệ", message: issues.length ? "Máy chủ từ chối các điểm dưới đây. Sửa trong dự án Unity, xuất lại tệp rồi đăng ký lại." : "Máy chủ từ chối tệp (số phiên bản, giao thức, định dạng hoặc danh sách năng lực sai). Xuất lại tệp từ dự án Unity rồi thử lại.", issues };
  }
  if (error.status === 404) return { kind: "notFound", title: "Không tìm thấy phiên bản", message: "Phiên bản này không còn trong danh sách. Danh sách đã được tải lại.", issues: [] };
  if (error.status === 401) return { kind: "denied", title: "Phiên đăng nhập đã hết hạn", message: "Đăng nhập lại rồi thử lại.", issues: [] };
  if (error.status === 403) return { kind: "denied", title: "Không có quyền", message: "Chỉ quản trị FET3D được quản lý phiên bản chương trình mô phỏng.", issues: [] };
  return { kind: "retry", title: "Không thể hoàn tất", message: error.status >= 500 ? "Máy chủ đang gặp lỗi. Thử lại sau ít phút." : error.message, issues: [] };
}
