import { apiClient } from "@/api/client";

import type { CreateOrganizationInput, Organization, OrganizationFilters, PageResponse } from "./types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const organizationsApi = {
  list(accessToken: string, filters: OrganizationFilters) {
    return apiClient.request<PageResponse<Organization>>("/api/organizations", {
      headers: headers(accessToken),
      query: filters,
    });
  },
  create(accessToken: string, input: CreateOrganizationInput) {
    return apiClient.request<Organization>("/api/organizations", {
      headers: headers(accessToken),
      json: input,
    });
  },
  setStatus(accessToken: string, id: string, isActive: boolean) {
    return apiClient.request<Organization>(`/api/organizations/${id}/status`, {
      headers: headers(accessToken),
      json: { isActive },
      method: "PATCH",
    });
  },
};
