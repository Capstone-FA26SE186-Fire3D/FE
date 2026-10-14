import { apiClient } from "@/api/client";
import { normalizePage, type RawPage } from "@/api/pagination";
import type { PageResponse } from "@/api/types/common";

import type {
  BuildReleaseInput,
  ConfirmTrainingInput,
  ConfirmTrainingResult,
  ContentReviewSubmission,
  CreatedResource,
  DraftForSnapshot,
  DraftPage,
  DraftSummary,
  DraftValidation,
  JobQa,
  PackageBuildAccepted,
  PackageBuildRequest,
  RetryJobInput,
  RetryJobResult,
  ProcessingJobDetail,
  ProcessingJobPage,
  Release,
  ReleaseListFilters,
  ReleasePage,
  ReleaseSummary,
  ScenarioDetail,
  ScenarioVersionDetail,
  ScenarioVersionPage,
  ScenarioVersionSummary,
  TrainingItem,
  ValidationRunHistoryItem,
  VersionIssuePage,
  VersionReadiness,
  VersionReview,
} from "./version-types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Scenario version / readiness / release calls (Organization). Every write that BE marks idempotent takes
 * the caller's `idempotencyKey`: one key per user intent, reused unchanged when the same payload is retried.
 */
export const scenarioVersionsApi = {
  getScenario(accessToken: string, scenarioId: string, signal?: AbortSignal) {
    return apiClient.request<ScenarioDetail>(`/api/scenarios/${scenarioId}`, { headers: headers(accessToken), signal });
  },
  async listVersions(accessToken: string, scenarioId: string, page: number, pageSize: number, signal?: AbortSignal): Promise<ScenarioVersionPage> {
    const raw = await apiClient.request<RawPage<ScenarioVersionSummary>>(`/api/scenarios/${scenarioId}/versions`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
    return normalizePage(raw, { page, pageSize });
  },
  /** Drafts of a scenario without state, newest save first. Lets the user resume work after a reload or on another machine. */
  async listDrafts(accessToken: string, scenarioId: string, page: number, pageSize: number, signal?: AbortSignal): Promise<DraftPage> {
    const raw = await apiClient.request<RawPage<DraftSummary>>(`/api/scenarios/${scenarioId}/drafts`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
    return normalizePage(raw, { page, pageSize });
  },
  /** Technical readiness of the version (package job, QA outcome, confirmation, `missing` codes). Report only. */
  getVersionReadiness(accessToken: string, versionId: string, signal?: AbortSignal) {
    return apiClient.request<VersionReadiness>(`/api/scenario-versions/${versionId}/readiness`, { headers: headers(accessToken), signal });
  },
  /** Frozen submission: hashes, submit/decision metadata and rejection reason. 404 while the version was never submitted. */
  getVersionReview(accessToken: string, versionId: string, signal?: AbortSignal) {
    return apiClient.request<VersionReview>(`/api/scenario-versions/${versionId}/review`, { headers: headers(accessToken), signal });
  },
  /** QA history of the revision across jobs and attempts, newest first. */
  async listValidationRuns(accessToken: string, revisionId: string, page: number, pageSize: number, signal?: AbortSignal): Promise<PageResponse<ValidationRunHistoryItem>> {
    const raw = await apiClient.request<RawPage<ValidationRunHistoryItem>>(`/api/revisions/${revisionId}/validation-runs`, {
      headers: headers(accessToken),
      query: { page, pageSize },
      signal,
    });
    return normalizePage(raw, { page, pageSize });
  },
  /** Releases newest first; an OrganizationUser only sees its own organization. */
  async listReleases(accessToken: string, filters: ReleaseListFilters, page: number, pageSize: number, signal?: AbortSignal): Promise<ReleasePage> {
    const raw = await apiClient.request<RawPage<ReleaseSummary>>("/api/releases", {
      headers: headers(accessToken),
      query: { ...filters, page, pageSize },
      signal,
    });
    return normalizePage(raw, { page, pageSize });
  },
  getVersion(accessToken: string, versionId: string, signal?: AbortSignal) {
    return apiClient.request<ScenarioVersionDetail>(`/api/scenario-versions/${versionId}`, { headers: headers(accessToken), signal });
  },

  /** Reads a draft with the ETag (`"<xmin>"`) that `snapshotDraft` must send as `If-Match`. */
  async getDraft(accessToken: string, draftId: string, signal?: AbortSignal): Promise<{ draft: DraftForSnapshot; eTag: string }> {
    const response = await apiClient.requestWithMeta<DraftForSnapshot>(`/api/scenario-drafts/${draftId}`, { headers: headers(accessToken), signal });
    return { draft: response.data, eTag: response.headers.get("etag") ?? `"${response.data.version}"` };
  },
  validateDraft(accessToken: string, draftId: string) {
    return apiClient.request<DraftValidation>(`/api/scenario-drafts/${draftId}/validate`, { headers: headers(accessToken), method: "POST" });
  },
  /** 201 `{id}` of the new immutable version. 412 = draft changed since `eTag`; 428 = no If-Match. */
  snapshotDraft(accessToken: string, draftId: string, eTag: string, idempotencyKey: string) {
    return apiClient.request<CreatedResource>(`/api/scenario-drafts/${draftId}/snapshot`, {
      headers: headers(accessToken),
      idempotencyKey,
      ifMatch: eTag,
      method: "POST",
    });
  },

  /** Jobs of the revision (newest first); the caller filters by `scenarioVersionId`. Up to 100 per page. */
  listRevisionJobs(accessToken: string, revisionId: string, signal?: AbortSignal) {
    return apiClient.request<ProcessingJobPage>(`/api/revisions/${revisionId}/processing-jobs`, {
      headers: headers(accessToken),
      query: { page: 1, pageSize: 100 },
      signal,
    });
  },
  /** 202: queued only. `{jobId}`; poll `getJob` / `getJobQa`. */
  startPackageBuild(accessToken: string, versionId: string, input: PackageBuildRequest, idempotencyKey: string) {
    return apiClient.request<PackageBuildAccepted>(`/api/scenario-versions/${versionId}/package-builds`, {
      headers: headers(accessToken),
      idempotencyKey,
      json: input,
    });
  },
  getJob(accessToken: string, jobId: string, signal?: AbortSignal) {
    return apiClient.request<ProcessingJobDetail>(`/api/processing-jobs/${jobId}`, { headers: headers(accessToken), signal });
  },
  /** Requeues a Failed job (202). Same `requestId` + reason replays; a new intent needs a new `requestId`. */
  retryJob(accessToken: string, jobId: string, input: RetryJobInput) {
    return apiClient.request<RetryJobResult>(`/api/processing-jobs/${jobId}/retry`, { headers: headers(accessToken), json: input });
  },
  getJobQa(accessToken: string, jobId: string, signal?: AbortSignal) {
    return apiClient.request<JobQa>(`/api/processing-jobs/${jobId}/qa`, { headers: headers(accessToken), query: { page: 1, pageSize: 20 }, signal });
  },
  listRevisionIssues(accessToken: string, revisionId: string, signal?: AbortSignal) {
    return apiClient.request<VersionIssuePage>(`/api/revisions/${revisionId}/issues`, {
      headers: headers(accessToken),
      query: { page: 1, pageSize: 100 },
      signal,
    });
  },
  /** Technical attestation only (no content approval). Repeating it for the same run returns the same `reviewId`. */
  confirmForTraining(accessToken: string, revisionId: string, input: ConfirmTrainingInput) {
    return apiClient.request<ConfirmTrainingResult>(`/api/revisions/${revisionId}/confirm-for-training`, { headers: headers(accessToken), json: input });
  },

  /** 201 with the frozen hashes. Idempotency-Key is required by BE for this call. */
  submitForReview(accessToken: string, versionId: string, idempotencyKey: string) {
    return apiClient.request<ContentReviewSubmission>(`/api/scenario-versions/${versionId}/submit`, {
      headers: headers(accessToken),
      idempotencyKey,
      method: "POST",
    });
  },

  buildRelease(accessToken: string, input: BuildReleaseInput, idempotencyKey: string) {
    return apiClient.request<Release>("/api/releases", { headers: headers(accessToken), idempotencyKey, json: input });
  },
  getRelease(accessToken: string, releaseId: string, signal?: AbortSignal) {
    return apiClient.request<Release>(`/api/releases/${releaseId}`, { headers: headers(accessToken), signal });
  },
  /**
   * Publishes a Built release: 200 with the updated `ReleaseResponse`. `Idempotency-Key` is required: reuse the same key
   * when the same release is retried. 503 `PUBLISH_GATE_UNAVAILABLE` and 409 gate codes leave it Built; always take the
   * status from the response or a fresh read, never assume Published.
   */
  publishRelease(accessToken: string, releaseId: string, idempotencyKey: string) {
    return apiClient.request<Release>(`/api/releases/${releaseId}/publish`, { headers: headers(accessToken), idempotencyKey, method: "POST" });
  },
  revokeRelease(accessToken: string, releaseId: string, reason: string) {
    return apiClient.request<void>(`/api/releases/${releaseId}/revoke`, { headers: headers(accessToken), json: { reason }, method: "POST" });
  },
  /** Read only, not paginated. */
  listTrainings(accessToken: string, buildingId: string, signal?: AbortSignal) {
    return apiClient.request<TrainingItem[]>(`/api/buildings/${buildingId}/trainings`, { headers: headers(accessToken), signal });
  },
};
