import { isObject } from "../store/json";
import { SCHEMA_VERSION } from "./contract";

/**
 * How the editor treats a draft, decided by what the SERVER stored:
 * - `v1`: `state.schemaVersion === "fet3d.editor/1"`.
 * - `empty`: a draft just created (`{}`); the first PUT must be a document that declares `schemaVersion`.
 * - `legacy`: no `schemaVersion` (the historical typed shape). Edited as before; never converted, never overwritten with v1.
 * - `unsupported`: a schemaVersion this editor does not know. Not editable here.
 */
export type DraftMode = "v1" | "empty" | "legacy" | "unsupported";

export function classifyDraft(state: unknown): { mode: DraftMode; schemaVersion: string | null } {
  if (!isObject(state)) return { mode: "unsupported", schemaVersion: null };
  if (Object.keys(state).length === 0) return { mode: "empty", schemaVersion: null };
  if (!("schemaVersion" in state)) return { mode: "legacy", schemaVersion: null };
  const declared = typeof state.schemaVersion === "string" ? state.schemaVersion : "";
  return { mode: declared === SCHEMA_VERSION ? "v1" : "unsupported", schemaVersion: declared };
}
