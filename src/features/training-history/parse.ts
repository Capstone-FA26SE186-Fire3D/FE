import type { CriterionResult, HistoryItem, NamedRef, ScenarioRef, SessionState, TrainingResult } from "./types";

/*
 * The BE documents these responses with open types (OpenAPI: plain `string`, numbers as `integer|string`, `JsonElement`
 * for metrics), so every response is read defensively: a wrong-typed field falls back to a safe value instead of
 * throwing inside a React render, and an unknown status/outcome string is kept as received so the screen can say so.
 */

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const bool = (value: unknown): boolean => value === true;

/** OpenAPI allows `integer|string` for int32/int64 and `number|string` for doubles: accept a numeric string too. */
export function numOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function ref(raw: unknown): NamedRef | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return { id: raw.id, name: str(raw.name) };
}

function scenario(raw: unknown): ScenarioRef | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return { id: raw.id, versionId: str(raw.versionId), name: str(raw.name), versionNumber: numOrNull(raw.versionNumber) };
}

export function parseHistoryItem(raw: unknown): HistoryItem | null {
  if (!isRecord(raw) || typeof raw.sessionId !== "string") return null;
  const training = ref(raw.training);
  const building = ref(raw.building);
  const scenarioRef = scenario(raw.scenario);
  return {
    sessionId: raw.sessionId,
    status: str(raw.status),
    mode: str(raw.mode),
    resultStatus: strOrNull(raw.resultStatus),
    endReason: strOrNull(raw.endReason),
    startedAt: str(raw.startedAt),
    endedAt: strOrNull(raw.endedAt),
    resultCreatedAt: strOrNull(raw.resultCreatedAt),
    training: training ?? { id: "", name: "" },
    releaseId: str(raw.releaseId),
    building: building ?? { id: "", name: "" },
    scenario: scenarioRef ?? { id: "", versionId: "", name: "", versionNumber: null },
  };
}

export function parseCriterion(raw: unknown): CriterionResult | null {
  if (!isRecord(raw)) return null;
  return {
    id: str(raw.id),
    label: strOrNull(raw.label),
    description: strOrNull(raw.description),
    metric: str(raw.metric),
    value: raw.value ?? null,
    operator: str(raw.operator),
    threshold: numOrNull(raw.threshold),
    mandatory: bool(raw.mandatory),
    weight: numOrNull(raw.weight),
    passed: bool(raw.passed),
    reason: strOrNull(raw.reason),
  };
}

export function parseResult(raw: unknown): TrainingResult | null {
  if (!isRecord(raw) || typeof raw.sessionId !== "string") return null;
  return {
    sessionId: raw.sessionId,
    mode: str(raw.mode),
    outcome: str(raw.outcome),
    reason: str(raw.reason),
    scorePercent: numOrNull(raw.scorePercent),
    passThresholdPercent: numOrNull(raw.passThresholdPercent),
    rubricHash: strOrNull(raw.rubricHash),
    criteria: Array.isArray(raw.criteria) ? raw.criteria.map(parseCriterion).filter((item): item is CriterionResult => item !== null) : null,
    metrics: isRecord(raw.metrics) ? raw.metrics : {},
    lastEventSequence: numOrNull(raw.lastEventSequence),
    createdAt: strOrNull(raw.createdAt),
  };
}

export function parseSessionState(raw: unknown): SessionState | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const completion = isRecord(raw.completion) ? raw.completion : null;
  return {
    id: raw.id,
    status: str(raw.status),
    mode: str(raw.mode),
    startedAt: strOrNull(raw.startedAt),
    endedAt: strOrNull(raw.endedAt),
    endReason: completion ? strOrNull(completion.endReason) : null,
    hasResult: bool(raw.hasResult),
  };
}
