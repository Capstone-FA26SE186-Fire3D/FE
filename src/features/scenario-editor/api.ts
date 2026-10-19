import { apiClient } from "@/api/client";
import type { EditorPreview } from "@/features/buildings/types";

import { draftEtag, normalizeEtag } from "./store/etag";
import type { JsonObject } from "./store/json";

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

export type ScenarioDetail = { id: string; buildingId: string; organizationId: string; name: string; createdAt: string };

/** `GET /api/scenario-drafts/{id}`: `state` is whatever JSON the BE stored (`{}` for a new draft). */
export type DraftResponse = {
  id: string;
  scenarioId: string;
  revisionId: string;
  buildingId: string;
  organizationId: string;
  draftNumber: number;
  state: JsonObject;
  source: string;
  lastAiRequestId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type LoadedDraft = { draft: DraftResponse; etag: string };

export type RuntimeCatalogEntry = { runtimeVersion: string; protocolVersion: string; manifestSchemaVersion: string; capabilities: unknown; capabilityContracts?: unknown };

export type ValidateResponse = { draftId: string; version: number; isValid: boolean; issues: unknown };

/** `POST /api/scenario-drafts/{id}/validate-state`: dry run of an unsaved body. `stateHash` is the SHA-256 of the exact request body bytes. */
export type ValidateStateResponse = { draftId: string; storedVersion: number; stateHash: string; isValid: boolean; issues: unknown };

/** `GET /api/buildings/{id}/editor-preview` with the `fet3d.editor/1` fields (status Ready | NotReady | ReprocessRequired). */
export type EditorPreviewV1 = EditorPreview & { schemaVersion?: string | null; units?: string | null; upAxis?: string | null; handedness?: string | null };

/** `GET /api/revisions/{id}/floors`: pin + floors of the accepted Geometry artifact, without storage access. */
export type RevisionFloorsResponse = { revisionId: string; buildingId: string; status: string; artifactId: string | null; sha256Hash: string | null; schemaVersion: string | null; floors: unknown | null };

export const scenarioEditorApi = {
  getScenario(accessToken: string, scenarioId: string, signal?: AbortSignal) {
    return apiClient.request<ScenarioDetail>(`/api/scenarios/${scenarioId}`, { headers: auth(accessToken), signal });
  },
  async getDraft(accessToken: string, draftId: string, signal?: AbortSignal): Promise<LoadedDraft> {
    const response = await apiClient.requestWithMeta<DraftResponse>(`/api/scenario-drafts/${draftId}`, { headers: auth(accessToken), signal });
    const etag = draftEtag(response.headers, response.data.version);
    if (!etag) throw new Error("Máy chủ không trả ETag cho bản nháp.");
    return { draft: response.data, etag };
  },
  /**
   * PUT with `If-Match`. 204 carries the new ETag in the header (CORS exposes `ETag`). If a proxy strips it, the caller
   * must reload the draft: the new revision is not derivable client-side, and guessing it would risk overwriting.
   */
  async putDraft(accessToken: string, draftId: string, body: JsonObject, etag: string, signal?: AbortSignal): Promise<{ etag: string | null }> {
    const response = await apiClient.requestWithMeta<void>(`/api/scenario-drafts/${draftId}`, {
      headers: auth(accessToken), json: body, method: "PUT", ifMatch: etag, signal,
    });
    return { etag: normalizeEtag(response.headers.get("etag")) };
  },
  validate(accessToken: string, draftId: string, signal?: AbortSignal) {
    return apiClient.request<ValidateResponse>(`/api/scenario-drafts/${draftId}/validate`, { headers: auth(accessToken), method: "POST", signal });
  },
  createDraft(accessToken: string, scenarioId: string, revisionId: string, idempotencyKey: string) {
    return apiClient.request<{ id: string }>(`/api/scenarios/${scenarioId}/draft`, {
      headers: auth(accessToken), json: { revisionId }, idempotencyKey,
    });
  },
  catalog(accessToken: string, signal?: AbortSignal) {
    return apiClient.request<RuntimeCatalogEntry[]>("/api/scenario-interactions/catalog", { headers: auth(accessToken), signal });
  },
  editorPreview(accessToken: string, buildingId: string, revisionId: string, signal?: AbortSignal) {
    return apiClient.request<EditorPreviewV1>(`/api/buildings/${buildingId}/editor-preview`, { headers: auth(accessToken), query: { revisionId }, signal });
  },
  revisionFloors(accessToken: string, revisionId: string, signal?: AbortSignal) {
    return apiClient.request<RevisionFloorsResponse>(`/api/revisions/${revisionId}/floors`, { headers: auth(accessToken), signal });
  },
  rubricCatalog(accessToken: string, signal?: AbortSignal) {
    return apiClient.request<unknown>("/api/scenario-rubrics/catalog", { headers: auth(accessToken), signal });
  },
  /** Validates the body that would be PUT without storing it or changing the ETag. Shape problems come back as issues (200), not 422. */
  validateState(accessToken: string, draftId: string, body: JsonObject, signal?: AbortSignal) {
    return apiClient.request<ValidateStateResponse>(`/api/scenario-drafts/${draftId}/validate-state`, { headers: auth(accessToken), method: "POST", json: body, signal });
  },
};
