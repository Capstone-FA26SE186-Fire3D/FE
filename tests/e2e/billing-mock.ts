import type { Page, Route } from "@playwright/test";

/**
 * Stateful mock backend for the billing specs (Billing v7). These are route mocks that follow the OpenAPI at BE
 * `1eaf988`: they keep state like the server would (quotations, ETags, idempotency receipts, checkouts, ledger,
 * quota grants, notifications, enterprise requests), so a reload proves recovery from "server" data.
 * They are mock evidence only, never evidence against the real API.
 */
export const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
export const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };

export const ids = {
  quote: "aaaaaaaa-0000-0000-0000-000000000001",
  quoteDraft: "aaaaaaaa-0000-0000-0000-000000000002",
  line: "bbbbbbbb-0000-0000-0000-000000000001",
  pkg: "cccccccc-0000-0000-0000-000000000001",
  pkg2: "cccccccc-0000-0000-0000-000000000002",
  pkgBig: "cccccccc-0000-0000-0000-000000000003",
  pkgLegacy: "cccccccc-0000-0000-0000-000000000004",
  checkout: "dddddddd-0000-0000-0000-000000000001",
  payment: "eeeeeeee-0000-0000-0000-000000000001",
  discount: "ffffffff-0000-0000-0000-000000000001",
  policy: "99999999-0000-0000-0000-000000000001",
  entitlement: "88888888-0000-0000-0000-000000000001",
  enterprise: "77777777-0000-0000-0000-000000000001",
  topUpQuote: "aaaaaaaa-0000-0000-0000-000000000003",
};

export const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
export const etagOf = (id: string, revision: number) => `"billing-${id.replace(/-/g, "")}-${revision}"`;

type Rec = Record<string, unknown>;
type Override = { status: number; json?: unknown; headers?: Record<string, string>; delayMs?: number };

export function packageFixture(overrides: Rec = {}) {
  return { id: ids.pkg, code: "BLD-12", name: "Gói Building 12 tháng", unitPrice: 500000, currency: "VND", durationMonths: 12, isActive: true, description: "Dịch vụ game cho một công trình", revision: 3, commercialVersion: 7, learnerLimit: 60, aiQuotaUnits: 1000, aiPolicyVersionId: ids.policy, pricingBasis: "Monthly", isPurchasable: true, ...overrides } as Rec & { id: string; revision: number; durationMonths: number; unitPrice: number; code: string; name: string; learnerLimit: number | null };
}

/** Totals are deliberately not derivable from the lines: a UI that recomputes would show different numbers. */
export function quotationFixture(overrides: Rec = {}) {
  return {
    id: ids.quote, organizationId: "org-1", quotationNumber: "FET-Q-0001", status: "Issued", revision: 4, currency: "VND",
    subtotalAmount: 6000000, discountAmount: 600000, taxAmount: 540000 as number | null, totalAmount: 5940000, discountRuleId: ids.discount,
    terms: "Điều khoản mẫu: dịch vụ có hiệu lực sau khi PayOS xác nhận.", validUntil: iso(3), acceptedAt: null, commercialVersion: 7, purpose: "BuildingService", topUp: null, pricingStatus: "Final", issuedAt: iso(-1),
    items: [{ id: ids.line, buildingId: "b-1", servicePackageId: ids.pkg, purchaseAction: "New", durationMonths: 12, buildingName: "Công trình 1", buildingAddress: "1 Test Street, Hà Nội", packageName: "Gói Building 12 tháng", unitPrice: 500000, subtotalAmount: 6000000, discountAmount: 600000, totalAmount: 5400000, commercialVersion: 7, packageRevision: 3, learnerLimit: 60, aiQuotaUnits: 1000, aiPolicyVersionId: ids.policy, aiQuotaUnit: "tokens", startsAt: iso(5), endsAt: iso(370), pricingBasis: "Monthly", upgradeEntitlementId: null, upgradeBaseCapacityRevision: null, upgradePreviousLearnerLimit: null }] as Rec[],
    ...overrides,
  } as Rec & { id: string; revision: number; status: string; items: Rec[]; organizationId: string; purpose: string; validUntil: string };
}

export function checkoutFixture(overrides: Rec = {}) {
  return { checkoutId: ids.checkout, quotationId: ids.quote, paymentRequestId: ids.payment as string | null, orderCode: 100200, amount: 5940000, currency: "VND", checkoutStatus: "Ready", checkoutUrl: "https://pay.payos.test/web/abc" as string | null, qrCode: null, expiresAt: iso(0.02), errorCode: null as string | null, ...overrides };
}

