import { getIn, isObject, type Json, type JsonObject } from "./json";

/**
 * Draft state as the BE stores it (`ScenarioDraftStateDto`, BE main @ b6a7d74). The editor edits the raw JSON object;
 * these types only describe the parts it understands. Everything else is preserved verbatim.
 *
 * Contract limits (BE#54, reported as-is, not invented here):
 * - the BE deserializes the PUT body into the DTO and serializes it back, so any field outside the DTO — at the top
 *   level or inside a spawn/hazard — is dropped when saving. The editor keeps such fields in memory but cannot persist them.
 * - `goals`, `npcs`, `blockedElements`, `modePolicy`, `safetyThresholds` are untyped JSON on the BE: preserved, never interpreted.
 * - the unit of `rotation` is not defined; the editor assumes degrees around the vertical axis (see ROTATION_UNIT).
 */

export const DTO_KEYS = [
  "spawnPoints", "hazards", "scoringConfig", "routingConfig", "rubric", "learningObjectives", "learnerInstructions",
  "objectAnchors", "requiredCapabilities", "runtimeVersion", "goals", "npcs", "blockedElements", "modePolicy",
  "safetyThresholds", "randomSeed", "replanIntervalSeconds",
] as const;

/** ASSUMPTION (BE#54): rotation is in degrees, about the vertical (Y) axis; positions are metres, Y-up. */
export const ROTATION_UNIT = "degrees" as const;

export const HAZARD_TYPES = ["Fire", "Smoke", "Wind"] as const;

export type ObjectKind = "spawn" | "hazard";
export type Selection = { kind: ObjectKind; index: number } | null;

export type Position = { x: number; y: number; z: number; rotation: number };
export type Hazard = { id: string; type: string; position: Position; intensity: number; activationTime: number };

const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export function readPosition(value: unknown): Position {
  const source = isObject(value) ? value : {};
  return { x: num(source.x), y: num(source.y), z: num(source.z), rotation: num(source.rotation) };
}

export function readSpawns(draft: JsonObject): Position[] {
  const list = draft.spawnPoints;
  return Array.isArray(list) ? list.map(readPosition) : [];
}

export function readHazards(draft: JsonObject): Hazard[] {
  const list = draft.hazards;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const source = isObject(item) ? item : {};
    return {
      id: typeof source.id === "string" ? source.id : "",
      type: typeof source.type === "string" ? source.type : "",
      position: readPosition(source.position),
      intensity: num(source.intensity),
      activationTime: num(source.activationTime),
    };
  });
}

export function listStrings(draft: JsonObject, key: string): string[] {
  const value = draft[key];
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : "")) : [];
}

export function readNumber(draft: JsonObject, path: ReadonlyArray<string | number>): number | undefined {
  const value = getIn(draft, path);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Top-level keys the BE would drop on save (not part of the DTO). */
export function unknownKeys(draft: JsonObject): string[] {
  const known = new Set<string>(DTO_KEYS);
  return Object.keys(draft).filter((key) => !known.has(key));
}

/** Number of entries of an untyped array field the editor only preserves. */
export function preservedCount(draft: JsonObject, key: string): number {
  const value = draft[key];
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Body of `PUT /api/scenario-drafts/{id}`. The DTO has non-nullable members (`spawnPoints`, `hazards`,
 * `scoringConfig`, `routingConfig`), so a freshly created draft (`{}`) cannot be written as-is. Missing required
 * containers are added empty; missing scoring numbers are sent as 0, which is "not entered yet" and which
 * `validate` reports until the author fills it in (`TIME_LIMIT_INVALID`). No scoring policy is preset.
 * Every other field is passed through by reference.
 */
export function prepareForSave(draft: JsonObject): JsonObject {
  const scoring = isObject(draft.scoringConfig) ? draft.scoringConfig : {};
  const routing = isObject(draft.routingConfig) ? draft.routingConfig : {};
  const next: JsonObject = { ...draft };
  if (!Array.isArray(draft.spawnPoints)) next.spawnPoints = [];
  if (!Array.isArray(draft.hazards)) next.hazards = [];
  if (!isObject(draft.scoringConfig) || typeof scoring.baseScore !== "number" || typeof scoring.timeLimitSeconds !== "number" || typeof scoring.penaltyPerMistake !== "number") {
    next.scoringConfig = {
      ...scoring,
      baseScore: typeof scoring.baseScore === "number" ? scoring.baseScore : 0,
      timeLimitSeconds: typeof scoring.timeLimitSeconds === "number" ? scoring.timeLimitSeconds : 0,
      penaltyPerMistake: typeof scoring.penaltyPerMistake === "number" ? scoring.penaltyPerMistake : 0,
    };
  }
  if (!isObject(draft.routingConfig) || !Array.isArray(routing.evacuationRoutes)) next.routingConfig = { ...routing, evacuationRoutes: [] };
  return next;
}

export function emptyDraftState(): JsonObject {
  return {};
}

/** Smallest unused `hazard-N` id. */
export function nextHazardId(draft: JsonObject): string {
  const used = new Set(readHazards(draft).map((hazard) => hazard.id));
  for (let n = 1; ; n++) if (!used.has(`hazard-${n}`)) return `hazard-${n}`;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function asJson(value: unknown): Json {
  return value as Json;
}
