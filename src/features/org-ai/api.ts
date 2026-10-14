import { apiClient } from "@/api/client";

import type {
  AdminAiRequestFilters,
  AiPolicy,
  AiRequest,
  AiRequestFilters,
  AiRequestPage,
  AiSourceList,
  AnswerInput,
  CreateAiPolicyInput,
  CreateKnowledgeSourceInput,
  KnowledgeSource,
  KnowledgeSourceFilters,
  KnowledgeSourcePage,
  ScenarioDraftInput,
  WithEtag,
} from "./types";

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

/** Knowledge-source ETag is the quoted revision (`"7"`); the body carries `revision`, used when a proxy strips the header. */
export const knowledgeEtag = (revision: number) => `"${revision}"`;

export const orgAiApi = {
  sources(accessToken: string, signal?: AbortSignal) {
    return apiClient.request<AiSourceList>("/api/ai/organization/sources", { headers: auth(accessToken), signal });
  },
  /** 202 + the queued request. The same Idempotency-Key replays the SAME request (never a second reservation). */
  submitAnswer(accessToken: string, input: AnswerInput, idempotencyKey: string, signal?: AbortSignal) {
    return apiClient.request<AiRequest>("/api/ai/organization/answer", { headers: auth(accessToken), json: input, idempotencyKey, signal });
  },
  submitScenarioDraft(accessToken: string, input: ScenarioDraftInput, idempotencyKey: string, signal?: AbortSignal) {
    return apiClient.request<AiRequest>("/api/ai/organization/scenario-draft", { headers: auth(accessToken), json: input, idempotencyKey, signal });
  },
  listRequests(accessToken: string, filters: AiRequestFilters, signal?: AbortSignal) {
    return apiClient.request<AiRequestPage>("/api/ai/requests", { headers: auth(accessToken), query: { ...filters }, signal });
  },
  /** Source of truth for a request: used by polling, reload and to resolve an unknown submit outcome. */
  getRequest(accessToken: string, requestId: string, signal?: AbortSignal) {
    return apiClient.request<AiRequest>(`/api/ai/requests/${encodeURIComponent(requestId)}`, { headers: auth(accessToken), signal });
  },
};

export const adminAiApi = {
  listRequests(accessToken: string, filters: AdminAiRequestFilters, signal?: AbortSignal) {
    return apiClient.request<AiRequestPage>("/api/admin/ai/requests", { headers: auth(accessToken), query: { ...filters }, signal });
  },
  getRequest(accessToken: string, requestId: string, signal?: AbortSignal) {
    return apiClient.request<AiRequest>(`/api/admin/ai/requests/${encodeURIComponent(requestId)}`, { headers: auth(accessToken), signal });
  },
  /** Only schedules a provider lookup for a NeedsReconcile request (202); consumed numbers are never edited. */
  reconcile(accessToken: string, requestId: string, idempotencyKey: string) {
    return apiClient.request<AiRequest>(`/api/admin/ai/requests/${encodeURIComponent(requestId)}/reconcile`, { headers: auth(accessToken), method: "POST", idempotencyKey });
  },

  listPolicies(accessToken: string, signal?: AbortSignal) {
    return apiClient.request<{ items: AiPolicy[] }>("/api/admin/ai/policies", { headers: auth(accessToken), signal });
  },
  /** Policies are immutable: a change is a new period for the operation (overlap -> 409 AI_POLICY_OVERLAP). */
  createPolicy(accessToken: string, input: CreateAiPolicyInput, idempotencyKey: string) {
    return apiClient.request<AiPolicy>("/api/admin/ai/policies", { headers: auth(accessToken), json: input, idempotencyKey });
  },

  listKnowledgeSources(accessToken: string, filters: KnowledgeSourceFilters, signal?: AbortSignal) {
    return apiClient.request<KnowledgeSourcePage>("/api/admin/knowledge-sources", { headers: auth(accessToken), query: { ...filters }, signal });
  },
  async getKnowledgeSource(accessToken: string, id: string, signal?: AbortSignal): Promise<WithEtag<KnowledgeSource>> {
    const response = await apiClient.requestWithMeta<KnowledgeSource>(`/api/admin/knowledge-sources/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal });
    return { data: response.data, etag: response.headers.get("etag") ?? knowledgeEtag(response.data.revision) };
  },
  createKnowledgeSource(accessToken: string, input: CreateKnowledgeSourceInput, idempotencyKey: string) {
    return apiClient.request<KnowledgeSource>("/api/admin/knowledge-sources", { headers: auth(accessToken), json: input, idempotencyKey });
  },
  /** Draft -> Approved or Approved -> Retired. `etag` must be the one of the last read: 412 means it changed meanwhile. */
  async changeKnowledgeSource(accessToken: string, id: string, operation: "approve" | "retire", etag: string): Promise<WithEtag<KnowledgeSource>> {
    const response = await apiClient.requestWithMeta<KnowledgeSource>(`/api/admin/knowledge-sources/${encodeURIComponent(id)}/${operation}`, { headers: auth(accessToken), method: "POST", ifMatch: etag });
    return { data: response.data, etag: response.headers.get("etag") ?? knowledgeEtag(response.data.revision) };
  },
};
