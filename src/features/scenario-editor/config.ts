/**
 * Capability flags for editor parts whose BE contract is not confirmed. All default to false: the UI is designed and
 * visible but locked, and nothing is read from or written to those fields except by passing them through untouched
 * (draft fields the editor does not edit are preserved by reference, see store/json.ts).
 *
 * Open a flag ONLY when BE publishes a versioned schema + validator for that field (BE#54, BE#55). Until then the
 * editor must not invent a payload shape. Conditions to open each flag are recorded in docs/fet3d-operations-ui-tracker.md.
 */
export const EDITOR_CAPABILITIES = {
  /** `goals[]` — BE#54: untyped JsonArray, no schema/validator. */
  goals: false,
  /** `npcs[]` — BE#54. */
  npcs: false,
  /** `blockedElements[]` — BE#54. */
  blockedElements: false,
  /** Runtime devices (extinguisher, towel, water source…) — BE#54: catalog is raw JSON without parameter schema. */
  devices: false,
  /** Playtest handoff — BE#55: no status/recovery endpoint or opaque handoff code. */
  playtest: false,
} as const;

export type EditorCapability = keyof typeof EDITOR_CAPABILITIES;

export const BE_ISSUES = {
  editorContract: { label: "BE #54 — contract dữ liệu editor 3D", href: "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/54" },
  playtest: { label: "BE #55 — playtest handoff", href: "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/55" },
  draftLookup: { label: "BE #53 — tìm lại draft theo scenario", href: "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/53" },
} as const;
