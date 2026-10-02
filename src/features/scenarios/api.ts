import { apiClient } from "@/api/client";

import type { CreatedScenarioResource, ScenarioDraft, ScenarioDraftState, ScenarioDraftValidation, ScenarioPage } from "./types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const scenariosApi = {
  listBuilding(accessToken: string, buildingId: string, page = 1, pageSize = 20) {
    return apiClient.request<ScenarioPage>(`/api/buildings/${buildingId}/scenarios`, {
      headers: headers(accessToken),
      query: { page, pageSize },
    });
  },
  create(accessToken: string, input: { buildingId: string; name: string }) {
    return apiClient.request<CreatedScenarioResource>("/api/scenarios", {
      headers: headers(accessToken),
      json: input,
    });
  },
  createDraft(accessToken: string, scenarioId: string, revisionId: string) {
    return apiClient.request<CreatedScenarioResource>(`/api/scenarios/${scenarioId}/draft`, {
      headers: headers(accessToken),
      json: { revisionId },
    });
  },
  getDraft(accessToken: string, draftId: string) {
    return apiClient.requestWithMeta<ScenarioDraft>(`/api/scenario-drafts/${draftId}`, {
      headers: headers(accessToken),
    });
  },
  updateDraft(accessToken: string, draftId: string, state: ScenarioDraftState, eTag: string) {
    return apiClient.requestWithMeta<void>(`/api/scenario-drafts/${draftId}`, {
      headers: { ...headers(accessToken), "If-Match": eTag },
      json: state,
      method: "PUT",
    });
  },
  validateDraft(accessToken: string, draftId: string) {
    return apiClient.request<ScenarioDraftValidation>(`/api/scenario-drafts/${draftId}/validate`, {
      headers: headers(accessToken),
      method: "POST",
    });
  },
  snapshotDraft(accessToken: string, draftId: string) {
    return apiClient.request<CreatedScenarioResource>(`/api/scenario-drafts/${draftId}/snapshot`, {
      headers: headers(accessToken),
      method: "POST",
    });
  },
};
