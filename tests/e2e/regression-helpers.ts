import type { Page, Route } from "@playwright/test";

/*
 * Shared pieces of the cross-screen regression suite (regression-*.spec.ts). Everything is a Playwright route mock:
 * it is evidence for how the UI behaves against server-like answers, never proof about the deployed API.
 */

export type Call = { method: string; path: string; search: string; headers: Record<string, string>; body: unknown };
export const page1 = <T,>(items: T[], pageNo = 1, pageSize = 20, totalCount = items.length) => ({ items, totalCount, page: pageNo, pageSize });

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

/** Records every /api call so a test can assert how often and with which headers the UI called. */
export class CallLog {
  calls: Call[] = [];
  record(route: Route): Call {
    const request = route.request();
    const url = new URL(request.url());
    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    const call = { method: request.method(), path: url.pathname, search: url.search, headers: lowerHeaders(request.headers()), body };
    this.calls.push(call);
    return call;
  }
  to(method: string, pattern: RegExp | string) {
    return this.calls.filter((call) => call.method === method && (typeof pattern === "string" ? call.path === pattern : pattern.test(call.path)));
  }
}

export const tokenSession = (page: Page, accessToken: string, refreshToken = `${accessToken}-refresh`) =>
  page.addInitScript(([access, refresh]) => {
    // Only the first document of the tab: a later navigation must keep whatever the app did to the session.
    if (!sessionStorage.getItem("__regression_seeded")) {
      sessionStorage.setItem("__regression_seeded", "1");
      sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: access, refreshToken: refresh }));
    }
  }, [accessToken, refreshToken]);

export type TenantUser = { id: string; email: string; fullName: string; role: number; organizationId: string | null; profileRevision: number };

export type Tenant = {
  token: string;
  password: string;
  user: TenantUser;
  buildings: Array<{ id: string; name: string }>;
};

const buildingJson = (tenant: Tenant, item: { id: string; name: string }) => ({
  id: item.id, name: item.name, buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: tenant.user.organizationId,
  createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
  location: { id: `loc-${item.id}`, address: "1 Test Street", city: "Hà Nội", district: "Cầu Giấy", latitude: null, longitude: null, geojson: null }, contact: null,
});

/**
 * Two organizations behind one mock API: the bearer token decides who is asking, a resource of another tenant is 404
 * (the real API hides foreign tenants the same way) and login hands out the token of the matching account.
 */
export async function installTenantServer(page: Page, tenants: Tenant[], log = new CallLog()) {
  const byToken = (route: Route) => {
    const header = route.request().headers()["authorization"] ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    return tenants.find((tenant) => tenant.token === token);
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path === "/api/auth/login") {
      log.record(route);
      const body = request.postDataJSON() as { email: string; password: string };
      const tenant = tenants.find((item) => item.user.email === body.email && item.password === body.password);
      return tenant
        ? route.fulfill({ json: { accessToken: tenant.token, refreshToken: `${tenant.token}-refresh`, user: tenant.user } })
        : route.fulfill({ status: 401, json: { title: "Invalid credentials", code: "INVALID_CREDENTIALS" } });
    }
    if (!/^\/api\/(auth\/me|auth\/logout|buildings|organizations\/me)/.test(path)) return route.fallback();
    log.record(route);
    if (path === "/api/auth/logout") return route.fulfill({ status: 204, body: "" });
    const tenant = byToken(route);
    if (!tenant) return route.fulfill({ status: 401, json: { title: "Unauthorized", code: "UNAUTHORIZED" } });
    if (path === "/api/auth/me") return route.fulfill({ json: tenant.user, headers: { ETag: `"${tenant.user.profileRevision}"` } });
    if (path === "/api/organizations/me") return route.fulfill({ json: { id: tenant.user.organizationId, name: `Tổ chức ${tenant.user.organizationId}`, slug: "org", address: "", phoneNumber: "", isActive: true, profileRevision: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }, headers: { ETag: '"1"' } });
    if (path === "/api/buildings" && method === "GET") return route.fulfill({ json: page1(tenant.buildings.map((item) => buildingJson(tenant, item))) });
    const match = /^\/api\/buildings\/([^/]+)$/.exec(path);
    if (match) {
      const item = tenant.buildings.find((candidate) => candidate.id === match[1]);
      return item ? route.fulfill({ json: buildingJson(tenant, item) }) : route.fulfill({ status: 404, json: { title: "Not found", code: "NOT_FOUND" } });
    }
    return route.fulfill({ json: page1([]) });
  });
  return log;
}

export const orgA: Tenant = {
  token: "tok-org-a", password: "password-a-123",
  user: { id: "user-a", email: "a@org-a.test", fullName: "Chủ Tổ chức A", role: 1, organizationId: "org-a", profileRevision: 1 },
  buildings: [{ id: "bld-a1", name: "Tòa A-Alpha" }, { id: "bld-a2", name: "Tòa A-Beta" }],
};
export const orgB: Tenant = {
  token: "tok-org-b", password: "password-b-123",
  user: { id: "user-b", email: "b@org-b.test", fullName: "Chủ Tổ chức B", role: 1, organizationId: "org-b", profileRevision: 1 },
  buildings: [{ id: "bld-b1", name: "Tòa B-Gamma" }],
};
