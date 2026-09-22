import { apiClient } from "@/api/client";
import type { CreateAccountInput, ManagedAccount, Organization, PageResponse } from "./types";
import type { UserRole } from "@/features/auth/types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export type AccountFilters = {
  search?: string;
  isActive?: boolean;
  role?: UserRole;
  organizationId?: string;
  page?: number;
  pageSize?: number;
};

export const accountsApi = {
  list(accessToken: string, filters: AccountFilters) {
    return apiClient.request<PageResponse<ManagedAccount>>("/api/accounts", { headers: headers(accessToken), query: filters });
  },
  create(accessToken: string, input: CreateAccountInput) {
    return apiClient.request("/api/accounts", { headers: headers(accessToken), json: input });
  },
  get(accessToken: string, id: string) {
    return apiClient.request<ManagedAccount>(`/api/accounts/${id}`, { headers: headers(accessToken) });
  },
  setStatus(accessToken: string, id: string, isActive: boolean) {
    return apiClient.request<ManagedAccount>(`/api/accounts/${id}/status`, { headers: headers(accessToken), json: { isActive }, method: "PATCH" });
  },
  organizations(accessToken: string) {
    return apiClient.request<PageResponse<Organization>>("/api/organizations", { headers: headers(accessToken), query: { page: 1, pageSize: 100, isActive: true } });
  },
};
