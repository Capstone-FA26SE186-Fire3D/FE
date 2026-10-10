import { deepEqual, getIn, insertAt, pathKey, removeAt, setIn, type Json, type JsonObject, type Path } from "./json";
import { nextHazardId, type ObjectKind, type Position, type Selection } from "./model";

/**
 * Undo/redo is patch based: each user action is a Command made of patches along JSON paths. Applying and inverting
 * patches never rebuilds objects the patch does not touch, which is what keeps unknown draft fields intact.
 */
export type Patch =
  | { op: "set"; path: Path; before: Json | undefined; after: Json | undefined }
  | { op: "insert"; path: Path; index: number; value: Json }
  | { op: "remove"; path: Path; index: number; value: Json };

export type Command = {
  id: number;
  label: string;
  patches: Patch[];
  /** Consecutive commands with the same key merge into one history entry (a gizmo drag, typing in one field). */
  mergeKey?: string;
  /** Merge only if the previous command is at most this old (typing). Undefined: always merge (a drag gesture). */
  windowMs?: number;
  at: number;
  /** Selection to restore on undo / apply on redo. Undefined leaves the selection alone. */
  selectBefore?: Selection;
  selectAfter?: Selection;
};

export function applyPatch(state: JsonObject, patch: Patch): JsonObject {
  if (patch.op === "set") return setIn(state, patch.path, patch.after);
  if (patch.op === "insert") return insertAt(state, patch.path, patch.index, patch.value);
  return removeAt(state, patch.path, patch.index);
}

export function invertPatch(patch: Patch): Patch {
  if (patch.op === "set") return { op: "set", path: patch.path, before: patch.after, after: patch.before };
  if (patch.op === "insert") return { op: "remove", path: patch.path, index: patch.index, value: patch.value };
  return { op: "insert", path: patch.path, index: patch.index, value: patch.value };
}

export function applyCommand(state: JsonObject, command: Command): JsonObject {
  return command.patches.reduce(applyPatch, state);
}

export function revertCommand(state: JsonObject, command: Command): JsonObject {
  return command.patches.slice().reverse().map(invertPatch).reduce(applyPatch, state);
}

// ───────── history ─────────

export type History = { past: Command[]; future: Command[] };
export const emptyHistory: History = { past: [], future: [] };
export const HISTORY_LIMIT = 200;

function compact(patches: Patch[]): Patch[] {
  if (!patches.every((patch) => patch.op === "set")) return patches;
  const merged = new Map<string, Patch & { op: "set" }>();
  for (const patch of patches) {
    if (patch.op !== "set") continue;
    const key = pathKey(patch.path);
    const first = merged.get(key);
    merged.set(key, first ? { ...patch, before: first.before } : patch);
  }
  return [...merged.values()].filter((patch) => !deepEqual(patch.before, patch.after));
}

export function mergeCommands(previous: Command, next: Command): Command {
  return { ...previous, patches: compact([...previous.patches, ...next.patches]), at: next.at, selectAfter: next.selectAfter };
}

export function canMerge(previous: Command | undefined, next: Command): previous is Command {
  if (!previous || !next.mergeKey || previous.mergeKey !== next.mergeKey) return false;
  return next.windowMs === undefined || next.at - previous.at <= next.windowMs;
}

export function pushCommand(history: History, command: Command): History {
  const top = history.past[history.past.length - 1];
  if (canMerge(top, command)) {
    const merged = mergeCommands(top, command);
    // A drag that ends where it started leaves no history entry.
    const past = merged.patches.length === 0 ? history.past.slice(0, -1) : [...history.past.slice(0, -1), merged];
    return { past, future: [] };
  }
  return { past: [...history.past, command].slice(-HISTORY_LIMIT), future: [] };
}

// ───────── command builders (pure; read the current draft to capture "before") ─────────

function nested(rest: Path, value: Json | undefined): Json | undefined {
  if (value === undefined) return undefined;
  return rest.reduceRight<Json>((acc, segment) => ({ [String(segment)]: acc }), value);
}

/**
 * Set a field. If a parent object is missing, the patch targets the first missing ancestor so undo removes the
 * whole created branch instead of leaving empty containers behind.
 */
export function makeSetPatch(draft: JsonObject, path: Path, value: Json | undefined): Patch | null {
  for (let i = 1; i < path.length; i++) {
    const parent = getIn(draft, path.slice(0, i));
    if (parent === undefined || parent === null) {
      if (value === undefined) return null;
      return { op: "set", path: path.slice(0, i), before: undefined, after: nested(path.slice(i), value) };
    }
  }
  const before = getIn(draft, path) as Json | undefined;
  return deepEqual(before, value) ? null : { op: "set", path, before, after: value };
}

