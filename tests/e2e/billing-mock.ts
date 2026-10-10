import type { Page, Route } from "@playwright/test";

/** Shared mock backend for the billing specs. These are mock (route) fixtures, not evidence against the real API. */
export const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
export const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };

export const ids = {
  quote: "aaaaaaaa-0000-0000-0000-000000000001",
  quoteDraft: "aaaaaaaa-0000-0000-0000-000000000002",
  line: "bbbbbbbb-0000-0000-0000-000000000001",
  pkg: "cccccccc-0000-0000-0000-000000000001",
  pkg2: "cccccccc-0000-0000-0000-000000000002",
  checkout: "dddddddd-0000-0000-0000-000000000001",
  payment: "eeeeeeee-0000-0000-0000-000000000001",
  discount: "ffffffff-0000-0000-0000-000000000001",
};

export const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
export const etagOf = (id: string, revision: number) => `"billing-${id.replace(/-/g, "")}-${revision}"`;

export function packageFixture(overrides: Record<string, unknown> = {}) {
  return { id: ids.pkg, code: "BLD-12", name: "Gói Building 12 tháng", unitPrice: 500000, currency: "VND", durationMonths: 12, isActive: true, description: "Dịch vụ game cho một công trình", revision: 3, ...overrides };
}

/** Totals are deliberately not derivable from the lines: a UI that recomputes would show different numbers. */
export function quotationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.quote, organizationId: "org-1", quotationNumber: "FET-Q-0001", status: "Issued", revision: 4, currency: "VND",
    subtotalAmount: 6000000, discountAmount: 600000, taxAmount: 540000, totalAmount: 5940000, discountRuleId: ids.discount,
    terms: "Điều khoản mẫu: dịch vụ có hiệu lực sau khi PayOS xác nhận.", validUntil: iso(3), acceptedAt: null,
    items: [{ id: ids.line, buildingId: "b-1", servicePackageId: ids.pkg, purchaseAction: "New", durationMonths: 12, buildingName: "Công trình 1", buildingAddress: "1 Test Street, Hà Nội", packageName: "Gói Building 12 tháng", unitPrice: 500000, subtotalAmount: 6000000, discountAmount: 600000, totalAmount: 5400000 }],
    ...overrides,
  };
}

export function checkoutFixture(overrides: Record<string, unknown> = {}) {
  return { checkoutId: ids.checkout, quotationId: ids.quote, paymentRequestId: ids.payment, orderCode: 100200, amount: 5940000, currency: "VND", checkoutStatus: "Ready", checkoutUrl: "https://pay.payos.test/web/abc", qrCode: null, expiresAt: iso(0.02), errorCode: null, ...overrides };
}

export function paymentFixture(overrides: Record<string, unknown> = {}) {
  return { id: ids.payment, quotationId: ids.quote, orderCode: 100200, amount: 5940000, currency: "VND", paymentStatus: "Paid", paidAt: iso(-0.001), transactionId: "tx-1", transactionStatus: "Applied", provisioningStatus: "Pending", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "Pending", entitlementId: null, errorCode: null }], ...overrides };
}

export type Call = { method: string; path: string; search: string; headers: Record<string, string>; body: unknown };

export type Mock = {
  calls: Call[];
  quotations: Record<string, ReturnType<typeof quotationFixture>>;
  packages: Array<ReturnType<typeof packageFixture>>;
  discounts: Array<Record<string, unknown>>;
  entitlements: Array<Record<string, unknown>>;
  enterprise: Array<Record<string, unknown>>;
  checkout: ReturnType<typeof checkoutFixture>;
  payment: ReturnType<typeof paymentFixture>;
  /** Per "METHOD /path": a queue of overrides consumed in order (status/json/delay). */
  overrides: Map<string, Array<{ status: number; json?: unknown; headers?: Record<string, string>; delayMs?: number }>>;
};

