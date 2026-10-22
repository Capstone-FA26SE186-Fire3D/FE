import { TYPING_WINDOW_MS, arrayItemCommand, makeSetPatch, type Command, type Patch } from "../store/commands";
import { pathKey, type Json, type JsonObject, type Path } from "../store/json";
import type { CapabilityOption } from "./catalog";
import { KIND_META, type GeometryPin, type ObjectKind } from "./contract";
import { IDENTITY_QUATERNION, type Quat, type Vec3 } from "./matrix";
import { nextObjectId, readObjects } from "./state";
import type { GeometryInfo } from "./geometry";

/** Selection of the v1 editor: an index into `objects[]`. Ids can be edited, so the index is the stable handle. */
export type V1Selection = { kind: "object"; index: number } | null;
export type V1Command = Command<V1Selection>;

const at = (index: number): V1Selection => ({ kind: "object", index });

const ID_PREFIXES = Object.fromEntries(Object.entries(KIND_META).map(([kind, meta]) => [kind, meta.idPrefix])) as Record<ObjectKind, string>;

function build(id: number, patches: Patch[], init: { label: string; at: number; selectBefore?: V1Selection; selectAfter?: V1Selection; mergeKey?: string; typing?: boolean }): V1Command | null {
  if (patches.length === 0) return null;
  return {
    id, patches, label: init.label, at: init.at, selectBefore: init.selectBefore, selectAfter: init.selectAfter,
    mergeKey: init.mergeKey, windowMs: init.typing ? TYPING_WINDOW_MS : undefined,
  };
}

/** Set (or, with `undefined`, remove) one field of the document. Typing in the same field merges into one history entry. */
export function setPathCommand(draft: JsonObject, id: number, path: Path, value: Json | undefined, init: { label: string; at: number; selection: V1Selection; typing?: boolean }): V1Command | null {
  const patch = makeSetPatch(draft, path, value);
  return build(id, patch ? [patch] : [], { label: init.label, at: init.at, selectBefore: init.selection, selectAfter: init.selection, mergeKey: init.typing ? `typing:${pathKey(path)}` : undefined, typing: init.typing });
}

/**
 * Several field writes as ONE history entry (applying a library sample): one undo restores every field. Only fields whose value
 * actually changes produce a patch, so applying a sample that matches the draft leaves no entry. Never merges with typing.
 */
export function setFieldsCommand(draft: JsonObject, id: number, changes: ReadonlyArray<{ path: Path; value: Json | undefined }>, init: { label: string; at: number; selection: V1Selection }): V1Command | null {
  // Each patch is built against the draft BEFORE the command, so two writes under one new parent would each create it; the caller keeps writes disjoint.
  const patches = changes.flatMap((change) => makeSetPatch(draft, change.path, change.value) ?? []);
  return build(id, patches, { label: init.label, at: init.at, selectBefore: init.selection, selectAfter: init.selection });
}

export type NewObject = { kind: ObjectKind; floorId: string; position: Vec3; rotation?: Quat };

export function addObjectCommand(draft: JsonObject, id: number, object: NewObject, now: number, selectBefore: V1Selection): V1Command {
  const objects = readObjects(draft);
  const value: Json = {
    id: nextObjectId(draft, object.kind, ID_PREFIXES),
    kind: object.kind,
    placement: {
      floorId: object.floorId,
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotation: { ...(object.rotation ?? IDENTITY_QUATERNION) },
    },
  };
  const command = arrayItemCommand(draft, id, ["objects"], { type: "add", value }, now, `Đặt ${KIND_META[object.kind].lower}`)!;
  return { ...command, selectBefore, selectAfter: at(objects.length) };
}

/** Copy of an object (all its fields, new id) placed 0.5 m to the side on the same floor; selects the copy. One undoable step. */
export function duplicateObjectCommand(draft: JsonObject, id: number, index: number, now: number): V1Command | null {
  const objects = readObjects(draft);
  const target = objects[index];
  const source = Array.isArray(draft.objects) ? draft.objects[index] : undefined;
  if (!target?.kind || !source || typeof source !== "object" || Array.isArray(source)) return null;
  const copy = JSON.parse(JSON.stringify(source)) as JsonObject;
  copy.id = nextObjectId(draft, target.kind, ID_PREFIXES);
  const placement = copy.placement;
  if (placement && typeof placement === "object" && !Array.isArray(placement)) {
    const position = (placement as JsonObject).position;
    if (position && typeof position === "object" && !Array.isArray(position) && typeof (position as JsonObject).x === "number") (position as JsonObject).x = Math.round(((position as JsonObject).x as number + 0.5) * 1000) / 1000;
  }
  const command = arrayItemCommand(draft, id, ["objects"], { type: "add", value: copy }, now, `Nhân bản ${KIND_META[target.kind].lower}`);
  return command ? { ...command, selectBefore: at(index), selectAfter: at(objects.length) } : null;
}

