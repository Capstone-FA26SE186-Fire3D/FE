import { isObject } from "../store/json";
import { IFC_GLOBAL_ID_PATTERN, ID_PATTERN, SCHEMA_VERSION, SHA256_PATTERN, UUID_PATTERN, type GeometryPin } from "./contract";
import { isMatrix16, matrixProblem } from "./matrix";

/**
 * Geometry metadata the editor needs, read from `GET /api/buildings/{id}/editor-preview` (model + semantic mapping) or
 * `GET /api/revisions/{id}/floors` (pin + floors, no S3). The BE only returns coordinates when the artifact's metadata
 * passes `fet3d.editor/1`; a legacy artifact is `ReprocessRequired` with no coordinates and no URL. This parser
 * re-checks the shape defensively and never invents a floor, mapping or transform.
 */

export type FloorV1 = { id: string; name: string; elevationMeters: number; ifcGlobalId?: string; transform: number[] };
export type SemanticEntry = { ifcGlobalId: string; nodeId: string; floorId: string; semanticType: string };

export type GeometryInfo = {
  artifactId: string;
  sha256Hash: string;
  /** IFC to GLB. Display and checks only. */
  coordinateTransform: number[];
  floors: FloorV1[];
  semantic: SemanticEntry[];
};

export type GeometryReading =
  | { kind: "valid"; info: GeometryInfo }
  /** No accepted Geometry artifact yet (or the stored object cannot be confirmed). */
  | { kind: "not-ready" }
  /** An artifact exists but its metadata is legacy or fails the contract: re-run IFC processing. */
  | { kind: "reprocess" }
  /** The server said Ready but the payload does not satisfy the contract: treated as unusable, never guessed. */
  | { kind: "invalid"; reason: string };

type PreviewLike = {
  status?: string | null;
  artifactId?: string | null;
  sha256Hash?: string | null;
  coordinateTransform?: unknown;
  floors?: unknown;
  semanticMapping?: unknown;
  schemaVersion?: string | null;
  units?: string | null;
  upAxis?: string | null;
  handedness?: string | null;
};

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function parseFloorsV1(raw: unknown): { floors: FloorV1[]; problem: string | null } {
  if (!Array.isArray(raw) || raw.length === 0) return { floors: [], problem: "Mô hình chưa kèm danh sách tầng." };
  const floors: FloorV1[] = [];
  const ids = new Set<string>();
  for (const [index, item] of raw.entries()) {
    if (!isObject(item)) return { floors: [], problem: `Tầng #${index + 1} không đúng dạng.` };
    const { id, name, elevationMeters, ifcGlobalId, transform } = item;
    if (typeof id !== "string" || !ID_PATTERN.test(id) || ids.has(id)) return { floors: [], problem: `Tầng #${index + 1} có mã không hợp lệ hoặc trùng.` };
    if (!text(name)) return { floors: [], problem: `Tầng ${id} thiếu tên.` };
    if (typeof elevationMeters !== "number" || !Number.isFinite(elevationMeters)) return { floors: [], problem: `Tầng ${id} thiếu cao độ.` };
    const problem = matrixProblem(transform);
    if (problem) return { floors: [], problem: `Tầng ${id}: ${problem}` };
    if (ifcGlobalId !== undefined && ifcGlobalId !== null && (typeof ifcGlobalId !== "string" || !IFC_GLOBAL_ID_PATTERN.test(ifcGlobalId))) return { floors: [], problem: `Tầng ${id} có IFC GlobalId không hợp lệ.` };
    ids.add(id);
    floors.push({ id, name: name as string, elevationMeters, ...(typeof ifcGlobalId === "string" ? { ifcGlobalId } : {}), transform: transform as number[] });
  }
  return { floors, problem: null };
}

export function parseSemanticMapping(raw: unknown, floorIds: ReadonlySet<string>): { entries: SemanticEntry[]; problem: string | null } {
  if (!Array.isArray(raw)) return { entries: [], problem: "Mô hình chưa kèm ánh xạ ngữ nghĩa." };
  const entries: SemanticEntry[] = [];
  for (const [index, item] of raw.entries()) {
    if (!isObject(item) || typeof item.ifcGlobalId !== "string" || !IFC_GLOBAL_ID_PATTERN.test(item.ifcGlobalId) || !text(item.nodeId) || typeof item.floorId !== "string" || !text(item.semanticType)) {
      return { entries: [], problem: `Ánh xạ ngữ nghĩa #${index + 1} không đúng dạng.` };
    }
    if (!floorIds.has(item.floorId)) return { entries: [], problem: `Ánh xạ ngữ nghĩa #${index + 1} trỏ tới tầng không có.` };
    entries.push({ ifcGlobalId: item.ifcGlobalId, nodeId: item.nodeId as string, floorId: item.floorId, semanticType: item.semanticType as string });
  }
  return { entries, problem: null };
}

