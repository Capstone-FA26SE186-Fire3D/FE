/** Lifecycle of a scenario content review (BE `scenario_content_reviews.status`). */
export type ReviewStatus = "Submitted" | "Approved" | "Rejected";
export type ReviewAction = "approve" | "reject";

/**
 * Body of `POST /api/admin/scenario-versions/{id}/approve|reject` (BE `ContentReviewDecisionRequest`).
 * Hashes are the SHA-256 returned at submission (64 hex chars); `reason` is required (1-4000) to reject.
 */
export type ContentReviewDecisionRequest = { contentHash: string; rubricHash: string; reason?: string };

/** Success body of both commands (200). `code` is always "OK" on success. */
export type ContentReviewDecision = { code: "OK"; reviewId: string; status: Exclude<ReviewStatus, "Submitted">; contentHash: string; rubricHash: string };

/**
 * Sends one decision. The real implementation is `contentReviewsApi` (bound to an access token); the
 * prototype passes an in-memory sample so the UI never calls the API while the read side (BE#52) is missing.
 */
export type ReviewDecisionPort = (action: ReviewAction, versionId: string, input: ContentReviewDecisionRequest, idempotencyKey: string) => Promise<ContentReviewDecision>;

/*
 * Read model PROPOSED for BE#52 — none of this exists in the backend yet. The shapes follow the issue text
 * (`GET /api/admin/scenario-reviews?status=&organizationId=&page=&pageSize=` + detail) and will be adjusted
 * to the real contract once it is defined.
 */

/** Technical readiness is a separate gate from content review (IFC QA / ConfirmForTraining). */
export type ReviewReadiness = {
  validationOutcome: "Passed" | "Failed" | "NotRun";
  blockingIssues: number;
  confirmForTraining: boolean;
  runtimeReady: boolean;
};

export type ReviewSummary = {
  reviewId: string;
  versionId: string;
  scenarioName: string;
  versionNumber: number;
  organizationId: string;
  organizationName: string;
  buildingName: string;
  status: ReviewStatus;
  submittedAt: string;
  submittedBy: string;
  decidedAt: string | null;
  decidedBy: string | null;
  readinessReady: boolean;
};

export type ReviewHazard = { id: string; type: string; intensity: number; activationSeconds: number };
export type RubricCriterion = { name: string; weight: number; description: string };

export type ReviewDetail = ReviewSummary & {
  contentHash: string;
  rubricHash: string;
  reason: string | null;
  objectives: string[];
  learnerInstructions: string;
  hazards: ReviewHazard[];
  scoring: { baseScore: number; timeLimitSeconds: number; penaltyPerMistake: number };
  routes: string[];
  requiredCapabilities: string[];
  rubric: RubricCriterion[];
  readiness: ReviewReadiness;
};

export type ReviewFilters = { status: ReviewStatus | ""; organizationId: string; page: number; pageSize: number };
