/**
 * Organization AI through the .NET API (BE `docs/organization-ai.md`, OpenAPI schemas `AiRequestView`/`AiRequestPage`,
 * Docs v7 vocabulary since BE#89). The FE never talks to the FastAPI adapter.
 */

export type AiOperation = "ScenarioDraft" | "Answer" | "TraineeAnswer";
/** Operations an organization submits (and filters its own history by). */
export const AI_OPERATIONS: readonly AiOperation[] = ["Answer", "ScenarioDraft"];
/** Every operation the PlatformAdmin sees: TraineeAnswer comes from the Trainee audience. */
export const ADMIN_AI_OPERATIONS: readonly AiOperation[] = ["Answer", "ScenarioDraft", "TraineeAnswer"];
export type AiAudience = "organization" | "trainee";
export const AI_AUDIENCES: readonly AiAudience[] = ["organization", "trainee"];

/**
 * Request lifecycle (service state only). What the AI produced is `resultType`, set once `Succeeded`.
 * `Rejected` is reserved by v7 and not produced yet. The pre-v7 names (Queued, Running, SafetyRejected,
 * InsufficientEvidence as a status) are gone: list filters with them answer 400.
 */
export type AiRequestStatus = "Accepted" | "Processing" | "Succeeded" | "Failed" | "NeedsReconcile" | "Rejected";
export const AI_STATUSES: readonly AiRequestStatus[] = ["Accepted", "Processing", "Succeeded", "Failed", "NeedsReconcile"];

/** Outcome of a `Succeeded` request. InsufficientEvidence and RejectedBySafetyGate succeed as a request but carry no answer/draft. */
export type AiResultType = "KnowledgeAnswer" | "ScenarioDraft" | "InsufficientEvidence" | "RejectedBySafetyGate";
export const AI_RESULT_TYPES: readonly AiResultType[] = ["KnowledgeAnswer", "ScenarioDraft", "InsufficientEvidence", "RejectedBySafetyGate"];

/**
 * A filter value read from the URL, or "" when it is not one of `allowed`. Old links (pre-v7 statuses such as Queued or
 * Running) and hand-edited URLs then show the unfiltered list instead of sending a value the API rejects with 400.
 */
export function urlFilter<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An id read from the URL, or "" when it is not a GUID (the API answers 400 for anything else). */
export function urlId(value: string): string {
  return GUID.test(value) ? value : "";
}

/** `result.status`: Answered (KnowledgeAnswer), NeedsUserEdit (ScenarioDraft only), InsufficientEvidence, RejectedBySafetyGate. */
export type AiResultStatus = "Answered" | "NeedsUserEdit" | "InsufficientEvidence" | "RejectedBySafetyGate";

export type AiSourceKind = "KnowledgeSource" | "LibraryVersion" | "LearnPost" | "TrainingSnapshot" | "SessionResult";
export const AI_SOURCE_KINDS: readonly AiSourceKind[] = ["KnowledgeSource", "LibraryVersion", "LearnPost"];

/**
 * Where a source can be opened (`AiSourceLink`): every field is present, the ones that do not apply are null.
 * LearnPost → `learnSlug` + `learnPostId`, LibraryVersion → `libraryItemId`, KnowledgeSource → `sourceUri` (https).
 */
export type AiSourceLink = { learnSlug?: string | null; learnPostId?: string | null; libraryItemId?: string | null; sourceUri?: string | null };

/** `GET /api/ai/organization/sources` item: what the organization may cite right now. */
export type AiEligibleSource = { kind: AiSourceKind | (string & {}); id: string; versionId: string; title: string; versionLabel: string; link?: AiSourceLink | null };
export type AiSourceList = { items: AiEligibleSource[] };

/** Source as pinned on the request (id, version, content hash). */
export type AiPinnedSource = AiEligibleSource & { contentHash?: string };

export type AiSourceRef = { kind: string; id: string };

/** `AiCitationView`: kind, title, version and link are resolved by the backend against the pins, never taken from the provider. */
export type AiCitation = {
  kind: string;
  id: string;
  versionId?: string;
  title?: string;
  versionLabel?: string;
  chunkId?: string | null;
  locator?: string | null;
  relevance?: number | null;
  link?: AiSourceLink | null;
};

