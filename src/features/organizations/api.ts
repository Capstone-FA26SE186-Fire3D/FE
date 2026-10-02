import { apiClient } from "@/api/client";

import type { CreateOrganizationInput, Organization, OrganizationFilters, OrganizationProfile, PageResponse, UpdateOrganizationProfileInput } from "./types";

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
  get(accessToken: string, id: string) {
    return apiClient.request<Organization>(`/api/organizations/${id}`, {
      headers: headers(accessToken),
    });
  },
  setStatus(accessToken: string, id: string, isActive: boolean) {
    return apiClient.request<Organization>(`/api/organizations/${id}/status`, {
      headers: headers(accessToken),
      json: { isActive },
      method: "PATCH",
    });
  },
  getMine(accessToken: string) {
    return apiClient.requestWithMeta<OrganizationProfile>("/api/organizations/me", {
      headers: headers(accessToken),
    });
  },
  updateMine(accessToken: string, etag: string, input: UpdateOrganizationProfileInput) {
    return apiClient.requestWithMeta<OrganizationProfile>("/api/organizations/me", {
      headers: { ...headers(accessToken), "If-Match": etag },
      json: input,
      method: "PATCH",
    });
  },
};
