/**
 * Capability flags for editor parts that depend on another team's contract. Goal / NPC / blocked element / equipment are
 * NOT flags any more: they follow real state (valid Geometry + the published runtime capability catalog), see
 * v1/availability.ts. Only the playtest handoff is still locked here.
 *
 * Open `playtest` ONLY when BE publishes the playtest handoff contract (BE#55: status/recovery endpoint, opaque handoff code).
 */
export const EDITOR_CAPABILITIES = {
  /** Playtest handoff — BE#55: no status/recovery endpoint or opaque handoff code. */
  playtest: false,
} as const;

export type EditorCapability = keyof typeof EDITOR_CAPABILITIES;

export const BE_ISSUES = {
  playtest: { label: "BE #55 — playtest handoff", href: "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/55" },
} as const;
