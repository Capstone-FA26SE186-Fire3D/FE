import type { ApiFieldError, PageResponse } from "@/api/types/common";

/** Validation problem returned by `POST /api/scenario-drafts/{id}/validate` (`issues[]`). Same shape as ApiFieldError. */
export type ValidationIssue = ApiFieldError;

/**
 * `GET /api/scenarios/{id}`. The resume fields (BE#53) are optional because older deployments omit them: when absent
 * the UI falls back to the draft/version lists rather than guessing.
 */
export type ScenarioDetail = {
  id: string;
  buildingId: string;
  organizationId: string;
  name: string;
  createdAt: string;
  /** Most recently saved draft; its `currentDraftVersion` is the number to quote as the ETag (`"<version>"`). */
  currentDraftId?: string | null;
  currentDraftVersion?: number | null;
  draftCount?: number;
  latestVersionId?: string | null;
  latestVersionNumber?: number | null;
};

/** Content review state of a scenario version as the server reports it; never inferred from other gates. */
export type ReviewStatus = "NotSubmitted" | "Submitted" | "Approved" | "Rejected";

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
  /** Server review state; missing only on deployments older than BE#52. */
  reviewStatus?: ReviewStatus | string;
  reviewId?: string | null;
  rejectReason?: string | null;
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

/** `GET /api/scenarios/{id}/drafts`: drafts without state, newest save first. `version` quotes the ETag (`"<version>"`). */
export type DraftSummary = {
  id: string;
  scenarioId: string;
  revisionId: string;
  draftNumber: number;
  source: string;
  schemaVersion: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastEditedById: string | null;
  lastEditedByName: string | null;
};

export type DraftPage = PageResponse<DraftSummary>;

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
  /** Same value as `status`; kept because the history endpoint names it `outcome`. */
  outcome?: string;
  summary: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

/** Row of `GET /api/revisions/{id}/validation-runs` (QA history across jobs, newest first). */
export type ValidationRunHistoryItem = {
  id: string;
  revisionId: string;
  processingJobId: string;
  jobKind: string;
  processingAttemptId: string;
  attemptStatus: string;
  artifactId: string | null;
  scenarioVersionId: string | null;
  scope: string;
  validatorVersion: string;
  outcome: string;
  /** True for the run of the job's current attempt. */
  isCurrent: boolean;
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

/** Response of `POST /api/scenario-versions/{id}/submit` (201). Read it again through `getVersionReview`. */
export type ContentReviewSubmission = {
  code?: string;
  reviewId: string;
  status: "Submitted" | "Approved" | "Rejected" | string;
  contentHash: string;
  rubricHash: string;
};

export type ReadinessJob = { jobId: string; status: string; currentAttemptId: string | null };

export type ReadinessBlocker = { issueCode: string; severity: string; message: string };

/**
 * `GET /api/scenario-versions/{id}/readiness`: technical readiness before/independent of content approval. It only
 * reports; confirm-for-training, release build and publish re-check every condition.
 */
export type VersionReadiness = {
  scenarioVersionId: string;
  revisionId: string;
  scenarioHash: string;
  reviewStatus: ReviewStatus | string;
  packageJob: ReadinessJob | null;
  validationRunId: string | null;
  outcome: string | null;
  blockerCount: number;
  blockers: ReadinessBlocker[];
  confirmationReviewId: string | null;
  candidateArtifactId: string | null;
  technicalReady: boolean;
  /** Stable codes, e.g. `PACKAGE_VALIDATION_REQUIRED`, `QA_NOT_PASSED`, `CONFIRMATION_REQUIRED`. */
  missing: string[];
};

/** `GET /api/scenario-versions/{id}/review` (OrganizationUser of the tenant or PlatformAdmin; 404 when not submitted). */
export type VersionReview = {
  review: {
    reviewId: string;
    scenarioVersionId: string;
    status: ReviewStatus | string;
    contentHash: string;
    rubricHash: string;
    submittedBy: string;
    submittedAt: string;
    decidedBy: string | null;
    decidedAt: string | null;
    reason: string | null;
    versionNumber: number;
  };
  readiness: {
    validationRunId: string | null;
    outcome: string | null;
    blockerCount: number;
    confirmationReviewId: string | null;
    candidateArtifactId: string | null;
    technicalReady: boolean;
  };
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

/** Building service period covering now (`GET /api/releases/{id}`); `null` when none. */
export type ReleaseEntitlement = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  paid: boolean;
  learnerLimit: number | null;
};

/** Row of `GET /api/releases`; status is `Built | Published | Revoked`. */
export type ReleaseSummary = {
  id: string;
  buildingId: string;
  scenarioId: string;
  scenarioVersionId: string;
  versionNumber: number;
  scenarioName: string;
  status: string;
  createdAt: string;
  publishedAt: string | null;
  revokedAt: string | null;
};

export type ReleasePage = PageResponse<ReleaseSummary>;

export type ReleaseListFilters = { buildingId?: string; scenarioId?: string; status?: "Built" | "Published" | "Revoked" };

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
  /** Present on `GET /api/releases/{id}` only. */
  entitlement?: ReleaseEntitlement | null;
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
  releaseStatus?: string | null;
  scenarioVersionId?: string | null;
  /** Always `Approved`: only trainings pinned to an approved content review are listed. */
  reviewStatus?: string;
};