export function paymentFixture(overrides: Rec = {}) {
  return { id: ids.payment, quotationId: ids.quote, orderCode: 100200, amount: 5940000, currency: "VND", paymentStatus: "Paid", paidAt: iso(-0.001), transactionId: "tx-1", transactionStatus: "Applied", provisioningStatus: "Pending", items: [{ quotationItemId: ids.line, buildingId: "b-1" as string | null, status: "Pending", entitlementId: null, errorCode: null }], ...overrides } as Rec & { paymentStatus: string; provisioningStatus: string; items: Rec[] };
}

export const ledgerRow = (overrides: Rec = {}) => ({
  checkoutId: ids.checkout, checkoutStatus: "Ready", checkoutError: null, quotationId: ids.quote, quotationNumber: "FET-Q-0001", organizationId: "org-1", purpose: "BuildingService",
  paymentRequestId: ids.payment, paymentStatus: "Pending", transactionId: null, transactionStatus: null, amount: 5940000, currency: "VND", provisioningStatus: "NotStarted",
  provisioningLines: 1, provisioningSucceeded: 0, createdAt: iso(-0.5), paidAt: null, ...overrides,
}) as Rec;

export const serviceView = (overrides: Rec = {}) => ({ entitlementId: ids.entitlement, buildingId: "b-1", organizationId: "org-1", status: "Active", startsAt: iso(-100), endsAt: iso(265), isEffective: true, commercialVersion: 7, baseLearnerLimit: 60, effectiveLearnerLimit: 60, capacityRevision: 1, seatsUsed: 12, seatsRemaining: 48, upgrades: [] as Rec[], ...overrides }) as Rec;

export const grant = (overrides: Rec = {}) => ({ id: "g-1", sourceKind: "BuildingService", quotaUnit: "tokens", quotaUnits: 1000, startsAt: iso(-100), endsAt: iso(265), status: "Active", reserved: 50, consumed: 300, available: 650, entitlementId: ids.entitlement, buildingId: "b-1", paymentTransactionId: "11111111-0000-0000-0000-000000000001", policyVersionId: ids.policy, createdAt: iso(-100), ...overrides }) as Rec;

export type Call = { method: string; path: string; search: string; headers: Record<string, string>; body: unknown };

export type Mock = {
  calls: Call[];
  quotations: Record<string, ReturnType<typeof quotationFixture>>;
  packages: Array<ReturnType<typeof packageFixture>>;
  policies: Rec[];
  discounts: Rec[];
  entitlements: Rec[];
  /** Per Building: `GET /api/buildings/{id}/service-entitlement`. */
  service: Record<string, { current: Rec | null; upcoming: Rec[] }>;
  quota: { units: Rec[]; grants: Rec[]; usage: Rec[] };
  notifications: Rec[];
  enterprise: Rec[];
  responses: Record<string, Rec[]>;
  /** True once a checkout exists for `quotationId` of `checkout` (created by POST or seeded). */
  checkoutExists: boolean;
  checkout: ReturnType<typeof checkoutFixture>;
  payment: ReturnType<typeof paymentFixture>;
  /** Explicit admin ledger rows (pagination/filter tests); otherwise derived from `checkout` + `payment`. */
  ledger: Rec[];
  /** Quotation ids whose payment is Paid: cancel answers 409 QUOTATION_ALREADY_PAID. */
  paidQuotations: Set<string>;
  receipts: Map<string, { body: string; status: number; json: unknown; headers: Record<string, string> }>;
  /** Per "METHOD /path": a queue of overrides consumed in order (status/json/delay). */
  overrides: Map<string, Override[]>;
  sequence: number;
};

export function newMock(): Mock {
  return {
    calls: [],
    quotations: { [ids.quote]: quotationFixture(), [ids.quoteDraft]: quotationFixture({ id: ids.quoteDraft, quotationNumber: "FET-Q-0002", status: "Draft", revision: 1, taxAmount: null, terms: null, discountAmount: 0, totalAmount: 6000000, pricingStatus: "Estimated", issuedAt: null, items: [{ ...quotationFixture().items[0], id: "bbbbbbbb-0000-0000-0000-000000000002", discountAmount: 0, totalAmount: 6000000, startsAt: null, endsAt: null }] }) },
    packages: [packageFixture(), packageFixture({ id: ids.pkg2, code: "BLD-6", name: "Gói Building 6 tháng", durationMonths: 6, unitPrice: 600000, revision: 1, learnerLimit: 30, aiQuotaUnits: 200 }), packageFixture({ id: ids.pkgBig, code: "BLD-12-XL", name: "Gói Building 12 tháng XL", unitPrice: 900000, revision: 1, learnerLimit: 200, aiQuotaUnits: 5000 })],
    policies: [{ id: ids.policy, audience: "organization", policyKind: "quota", quotaUnit: "tokens", effectiveFrom: iso(-200), effectiveUntil: null, rollover: "None" }],
    discounts: [{ id: ids.discount, code: "BULK5", discountKind: "Percent", discountValue: 10, minimumBuildings: 5, validFrom: iso(-30), validUntil: null, servicePackageId: null, minimumDurationMonths: null, isActive: true, revision: 2 }],
    entitlements: [],
    service: {},
    quota: { units: [], grants: [], usage: [] },
    notifications: [],
    enterprise: [],
    responses: {},
    checkoutExists: false,
    checkout: checkoutFixture(),
    payment: paymentFixture(),
    ledger: [],
    paidQuotations: new Set(),
    receipts: new Map(),
    overrides: new Map(),
    sequence: 10,
  };
}