export function parseGeometry(preview: PreviewLike | null | undefined): GeometryReading {
  if (!preview) return { kind: "not-ready" };
  if (preview.status === "ReprocessRequired") return { kind: "reprocess" };
  if (!preview.artifactId || !preview.sha256Hash || preview.floors == null || preview.coordinateTransform == null) {
    // NotReady (no accepted artifact), or Ready without data: there is nothing to pin or place against.
    return preview.status === "Ready" ? { kind: "invalid", reason: "Máy chủ báo Ready nhưng thiếu artifact, hash hoặc dữ liệu tọa độ." } : { kind: "not-ready" };
  }
  if (!UUID_PATTERN.test(preview.artifactId)) return { kind: "invalid", reason: "Mã artifact Geometry không phải UUID." };
  if (!SHA256_PATTERN.test(preview.sha256Hash)) return { kind: "invalid", reason: "Hash SHA-256 của artifact không hợp lệ." };
  if (preview.schemaVersion && preview.schemaVersion !== SCHEMA_VERSION) return { kind: "invalid", reason: `Geometry khai báo schemaVersion ${preview.schemaVersion}, editor chỉ hỗ trợ ${SCHEMA_VERSION}.` };
  if ((preview.units && preview.units !== "m") || (preview.upAxis && preview.upAxis !== "Y") || (preview.handedness && preview.handedness !== "right")) {
    return { kind: "invalid", reason: "Geometry không dùng hệ tọa độ mét, Y-up, tay phải của contract." };
  }
  if (!isMatrix16(preview.coordinateTransform)) return { kind: "invalid", reason: `coordinateTransform: ${matrixProblem(preview.coordinateTransform)}` };
  const { floors, problem } = parseFloorsV1(preview.floors);
  if (problem) return { kind: "invalid", reason: problem };
  // The mapping is optional for pinning/placing (anchors need it); a malformed one is reported, an absent one means no anchors.
  let semantic: SemanticEntry[] = [];
  if (preview.semanticMapping != null) {
    const parsed = parseSemanticMapping(preview.semanticMapping, new Set(floors.map((floor) => floor.id)));
    if (parsed.problem) return { kind: "invalid", reason: parsed.problem };
    semantic = parsed.entries;
  }
  return { kind: "valid", info: { artifactId: preview.artifactId, sha256Hash: preview.sha256Hash, coordinateTransform: preview.coordinateTransform, floors, semantic } };
}

/** The pin written to `geometry` in the draft. */
export function pinOf(info: Pick<GeometryInfo, "artifactId" | "sha256Hash">): GeometryPin {
  return { artifactId: info.artifactId, sha256Hash: info.sha256Hash };
}

/** Anchor candidates for one floor, by IFC GlobalId, ordered by semantic type then node name. */
export function anchorsForFloor(info: GeometryInfo | null, floorId: string | undefined): SemanticEntry[] {
  if (!info || !floorId) return [];
  return info.semantic.filter((entry) => entry.floorId === floorId).sort((a, b) => a.semanticType.localeCompare(b.semanticType) || a.nodeId.localeCompare(b.nodeId));
}

export function floorOf(info: GeometryInfo | null, floorId: string | undefined): FloorV1 | undefined {
  return info?.floors.find((floor) => floor.id === floorId);
}

/** Result of `GET /api/revisions/{id}/floors`: enough to pin Geometry and list floors without touching storage. */
export type FloorsReading =
  | { kind: "valid"; pin: GeometryPin; floors: FloorV1[] }
  | { kind: "not-ready" }
  | { kind: "reprocess" }
  | { kind: "invalid"; reason: string };

export function parseFloorsResponse(response: { status?: string | null; artifactId?: string | null; sha256Hash?: string | null; schemaVersion?: string | null; floors?: unknown } | null | undefined): FloorsReading {
  if (!response) return { kind: "not-ready" };
  if (response.status === "ReprocessRequired") return { kind: "reprocess" };
  if (response.status !== "Ready") return { kind: "not-ready" };
  if (!response.artifactId || !UUID_PATTERN.test(response.artifactId) || !response.sha256Hash || !SHA256_PATTERN.test(response.sha256Hash)) return { kind: "invalid", reason: "Thiếu artifact hoặc hash SHA-256 hợp lệ để ghim Geometry." };
  if (response.schemaVersion && response.schemaVersion !== SCHEMA_VERSION) return { kind: "invalid", reason: `Geometry khai báo schemaVersion ${response.schemaVersion}.` };
  const { floors, problem } = parseFloorsV1(response.floors);
  if (problem) return { kind: "invalid", reason: problem };
  return { kind: "valid", pin: { artifactId: response.artifactId, sha256Hash: response.sha256Hash }, floors };
}