export function newMock(): Mock {
  return {
    calls: [],
    quotations: { [ids.quote]: quotationFixture(), [ids.quoteDraft]: quotationFixture({ id: ids.quoteDraft, quotationNumber: "FET-Q-0002", status: "Draft", revision: 1, taxAmount: 0, terms: null, discountAmount: 0, totalAmount: 6000000 }) },
    packages: [packageFixture(), packageFixture({ id: ids.pkg2, code: "BLD-6", name: "Gói Building 6 tháng", durationMonths: 6, unitPrice: 600000, revision: 1 })],
    discounts: [{ id: ids.discount, code: "BULK5", discountKind: "Percent", discountValue: 10, minimumBuildings: 5, validFrom: iso(-30), validUntil: null, servicePackageId: null, minimumDurationMonths: null, isActive: true, revision: 2 }],
    entitlements: [],
    enterprise: [],
    checkout: checkoutFixture(),
    payment: paymentFixture(),
    overrides: new Map(),
  };
}

export function queue(mock: Mock, key: string, ...items: Array<{ status: number; json?: unknown; headers?: Record<string, string>; delayMs?: number }>) {
  mock.overrides.set(key, [...(mock.overrides.get(key) ?? []), ...items]);
}

export const building = (id = "b-1") => ({ id, name: id === "b-1" ? "Công trình 1" : `Công trình ${id}`, buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: { id: "loc", address: "1 Test Street, Hà Nội", city: null, district: null, latitude: null, longitude: null, geojson: null }, contact: null });

const page_ = <T,>(items: T[], pageNo = 1, pageSize = 20) => ({ items, total: items.length, page: pageNo, pageSize });

export async function signIn(page: Page, user: typeof owner | typeof admin) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "billing-access", refreshToken: "billing-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