export type AiBimAnchor = { ifcGlobalId: string; entityType?: string | null; revisionId: string };

/** What was asked (`AiRequestInputView`); lets a client that lost the submit response find its request again by text. */
export type AiRequestInput = {
  text: string;
  inputHash?: string;
  buildingId?: string | null;
  buildingName?: string | null;
  revisionId?: string | null;
  requestedSources?: AiSourceRef[];
  context?: Record<string, unknown> | null;
};

/** `fet3d.editor/1` document proposed for ScenarioDraft; shape-checked by the BE, content is only a proposal. */
export type AiDraftProposal = { state: Record<string, unknown>; notes?: string | null };

export type AiResult = {
  status?: AiResultStatus | (string & {});
  /** Pre-v7 location of the citations; v7 returns them on the request (`AiRequest.citations`). */
  citations?: AiCitation[];
  /** Plain text (Answer). */
  answer?: string;
  draft?: AiDraftProposal;
  /** Plain text for InsufficientEvidence / RejectedBySafetyGate. */
  message?: string | null;
  confidence?: "low" | "medium" | "high" | (string & {}) | null;
  assumptions?: string[] | null;
  limitations?: string[] | null;
  bimAnchors?: AiBimAnchor[] | null;
};

export type AiAllocation = { grantId: string; reservedUnits: number; consumedUnits: number | null; status: string };

/** Same fields for the organization and the admin; `*Admin` fields exist only on `/api/admin/ai/requests`. */
export type AiRequest = {
  requestId: string;
  audience?: AiAudience | (string & {});
  operation: AiOperation | (string & {});
  status: AiRequestStatus | (string & {});
  /** Set when `status` is Succeeded, null before. */
  resultType?: AiResultType | (string & {}) | null;
  quotaUnit?: string;
  reservedUnits?: number;
  /** `null` until the request is settled (BE `int?`, serialized as null). */
  consumedUnits?: number | null;
  sources?: AiPinnedSource[];
  result?: AiResult | null;
  citations?: AiCitation[];
  failureCode?: string | null;
  input?: AiRequestInput | null;
  /** Trainee only: the context (Training access, Learn post) is gone, so result and citations are withheld. */
  resultWithheld?: boolean | null;
  createdAt: string;
  completedAt?: string | null;
  revision?: number;
  // admin only
  modelVersion?: string | null;
  organizationId?: string;
  actorUserId?: string;
  policyId?: string;
  attempts?: number;
  reconcileRequestedAt?: string | null;
  /** Raw provider payload (BE `JsonElement?`): arbitrary JSON, admin detail only. */
  providerResult?: unknown;
  /** Provider token/usage report (BE `JsonElement?`), admin detail only. Never used for quota. */
  technicalUsage?: unknown;
  updatedAt?: string;
  allocations?: AiAllocation[];
};

export type AiRequestPage = { items: AiRequest[]; total: number; page: number; pageSize: number };

export type AiRequestFilters = { status?: string; resultType?: string; operation?: string; mine?: boolean; page?: number; pageSize?: number };
export type AdminAiRequestFilters = { status?: string; operation?: string; audience?: string; organizationId?: string; page?: number; pageSize?: number };

export type AnswerInput = { question: string; sources?: AiSourceRef[] };
/** `revisionId` pins one accepted-geometry revision; without it the BE takes the newest such revision (none → 409 AI_REVISION_NOT_READY). */
export type ScenarioDraftInput = { buildingId: string; prompt: string; sources?: AiSourceRef[]; revisionId?: string };

/** `GET /api/ai/organization/limits` item: what one request reserves now and whether the pooled balance covers it. */
export type AiOperationLimit = {
  operation: AiOperation | (string & {});
  policyActive: boolean;
  quotaUnit?: string | null;
  estimatedReserve?: number | null;
  maxInputChars?: number | null;
  maxSources?: number | null;
  availableUnits: number;
  canSubmit: boolean;
};
export type AiLimits = { items: AiOperationLimit[] };

