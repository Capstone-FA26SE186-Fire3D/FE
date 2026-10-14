import { apiClient } from "@/api/client";

import type { AdminUpdateOrganizationInput, CreateOrganizationInput, Organization, OrganizationDetail, OrganizationFilters, OrganizationProfile, PageResponse, UpdateOrganizationProfileInput } from "./types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export const organizationsApi = {
  list(accessToken: string, filters: OrganizationFilters, signal?: AbortSignal) {
    return apiClient.request<PageResponse<Organization>>("/api/organizations", {
      headers: headers(accessToken),
      query: filters,
      signal,
    });
  },
  create(accessToken: string, input: CreateOrganizationInput) {
    return apiClient.request<Organization>("/api/organizations", {
      headers: headers(accessToken),
      json: input,
    });
  },
  get(accessToken: string, id: string, signal?: AbortSignal) {
    return apiClient.request<Organization>(`/api/organizations/${id}`, {
      headers: headers(accessToken),
      signal,
    });
  },
  /** Detail with its profile ETag (`"N"`, shared with `/api/organizations/me`) for the admin PATCH. */
  getDetail(accessToken: string, id: string, signal?: AbortSignal) {
    return apiClient.requestWithMeta<OrganizationDetail>(`/api/organizations/${id}`, { headers: headers(accessToken), signal });
  },
  /** PlatformAdmin edit of name/address/phone. `If-Match` is required: 428 missing, 412 stale, 409 phone used elsewhere. */
  update(accessToken: string, id: string, etag: string, input: AdminUpdateOrganizationInput) {
    return apiClient.requestWithMeta<OrganizationDetail>(`/api/organizations/${id}`, { headers: headers(accessToken), ifMatch: etag, json: input, method: "PATCH" });
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
