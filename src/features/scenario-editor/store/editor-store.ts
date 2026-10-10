import { applyCommand, emptyHistory, pushCommand, revertCommand, type Command, type History } from "./commands";
import { deepEqual, type JsonObject } from "./json";
import { prepareForSave, type Selection } from "./model";

export type Tool = "select" | "move" | "rotate" | "place-spawn" | "place-hazard";
export type SavePhase = "idle" | "saving" | "conflict" | "error";

export type EditorState = {
  /** The draft being edited: the API's JSON object, changed only through commands. */
  draft: JsonObject;
  /** The payload last known to be on the server (what `dirty` is measured against). */
  baseline: JsonObject;
  /** `"<xmin>"` as the BE sent it; `null` until a draft is loaded. */
  etag: string | null;
  version: number | null;
  history: History;
  selection: Selection;
  tool: Tool;
  phase: SavePhase;
  saveError: string | null;
  lastSavedAt: number | null;
  nextCommandId: number;
  gesture: number;
};

export type EditorAction =
  | { type: "loaded"; draft: JsonObject; etag: string; version: number | null }
  | { type: "edit"; build: (draft: JsonObject, id: number, selection: Selection) => Command | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; selection: Selection }
  | { type: "tool"; tool: Tool }
  | { type: "gesture-start" }
  | { type: "save-start" }
  | { type: "save-ok"; payload: JsonObject; etag: string }
  | { type: "save-fail"; message: string; conflict: boolean }
  | { type: "replace"; draft: JsonObject; baseline: JsonObject; etag: string; version: number | null };

export const initialEditorState: EditorState = {
  draft: {}, baseline: prepareForSave({}), etag: null, version: null, history: emptyHistory, selection: null, tool: "select",
  phase: "idle", saveError: null, lastSavedAt: null, nextCommandId: 1, gesture: 0,
};

function clampSelection(draft: JsonObject, selection: Selection): Selection {
  if (!selection) return null;
  const list = draft[selection.kind === "spawn" ? "spawnPoints" : "hazards"];
  return Array.isArray(list) && selection.index >= 0 && selection.index < list.length ? selection : null;
}

function keepPhase(phase: SavePhase): SavePhase {
  return phase === "saving" || phase === "conflict" ? phase : "idle";
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "loaded":
      return { ...initialEditorState, draft: action.draft, baseline: prepareForSave(action.draft), etag: action.etag, version: action.version, tool: state.tool };
    case "edit": {
      const command = action.build(state.draft, state.nextCommandId, state.selection);
      if (!command) return state;
      const draft = applyCommand(state.draft, command);
      const selection = command.selectAfter === undefined ? clampSelection(draft, state.selection) : clampSelection(draft, command.selectAfter);
      return {
        ...state, draft, selection, history: pushCommand(state.history, command), nextCommandId: state.nextCommandId + 1,
        phase: keepPhase(state.phase), saveError: null,
      };
    }
    case "undo": {
      const command = state.history.past[state.history.past.length - 1];
      if (!command) return state;
      const draft = revertCommand(state.draft, command);
      const selection = command.selectBefore === undefined ? state.selection : command.selectBefore;
      return {
        ...state, draft, selection: clampSelection(draft, selection),
        history: { past: state.history.past.slice(0, -1), future: [command, ...state.history.future] },
        phase: keepPhase(state.phase),
      };
    }
    case "redo": {
      const [command, ...future] = state.history.future;
      if (!command) return state;
      const draft = applyCommand(state.draft, command);
      const selection = command.selectAfter === undefined ? state.selection : command.selectAfter;
      return {
        ...state, draft, selection: clampSelection(draft, selection),
        history: { past: [...state.history.past, command], future },
        phase: keepPhase(state.phase),
      };
    }
    case "select":
      return { ...state, selection: clampSelection(state.draft, action.selection) };
    case "tool":
      return { ...state, tool: action.tool };
    case "gesture-start":
      return { ...state, gesture: state.gesture + 1 };
    case "save-start":
      return { ...state, phase: "saving", saveError: null };
    case "save-ok":
      return { ...state, baseline: action.payload, etag: action.etag, phase: "idle", saveError: null, lastSavedAt: Date.now() };
    case "save-fail":
      return { ...state, phase: action.conflict ? "conflict" : "error", saveError: action.message };
    case "replace":
      // History is dropped: its patches were recorded against a different base and may no longer apply.
      return { ...state, draft: action.draft, baseline: action.baseline, etag: action.etag, version: action.version, history: emptyHistory, selection: clampSelection(action.draft, state.selection), phase: "idle", saveError: null };
    default:
      return state;
  }
}

export function isDirty(state: Pick<EditorState, "draft" | "baseline">): boolean {
  return !deepEqual(prepareForSave(state.draft), state.baseline);
}

export type SaveStatus = "saved" | "dirty" | "saving" | "conflict" | "error";

export function saveStatus(state: EditorState, dirty: boolean): SaveStatus {
  if (state.phase === "saving") return "saving";
  if (state.phase === "conflict") return "conflict";
  if (state.phase === "error") return "error";
  return dirty ? "dirty" : "saved";
}
