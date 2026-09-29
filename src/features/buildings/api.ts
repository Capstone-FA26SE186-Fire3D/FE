import { apiClient } from "@/api/client";

import type {
  Building,
  BimFactPage,
  BuildingFilters,
  BuildingInput,
  BuildingPage,
  BuildingSummary,
  EditorPreview,
  FinalizeIfcUploadInput,
  InitiatedIfcUpload,
  InitiateIfcUploadInput,
  RevisionPage,
  RevisionIssuePage,
  ProcessingJobPage,
  AnnotationItem,
  AnnotationSnapshot,
} from "./types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const buildingsApi = {
  list(accessToken: string, filters: BuildingFilters) {
    return apiClient.request<BuildingPage>("/api/buildings", {
      headers: headers(accessToken),
      query: filters,
    });
  },
  create(accessToken: string, input: BuildingInput) {
    return apiClient.request<Building>("/api/buildings", {
      headers: headers(accessToken),
      json: input,
    });
  },
  get(accessToken: string, id: string) {
    return apiClient.request<Building>(`/api/buildings/${id}`, { headers: headers(accessToken) });
  },
  update(accessToken: string, id: string, input: BuildingInput) {
    return apiClient.request<Building>(`/api/buildings/${id}`, {
      headers: headers(accessToken),
      json: input,
      method: "PUT",
    });
  },
  archive(accessToken: string, id: string) {
    return apiClient.request<BuildingSummary>(`/api/buildings/${id}`, {
      headers: headers(accessToken),
      method: "DELETE",
    });
  },
  listRevisions(accessToken: string, buildingId: string, page = 1, pageSize = 20) {
    return apiClient.request<RevisionPage>(`/api/buildings/${buildingId}/revisions`, {
      headers: headers(accessToken),
      query: { page, pageSize },
    });
  },
  initiateUpload(accessToken: string, buildingId: string, input: InitiateIfcUploadInput) {
    return apiClient.request<InitiatedIfcUpload>(`/api/buildings/${buildingId}/revisions/upload-url`, {
      headers: headers(accessToken),
      json: input,
    });
  },
  finalizeUpload(accessToken: string, revisionId: string, input: FinalizeIfcUploadInput) {
    return apiClient.request<void>(`/api/revisions/${revisionId}/upload-complete`, {
      headers: headers(accessToken),
      json: input,
    });
  },
  getPreview(accessToken: string, buildingId: string, revisionId: string) {
    return apiClient.request<EditorPreview>(`/api/buildings/${buildingId}/editor-preview`, {
      headers: headers(accessToken),
      query: { revisionId },
    });
  },
  processRevision(accessToken: string, revisionId: string) {
    return apiClient.request<void>(`/api/revisions/${revisionId}/process`, {
      headers: headers(accessToken),
      method: "POST",
    });
  },
  listProcessingJobs(accessToken: string, revisionId: string) {
    return apiClient.request<ProcessingJobPage>(`/api/revisions/${revisionId}/processing-jobs`, {
      headers: headers(accessToken),
      query: { page: 1, pageSize: 20 },
    });
  },
  listIssues(accessToken: string, revisionId: string) {
    return apiClient.request<RevisionIssuePage>(`/api/revisions/${revisionId}/issues`, {
      headers: headers(accessToken),
      query: { page: 1, pageSize: 50 },
    });
  },
  listBimFacts(accessToken: string, revisionId: string) {
    return apiClient.request<BimFactPage>(`/api/revisions/${revisionId}/bim-facts`, {
      headers: headers(accessToken),
      query: { page: 1, pageSize: 50 },
    });
  },
  getAnnotations(accessToken: string, revisionId: string) {
    return apiClient.request<AnnotationSnapshot>(`/api/revisions/${revisionId}/annotations`, {
      headers: headers(accessToken),
    });
  },
  saveAnnotations(accessToken: string, revisionId: string, items: AnnotationItem[], eTag: string) {
    return apiClient.request<AnnotationSnapshot>(`/api/revisions/${revisionId}/annotations`, {
      headers: { ...headers(accessToken), "If-Match": eTag },
      json: { items },
      method: "PUT",
    });
  },
};
