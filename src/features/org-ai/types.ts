/**
 * Organization AI through the .NET API (BE `docs/organization-ai.md`, OpenAPI @ 1eaf988). The OpenAPI only declares
 * `JsonElement` for the bodies below, so these shapes follow the BE source (`ai_request_representation`, the gates in
 * `OrganizationAi.sql`, `OrganizationAiContracts.cs`). The FE never talks to the FastAPI adapter.
 */

export type AiOperation = "ScenarioDraft" | "Answer";
export const AI_OPERATIONS: readonly AiOperation[] = ["Answer", "ScenarioDraft"];

/** Request lifecycle. `Succeeded | InsufficientEvidence | SafetyRejected` are the adapter outcomes; the rest are service states. */
export type AiRequestStatus = "Queued" | "Running" | "Succeeded" | "InsufficientEvidence" | "SafetyRejected" | "Failed" | "NeedsReconcile";
export const AI_STATUSES: readonly AiRequestStatus[] = ["Queued", "Running", "Succeeded", "InsufficientEvidence", "SafetyRejected", "Failed", "NeedsReconcile"];

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
  outcome?: string;
  citations?: AiCitation[];
  /** Plain text (Answer). */
  answer?: string;
  draft?: AiDraftProposal;
  /** Plain text for InsufficientEvidence / SafetyRejected. */
  message?: string | null;
};

export type AiAllocation = { grantId: string; reservedUnits: number; consumedUnits: number | null; status: string };

/** Same fields for the organization and the admin; `*Admin` fields exist only on `/api/admin/ai/requests`. */
export type AiRequest = {
  requestId: string;
  operation: AiOperation | (string & {});
  status: AiRequestStatus | (string & {});
  quotaUnit?: string;
  reservedUnits?: number;
  consumedUnits?: number;
  sources?: AiPinnedSource[];
  result?: AiResult;
  failureCode?: string;
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

export type AiRequestFilters = { status?: string; operation?: string; mine?: boolean; page?: number; pageSize?: number };
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
