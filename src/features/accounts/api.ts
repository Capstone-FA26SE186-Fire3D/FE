import { apiClient } from "@/api/client";
import type { CreateAccountInput, CreatedAccount, ManagedAccount, Organization, PageResponse } from "./types";
import { normalizeRole, roleToApiName } from "@/features/auth/roles";
import type { UserRole } from "@/features/auth/types";

type ApiManagedAccount = Omit<ManagedAccount, "role"> & { role: unknown };

type ApiCreatedAccount = Omit<CreatedAccount, "role"> & { role: unknown };

function normalizeAccount(account: ApiManagedAccount): ManagedAccount {
  return { ...account, role: normalizeRole(account.role) };
}

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** BE `AccountFilter`. `sort`: createdAt | updatedAt | email | fullName | lastLoginAt, '-' prefix for descending (default -createdAt). */
export type AccountFilters = {
  search?: string;
  isActive?: boolean;
  role?: UserRole;
  organizationId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
};

export const accountsApi = {
  list(accessToken: string, filters: AccountFilters, signal?: AbortSignal) {
    return apiClient.request<PageResponse<ApiManagedAccount>>("/api/accounts", { headers: headers(accessToken), query: filters, signal })
      .then((page) => ({ ...page, items: page.items.map(normalizeAccount) }));
  },
  /**
   * 201 `AccountResponse`; 409 when the email is taken. The account already exists once this resolves, so an unreadable
   * role in the body falls back to the requested role instead of turning a successful create into an error.
   */
  create(accessToken: string, input: CreateAccountInput): Promise<CreatedAccount> {
    return apiClient.request<ApiCreatedAccount>("/api/accounts", { headers: headers(accessToken), json: { ...input, role: roleToApiName(input.role) } })
      .then((account) => {
        let role = input.role;
        try { role = normalizeRole(account?.role); } catch { /* keep the requested role */ }
        return { ...account, role };
      });
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
