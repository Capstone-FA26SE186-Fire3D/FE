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
    return apiClient.request<PageResponse<ApiManagedAccount>>("/api/accounts", { headers: headers(accessToken), query: { ...filters, role: filters.role === undefined ? undefined : roleToApiName(filters.role) }, signal })
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
  /** The account with the `ETag` (profile revision) that `changeEmail` sends back as `If-Match`. */
  async detail(accessToken: string, id: string): Promise<{ account: ManagedAccount; etag: string | null }> {
    const response = await apiClient.requestWithMeta<ApiManagedAccount>(`/api/accounts/${id}`, { headers: headers(accessToken) });
    const account = normalizeAccount(response.data);
    return { account, etag: response.headers.get("etag") ?? (account.profileRevision ? `"${account.profileRevision}"` : null) };
  },
  /**
   * BE#235: fixes a mistyped email while the account has not verified it. 409 EMAIL_ALREADY_VERIFIED / EMAIL_EXISTS,
   * 412 when the account changed meanwhile. The pending code of the old address is dropped by the server.
   */
  async changeEmail(accessToken: string, id: string, email: string, etag: string): Promise<{ account: ManagedAccount; etag: string | null }> {
    const response = await apiClient.requestWithMeta<ApiManagedAccount>(`/api/accounts/${id}/email`, { headers: { ...headers(accessToken), "If-Match": etag }, json: { email }, method: "PATCH" });
    const account = normalizeAccount(response.data);
    return { account, etag: response.headers.get("etag") ?? (account.profileRevision ? `"${account.profileRevision}"` : null) };
  },
  setStatus(accessToken: string, id: string, isActive: boolean) {
    return apiClient.request<ApiManagedAccount>(`/api/accounts/${id}/status`, { headers: headers(accessToken), json: { isActive }, method: "PATCH" }).then(normalizeAccount);
  },
  organizations(accessToken: string) {
    return apiClient.request<PageResponse<Organization>>("/api/organizations", { headers: headers(accessToken), query: { page: 1, pageSize: 100, isActive: true } });
  },
};
