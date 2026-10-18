import { apiClient } from "@/api/client";
import { ApiError, type PageResponse } from "@/api/types/common";
import type { ScenarioSummary } from "@/features/scenarios/types";

import type {
  AnnotationItem,
  AnnotationSnapshot,
  BimFactPage,
  Building,
  BuildingAccess,
  BuildingFilters,
  BuildingInput,
  BuildingPage,
  BuildingRevision,
  BuildingSummary,
  ConfirmTrainingInput,
  EditorPreview,
  EquipmentCandidates,
  EquipmentDecisionInput,
  FinalizeIfcUploadInput,
  InitiateIfcUploadInput,
  InitiatedIfcUpload,
  JobQa,
  ProcessRevisionResult,
  ProcessingJobDetail,
  ProcessingJobPage,
  ProcessingLogPage,
  RetryJobResult,
  RevisionArtifactPage,
  RevisionIssuePage,
  RevisionPage,
  ScenarioVersionPage,
  VersionedBuilding,
} from "./types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** PlatformAdmin selects the tenant with `organizationId`; an OrganizationUser never sends it. */
function orgQuery(organizationId?: string) {
  return organizationId ? { organizationId } : undefined;
}

export const buildingsApi = {
  /** `filters.organizationId` is required for PlatformAdmin and must be omitted for OrganizationUser. */
  list(accessToken: string, filters: BuildingFilters, signal?: AbortSignal) {
    return apiClient.request<BuildingPage>("/api/buildings", {
      headers: headers(accessToken),
      query: filters,
      signal,
    });
  },
  /**
   * PlatformAdmin passes `organizationId`; it travels in the body (the query alias is deprecated in the BE).
   * Idempotency-Key is mandatory (400 IDEMPOTENCY_KEY_REQUIRED): the same key + same input replays the first 201,
   * the same key with another input is 409 IDEMPOTENCY_KEY_CONFLICT.
   */
  async create(accessToken: string, input: BuildingInput, idempotencyKey: string, organizationId?: string): Promise<VersionedBuilding> {
    const response = await apiClient.requestWithMeta<Building>("/api/buildings", {
      headers: headers(accessToken),
      idempotencyKey,
      json: organizationId ? { ...input, organizationId } : input,
    });
    return { data: response.data, etag: response.headers.get("etag") };
  },
  get(accessToken: string, id: string, signal?: AbortSignal) {
    return apiClient.request<Building>(`/api/buildings/${id}`, { headers: headers(accessToken), signal });
  },
  /** Detail plus its ETag, for screens that will PUT or DELETE it. */
  async getVersioned(accessToken: string, id: string, signal?: AbortSignal): Promise<VersionedBuilding> {
    const response = await apiClient.requestWithMeta<Building>(`/api/buildings/${id}`, { headers: headers(accessToken), signal });
    return { data: response.data, etag: response.headers.get("etag") };
  },
  /** If-Match is mandatory: missing → 428, changed since read → 412 with `current` + new ETag (see `buildingConflict`). */
  async update(accessToken: string, id: string, input: BuildingInput, etag: string, organizationId?: string): Promise<VersionedBuilding> {
    const response = await apiClient.requestWithMeta<Building>(`/api/buildings/${id}`, {
      headers: headers(accessToken),
      ifMatch: etag,
      json: input,
      method: "PUT",
      query: orgQuery(organizationId),
    });
    return { data: response.data, etag: response.headers.get("etag") };
  },
  /** Archive (isActive=false), 200 with the summary. Same If-Match rules as PUT; an already archived Building answers 200 again. */
  async archive(accessToken: string, id: string, etag: string, organizationId?: string): Promise<VersionedBuilding<BuildingSummary>> {
    const response = await apiClient.requestWithMeta<BuildingSummary>(`/api/buildings/${id}`, {
      headers: headers(accessToken),
      ifMatch: etag,
      method: "DELETE",
      query: orgQuery(organizationId),
    });
    return { data: response.data, etag: response.headers.get("etag") };
  },
  listRevisions(accessToken: string, buildingId: string, page = 1, pageSize = 50, signal?: AbortSignal) {
    return apiClient.request<RevisionPage>(`/api/buildings/${buildingId}/revisions`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
  },

  getRevision(accessToken: string, revisionId: string, signal?: AbortSignal) {
    return apiClient.request<BuildingRevision>(`/api/revisions/${revisionId}`, { headers: headers(accessToken), signal });
  },

  /** Idempotency-Key is mandatory (400 IDEMPOTENCY_KEY_REQUIRED). Keep the key when retrying the same payload. */
  initiateUpload(accessToken: string, buildingId: string, input: InitiateIfcUploadInput, idempotencyKey: string) {
    return apiClient.request<InitiatedIfcUpload>(`/api/buildings/${buildingId}/revisions/upload-url`, {
      headers: headers(accessToken),
      idempotencyKey,
      json: input,
    });
  },
  /** 204 when the staged object matches. 410 expired, 422 mismatch, 503 + Retry-After storage unavailable. */
  finalizeUpload(accessToken: string, revisionId: string, input: FinalizeIfcUploadInput) {
    return apiClient.request<void>(`/api/revisions/${revisionId}/upload-complete`, {
      headers: headers(accessToken),
      json: input,
    });
  },
  getPreview(accessToken: string, buildingId: string, revisionId: string, signal?: AbortSignal) {
    return apiClient.request<EditorPreview>(`/api/buildings/${buildingId}/editor-preview`, {
      headers: headers(accessToken),
      query: { revisionId },
      signal,
    });
  },
  /**
   * 202 `{ jobId }` means queued, not processed. Needs an Idempotency-Key as well. When the revision already has a Geometry
   * job for the same file the BE answers 202 with that job again: it never starts a second run (BE request_revision_processing).
   */
  processRevision(accessToken: string, revisionId: string, idempotencyKey: string) {
    return apiClient.request<ProcessRevisionResult>(`/api/revisions/${revisionId}/process`, {
      headers: headers(accessToken),
      idempotencyKey,
      method: "POST",
    });
  },
  listProcessingJobs(accessToken: string, revisionId: string, page = 1, pageSize = 20, signal?: AbortSignal) {
    return apiClient.request<ProcessingJobPage>(`/api/revisions/${revisionId}/processing-jobs`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
  },
  getJob(accessToken: string, jobId: string, signal?: AbortSignal) {
    return apiClient.request<ProcessingJobDetail>(`/api/processing-jobs/${jobId}`, { headers: headers(accessToken), signal });
  },
  /** QA of the CURRENT attempt only; empty `validationRuns.items` means "no result yet", never "passed". */
  getJobQa(accessToken: string, jobId: string, signal?: AbortSignal) {
    return apiClient.request<JobQa>(`/api/processing-jobs/${jobId}/qa`, {
      headers: headers(accessToken),
      query: { page: 1, pageSize: 20 },
      signal,
    });
  },
  /** `requestId` is a fresh UUID per retry intent; resending the same one is replayed (AlreadyRequeued). */
  retryJob(accessToken: string, jobId: string, input: { requestId: string; reason: string }) {
    return apiClient.request<RetryJobResult>(`/api/processing-jobs/${jobId}/retry`, {
      headers: headers(accessToken),
      json: input,
    });
  },
  /** Candidates with their latest decision; ETag = overlay version. 409 EQUIPMENT_CANDIDATES_UNAVAILABLE without accepted geometry. */
  async getEquipmentCandidates(accessToken: string, revisionId: string, signal?: AbortSignal): Promise<VersionedBuilding<EquipmentCandidates>> {
    const response = await apiClient.requestWithMeta<EquipmentCandidates>(`/api/revisions/${revisionId}/equipment-candidates`, { headers: headers(accessToken), signal });
    return { data: response.data, etag: response.headers.get("etag") ?? `"${response.data.version}"` };
  },
  /** Merged over the latest decisions; If-Match required (412 when someone saved meanwhile). Returns the new view and ETag. */
  async saveEquipmentDecisions(accessToken: string, revisionId: string, items: EquipmentDecisionInput[], etag: string): Promise<VersionedBuilding<EquipmentCandidates>> {
    const response = await apiClient.requestWithMeta<EquipmentCandidates>(`/api/revisions/${revisionId}/equipment-decisions`, { headers: headers(accessToken), method: "PATCH", ifMatch: etag, json: { items } });
    return { data: response.data, etag: response.headers.get("etag") ?? `"${response.data.version}"` };
  },
  listIssues(accessToken: string, revisionId: string, page = 1, pageSize = 100, signal?: AbortSignal) {
    return apiClient.request<RevisionIssuePage>(`/api/revisions/${revisionId}/issues`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
  },
  listArtifacts(accessToken: string, revisionId: string, page = 1, pageSize = 50, signal?: AbortSignal) {
    return apiClient.request<RevisionArtifactPage>(`/api/revisions/${revisionId}/artifacts`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
  },
  listProcessingLogs(accessToken: string, revisionId: string, page = 1, pageSize = 50, signal?: AbortSignal) {
    return apiClient.request<ProcessingLogPage>(`/api/revisions/${revisionId}/processing-logs`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
  },
  listBimFacts(accessToken: string, revisionId: string, page = 1, pageSize = 20, signal?: AbortSignal) {
    return apiClient.request<BimFactPage>(`/api/revisions/${revisionId}/bim-facts`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
  },
  getAnnotations(accessToken: string, revisionId: string, signal?: AbortSignal) {
    return apiClient.request<AnnotationSnapshot>(`/api/revisions/${revisionId}/annotations`, {
      headers: headers(accessToken),
      signal,
    });
  },
  /** `version` is the snapshot version from the last GET; sent as If-Match `"<version>"`. 412 = someone saved first. */
  saveAnnotations(accessToken: string, revisionId: string, items: AnnotationItem[], version: number) {
    return apiClient.request<AnnotationSnapshot>(`/api/revisions/${revisionId}/annotations`, {
      headers: headers(accessToken),
      ifMatch: `"${version}"`,
      json: { items },
      method: "PUT",
    });
  },
  /** Technical readiness for an exact revision + scenario version + validation run. Not content approval. */
  confirmForTraining(accessToken: string, revisionId: string, input: ConfirmTrainingInput) {
    return apiClient.request<{ reviewId: string }>(`/api/revisions/${revisionId}/confirm-for-training`, {
      headers: headers(accessToken),
      json: input,
    });
  },

  getAccess(accessToken: string, buildingId: string, signal?: AbortSignal) {
    return apiClient.request<BuildingAccess>(`/api/buildings/${buildingId}/access`, { headers: headers(accessToken), signal });
  },
  updateAccess(accessToken: string, buildingId: string, visibility: "Private" | "Public", accessRevision: number) {
    return apiClient.request<BuildingAccess>(`/api/buildings/${buildingId}/access`, {
      headers: headers(accessToken),
      ifMatch: `"access-${accessRevision}"`,
      json: { visibility },
      method: "PATCH",
    });
  },
  /** The response carries the ONLY copy of the new code. */
  rotateParticipationCode(accessToken: string, buildingId: string, accessRevision: number) {
    return apiClient.request<BuildingAccess>(`/api/buildings/${buildingId}/participation-code/rotate`, {
      headers: headers(accessToken),
      ifMatch: `"access-${accessRevision}"`,
      method: "POST",
    });
  },
  revokeParticipationCode(accessToken: string, buildingId: string, accessRevision: number) {
    return apiClient.request<BuildingAccess>(`/api/buildings/${buildingId}/participation-code`, {
      headers: headers(accessToken),
      ifMatch: `"access-${accessRevision}"`,
      method: "DELETE",
    });
  },

  listScenarios(accessToken: string, buildingId: string, page = 1, pageSize = 20, signal?: AbortSignal) {
    return apiClient.request<PageResponse<ScenarioSummary>>(`/api/buildings/${buildingId}/scenarios`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
  },
  /** Idempotency-Key required. */
  createScenario(accessToken: string, input: { buildingId: string; name: string }, idempotencyKey: string) {
    return apiClient.request<{ id: string }>("/api/scenarios", {
      headers: headers(accessToken),
      idempotencyKey,
      json: input,
    });
  },
  listScenarioVersions(accessToken: string, scenarioId: string, page = 1, pageSize = 20, signal?: AbortSignal) {
    return apiClient.request<ScenarioVersionPage>(`/api/scenarios/${scenarioId}/versions`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
  },
};

/**
 * True when two reads describe the same version of a Building: same `updatedAt` and same fields a save sends back.
 * Used when the first read had no readable ETag: the ETag fetched at save time only applies to the data fetched with it.
 */
export function sameBuildingVersion(a: Building, b: Building): boolean {
  const pick = (x: Building) => JSON.stringify([x.name, x.buildingType ?? null, x.totalFloors, x.location ?? null, x.contact ?? null]);
  const at = (x: Building) => Date.parse(x.updatedAt);
  return a.id === b.id && at(a) === at(b) && pick(a) === pick(b);
}

/** A 412 on PUT/DELETE /api/buildings/{id}: the Building as it is now (`current`) and its new ETag, to compare and retry. */
export function buildingConflict(error: unknown): { current: Building | null; etag: string | null } | null {
  if (!(error instanceof ApiError) || error.status !== 412) return null;
  const current = error.payload?.current;
  return {
    current: current && typeof current === "object" && typeof (current as Building).id === "string" ? (current as Building) : null,
    etag: error.headers?.get("etag") ?? null,
  };
}
