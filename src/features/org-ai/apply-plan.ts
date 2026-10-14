import { applyPatch, makeSetPatch, type Command, type Patch } from "@/features/scenario-editor/store/commands";
import { deepEqual, isObject, type Json, type JsonObject } from "@/features/scenario-editor/store/json";
import { ID_PATTERN, LIMITS, OBJECT_KINDS, SCHEMA_VERSION } from "@/features/scenario-editor/v1/contract";
import { readGeometryPin, readObjects, shapeIssues } from "@/features/scenario-editor/v1/state";
import type { Issue } from "@/features/scenario-editor/store/validation";

/**
 * What can safely move from an AI proposal (`result.draft.state`, `fet3d.editor/1`) into the draft the author has open.
 *
 * Rules (nothing is applied by this module; it only describes and builds ONE undoable editor command):
 * - Fields that are not spatial can be applied one by one. The ones that are product decisions (time limit, mode policy,
 *   rubric/pass threshold, runtime version, seed, replan interval) are never preselected.
 * - The draft's pinned Geometry is never replaced by the proposal.
 * - Spatial `objects[]` are offered only when the proposal pins the SAME Geometry (artifact + hash) as the draft and the
 *   object names a floor of that Geometry; otherwise they stay read-only with the reason.
 * - After the chosen changes, the whole document must still pass the same shape check the BE runs on PUT.
 */

export type PlanField = {
  key: string;
  label: string;
  current: Json | undefined;
  proposed: Json;
  /** True when applying changes the draft. */
  differs: boolean;
  selectable: boolean;
  /** Preselected in the dialog. Product decisions stay off until the author opts in. */
  defaultOn: boolean;
  note?: string;
};

export type PlanObject = { index: number; id: string; kind: string; label: string; floorId: string; anchorId?: string; eligible: boolean; reason?: string; value: Json };

export type ApplyPlan = {
  fields: PlanField[];
  geometry: { proposed: { artifactId: string; sha256Hash: string } | null; current: { artifactId: string; sha256Hash: string } | null; matches: boolean };
  objects: PlanObject[];
  /** Keys of proposal fields the editor does not know; shown read-only, never copied. */
  ignoredKeys: string[];
};

const FIELD_DEFS: Array<{ key: string; label: string; defaultOn: boolean; note?: string }> = [
  { key: "name", label: "Tên kịch bản", defaultOn: true },
  { key: "learningObjectives", label: "Mục tiêu học tập", defaultOn: true },
  { key: "learnerInstructions", label: "Hướng dẫn cho người học", defaultOn: true },
  { key: "timeLimitSeconds", label: "Giới hạn thời gian (giây)", defaultOn: false, note: "Quyết định của tổ chức; chọn có chủ ý." },
  { key: "modePolicy", label: "Chế độ huấn luyện cho phép", defaultOn: false, note: "Quyết định của tổ chức; chọn có chủ ý." },
  { key: "rubric", label: "Rubric và ngưỡng đạt", defaultOn: false, note: "Ngưỡng đạt do tổ chức quyết định; metric được kiểm tra theo catalog sau khi áp dụng." },
  { key: "runtimeVersion", label: "Phiên bản runtime", defaultOn: false, note: "Đổi runtime làm thay đổi năng lực hợp lệ của đối tượng." },
  { key: "randomSeed", label: "Hạt giống ngẫu nhiên", defaultOn: false },
  { key: "replanIntervalSeconds", label: "Chu kỳ lập lại lộ trình (giây)", defaultOn: false },
];

const KNOWN_ROOT = new Set(["schemaVersion", "geometry", "objects", ...FIELD_DEFS.map((field) => field.key)]);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function readPin(value: unknown): { artifactId: string; sha256Hash: string } | null {
  return isObject(value) && typeof value.artifactId === "string" && typeof value.sha256Hash === "string" ? { artifactId: value.artifactId, sha256Hash: value.sha256Hash } : null;
}

/** Proposal is a usable `fet3d.editor/1` document (the BE already shape-checks it; this guards against a different contract). */
export function readProposalState(result: unknown): JsonObject | null {
  const draft = isObject(result) ? (result as JsonObject).draft : undefined;
  const state = isObject(draft) ? (draft as JsonObject).state : undefined;
  return isObject(state) && state.schemaVersion === SCHEMA_VERSION ? state : null;
}

export function readProposalNotes(result: unknown): string | null {
  const draft = isObject(result) ? (result as JsonObject).draft : undefined;
  const notes = isObject(draft) ? (draft as JsonObject).notes : undefined;
  return typeof notes === "string" && notes.trim() ? notes : null;
}