function lower(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

/** One dispatcher for every /api/* billing route; unknown paths fall through to other mocks. */
export async function mockBilling(page: Page, mock: Mock) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (path.startsWith("/api/auth/")) return route.fallback();

    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    mock.calls.push({ method, path, search: url.search, headers: lower(request.headers()), body });

    const queued = mock.overrides.get(`${method} ${path}`)?.shift();
    if (queued) {
      if (queued.delayMs) await new Promise((resolve) => setTimeout(resolve, queued.delayMs));
      return route.fulfill({ status: queued.status, json: queued.json, headers: queued.headers });
    }

    const h = lower(request.headers());
    const quoteMatch = path.match(/^\/api\/(?:billing|admin)\/quotations\/([^/]+?)(?:\/(accept|issue))?$/);

    if (method === "GET" && path === "/api/buildings") return route.fulfill({ json: { items: [building("b-1"), building("b-2")], totalCount: 2, page: 1, pageSize: 100 } });
    if (method === "GET" && /^\/api\/buildings\/[^/]+$/.test(path)) return route.fulfill({ json: building(path.split("/").pop()) });
    if (method === "GET" && path === "/api/organizations") return route.fulfill({ json: { items: [{ id: "org-1", name: "FET3D Lab", slug: "fet3d-lab", isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }], totalCount: 1, page: 1, pageSize: 100 } });

    if (method === "GET" && path === "/api/billing/service-packages") return route.fulfill({ json: mock.packages });
    const pkgMatch = path.match(/^\/api\/billing\/service-packages\/([^/]+)$/);
    if (method === "GET" && pkgMatch) {
      const item = mock.packages.find((entry) => entry.id === pkgMatch[1]);
      return item ? route.fulfill({ json: item, headers: { ETag: etagOf(item.id, item.revision) } }) : route.fulfill({ status: 404, json: { code: "BILLING_RESOURCE_NOT_FOUND" } });
    }
    if (method === "POST" && path === "/api/admin/service-packages") {
      const created = packageFixture({ ...(body as object), id: `cccccccc-0000-0000-0000-0000000000${mock.packages.length + 10}`, revision: 1, currency: "VND" });
      mock.packages.push(created);
      return route.fulfill({ status: 201, json: created, headers: { ETag: etagOf(created.id, 1) } });
    }
    const pkgPatch = path.match(/^\/api\/admin\/service-packages\/([^/]+)$/);
    if (method === "PATCH" && pkgPatch) {
      const item = mock.packages.find((entry) => entry.id === pkgPatch[1])!;
      if (h["if-match"] !== etagOf(item.id, item.revision)) return route.fulfill({ status: 412, json: { code: "REVISION_MISMATCH", title: "The resource changed." } });
      Object.assign(item, body, { revision: item.revision + 1 });
      return route.fulfill({ json: item, headers: { ETag: etagOf(item.id, item.revision) } });
    }

    if (method === "GET" && path === "/api/admin/discount-rules") return route.fulfill({ json: mock.discounts });
    if (method === "POST" && path === "/api/admin/discount-rules") {
      const created = { ...(body as object), id: "ffffffff-0000-0000-0000-000000000099", revision: 1 };
      mock.discounts.push(created);
      return route.fulfill({ status: 201, json: created });
    }

    if (method === "GET" && path === "/api/billing/quotations") return route.fulfill({ json: page_(Object.values(mock.quotations)) });
    if (method === "POST" && path === "/api/billing/quotations") {
      const created = quotationFixture({ id: "aaaaaaaa-0000-0000-0000-000000000009", quotationNumber: "FET-Q-0009", status: "Draft", revision: 1, terms: null, taxAmount: 0, discountAmount: 0, discountRuleId: null, subtotalAmount: 6000000, totalAmount: 6000000 });
      mock.quotations[created.id] = created;
      return route.fulfill({ status: 201, json: created, headers: { ETag: etagOf(created.id, 1) } });
    }
    if (quoteMatch && method === "GET") {
      const item = mock.quotations[quoteMatch[1]];
      return item ? route.fulfill({ json: item, headers: { ETag: etagOf(item.id, item.revision) } }) : route.fulfill({ status: 404, json: { code: "BILLING_RESOURCE_NOT_FOUND" } });
    }
    if (quoteMatch && quoteMatch[2] === "accept" && method === "POST") {
      const item = mock.quotations[quoteMatch[1]];
      if (h["if-match"] !== etagOf(item.id, item.revision)) return route.fulfill({ status: 412, json: { code: "REVISION_MISMATCH" } });
      Object.assign(item, { status: "Accepted", acceptedAt: new Date().toISOString(), revision: item.revision + 1 });
      return route.fulfill({ json: item, headers: { ETag: etagOf(item.id, item.revision) } });
    }
    if (quoteMatch && quoteMatch[2] === "issue" && method === "POST") {
      const item = mock.quotations[quoteMatch[1]];
      if (h["if-match"] !== etagOf(item.id, item.revision)) return route.fulfill({ status: 412, json: { code: "REVISION_MISMATCH" } });
      const input = body as { taxAmount: number; terms: string; validUntil: string };
      Object.assign(item, { status: "Issued", taxAmount: input.taxAmount, terms: input.terms, validUntil: input.validUntil, revision: item.revision + 1, totalAmount: 6000000 + input.taxAmount });
      return route.fulfill({ json: item, headers: { ETag: etagOf(item.id, item.revision) } });
    }

    if (method === "POST" && path === "/api/billing/enterprise-quote-requests") {
      const created = { ...(body as object), id: "enterprise-1", organizationId: "org-1", status: "New", createdAt: new Date().toISOString() };
      mock.enterprise.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    if (method === "GET" && (path === "/api/billing/enterprise-quote-requests" || path === "/api/admin/enterprise-quote-requests")) return route.fulfill({ json: page_(mock.enterprise) });

    if (method === "POST" && path === "/api/payments/payos/create") return route.fulfill({ status: 201, json: mock.checkout, headers: { Location: `/api/payments/payos/checkouts/${ids.checkout}` } });
    if (method === "GET" && path.startsWith("/api/payments/payos/checkouts/")) return route.fulfill({ json: mock.checkout });
    if (method === "POST" && /\/api\/payments\/payos\/requests\/[^/]+\/cancel$/.test(path)) return route.fulfill({ json: { ...mock.checkout, checkoutStatus: "Cancelled" } });
    if (method === "GET" && path.startsWith("/api/payments/payos/requests/")) return route.fulfill({ json: mock.payment });
    if (method === "POST" && path.startsWith("/api/admin/payments/payos/checkouts/")) return route.fulfill({ status: 202 });
    if (method === "GET" && path === "/api/billing/entitlements") return route.fulfill({ json: page_(mock.entitlements, 1, 50) });

    return route.fallback();
  });
}

export const callsTo = (mock: Mock, method: string, path: string) => mock.calls.filter((call) => call.method === method && call.path === path);
