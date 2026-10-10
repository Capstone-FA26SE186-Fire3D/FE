import { apiClient } from "@/api/client";
import type { PageResponse } from "@/api/types/common";
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
  BuildingSummary,
  ConfirmTrainingInput,
  EditorPreview,
  FinalizeIfcUploadInput,
  InitiatedIfcUpload,
  InitiateIfcUploadInput,
  JobQa,
  ProcessingJobDetail,
  ProcessingJobPage,
  ProcessingLogPage,
  ProcessRevisionResult,
  RetryJobResult,
  RevisionArtifactPage,
  RevisionIssuePage,
  RevisionPage,
  ScenarioVersionPage,
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
  /** PlatformAdmin passes `organizationId`; it travels in the body (the query alias is deprecated in the BE). */
  create(accessToken: string, input: BuildingInput, organizationId?: string) {
    return apiClient.request<Building>("/api/buildings", {
      headers: headers(accessToken),
      json: organizationId ? { ...input, organizationId } : input,
    });
  },
  get(accessToken: string, id: string, signal?: AbortSignal) {
    return apiClient.request<Building>(`/api/buildings/${id}`, { headers: headers(accessToken), signal });
  },
  update(accessToken: string, id: string, input: BuildingInput, organizationId?: string) {
    return apiClient.request<Building>(`/api/buildings/${id}`, {
      headers: headers(accessToken),
      json: input,
      method: "PUT",
      query: orgQuery(organizationId),
    });
  },
  archive(accessToken: string, id: string, organizationId?: string) {
    return apiClient.request<BuildingSummary>(`/api/buildings/${id}`, {
      headers: headers(accessToken),
      method: "DELETE",
      query: orgQuery(organizationId),
    });
  },
  listRevisions(accessToken: string, buildingId: string, page = 1, pageSize = 50, signal?: AbortSignal) {
    return apiClient.request<RevisionPage>(`/api/buildings/${buildingId}/revisions`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
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
  /** 202 `{ jobId }` means queued, not processed. Needs an Idempotency-Key as well. */
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
