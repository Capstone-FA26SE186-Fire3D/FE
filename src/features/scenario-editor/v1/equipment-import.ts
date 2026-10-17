import type { EquipmentCandidate } from "@/features/buildings/types";

import { makeSetPatch, type Patch } from "../store/commands";
import type { Json, JsonObject } from "../store/json";
import { findCapability, type RuntimeOption } from "./catalog";
import { KIND_META, LIMITS } from "./contract";
import type { V1Command, V1Selection } from "./commands";
import type { GeometryInfo } from "./geometry";
import { IDENTITY_QUATERNION, roundQuaternion, round3, yawToQuaternion } from "./matrix";
import { readObjects } from "./state";

/**
 * Equipment the OrganizationUser Confirmed/Retyped on the revision (`GET /api/revisions/{id}/equipment-candidates`, BE
 * `docs/ifc-equipment-candidates.md`) turned into `Equipment` objects of `fet3d.editor/1`: `anchorId` = `ifcGlobalId`,
 * `capability` = the decided `catalogKey` at the version of the draft's runtime, placement from `floorId`/`position`/`rotationY`
 * (floor-local metres, degrees about Y). The capability schema has no defaults, so `parameters` are never invented: required
 * ones are listed for the author to fill. A `suggestedDecision` from an earlier revision is never applied, and a candidate
 * whose GlobalId already anchors an Equipment object is skipped.
 */

export type ImportSkip =
  | "not-decided" | "rejected" | "present" | "duplicate" | "capability-missing" | "anchor-missing" | "floor-missing" | "floor-mismatch" | "position-invalid" | "limit";

export type ImportRow =
  | { status: "add"; candidate: EquipmentCandidate; object: JsonObject; catalogKey: string; floorId: string; requiredParameters: string[] }
  | { status: "skip"; candidate: EquipmentCandidate; reason: ImportSkip; catalogKey: string | null };

export type ImportPlan = {
  /** Why nothing can be planned at all; the rows are then empty. */
  blocked: "runtime" | "geometry" | null;
  rows: ImportRow[];
};

export const SKIP_LABEL: Record<ImportSkip, string> = {
  "not-decided": "Chưa có quyết định (đề xuất từ revision trước không được tự áp dụng)",
  rejected: "Đã loại bỏ",
  present: "Đã có trong bản nháp (cùng cấu kiện neo)",
  duplicate: "Trùng GlobalId với thiết bị khác trong danh sách",
  "capability-missing": "Runtime của bản nháp không có năng lực này cho Thiết bị",
  "anchor-missing": "Geometry không có GlobalId này trong semantic mapping",
  "floor-missing": "Không xác định được tầng",
  "floor-mismatch": "Tầng của thiết bị khác tầng của cấu kiện trong Geometry",
  "position-invalid": "Tọa độ không hợp lệ",
  limit: `Bản nháp đã đạt tối đa ${LIMITS.objectsMax} đối tượng`,
};

/** The decided capability id: Retyped and Confirmed may carry a new one; Confirmed without one keeps the detected key. */
export function decidedKey(candidate: EquipmentCandidate): string | null {
  const decision = candidate.decision;
  if (!decision || (decision.decision !== "Confirmed" && decision.decision !== "Retyped")) return null;
  return decision.catalogKey || (decision.decision === "Confirmed" ? candidate.catalogKey : null);
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function planEquipmentImport({ draft, candidates, runtime, geometry }: { draft: JsonObject; candidates: EquipmentCandidate[]; runtime: RuntimeOption | undefined; geometry: GeometryInfo | null }): ImportPlan {
  if (!geometry) return { blocked: "geometry", rows: [] };
  if (!runtime) return { blocked: "runtime", rows: [] };
  const objects = readObjects(draft);
  const anchored = new Set(objects.filter((object) => object.kind === "Equipment" && object.anchorId).map((object) => object.anchorId!));
  const usedIds = new Set(objects.map((object) => object.id));
  const seen = new Set<string>();
  let room = LIMITS.objectsMax - objects.length;
  let n = 0;
  const nextId = () => {
    for (;;) {
      const id = `${KIND_META.Equipment.idPrefix}-${++n}`;
      if (!usedIds.has(id)) { usedIds.add(id); return id; }
    }
  };

  const rows = candidates.map((candidate): ImportRow => {
    const key = decidedKey(candidate);
    const skip = (reason: ImportSkip): ImportRow => ({ status: "skip", candidate, reason, catalogKey: key });
    if (candidate.decision?.decision === "Rejected") return skip("rejected");
    if (!key) return skip("not-decided");
    if (anchored.has(candidate.ifcGlobalId)) return skip("present");
    if (seen.has(candidate.ifcGlobalId)) return skip("duplicate");
    const capability = findCapability(runtime, key);
    if (!capability || !capability.objectKinds.includes("Equipment")) return skip("capability-missing");
    const entry = geometry.semantic.find((item) => item.ifcGlobalId === candidate.ifcGlobalId);
    if (!entry) return skip("anchor-missing");
    const floorId = candidate.floorId || entry.floorId;
    if (!floorId || !geometry.floors.some((floor) => floor.id === floorId)) return skip("floor-missing");
    if (floorId !== entry.floorId) return skip("floor-mismatch");
    const [x, y, z] = candidate.position ?? [];
    if (!finite(x) || !finite(y) || !finite(z) || [x, y, z].some((value) => Math.abs(value) > LIMITS.positionAbs)) return skip("position-invalid");
    if (room <= 0) return skip("limit");
    room -= 1;
    seen.add(candidate.ifcGlobalId);
    const rotation = finite(candidate.rotationY) ? roundQuaternion(yawToQuaternion(candidate.rotationY)) : IDENTITY_QUATERNION;
    const object: JsonObject = {
      id: nextId(),
      kind: "Equipment",
      placement: { floorId, position: { x: round3(x), y: round3(y), z: round3(z) }, rotation: { ...rotation } },
      anchorId: candidate.ifcGlobalId,
      capability: { id: capability.id, version: capability.version },
    };
    return { status: "add", candidate, object, catalogKey: key, floorId, requiredParameters: capability.fields.filter((field) => field.required).map((field) => field.name) };
  });
  return { blocked: null, rows };
}

/** All planned objects as ONE undoable entry; the first added object is selected. Null when nothing is added. */
export function importEquipmentCommand(draft: JsonObject, id: number, added: JsonObject[], now: number, selectBefore: V1Selection): V1Command | null {
  if (added.length === 0) return null;
  const current = Array.isArray(draft.objects) ? draft.objects : null;
  const start = current ? current.length : 0;
  const patches: Patch[] = [];
  if (!current) {
    const create = makeSetPatch(draft, ["objects"], []);
    if (create) patches.push(create);
  }
  added.forEach((value, offset) => patches.push({ op: "insert", path: ["objects"], index: start + offset, value: value as Json }));
  return {
    id, at: now, patches, label: `Thêm ${added.length} thiết bị đã xác nhận`,
    selectBefore, selectAfter: { kind: "object", index: start },
  };
}