export function removeObjectCommand(draft: JsonObject, id: number, index: number, now: number): V1Command | null {
  const objects = readObjects(draft);
  const target = objects[index];
  if (!target) return null;
  const command = arrayItemCommand(draft, id, ["objects"], { type: "remove", index }, now, `Xóa ${target.kind ? KIND_META[target.kind].lower : "đối tượng"}`);
  return command ? { ...command, selectBefore: at(index), selectAfter: null } : null;
}

/** Move: only the changed coordinates are patched, so extra fields on the placement survive. A drag gesture merges into one entry. */
export function moveObjectCommand(draft: JsonObject, id: number, index: number, next: Partial<Vec3>, init: { at: number; label: string; mergeKey?: string }): V1Command | null {
  const patches: Patch[] = [];
  for (const axis of ["x", "y", "z"] as const) {
    const value = next[axis];
    if (value === undefined) continue;
    const patch = makeSetPatch(draft, ["objects", index, "placement", "position", axis], value);
    if (patch) patches.push(patch);
  }
  return build(id, patches, { label: init.label, at: init.at, selectBefore: at(index), selectAfter: at(index), mergeKey: init.mergeKey, typing: init.mergeKey?.startsWith("typing:") });
}

/** Replace the rotation quaternion (all four components). Called only when the author actually rotates the object. */
export function rotateObjectCommand(draft: JsonObject, id: number, index: number, q: Quat, init: { at: number; label: string; mergeKey?: string }): V1Command | null {
  const patches: Patch[] = [];
  for (const axis of ["x", "y", "z", "w"] as const) {
    const patch = makeSetPatch(draft, ["objects", index, "placement", "rotation", axis], q[axis]);
    if (patch) patches.push(patch);
  }
  return build(id, patches, { label: init.label, at: init.at, selectBefore: at(index), selectAfter: at(index), mergeKey: init.mergeKey, typing: init.mergeKey?.startsWith("typing:") });
}

/**
 * Move an object to another floor. Floor-local coordinates are kept (same x/z, same height above the floor); an anchor
 * that belongs to the old floor would fail `ANCHOR_FLOOR_MISMATCH`, so it is cleared in the same undoable step.
 */
export function setFloorCommand(draft: JsonObject, id: number, index: number, floorId: string, geometry: GeometryInfo | null, now: number): V1Command | null {
  const object = readObjects(draft)[index];
  if (!object) return null;
  const patches: Patch[] = [];
  const floor = makeSetPatch(draft, ["objects", index, "placement", "floorId"], floorId);
  if (floor) patches.push(floor);
  let cleared = false;
  if (object.anchorId && geometry) {
    const entry = geometry.semantic.find((item) => item.ifcGlobalId === object.anchorId);
    if (!entry || entry.floorId !== floorId) {
      const anchor = makeSetPatch(draft, ["objects", index, "anchorId"], undefined);
      if (anchor) { patches.push(anchor); cleared = true; }
    }
  }
  return build(id, patches, { label: cleared ? "Đổi tầng (bỏ neo không cùng tầng)" : "Đổi tầng", at: now, selectBefore: at(index), selectAfter: at(index) });
}

/** Choose or clear the capability. Parameters of a different capability do not apply, so they are dropped with it. */
export function setCapabilityCommand(draft: JsonObject, id: number, index: number, capability: Pick<CapabilityOption, "id" | "version"> | undefined, now: number): V1Command | null {
  const object = readObjects(draft)[index];
  if (!object) return null;
  const patches: Patch[] = [];
  const same = capability && object.capability?.id === capability.id;
  const cap = makeSetPatch(draft, ["objects", index, "capability"], capability ? { id: capability.id, version: capability.version } : undefined);
  if (cap) patches.push(cap);
  if (!same) {
    const params = makeSetPatch(draft, ["objects", index, "parameters"], undefined);
    if (params) patches.push(params);
  }
  return build(id, patches, { label: capability ? "Chọn năng lực" : "Bỏ năng lực", at: now, selectBefore: at(index), selectAfter: at(index) });
}

export function pinGeometryCommand(draft: JsonObject, id: number, pin: GeometryPin, now: number, selection: V1Selection): V1Command | null {
  const patch = makeSetPatch(draft, ["geometry"], { artifactId: pin.artifactId, sha256Hash: pin.sha256Hash });
  return build(id, patch ? [patch] : [], { label: "Ghim lại Geometry hiện tại", at: now, selectBefore: selection, selectAfter: selection });
}

/** Append an item to an array field (objectives, criteria). */
export function addItemCommand(draft: JsonObject, id: number, path: Path, value: Json, now: number, label: string, selection: V1Selection): V1Command | null {
  const command = arrayItemCommand(draft, id, path, { type: "add", value }, now, label);
  return command ? { ...command, selectBefore: selection, selectAfter: selection } : null;
}

export function removeItemCommand(draft: JsonObject, id: number, path: Path, index: number, now: number, label: string, selection: V1Selection): V1Command | null {
  const command = arrayItemCommand(draft, id, path, { type: "remove", index }, now, label);
  return command ? { ...command, selectBefore: selection, selectAfter: selection } : null;
}
