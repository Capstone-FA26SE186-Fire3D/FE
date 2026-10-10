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

export type RuntimeCatalogEntry = { runtimeVersion: string; protocolVersion: string; manifestSchemaVersion: string; capabilities: unknown };

export type ValidateResponse = { draftId: string; version: number; isValid: boolean; issues: unknown };

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
    return apiClient.request<EditorPreview>(`/api/buildings/${buildingId}/editor-preview`, { headers: auth(accessToken), query: { revisionId }, signal });
  },
};