type CommandInit = Pick<Command, "label" | "at" | "selectBefore" | "selectAfter" | "mergeKey" | "windowMs">;

function command(id: number, patches: Patch[], init: CommandInit): Command | null {
  return patches.length === 0 ? null : { id, patches, ...init };
}

export const TYPING_WINDOW_MS = 1200;

export function setFieldCommand(draft: JsonObject, id: number, path: Path, value: Json | undefined, init: { label: string; at: number; selection: Selection; mergeKey?: string }): Command | null {
  const patch = makeSetPatch(draft, path, value);
  return command(id, patch ? [patch] : [], {
    label: init.label, at: init.at, selectBefore: init.selection, selectAfter: init.selection,
    mergeKey: init.mergeKey ? `${init.mergeKey}` : undefined, windowMs: init.mergeKey ? TYPING_WINDOW_MS : undefined,
  });
}

export function positionPath(kind: ObjectKind, index: number): Path {
  return kind === "spawn" ? ["spawnPoints", index] : ["hazards", index, "position"];
}

export function listPath(kind: ObjectKind): Path {
  return kind === "spawn" ? ["spawnPoints"] : ["hazards"];
}

function listLength(draft: JsonObject, kind: ObjectKind) {
  const list = draft[kind === "spawn" ? "spawnPoints" : "hazards"];
  return Array.isArray(list) ? list.length : 0;
}

export function placeCommand(draft: JsonObject, id: number, kind: ObjectKind, position: Position, at: number, selectBefore: Selection | undefined): Command {
  const index = listLength(draft, kind);
  const value: Json = kind === "spawn"
    ? { x: position.x, y: position.y, z: position.z, rotation: position.rotation }
    : { id: nextHazardId(draft), type: "Fire", position: { x: position.x, y: position.y, z: position.z, rotation: position.rotation }, intensity: 1, activationTime: 0 };
  const patches: Patch[] = [];
  // A draft that has no array yet is created first so undo removes it again.
  if (!Array.isArray(draft[kind === "spawn" ? "spawnPoints" : "hazards"])) {
    patches.push({ op: "set", path: listPath(kind), before: undefined, after: [] });
  }
  patches.push({ op: "insert", path: listPath(kind), index, value });
  return {
    id, patches, at, label: kind === "spawn" ? "Đặt điểm xuất phát" : "Đặt nguy cơ",
    selectBefore, selectAfter: { kind, index },
  };
}

/** Move/rotate: only the changed coordinate leaves are patched, so extra fields on the object survive. */
export function transformCommand(draft: JsonObject, id: number, kind: ObjectKind, index: number, next: Partial<Position>, init: { at: number; mergeKey?: string; label: string }): Command | null {
  const base = positionPath(kind, index);
  const patches: Patch[] = [];
  for (const axis of ["x", "y", "z", "rotation"] as const) {
    const value = next[axis];
    if (value === undefined) continue;
    const patch = makeSetPatch(draft, [...base, axis], value);
    if (patch) patches.push(patch);
  }
  const selection: Selection = { kind, index };
  return command(id, patches, {
    label: init.label, at: init.at, selectBefore: selection, selectAfter: selection,
    mergeKey: init.mergeKey, windowMs: init.mergeKey?.startsWith("typing:") ? TYPING_WINDOW_MS : undefined,
  });
}

export function deleteCommand(draft: JsonObject, id: number, kind: ObjectKind, index: number, at: number): Command | null {
  const list = draft[kind === "spawn" ? "spawnPoints" : "hazards"];
  if (!Array.isArray(list) || index < 0 || index >= list.length) return null;
  return {
    id, at, label: kind === "spawn" ? "Xóa điểm xuất phát" : "Xóa nguy cơ",
    patches: [{ op: "remove", path: listPath(kind), index, value: list[index] }],
    selectBefore: { kind, index }, selectAfter: null,
  };
}

/** Append/remove a string in a string-list field (objectives, routes…). */
export function listItemCommand(draft: JsonObject, id: number, key: string, action: { type: "add"; value: string } | { type: "remove"; index: number }, at: number, label: string): Command | null {
  const current = draft[key];
  const length = Array.isArray(current) ? current.length : 0;
  const patches: Patch[] = [];
  if (action.type === "add") {
    if (!Array.isArray(current)) patches.push({ op: "set", path: [key], before: current as Json | undefined, after: [] });
    patches.push({ op: "insert", path: [key], index: length, value: action.value });
  } else {
    if (!Array.isArray(current) || action.index < 0 || action.index >= length) return null;
    patches.push({ op: "remove", path: [key], index: action.index, value: current[action.index] });
  }
  return { id, patches, at, label };
}