function objectReason(object: JsonObject, existingIds: Set<string>, seen: Set<string>, floorIds: Set<string> | null, geometryMatches: boolean): string | undefined {
  if (!geometryMatches) return "Đề xuất không ghim cùng Geometry với bản nháp này nên tọa độ không áp dụng được.";
  if (!floorIds) return "Chưa có Geometry hợp lệ của bản nháp để kiểm tra tầng.";
  const id = object.id;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return "Mã đối tượng không hợp lệ.";
  if (existingIds.has(id) || seen.has(id)) return "Bản nháp đã có đối tượng cùng mã.";
  if (typeof object.kind !== "string" || !(OBJECT_KINDS as readonly string[]).includes(object.kind)) return "Loại đối tượng không được hỗ trợ.";
  const placement = object.placement;
  if (!isObject(placement)) return "Thiếu vị trí.";
  if (typeof placement.floorId !== "string" || !floorIds.has(placement.floorId)) return "Tầng không có trong Geometry của bản nháp.";
  const position = placement.position;
  const rotation = placement.rotation;
  if (!isObject(position) || !finite(position.x) || !finite(position.y) || !finite(position.z)) return "Tọa độ không hợp lệ.";
  if ([position.x, position.y, position.z].some((value) => Math.abs(value as number) > LIMITS.positionAbs)) return "Tọa độ vượt giới hạn.";
  if (!isObject(rotation) || !finite(rotation.x) || !finite(rotation.y) || !finite(rotation.z) || !finite(rotation.w)) return "Hướng xoay không hợp lệ.";
  return undefined;
}

export function buildApplyPlan(proposal: JsonObject, draft: JsonObject, floorIds: Set<string> | null): ApplyPlan {
  const fields: PlanField[] = [];
  for (const def of FIELD_DEFS) {
    const proposed = proposal[def.key];
    if (proposed === undefined) continue;
    const current = draft[def.key];
    const differs = !deepEqual(current, proposed);
    fields.push({ key: def.key, label: def.label, current, proposed, differs, selectable: differs, defaultOn: def.defaultOn && differs, note: def.note });
  }

  const proposedPin = readPin(proposal.geometry);
  const currentPin = readGeometryPin(draft);
  const matches = Boolean(proposedPin && currentPin && proposedPin.artifactId === currentPin.artifactId && proposedPin.sha256Hash === currentPin.sha256Hash);

  const existingIds = new Set(readObjects(draft).map((object) => object.id));
  const seen = new Set<string>();
  const list = Array.isArray(proposal.objects) ? proposal.objects : [];
  const objects: PlanObject[] = list.map((raw, index) => {
    const object: JsonObject = isObject(raw) ? raw : {};
    const reason = isObject(raw) ? objectReason(object, existingIds, seen, floorIds, matches) : "Mục không phải đối tượng.";
    const id = typeof object.id === "string" ? object.id : "";
    if (!reason && id) seen.add(id);
    const placement = isObject(object.placement) ? object.placement : {};
    return {
      index, id, kind: typeof object.kind === "string" ? object.kind : "?", label: typeof object.label === "string" ? object.label : "",
      floorId: typeof placement.floorId === "string" ? placement.floorId : "", anchorId: typeof object.anchorId === "string" ? object.anchorId : undefined,
      eligible: !reason, reason, value: raw as Json,
    };
  });
  if (objects.filter((item) => item.eligible).length + existingIds.size > LIMITS.objectsMax) {
    for (const item of objects) if (item.eligible) { item.eligible = false; item.reason = `Vượt tối đa ${LIMITS.objectsMax} đối tượng.`; }
  }

  return { fields, geometry: { proposed: proposedPin, current: currentPin, matches }, objects, ignoredKeys: Object.keys(proposal).filter((key) => !KNOWN_ROOT.has(key)) };
}

export type Chosen = { fields: ReadonlySet<string>; objects: boolean };

/** Patches for the chosen changes, computed against the CURRENT draft so undo restores exactly what was there. */
export function buildApplyPatches(draft: JsonObject, plan: ApplyPlan, chosen: Chosen): Patch[] {
  const patches: Patch[] = [];
  for (const field of plan.fields) {
    if (!field.selectable || !chosen.fields.has(field.key)) continue;
    const patch = makeSetPatch(draft, [field.key], field.proposed);
    if (patch) patches.push(patch);
  }
  const eligible = chosen.objects ? plan.objects.filter((item) => item.eligible) : [];
  if (eligible.length > 0) {
    const existing = draft.objects;
    if (Array.isArray(existing)) eligible.forEach((item, offset) => patches.push({ op: "insert", path: ["objects"], index: existing.length + offset, value: item.value }));
    else patches.push({ op: "set", path: ["objects"], before: undefined, after: eligible.map((item) => item.value) });
  }
  return patches;
}

export function applyCount(chosen: Chosen, plan: ApplyPlan): number {
  return plan.fields.filter((field) => field.selectable && chosen.fields.has(field.key)).length + (chosen.objects ? plan.objects.filter((item) => item.eligible).length : 0);
}

/** The editor command (one history entry, so one Undo reverts every chosen change), or null when nothing would change. */
export function buildApplyCommand<S>(draft: JsonObject, id: number, now: number, selection: S, plan: ApplyPlan, chosen: Chosen): Command<S> | null {
  const patches = buildApplyPatches(draft, plan, chosen);
  return patches.length === 0 ? null : { id, patches, at: now, label: "Áp dụng đề xuất AI", selectBefore: selection, selectAfter: selection };
}

/** Shape problems the document would have after applying the chosen changes (empty = safe to apply). */
export function previewIssues(draft: JsonObject, plan: ApplyPlan, chosen: Chosen): Issue[] {
  return shapeIssues(buildApplyPatches(draft, plan, chosen).reduce(applyPatch, draft));
}
