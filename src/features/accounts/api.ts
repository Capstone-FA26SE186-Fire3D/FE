import { apiClient } from "@/api/client";
import type { CreateAccountInput, ManagedAccount, Organization, PageResponse } from "./types";
import { normalizeRole, roleToApiName } from "@/features/auth/roles";
import type { UserRole } from "@/features/auth/types";

type ApiManagedAccount = Omit<ManagedAccount, "role"> & { role: unknown };

function normalizeAccount(account: ApiManagedAccount): ManagedAccount {
  return { ...account, role: normalizeRole(account.role) };
}

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
  list(accessToken: string, filters: AccountFilters, signal?: AbortSignal) {
    return apiClient.request<PageResponse<ApiManagedAccount>>("/api/accounts", { headers: headers(accessToken), query: filters, signal })
      .then((page) => ({ ...page, items: page.items.map(normalizeAccount) }));
  },
  create(accessToken: string, input: CreateAccountInput) {
    return apiClient.request("/api/accounts", { headers: headers(accessToken), json: { ...input, role: roleToApiName(input.role) } });
  },
  get(accessToken: string, id: string) {
    return apiClient.request<ApiManagedAccount>(`/api/accounts/${id}`, { headers: headers(accessToken) }).then(normalizeAccount);
  },
  setStatus(accessToken: string, id: string, isActive: boolean) {
    return apiClient.request<ApiManagedAccount>(`/api/accounts/${id}/status`, { headers: headers(accessToken), json: { isActive }, method: "PATCH" }).then(normalizeAccount);
  },
  organizations(accessToken: string) {
    return apiClient.request<PageResponse<Organization>>("/api/organizations", { headers: headers(accessToken), query: { page: 1, pageSize: 100, isActive: true } });
  },
};