export function queue(mock: Mock, key: string, ...items: Override[]) {
  mock.overrides.set(key, [...(mock.overrides.get(key) ?? []), ...items]);
}

/** Seeds an existing checkout + payment for `quotationId` as if the user had already started paying. */
export function seedCheckout(mock: Mock, checkout: Rec = {}, payment: Rec = {}) {
  mock.checkoutExists = true;
  mock.checkout = checkoutFixture(checkout);
  mock.payment = paymentFixture(payment);
}

export const building = (id = "b-1") => ({ id, name: id === "b-1" ? "Công trình 1" : `Công trình ${id}`, buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: { id: "loc", address: "1 Test Street, Hà Nội", city: null, district: null, latitude: null, longitude: null, geojson: null }, contact: null });

const page_ = <T,>(items: T[], pageNo = 1, pageSize = 20) => ({ items: items.slice((pageNo - 1) * pageSize, pageNo * pageSize), total: items.length, page: pageNo, pageSize });

export async function signIn(page: Page, user: typeof owner | typeof admin) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "billing-access", refreshToken: "billing-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

function lower(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

/** Derived ledger row for the single seeded checkout/payment pair. */
function derivedRow(mock: Mock) {
  const quote = mock.quotations[mock.checkout.quotationId as string];
  const paid = mock.payment.paymentStatus === "Paid";
  const lines = mock.payment.items;
  return ledgerRow({
    checkoutId: mock.checkout.checkoutId, checkoutStatus: mock.checkout.checkoutStatus, checkoutError: mock.checkout.errorCode, quotationId: mock.checkout.quotationId,
    quotationNumber: quote?.quotationNumber ?? "FET-Q-0001", organizationId: quote?.organizationId ?? "org-1", purpose: quote?.purpose ?? "BuildingService",
    paymentRequestId: mock.checkout.paymentRequestId, paymentStatus: mock.checkout.paymentRequestId ? mock.payment.paymentStatus : null,
    transactionId: paid ? "11111111-0000-0000-0000-0000000000aa" : null, transactionStatus: paid ? "Applied" : null, amount: mock.checkout.amount,
    provisioningStatus: paid ? mock.payment.provisioningStatus : "NotStarted", provisioningLines: lines.length, provisioningSucceeded: lines.filter((line) => line.status === "Succeeded").length,
    paidAt: paid ? mock.payment.paidAt : null,
  });
}

function ledgerFor(mock: Mock) {
  if (mock.ledger.length) return mock.ledger;
  return mock.checkoutExists ? [derivedRow(mock)] : [];
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
    const q = url.searchParams;
    const pageNo = Number(q.get("page") ?? 1);
    const pageSize = Number(q.get("pageSize") ?? 20);
    const send = (status: number, json?: unknown, headers?: Record<string, string>) => route.fulfill({ status, json, headers });

    /** Idempotent create: the same key + body replays the stored response, a different body is a 409. */
    const receipt = async (scope: string, create: () => { status: number; json: unknown; headers?: Record<string, string> }) => {
      const key = h["idempotency-key"];
      if (!key) return send(400, { code: "IDEMPOTENCY_KEY_REQUIRED", title: "Idempotency-Key is required." });
      const id = `${method} ${scope} ${key}`;
      const fingerprint = JSON.stringify(body ?? null);
      const stored = mock.receipts.get(id);
      if (stored) {
        if (stored.body !== fingerprint) return send(409, { code: "IDEMPOTENCY_KEY_CONFLICT", title: "Key used for another input." });
        return send(stored.status, stored.json, stored.headers);
      }
      const made = create();
      if (made.status < 300) mock.receipts.set(id, { body: fingerprint, status: made.status, json: made.json, headers: made.headers ?? {} });
      return send(made.status, made.json, made.headers);
    };

    if (method === "GET" && path === "/api/buildings") return send(200, { items: [building("b-1"), building("b-2")], totalCount: 2, page: 1, pageSize: 100 });
    if (method === "GET" && /^\/api\/buildings\/[^/]+$/.test(path)) return send(200, building(path.split("/").pop()));
    if (method === "GET" && path === "/api/organizations") return send(200, { items: [{ id: "org-1", name: "FET3D Lab", slug: "fet3d-lab", isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }, { id: "org-2", name: "Trường Mẫu", slug: "truong-mau", isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }], totalCount: 2, page: 1, pageSize: 100 });

    // --- catalog -----------------------------------------------------------------------------------------------
    if (method === "GET" && path === "/api/billing/service-packages") return send(200, mock.packages);
    const pkgMatch = path.match(/^\/api\/billing\/service-packages\/([^/]+)$/);
    if (method === "GET" && pkgMatch) {
      const item = mock.packages.find((entry) => entry.id === pkgMatch[1]);
      return item ? send(200, item, { ETag: etagOf(item.id, item.revision) }) : send(404, { code: "BILLING_RESOURCE_NOT_FOUND" });
    }
    if (method === "POST" && path === "/api/admin/service-packages") {
      const input = body as Rec;
      const errors: Record<string, string[]> = {};
      if (input.durationMonths !== 6 && input.durationMonths !== 12) errors.durationMonths = ["V7 Building packages require 6 or 12 months."];
      if (!(Number(input.learnerLimit) > 0)) errors.learnerLimit = ["Learner limit must be positive."];
      if (Number(input.aiQuotaUnits) > 0 && !input.aiPolicyVersionId) errors.aiPolicyVersionId = ["Quota-bearing packages require a policy version."];
      if (Object.keys(errors).length) return send(400, { code: "BILLING_VALIDATION_FAILED", title: "invalid", errors });
      const created = packageFixture({ ...input, id: `cccccccc-0000-0000-0000-0000000000${mock.packages.length + 10}`, revision: 1, currency: "VND", commercialVersion: 7, pricingBasis: "Monthly", isPurchasable: true });
      mock.packages.push(created);
      return send(201, created, { ETag: etagOf(created.id, 1) });
    }
    const pkgPatch = path.match(/^\/api\/admin\/service-packages\/([^/]+)$/);
    if (method === "PATCH" && pkgPatch) {
      const item = mock.packages.find((entry) => entry.id === pkgPatch[1])!;
      if (h["if-match"] !== etagOf(item.id, item.revision)) return send(412, { code: "REVISION_MISMATCH", title: "The resource changed." });
      Object.assign(item, body, { revision: item.revision + 1 });
      return send(200, item, { ETag: etagOf(item.id, item.revision) });
    }

    if (method === "GET" && path === "/api/admin/billing/quota-policies") return send(200, page_(mock.policies, pageNo, pageSize));
    if (method === "POST" && path === "/api/admin/billing/quota-policies") {
      const input = body as { quotaUnit: string; effectiveFrom: string; effectiveUntil: string | null };
      if (!["tokens", "requests"].includes(input.quotaUnit)) return send(422, { code: "AI_QUOTA_UNIT_UNSUPPORTED", title: "Use tokens or requests." });
      const created = { id: `99999999-0000-0000-0000-0000000000${mock.policies.length + 10}`, audience: "organization", policyKind: "quota", quotaUnit: input.quotaUnit, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, rollover: "None" };
      mock.policies.push(created);
      return send(201, created);
    }

    if (method === "GET" && path === "/api/admin/discount-rules") return send(200, mock.discounts);
    if (method === "POST" && path === "/api/admin/discount-rules") {
      const created = { ...(body as object), id: "ffffffff-0000-0000-0000-000000000099", revision: 1 };
      mock.discounts.push(created);
      return send(201, created);
    }

    // --- quotations --------------------------------------------------------------------------------------------
    const quoteMatch = path.match(/^\/api\/(?:billing|admin)\/quotations\/([^/]+?)(?:\/(accept|issue|cancel|checkouts))?$/);
    if (method === "GET" && path === "/api/billing/quotations") return send(200, page_(Object.values(mock.quotations), pageNo, pageSize));
    if (method === "POST" && path === "/api/billing/quotations") {
      return receipt(path, () => {
        const input = body as { items?: Array<{ buildingId: string; servicePackageId: string; purchaseAction: string; upgradeEntitlementId?: string }>; purpose?: string; topUp?: { requestedQuotaUnits: number | null } };
        mock.sequence += 1;
        const id = `aaaaaaaa-0000-0000-0000-0000000000${mock.sequence}`;
        const number = `FET-Q-${String(mock.sequence).padStart(4, "0")}`;
        if (input.purpose === "AIQuotaTopUp") {
          const created = quotationFixture({ id, quotationNumber: number, status: "Draft", revision: 1, taxAmount: null, terms: null, discountAmount: 0, subtotalAmount: 0, totalAmount: 0, discountRuleId: null, pricingStatus: "Estimated", issuedAt: null, purpose: "AIQuotaTopUp", items: [], topUp: { id: `t-${id}`, requestedQuotaUnits: input.topUp?.requestedQuotaUnits ?? null, policyVersionId: null, quotaUnit: null, quotaUnits: null, amount: null, startsAt: null, endsAt: null } });
          mock.quotations[id] = created;
          return { status: 201, json: created, headers: { ETag: etagOf(id, 1) } };
        }
        const lines: Rec[] = [];
        for (const [index, item] of (input.items ?? []).entries()) {
          const pkg = mock.packages.find((entry) => entry.id === item.servicePackageId);
          if (!pkg || pkg.isPurchasable === false) return { status: 409, json: { code: "PACKAGE_NOT_PURCHASABLE", title: "not purchasable" } };
          const current = mock.service[item.buildingId]?.current as { entitlementId: string; effectiveLearnerLimit: number } | null | undefined;
          if (item.purchaseAction === "Upgrade") {
            if (!current || current.entitlementId !== item.upgradeEntitlementId) return { status: 409, json: { code: "UPGRADE_ENTITLEMENT_INVALID", title: "invalid entitlement" } };
            if (!(Number(pkg.learnerLimit) > current.effectiveLearnerLimit)) return { status: 409, json: { code: "UPGRADE_LIMIT_NOT_HIGHER", title: "not higher" } };
          }
          const upgrade = item.purchaseAction === "Upgrade";
          lines.push({ id: `bbbbbbbb-0000-0000-0000-${String(mock.sequence * 10 + index).padStart(12, "0")}`, buildingId: item.buildingId, servicePackageId: pkg.id, purchaseAction: item.purchaseAction, durationMonths: pkg.durationMonths, buildingName: building(item.buildingId).name, buildingAddress: "1 Test Street, Hà Nội", packageName: pkg.name, unitPrice: pkg.unitPrice, subtotalAmount: upgrade ? 0 : pkg.unitPrice * pkg.durationMonths, discountAmount: 0, totalAmount: upgrade ? 0 : pkg.unitPrice * pkg.durationMonths, commercialVersion: 7, packageRevision: pkg.revision, learnerLimit: pkg.learnerLimit, aiQuotaUnits: pkg.aiQuotaUnits, aiPolicyVersionId: pkg.aiPolicyVersionId, aiQuotaUnit: "tokens", startsAt: null, endsAt: upgrade ? (current as unknown as { endsAt?: string })?.endsAt ?? null : null, pricingBasis: upgrade ? "OneTime" : "Monthly", upgradeEntitlementId: upgrade ? item.upgradeEntitlementId : null, upgradeBaseCapacityRevision: upgrade ? 1 : null, upgradePreviousLearnerLimit: upgrade ? current!.effectiveLearnerLimit : null });
        }
        const subtotal = lines.reduce((sum, line) => sum + (line.subtotalAmount as number), 0);
        const created = quotationFixture({ id, quotationNumber: number, status: "Draft", revision: 1, taxAmount: null, terms: null, discountAmount: 0, subtotalAmount: subtotal, totalAmount: subtotal, discountRuleId: null, pricingStatus: "Estimated", issuedAt: null, items: lines });
        mock.quotations[id] = created;
        return { status: 201, json: created, headers: { ETag: etagOf(id, 1) } };
      });
    }
    if (quoteMatch && method === "GET" && !quoteMatch[2]) {
      const item = mock.quotations[quoteMatch[1]];
      return item ? send(200, item, { ETag: etagOf(item.id, item.revision) }) : send(404, { code: "BILLING_RESOURCE_NOT_FOUND" });
    }
    if (quoteMatch && quoteMatch[2] === "checkouts" && method === "GET") return send(200, page_(ledgerFor(mock).filter((row) => row.quotationId === quoteMatch[1]), pageNo, pageSize));
    if (quoteMatch && quoteMatch[2] === "accept" && method === "POST") {
      const item = mock.quotations[quoteMatch[1]];
      if (h["if-match"] !== etagOf(item.id, item.revision)) return send(412, { code: "REVISION_MISMATCH" });
      Object.assign(item, { status: "Accepted", acceptedAt: new Date().toISOString(), revision: item.revision + 1 });
      return send(200, item, { ETag: etagOf(item.id, item.revision) });
    }
    if (quoteMatch && quoteMatch[2] === "cancel" && method === "POST") {
      const item = mock.quotations[quoteMatch[1]];
      if (!h["idempotency-key"]) return send(400, { code: "IDEMPOTENCY_KEY_REQUIRED" });
      if (h["if-match"] !== etagOf(item.id, item.revision)) return send(412, { code: "REVISION_MISMATCH" });
      if (mock.paidQuotations.has(item.id)) return send(409, { code: "QUOTATION_ALREADY_PAID", title: "paid" });
      if (mock.checkoutExists && mock.checkout.quotationId === item.id && ["Creating", "Ready", "NeedsReconcile"].includes(mock.checkout.checkoutStatus)) return send(409, { code: "QUOTATION_CHECKOUT_UNRESOLVED", title: "open checkout", checkoutIds: [mock.checkout.checkoutId] });
      Object.assign(item, { status: "Cancelled", revision: item.revision + 1 });
      return send(200, item, { ETag: etagOf(item.id, item.revision) });
    }
    if (quoteMatch && quoteMatch[2] === "issue" && method === "POST") {
      const item = mock.quotations[quoteMatch[1]];
      if (h["if-match"] !== etagOf(item.id, item.revision)) return send(412, { code: "REVISION_MISMATCH" });
      const input = body as { taxAmount: number; terms: string; validUntil: string; items?: Array<{ quotationItemId: string; startsAt?: string | null; learnerLimit?: number; oneTimePrice?: number; additionalQuotaUnits?: number; aiPolicyVersionId?: string }>; topUp?: { policyVersionId: string; quotaUnits: number; amount: number; startsAt: string; endsAt: string } };
      let total = 0;
      if (item.purpose === "AIQuotaTopUp") {
        if (!input.topUp || input.items) return send(400, { code: "BILLING_VALIDATION_FAILED", title: "invalid", errors: { topUp: ["Top-up quotations are issued with topUp."] } });
        const policy = mock.policies.find((entry) => entry.id === input.topUp!.policyVersionId);
        if (!policy) return send(409, { code: "BILLING_POLICY_INTERVAL_INVALID", title: "policy" });
        Object.assign(item, { topUp: { ...(item.topUp as Rec), policyVersionId: policy.id, quotaUnit: policy.quotaUnit, quotaUnits: input.topUp.quotaUnits, amount: input.topUp.amount, startsAt: input.topUp.startsAt, endsAt: input.topUp.endsAt } });
        total = input.topUp.amount;
        Object.assign(item, { subtotalAmount: total });
      } else {
        const lines = item.items as Array<Rec & { id: string }>;
        for (const line of lines) {
          const entry = (input.items ?? []).find((candidate) => candidate.quotationItemId === line.id);
          if (!entry) return send(400, { code: "BILLING_VALIDATION_FAILED", title: "invalid", errors: { items: ["Provide an entry for every line."] } });
          if (line.purchaseAction === "Upgrade") {
            if (!(Number(entry.learnerLimit) > Number(line.upgradePreviousLearnerLimit))) return send(400, { code: "BILLING_VALIDATION_FAILED", title: "invalid", errors: { "items[0].learnerLimit": ["Learner limit must exceed the current limit."] } });
            Object.assign(line, { startsAt: entry.startsAt, learnerLimit: entry.learnerLimit, unitPrice: entry.oneTimePrice, subtotalAmount: entry.oneTimePrice, totalAmount: entry.oneTimePrice, aiQuotaUnits: entry.additionalQuotaUnits ?? 0 });
            total += Number(entry.oneTimePrice);
          } else {
            if (line.purchaseAction === "New" && !entry.startsAt) return send(400, { code: "BILLING_VALIDATION_FAILED", title: "invalid", errors: { "items[0].startsAt": ["New purchases require a future start."] } });
            Object.assign(line, { startsAt: entry.startsAt ?? iso(10), endsAt: iso(10 + Number(line.durationMonths) * 30) });
            total += Number(line.totalAmount);
          }
        }
      }
      if (total <= 0) return send(409, { code: "ZERO_AMOUNT_NOT_SUPPORTED", title: "zero" });
      Object.assign(item, { status: "Issued", taxAmount: input.taxAmount, terms: input.terms, validUntil: input.validUntil, revision: item.revision + 1, totalAmount: total + input.taxAmount, pricingStatus: "Final", issuedAt: new Date().toISOString() });
      return send(200, item, { ETag: etagOf(item.id, item.revision) });
    }

    // --- enterprise --------------------------------------------------------------------------------------------
    const asOrg = (item: Rec) => ({ ...item, assignedTo: null, closeReason: null });
    const enterpriseMatch = path.match(/^\/api\/(billing|admin)\/enterprise-quote-requests\/([^/]+?)(?:\/(responses|close|quotations))?$/);
    if (method === "POST" && path === "/api/billing/enterprise-quote-requests") {
      return receipt(path, () => {
        mock.sequence += 1;
        const created = { ...(body as object), id: `77777777-0000-0000-0000-0000000000${mock.sequence}`, organizationId: "org-1", status: "New", createdAt: new Date().toISOString(), revision: 1, quotationId: null, assignedTo: null, closedAt: null, closeReason: null };
        mock.enterprise.push(created);
        return { status: 201, json: created };
      });
    }
    if (method === "GET" && path === "/api/billing/enterprise-quote-requests") return send(200, page_(mock.enterprise.map(asOrg), pageNo, pageSize));
    if (method === "GET" && path === "/api/admin/enterprise-quote-requests") return send(200, page_(mock.enterprise, pageNo, pageSize));
    if (enterpriseMatch) {
      const [, scope, id, sub] = enterpriseMatch;
      const item = mock.enterprise.find((entry) => entry.id === id) as (Rec & { revision: number; status: string }) | undefined;
      if (!item) return send(404, { code: "BILLING_RESOURCE_NOT_FOUND" });
      if (method === "GET" && !sub) return send(200, scope === "admin" ? item : asOrg(item), { ETag: etagOf(id, item.revision) });
      if (method === "GET" && sub === "responses") return send(200, page_(mock.responses[id] ?? [], pageNo, pageSize));
      if (method === "PATCH" && !sub) {
        if (!h["if-match"]) return send(428, { code: "IF_MATCH_REQUIRED" });
        if (h["if-match"] !== etagOf(id, item.revision)) return send(412, { code: "REVISION_MISMATCH" });
        if (item.status === "Closed") return send(409, { code: "ENTERPRISE_REQUEST_CLOSED" });
        const input = body as { status?: string; assignedTo?: string; clearAssignment?: boolean };
        if (input.status === "Contacted" && item.status !== "New") return send(409, { code: "BILLING_STATE_CONFLICT" });
        if (input.status) item.status = input.status;
        if (input.assignedTo) item.assignedTo = input.assignedTo;
        if (input.clearAssignment) item.assignedTo = null;
        item.revision += 1;
        return send(200, item, { ETag: etagOf(id, item.revision) });
      }
      if (method === "POST" && sub === "responses") {
        return receipt(path, () => {
          if (item.status === "Closed") return { status: 409, json: { code: "ENTERPRISE_REQUEST_CLOSED", title: "closed" } };
          const created = { id: `r-${(mock.responses[id] ?? []).length + 1}`, requestId: id, authorId: "admin", authorName: "Platform Admin", message: (body as { message: string }).message, createdAt: new Date().toISOString() };
          mock.responses[id] = [...(mock.responses[id] ?? []), created];
          return { status: 201, json: created };
        });
      }
      if (method === "POST" && sub === "close") {
        return receipt(path, () => {
          if (h["if-match"] !== etagOf(id, item.revision)) return { status: 412, json: { code: "REVISION_MISMATCH" } };
          Object.assign(item, { status: "Closed", closedAt: new Date().toISOString(), closeReason: (body as { reason: string }).reason, revision: item.revision + 1 });
          return { status: 200, json: item, headers: { ETag: etagOf(id, item.revision) } };
        });
      }
      if (method === "POST" && sub === "quotations") {
        return receipt(path, () => {
          mock.sequence += 1;
          const input = body as { items: Array<{ buildingId: string; servicePackageId: string; purchaseAction: string }> };
          const pkg = mock.packages.find((entry) => entry.id === input.items[0].servicePackageId)!;
          const qid = `aaaaaaaa-0000-0000-0000-0000000000${mock.sequence}`;
          const lines = input.items.map((entry, index) => ({ ...quotationFixture().items[0], id: `bbbbbbbb-0000-0000-0000-${String(mock.sequence * 10 + index).padStart(12, "0")}`, buildingId: entry.buildingId, purchaseAction: entry.purchaseAction, servicePackageId: pkg.id, packageName: pkg.name, startsAt: null, endsAt: null, discountAmount: 0, totalAmount: pkg.unitPrice * pkg.durationMonths }));
          const created = quotationFixture({ id: qid, quotationNumber: `FET-Q-${String(mock.sequence).padStart(4, "0")}`, status: "Draft", revision: 1, taxAmount: null, terms: null, pricingStatus: "Estimated", issuedAt: null, items: lines, subtotalAmount: pkg.unitPrice * pkg.durationMonths * lines.length, totalAmount: pkg.unitPrice * pkg.durationMonths * lines.length, discountAmount: 0 });
          mock.quotations[qid] = created;
          Object.assign(item, { status: "Quoted", quotationId: qid, revision: item.revision + 1 });
          return { status: 201, json: created, headers: { ETag: etagOf(qid, 1) } };
        });
      }
    }

    // --- PayOS -------------------------------------------------------------------------------------------------
    if (method === "POST" && path === "/api/payments/payos/create") {
      return receipt(path, () => {
        const input = body as { quotationId: string };
        const quote = mock.quotations[input.quotationId];
        if (!quote || quote.status !== "Accepted") return { status: 409, json: { code: "QUOTATION_NOT_PAYABLE", title: "not payable" } };
        if (!mock.checkoutExists) {
          mock.checkoutExists = true;
          mock.checkout = checkoutFixture({ quotationId: input.quotationId, amount: quote.totalAmount });
          mock.payment = paymentFixture({ quotationId: input.quotationId, amount: quote.totalAmount, paymentStatus: "Pending", paidAt: null, transactionId: null, transactionStatus: null, provisioningStatus: "NotStarted", items: (quote.items as Array<{ id: string; buildingId: string }>).map((line) => ({ quotationItemId: line.id, buildingId: line.buildingId, status: "NotStarted", entitlementId: null, errorCode: null })) });
        }
        return { status: 201, json: mock.checkout, headers: { Location: `/api/payments/payos/checkouts/${mock.checkout.checkoutId}` } };
      });
    }
    if (method === "GET" && path.startsWith("/api/payments/payos/checkouts/")) return send(200, mock.checkout);
    if (method === "POST" && /\/api\/payments\/payos\/requests\/[^/]+\/cancel$/.test(path)) {
      if (!h["idempotency-key"]) return send(400, { code: "IDEMPOTENCY_KEY_REQUIRED" });
      mock.checkout = { ...mock.checkout, checkoutStatus: "Cancelled" };
      return send(200, mock.checkout);
    }
    if (method === "GET" && path.startsWith("/api/payments/payos/requests/")) return send(200, mock.payment);
    if (method === "POST" && /^\/api\/admin\/payments\/payos\/checkouts\/[^/]+\/reconcile$/.test(path)) {
      // The re-queued recovery succeeds: nothing is granted by hand, the stuck lines finish.
      mock.checkout = { ...mock.checkout, checkoutStatus: mock.checkout.checkoutStatus === "NeedsReconcile" ? "Completed" : mock.checkout.checkoutStatus, errorCode: null };
      if (mock.payment.paymentStatus === "Paid") mock.payment = paymentFixture({ ...mock.payment, provisioningStatus: "Succeeded", items: mock.payment.items.map((line) => ({ ...line, status: "Succeeded", errorCode: null, entitlementId: "ent-1" })) });
      for (const row of mock.ledger) if (row.checkoutId === path.split("/")[6]) Object.assign(row, { provisioningStatus: "Succeeded", checkoutStatus: "Completed", provisioningSucceeded: row.provisioningLines });
      return send(202);
    }
    if (method === "GET" && (path === "/api/admin/payments/payos/checkouts" || path === "/api/admin/payments/payos/requests")) {
      const status = q.get("Status") ?? q.get("status");
      const org = q.get("OrganizationId") ?? q.get("organizationId");
      const quotation = q.get("QuotationId") ?? q.get("quotationId");
      const from = q.get("From") ?? q.get("from");
      const to = q.get("To") ?? q.get("to");
      const byCheckouts = path.endsWith("/checkouts");
      const rows = ledgerFor(mock).filter((row) => (!status || (byCheckouts ? row.checkoutStatus : row.paymentStatus) === status) && (!org || row.organizationId === org) && (!quotation || row.quotationId === quotation) && (!from || String(row.createdAt) >= from) && (!to || String(row.createdAt) < to));
      return send(200, page_(rows, pageNo, pageSize));
    }
    if (method === "GET" && path === "/api/billing/entitlements") return send(200, page_(mock.entitlements, 1, 50));
    const serviceMatch = path.match(/^\/api\/buildings\/([^/]+)\/service-entitlement$/);
    if (method === "GET" && serviceMatch) {
      const view = mock.service[serviceMatch[1]] ?? { current: null, upcoming: [] };
      return send(200, { buildingId: serviceMatch[1], asOf: new Date().toISOString(), ...view });
    }

    // --- AI quota ----------------------------------------------------------------------------------------------
    if (method === "GET" && /^\/api\/(organizations\/me|admin\/organizations\/[^/]+)\/ai-quota$/.test(path)) return send(200, { organizationId: "org-1", asOf: new Date().toISOString(), units: mock.quota.units });
    if (method === "GET" && /^\/api\/(organizations\/me|admin\/organizations\/[^/]+)\/ai-quota\/grants$/.test(path)) return send(200, page_(mock.quota.grants, pageNo, pageSize));
    if (method === "GET" && /^\/api\/(organizations\/me|admin\/organizations\/[^/]+)\/ai-usage$/.test(path)) return send(200, page_(mock.quota.usage, pageNo, pageSize));

    // --- notifications -----------------------------------------------------------------------------------------
    if (method === "GET" && path === "/api/organizations/me/notifications") {
      const unread = (q.get("unread") ?? q.get("Unread")) === "true";
      return send(200, page_(mock.notifications.filter((entry) => !unread || !entry.readAt), pageNo, pageSize));
    }
    const readMatch = path.match(/^\/api\/organizations\/me\/notifications\/([^/]+)\/read$/);
    if (method === "PATCH" && readMatch) {
      const item = mock.notifications.find((entry) => entry.id === readMatch[1]);
      if (!item) return send(404, { code: "NOTIFICATION_NOT_FOUND" });
      item.readAt = item.readAt ?? new Date().toISOString();
      return send(200, item);
    }

    return route.fallback();
  });
}

export const callsTo = (mock: Mock, method: string, path: string) => mock.calls.filter((call) => call.method === method && call.path === path);
