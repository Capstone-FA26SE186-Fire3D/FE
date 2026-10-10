import type { ApiFieldError, PageResponse } from "@/api/types/common";

/** Validation problem returned by `POST /api/scenario-drafts/{id}/validate` (`issues[]`). Same shape as ApiFieldError. */
export type ValidationIssue = ApiFieldError;

export type ScenarioDetail = {
  id: string;
  buildingId: string;
  organizationId: string;
  name: string;
  createdAt: string;
};

export type ScenarioVersionSummary = {
  id: string;
  scenarioId: string;
  revisionId: string;
  buildingId: string;
  organizationId: string;
  versionNumber: number;
  name: string;
  schemaVersion: string;
  algorithmVersion: string;
  timeLimitSeconds: number;
  /** SHA-256 of the frozen scenario content. Submission pins this as `contentHash`. */
  scenarioHash: string;
  createdAt: string;
};

export type RubricCriterion = {
  id: string;
  metric: string;
  mandatory: boolean;
  weight: number;
  threshold: number;
  operator: "gte" | "lte" | "eq" | string;
};

export type ScenarioRubric = {
  schema_version?: string;
  pass_threshold?: number;
  criteria?: RubricCriterion[];
};

export type ScenarioVersionDetail = Omit<ScenarioVersionSummary, "createdAt"> & {
  randomSeed: number;
  replanIntervalSeconds: number;
  configuration: {
    spawn: unknown;
    goal: unknown;
    fireSource: unknown;
    npc: unknown;
    blockedElements: unknown;
    routing: unknown;
    scoring: unknown;
    modePolicy: unknown;
    safetyThresholds: unknown;
  };
  createdAt: string;
  stateSnapshot: unknown | null;
  rubric: ScenarioRubric | null;
  learningObjectives: string[] | null;
  learnerInstructions: string | null;
};

export type ScenarioVersionPage = PageResponse<ScenarioVersionSummary>;

/** Draft as read for snapshotting. `eTag` is the `"<xmin>"` value required in `If-Match`. */
export type DraftForSnapshot = {
  id: string;
  scenarioId: string;
  revisionId: string;
  draftNumber: number;
  state: unknown;
  updatedAt: string;
  version: number;
};

export type DraftValidation = {
  draftId: string;
  version: number;
  isValid: boolean;
  issues: ValidationIssue[];
};

export type CreatedResource = { id: string };

// ---- Package build / processing jobs ----

export type PackageKind = "PlaytestPackage" | "ReleasePackage";

export type PackageBuildRequest = { kind: PackageKind; buildTarget: string };

/** 202 body. A queued job is not an accepted package. */
export type PackageBuildAccepted = { jobId: string };

/** Logical job status as stored by BE: Queued | Running | Succeeded | Failed | Cancelled. */
export type ProcessingJobSummary = {
  id: string;
  revisionId: string;
  sourceDocumentId: string;
  scenarioVersionId: string | null;
  kind: string;
  status: string;
  createdAt: string;
};

export type ProcessingAttempt = {
  id: string;
  attemptNumber: number;
  status: string;
  toolchainVersion: string;
  startedAt: string;
  finishedAt: string | null;
  outputHash: string | null;
};

export type ProcessingJobDetail = {
  job: ProcessingJobSummary;
  inputHash: string;
  currentAttemptId: string | null;
  currentAttempt: ProcessingAttempt | null;
};

export type ValidationRun = {
  id: string;
  revisionId: string;
  processingJobId: string;
  processingAttemptId: string;
  /** Candidate artifact of the run; release creation needs this as `candidateArtifactId`. */
  artifactId: string | null;
  scenarioVersionId: string | null;
  scope: string;
  validatorVersion: string;
  /** `Passed | Failed` (generated from the run outcome). */
  status: string;
  summary: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type JobQa = {
  jobId: string;
  currentAttemptId: string | null;
  validationRuns: PageResponse<ValidationRun>;
};

export type VersionIssue = {
  id: string;
  revisionId: string;
  validationRunId: string;
  processingAttemptId: string;
  artifactId: string | null;
  issueCode: string;
  /** Info | Warning | Error | Critical */
  severity: string;
  status: string;
  message: string;
  isCurrentAttempt: boolean;
  createdAt: string;
};

/** Body of `POST /api/processing-jobs/{id}/retry`; `requestId` is a fresh UUID per retry intent. Only Failed jobs. */
export type RetryJobInput = { requestId: string; reason: string };
export type RetryJobResult = { jobId: string; outcome: string };

export type ProcessingJobPage = PageResponse<ProcessingJobSummary>;
export type VersionIssuePage = PageResponse<VersionIssue>;

// ---- Technical readiness / content review ----

export type ConfirmTrainingInput = {
  scenarioVersionId: string;
  validationRunId: string;
  annotationSetId?: string;
};

export type ConfirmTrainingResult = { reviewId: string };

/** Response of `POST /api/scenario-versions/{id}/submit` (201). BE has no endpoint to read it again (BE#52). */
export type ContentReviewSubmission = {
  code?: string;
  reviewId: string;
  status: "Submitted" | "Approved" | "Rejected" | string;
  contentHash: string;
  rubricHash: string;
};

// ---- Release ----

export type BuildReleaseInput = {
  revisionId: string;
  scenarioVersionId: string;
  confirmationReviewId: string;
  candidateArtifactId: string;
};

export type ReleasePackage = {
  id: string;
  candidateArtifactId: string;
  manifestUrl: string;
  manifestSha256: string;
  packageUrl: string;
  checksumSha256: string;
  packageSizeBytes: number;
  minRuntimeVersion: string;
  schemaVersion: string;
  buildTarget: string;
};

/** `Built | Published | Revoked`. Built is not Published. */
export type Release = {
  id: string;
  revisionId: string;
  scenarioVersionId: string;
  buildingId: string;
  organizationId: string;
  confirmationReviewId: string;
  status: string;
  safetyThresholds: string;
  publishedBy: string | null;
  publishedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  package: ReleasePackage;
};

export type TrainingItem = {
  id: string;
  releaseId: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  allowedModes: string[];
  createdAt: string;
};