/** `GET /api/ai/trainee/quota`: today's allowance (Asia/Ho_Chi_Minh day); used + reserved never exceed dailyUnits. */
export type TraineeAiQuota = {
  policyActive: boolean;
  quotaUnit?: string | null;
  dailyUnits?: number | null;
  usedUnits: number;
  reservedUnits: number;
  remainingUnits: number;
  estimatedReserve?: number | null;
  maxInputChars?: number | null;
  resetsAt: string;
  blockedByAssessment: boolean;
  canSubmit: boolean;
};

/** What a Trainee question is about: a published Learn version, a Training they may play, or one of their results. */
export type TraineeAiContext =
  | { kind: "Learn"; postId: string; versionId: string }
  | { kind: "Training"; trainingId: string }
  | { kind: "Result"; sessionId: string };
export type TraineeAnswerInput = { question: string; context?: TraineeAiContext; sources?: AiSourceRef[] };

export type AiPolicy = {
  id: string;
  operation: AiOperation | (string & {});
  quotaUnit: string;
  reserveUnits: number;
  maxInputChars: number;
  maxSources: number;
  /** TraineeAnswer only: allowance per Trainee per Asia/Ho_Chi_Minh day. */
  dailyUnits?: number | null;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  createdAt: string;
  /** Only on the `/end` response: the policy had not started yet, so it was removed instead of ended. */
  cancelled?: boolean | null;
};
/** Body of `POST /api/admin/ai/policies/{id}/end` (BE `EndAiPolicyRequest`); omitted `effectiveUntil` means now. */
export type EndAiPolicyInput = { effectiveUntil?: string };
export type AiPolicyPage = { items: AiPolicy[]; total: number; page: number; pageSize: number };
export type AiPolicyFilters = { operation?: string; page?: number; pageSize?: number };
export type CreateAiPolicyInput = {
  operation: string;
  quotaUnit: string;
  reserveUnits: number;
  maxInputChars: number;
  maxSources: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
  dailyUnits?: number;
};

export type KnowledgeVisibility = "Common" | "Organization";
export type KnowledgeStatus = "Draft" | "Approved" | "Retired";
export type KnowledgeSource = {
  id: string;
  visibility: KnowledgeVisibility | (string & {});
  organizationId?: string | null;
  title: string;
  sourceUri?: string | null;
  versionLabel: string;
  sourceHash: string;
  jurisdiction?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  approvalStatus: KnowledgeStatus | (string & {});
  approvedAt?: string | null;
  createdAt: string;
  revision: number;
  /** Only on the list/detail catalog: a Learn draft may cite it / publish and RAG accept it now. */
  canUseInDraft?: boolean;
  canPublishReference?: boolean;
};
/**
 * BE#188 `POST /api/admin/knowledge-sources/{id}/verify`: the API downloads `sourceUri` the way the AI service does and compares
 * its SHA-256 with `sourceHash`. Read-only. `reason` (Unavailable): NO_SOURCE_URI, URI_INVALID, ADDRESS_NOT_PUBLIC, FETCH_FAILED,
 * TIMEOUT, TOO_LARGE, TOO_MANY_REDIRECTS, REDIRECT_INVALID or HTTP_STATUS_nnn.
 */
export type KnowledgeSourceVerification = {
  sourceId: string;
  outcome: "Match" | "HashMismatch" | "Unavailable" | (string & {});
  sourceHash: string;
  actualHash?: string | null;
  sizeBytes?: number | null;
  httpStatus?: number | null;
  contentType?: string | null;
  reason?: string | null;
  checkedAt: string;
};
export type KnowledgeSourcePage = { items: KnowledgeSource[]; total: number; page: number; pageSize: number };
export type KnowledgeSourceFilters = { visibility?: string; status?: string; search?: string; page?: number; pageSize?: number };
export type CreateKnowledgeSourceInput = {
  visibility: string;
  title: string;
  versionLabel: string;
  sourceHash: string;
  organizationId?: string;
  sourceUri?: string;
  jurisdiction?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
};

export type WithEtag<T> = { data: T; etag: string };
