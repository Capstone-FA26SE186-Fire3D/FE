import { applyCommand, pushCommand, revertCommand, type History } from "../store/commands";
import { deepEqual, type JsonObject } from "../store/json";
import { readObjects } from "./state";
import type { V1Command, V1Selection } from "./commands";
import type { ObjectKind } from "./contract";

/**
 * Pure state of the v1 editor. `draft` is the exact document that would be PUT (no preparation step: unknown fields and
 * unedited objects keep their identity), `baseline` the document last known to be on the server.
 */
export type V1Tool = "select" | "move" | "rotate" | "place";
export type V1SavePhase = "idle" | "saving" | "conflict" | "error";

export type V1EditorState = {
  draft: JsonObject;
  baseline: JsonObject;
  etag: string | null;
  version: number | null;
  history: History<V1Selection>;
  selection: V1Selection;
  tool: V1Tool;
  /** Kind placed by the `place` tool. */
  placeKind: ObjectKind;
  phase: V1SavePhase;
  saveError: string | null;
  lastSavedAt: number | null;
  nextCommandId: number;
};

export type V1EditorAction =
  | { type: "loaded"; draft: JsonObject; etag: string; version: number | null }
  | { type: "edit"; build: (draft: JsonObject, id: number, selection: V1Selection) => V1Command | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; selection: V1Selection }
  | { type: "tool"; tool: V1Tool; placeKind?: ObjectKind }
  | { type: "save-start" }
  | { type: "save-ok"; payload: JsonObject; etag: string }
  | { type: "save-fail"; message: string; conflict: boolean }
  | { type: "replace"; draft: JsonObject; baseline: JsonObject; etag: string; version: number | null };

export const initialV1State: V1EditorState = {
  draft: {}, baseline: {}, etag: null, version: null, history: { past: [], future: [] }, selection: null, tool: "select", placeKind: "Spawn",
  phase: "idle", saveError: null, lastSavedAt: null, nextCommandId: 1,
};

function clamp(draft: JsonObject, selection: V1Selection): V1Selection {
  return selection && selection.index >= 0 && selection.index < readObjects(draft).length ? selection : null;
}

const keepPhase = (phase: V1SavePhase): V1SavePhase => (phase === "saving" || phase === "conflict" ? phase : "idle");

export function v1Reducer(state: V1EditorState, action: V1EditorAction): V1EditorState {
  switch (action.type) {
    case "loaded":
      return { ...initialV1State, draft: action.draft, baseline: action.draft, etag: action.etag, version: action.version, tool: state.tool, placeKind: state.placeKind };
    case "edit": {
      const command = action.build(state.draft, state.nextCommandId, state.selection);
      if (!command) return state;
      const draft = applyCommand(state.draft, command);
      const selection = clamp(draft, command.selectAfter === undefined ? state.selection : command.selectAfter);
      return { ...state, draft, selection, history: pushCommand(state.history, command), nextCommandId: state.nextCommandId + 1, phase: keepPhase(state.phase), saveError: null };
    }
    case "undo": {
      const command = state.history.past[state.history.past.length - 1];
      if (!command) return state;
      const draft = revertCommand(state.draft, command);
      return {
        ...state, draft, selection: clamp(draft, command.selectBefore === undefined ? state.selection : command.selectBefore),
        history: { past: state.history.past.slice(0, -1), future: [command, ...state.history.future] }, phase: keepPhase(state.phase),
      };
    }
    case "redo": {
      const [command, ...future] = state.history.future;
      if (!command) return state;
      const draft = applyCommand(state.draft, command);
      return {
        ...state, draft, selection: clamp(draft, command.selectAfter === undefined ? state.selection : command.selectAfter),
        history: { past: [...state.history.past, command], future }, phase: keepPhase(state.phase),
      };
    }
    case "select":
      return { ...state, selection: clamp(state.draft, action.selection) };
    case "tool":
      return { ...state, tool: action.tool, placeKind: action.placeKind ?? state.placeKind };
    case "save-start":
      return { ...state, phase: "saving", saveError: null };
    case "save-ok":
      return { ...state, baseline: action.payload, etag: action.etag, phase: "idle", saveError: null, lastSavedAt: Date.now() };
    case "save-fail":
      return { ...state, phase: action.conflict ? "conflict" : "error", saveError: action.message };
    case "replace":
      // History is dropped: its patches were recorded against a different base and may no longer apply.
      return { ...state, draft: action.draft, baseline: action.baseline, etag: action.etag, version: action.version, history: { past: [], future: [] }, selection: clamp(action.draft, state.selection), phase: "idle", saveError: null };
    default:
      return state;
  }
}

export const isV1Dirty = (state: Pick<V1EditorState, "draft" | "baseline">) => !deepEqual(state.draft, state.baseline);
