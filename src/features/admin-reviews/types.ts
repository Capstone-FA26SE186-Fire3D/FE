import type { PageResponse } from "@/api/types/common";

/** Lifecycle of a scenario content review (BE `scenario_content_reviews.status`). */
export type ReviewStatus = "Submitted" | "Approved" | "Rejected";
export type ReviewAction = "approve" | "reject";

export const reviewStatuses: ReviewStatus[] = ["Submitted", "Approved", "Rejected"];

/** `ScenarioReviewSummary` (OpenAPI). `submittedBy`/`decidedBy` are account ids: the API gives no display names. */
export type ReviewSummary = {
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
  organizationId: string;
  organizationName: string;
  buildingId: string;
  buildingName: string;
  scenarioId: string;
  scenarioName: string;
  versionNumber: number;
};

export type ReviewPage = PageResponse<ReviewSummary>;

/** `ScenarioReviewReadiness`: CURRENT technical information, not content approval and not the publish gate. */
export type ReviewReadiness = {
  validationRunId: string | null;
  outcome: string | null;
  blockerCount: number;
  confirmationReviewId: string | null;
  candidateArtifactId: string | null;
  technicalReady: boolean;
};

/** `ScenarioReviewDetail`. `content`/`rubric`/`learningObjectives` are JSON nodes and stay null for legacy snapshots. */
export type ReviewDetail = {
  review: ReviewSummary;
  content: unknown | null;
  rubric: unknown | null;
  learningObjectives: unknown | null;
  learnerInstructions: string | null;
  readiness: ReviewReadiness;
};

export type ReviewListQuery = { status?: ReviewStatus; organizationId?: string; page: number; pageSize: number };

/**
 * Body of `POST /api/admin/scenario-versions/{id}/approve|reject`. The hashes always come from the detail the
 * server returned; `reason` is required (1-4000) to reject and is not sent when approving.
 */
export type ContentReviewDecisionRequest = { contentHash: string; rubricHash: string; reason?: string };

/** Success body of both commands (200). `code` is always "OK". */
export type ContentReviewDecision = { code: "OK"; reviewId: string; status: Exclude<ReviewStatus, "Submitted">; contentHash: string; rubricHash: string };
