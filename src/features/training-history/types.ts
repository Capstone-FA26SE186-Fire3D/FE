/**
 * Trainee training history and personal result. Contract: BE `GET /api/training/sessions` (list),
 * `GET /api/training/sessions/{id}` (state) and `GET /api/training/sessions/{id}/result` (BE docs/learner-sessions.md,
 * TrainingSessionsController, LearnerSessionList.sql, LearnerSessions.sql). OpenAPI types status/mode/outcome as plain
 * `string`; the closed sets below come from the BE source and every label function still accepts an unknown value.
 */

/** Values `status` takes in the history list (AwaitingSync is derived: Running with a pinned completion). */
export const SESSION_STATUSES = ["Launching", "Running", "AwaitingSync", "Completed", "CompletedWithSupersededRelease", "ScenarioUnsurvivable", "Aborted", "Abandoned", "Crashed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
/**
 * States a v7 session takes and the only values `GET /api/training/sessions?status=` accepts (others answer 400).
 * The longer list above is kept for labels of legacy rows.
 */
export const FILTER_STATUSES = ["Launching", "Running", "AwaitingSync", "Completed"] as const;

export const TRAINING_MODES = ["Learn", "Guided", "Assessment"] as const;
export type TrainingMode = (typeof TRAINING_MODES)[number];

/** Stored result outcome. Completion of a session never implies Passed. */
export const RESULT_OUTCOMES = ["Passed", "NotPassed", "Incomplete", "NotAssessed"] as const;
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];

export const END_REASONS = ["Finished", "TimedOut", "Abandoned"] as const;

export type NamedRef = { id: string; name: string };
export type ScenarioRef = { id: string; versionId: string; name: string; versionNumber: number | null };

export type HistoryItem = {
  sessionId: string;
  /** Session state as the server reports it (string: unknown values are kept and shown as received). */
  status: string;
  mode: string;
  /** The stored outcome, or null while the server holds no result (running, awaiting sync, aborted, crashed). */
  resultStatus: string | null;
  endReason: string | null;
  startedAt: string;
  endedAt: string | null;
  resultCreatedAt: string | null;
  training: NamedRef;
  releaseId: string;
  building: NamedRef;
  scenario: ScenarioRef;
};

export type HistoryFilters = {
  status: string;
  mode: string;
  buildingId: string;
  /** yyyy-mm-dd, local day, inclusive */
  from: string;
  /** yyyy-mm-dd, local day, inclusive */
  to: string;
};

export type HistoryQuery = HistoryFilters & { page: number; pageSize: number };

/** `GET /api/training/buildings` item: a Building of the caller's own started sessions (kept after access is lost). */
export type HistoryBuilding = { id: string; name: string; sessionCount: number; lastSessionAt: string | null };

export type CriterionResult = {
  id: string;
  /** Author's label and description from the pinned rubric (null when left out). */
  label: string | null;
  description: string | null;
  metric: string;
  /** Measured value: number for the supported metrics, anything the server sends otherwise; null when unavailable. */
  value: unknown;
  operator: string;
  threshold: number | null;
  mandatory: boolean;
  weight: number | null;
  passed: boolean;
  /** Machine code, for example METRIC_UNAVAILABLE. */
  reason: string | null;
};

export type TrainingResult = {
  sessionId: string;
  mode: string;
  outcome: string;
  /** Machine code of the outcome (for example MANDATORY_CRITERION_FAILED), not prose. */
  reason: string;
  scorePercent: number | null;
  /** Rubric pass threshold on the same 0–100 scale as `scorePercent`; Assessment only. */
  passThresholdPercent: number | null;
  rubricHash: string | null;
  /** null: the server returned no criteria (the policy of the mode decides, the web does not infer it). */
  criteria: CriterionResult[] | null;
  metrics: Record<string, unknown>;
  lastEventSequence: number | null;
  createdAt: string | null;
};

/** The few fields of `GET /api/training/sessions/{id}` the detail needs when the list row is not at hand (deep link). */
export type SessionState = {
  id: string;
  /** Prepared | Expired (a preparation, not a play) or any history status. */
  status: string;
  mode: string;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  hasResult: boolean;
};

/** `not-ready` is the 409 RESULT_NOT_READY answer: the result is not stored yet, which is a state and not a failure. */
export type ResultLoad = { kind: "result"; result: TrainingResult } | { kind: "not-ready" };
