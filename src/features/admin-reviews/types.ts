import type { PageResponse } from "@/api/types/common";
import type { ExpertReviewItem } from "@/features/expert-reviews/api";

/** Lifecycle of a scenario content review (BE `scenario_content_reviews.status`). */
export type ReviewStatus = "Submitted" | "Approved" | "Rejected";
export type ReviewAction = "approve" | "reject";

export const reviewStatuses: ReviewStatus[] = ["Submitted", "Approved", "Rejected"];

/**
 * `ScenarioReviewSummary` (OpenAPI). `submittedBy`/`decidedBy` are account ids; `submittedByName`/`decidedByName` are the display
 * names when the API resolves them (null/absent otherwise, e.g. older deployments).
 */
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
  submittedByName?: string | null;
  decidedByName?: string | null;
};

/**
 * Item of `GET /api/admin/reviews` (BE#242): the expert queue's item shape (Scenario AND Infrastructure) with
 * `assigneeId/assigneeName/assignedAt`. A Scenario item's `reviewId` is the same id as `ReviewSummary.reviewId`.
 */
export type AssignedReview = ExpertReviewItem;
export type AssignedReviewPage = PageResponse<AssignedReview>;
/** Query of `GET /api/admin/reviews`: status Submitted by default; `assigneeId` narrows to one expert. */
export type AssignedReviewQuery = { kind?: "Scenario" | "Infrastructure"; status?: ReviewStatus; assigneeId?: string; page: number; pageSize: number };

/** Body of `POST /api/admin/reviews/{id}/reassign` (BE#242): `reason` 1–500 characters. Answers 200 with the updated item. */
export type ReassignReviewRequest = { expertId: string; reason: string };
export const REASSIGN_REASON_MAX = 500;

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

/** Query of `GET /api/admin/scenario-reviews`: page size defaults to 20, maximum 100. */
export type ReviewListQuery = { status?: ReviewStatus; organizationId?: string; page: number; pageSize: number };

/**
 * Body of `POST /api/admin/scenario-versions/{id}/approve|reject`. The hashes always come from the detail the
 * server returned; `reason` is required (1-4000) to reject and is not sent when approving.
 */
export type ContentReviewDecisionRequest = { contentHash: string; rubricHash: string; reason?: string };

/** Success body of both commands (200). `code` is always "OK". */
export type ContentReviewDecision = { code: "OK"; reviewId: string; status: Exclude<ReviewStatus, "Submitted">; contentHash: string; rubricHash: string };
