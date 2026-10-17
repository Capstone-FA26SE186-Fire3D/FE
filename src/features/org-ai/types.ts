/**
 * Organization AI through the .NET API (BE `docs/organization-ai.md`, OpenAPI schemas `AiRequestView`/`AiRequestPage`,
 * Docs v7 vocabulary since BE#89). The FE never talks to the FastAPI adapter.
 */

export type AiOperation = "ScenarioDraft" | "Answer";
export const AI_OPERATIONS: readonly AiOperation[] = ["Answer", "ScenarioDraft"];

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

export type AiSourceKind = "KnowledgeSource" | "LibraryVersion" | "LearnPost";
export const AI_SOURCE_KINDS: readonly AiSourceKind[] = ["KnowledgeSource", "LibraryVersion", "LearnPost"];

/** `GET /api/ai/organization/sources` item: what the organization may cite right now. */
export type AiEligibleSource = { kind: AiSourceKind | (string & {}); id: string; versionId: string; title: string; versionLabel: string };
export type AiSourceList = { items: AiEligibleSource[] };

/** Source as pinned on the request (id, version, content hash). */
export type AiPinnedSource = AiEligibleSource & { contentHash?: string };

export type AiSourceRef = { kind: string; id: string };

export type AiCitation = { kind: string; id: string; locator?: string };

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
};

export type AiAllocation = { grantId: string; reservedUnits: number; consumedUnits: number | null; status: string };

/** Same fields for the organization and the admin; `*Admin` fields exist only on `/api/admin/ai/requests`. */
export type AiRequest = {
  requestId: string;
  operation: AiOperation | (string & {});
  status: AiRequestStatus | (string & {});
  /** Set when `status` is Succeeded, null before. */
  resultType?: AiResultType | (string & {}) | null;
  quotaUnit?: string;
  reservedUnits?: number;
  consumedUnits?: number;
  sources?: AiPinnedSource[];
  result?: AiResult | null;
  citations?: AiCitation[];
  failureCode?: string | null;
  createdAt: string;
  completedAt?: string;
  revision?: number;
  // admin only
  organizationId?: string;
  actorUserId?: string;
  policyId?: string;
  attempts?: number;
  reconcileRequestedAt?: string;
  providerResult?: unknown;
  updatedAt?: string;
  allocations?: AiAllocation[];
};

export type AiRequestPage = { items: AiRequest[]; total: number; page: number; pageSize: number };

export type AiRequestFilters = { status?: string; resultType?: string; operation?: string; mine?: boolean; page?: number; pageSize?: number };
export type AdminAiRequestFilters = { status?: string; organizationId?: string; page?: number; pageSize?: number };

export type AnswerInput = { question: string; sources?: AiSourceRef[] };
export type ScenarioDraftInput = { buildingId: string; prompt: string; sources?: AiSourceRef[] };

export type AiPolicy = {
  id: string;
  operation: AiOperation | (string & {});
  quotaUnit: string;
  reserveUnits: number;
  maxInputChars: number;
  maxSources: number;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  createdAt: string;
};
export type CreateAiPolicyInput = {
  operation: string;
  quotaUnit: string;
  reserveUnits: number;
  maxInputChars: number;
  maxSources: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
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
