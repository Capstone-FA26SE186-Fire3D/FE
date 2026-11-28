/**
 * Admin scenario reviews (/admin/reviews): queue and detail, read-only since BE#211 (a Chuyên viên PCCC decides in /expert/reviews).
 * Evidence level: Playwright route mocks that keep SERVER STATE (statuses, receipts by Idempotency-Key) and follow the
 * BE contract (ScenarioReviewQueriesController, ScenarioContentReviewsController, OpenAPI @1eaf988; BE#242
 * AdminExpertReviewsController for the "người được giao" panel and Gán lại). Not an integration
 * test against the real API. Run against a production build (`NEXT_PUBLIC_API_BASE_URL=` empty so the mock is same-origin).
 */
import { EXPOSED } from "./api-headers";
import { expect, test, type Page, type Route } from "@playwright/test";
import { expectChipValue, pick } from "./chip-helpers";

const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const owner = { id: "owner-1", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", role: 1, organizationId: "org-1", profileRevision: 1 };

const ORG_1 = "11111111-1111-4111-8111-111111111111";
const ORG_2 = "22222222-2222-4222-8222-222222222222";
const SUBMITTER = "aaaaaaaa-0000-4000-8000-000000000001";
const ADMIN_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const hex = (seed: string) => (seed.repeat(64)).slice(0, 64);
const expertAccount = (id: string, fullName: string, isActive = true) => ({ id, email: `${id}@fire3d.test`, fullName, role: "FireSafetyExpert", organizationId: null, isActive, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
const EXPERT_A = expertAccount("expert-a", "Chuyên viên Lê Văn T");
const EXPERT_B = expertAccount("expert-b", "Chuyên viên Trần Thị B");
const EXPERTS = [EXPERT_A, EXPERT_B, expertAccount("expert-c", "Chuyên viên đã nghỉ", false)];

type Status = "Submitted" | "Approved" | "Rejected";
type Seed = { n: number; status?: Status; org?: string; scenarioName?: string; versionNumber?: number; reason?: string | null; ready?: boolean; legacy?: boolean; instructions?: string };

function buildReview(seed: Seed) {
  const orgId = seed.org ?? ORG_1;
  const status = seed.status ?? "Submitted";
  const id = `00000000-0000-4000-8000-${String(seed.n).padStart(12, "0")}`;
  const versionId = `99999999-0000-4000-8000-${String(seed.n).padStart(12, "0")}`;
  return {
    summary: {
      reviewId: id, scenarioVersionId: versionId, status,
      contentHash: hex(`c${seed.n}`.padEnd(2, "0")), rubricHash: hex(`d${seed.n}`.padEnd(2, "0")),
      submittedBy: SUBMITTER, submittedAt: new Date(Date.UTC(2026, 9, 1, 8, seed.n)).toISOString(),
      decidedBy: status === "Submitted" ? null : ADMIN_ID, decidedAt: status === "Submitted" ? null : "2026-10-12T09:00:00Z",
      reason: status === "Rejected" ? seed.reason ?? "Thiếu tiêu chí thời gian phản ứng." : null,
      organizationId: orgId, organizationName: orgId === ORG_1 ? "Trường THPT Lê Quý Đôn" : "Công ty Sao Mai",
      buildingId: `bld-${orgId.slice(0, 2)}`, buildingName: orgId === ORG_1 ? "Nhà A" : "Kho hàng",
      scenarioId: `scn-${seed.n}`, scenarioName: seed.scenarioName ?? `Kịch bản số ${seed.n}`, versionNumber: seed.versionNumber ?? 1,
    },
    content: seed.legacy ? null : { schemaVersion: "7.0", spawn: { x: 1.5, y: 0, z: 2 }, goal: { zone: "assembly-point" }, hazards: [{ id: "fire-1", type: "fire", intensity: 0.6 }, { id: "smoke-1", type: "smoke", intensity: 0.8 }], title: "Sơ tán giờ ra chơi", note: "<img src=x onerror=\"window.__xss=1\">" },
    rubric: seed.legacy ? null : { schema_version: "1", pass_threshold: 70, criteria: [{ id: "evac_time", metric: "evacuation_time_seconds", operator: "lte", threshold: 180, weight: 0.4, mandatory: true }, { id: "no_lift", metric: "elevator_use", operator: "eq", threshold: 0, weight: 0.6, mandatory: false }] },
    learningObjectives: seed.legacy ? null : ["Nhận biết tín hiệu báo cháy và sơ tán ngay.", "Chọn đường thoát nạn không có khói."],
    learnerInstructions: seed.legacy ? null : seed.instructions ?? "Bạn đang ở khu làm việc khi chuông báo cháy vang lên.",
    readiness: seed.ready === false
      ? { validationRunId: null, outcome: null, blockerCount: 0, confirmationReviewId: null, candidateArtifactId: null, technicalReady: false }
      : { validationRunId: "dddddddd-0000-4000-8000-000000000001", outcome: "Passed", blockerCount: 0, confirmationReviewId: "eeeeeeee-0000-4000-8000-000000000001", candidateArtifactId: "ffffffff-0000-4000-8000-000000000001", technicalReady: true },
  };
}
type ReviewRecord = ReturnType<typeof buildReview>;

type Faults = {
  /** Apply the decision but lose the response (timeout/network). */
  dropNextResponse?: boolean;
  /** Answer the next decision with 429 + Retry-After without applying it. */
  rateLimitNext?: boolean;
  /** Answer the next decision with this error without applying it. */
  failNext?: { status: number; code?: string };
  /** Delay the detail response of one review (ms) for late-response tests. */
  detailDelayMs?: Record<string, number>;
  listStatus?: number;
  detailStatus?: number;
};

class ReviewServer {
  reviews: ReviewRecord[];
  faults: Faults = {};
  listQueries: URLSearchParams[] = [];
  decisionRequests: Array<{ action: string; versionId: string; key: string | null; body: Record<string, unknown> }> = [];
  applied: Array<{ action: string; versionId: string }> = [];
  private receipts = new Map<string, { fingerprint: string; response: Record<string, unknown> }>();

  /**
   * BE#242 round-robin assignment (always on), keyed by reviewId of either kind: holder, or null/absent = not assigned.
   * `GET /api/admin/reviews` (AdminExpertReviewsController) lists waiting Scenario items (same reviewId as the scenario
   * list) plus `infrastructures`, in the expert item shape with flat `assigneeId/assigneeName/assignedAt`.
   */
  assignments: Record<string, { id: string; fullName: string } | null> = {};
  /** Hạ tầng PCCC items (BE#213) for the admin reviews list: `reviewId = infrastructureId`, scenario fields null. */
  infrastructures: Array<{ reviewId: string; status: Status; buildingName: string; organizationName: string; versionNumber: number; submittedAt: string }> = [];
  assignmentQueries: URLSearchParams[] = [];
  reassignRequests: Array<{ id: string; body: Record<string, unknown> }> = [];
  /** Answer the next reassign with this error code without applying it. */
  reassignFailNext?: { status: number; code: string };

  constructor(seeds: Seed[]) {
    this.reviews = seeds.map(buildReview);
  }

  private holder(id: string) {
    const holder = this.assignments[id] ?? null;
    return { assigneeId: holder?.id ?? null, assigneeName: holder?.fullName ?? null, assignedAt: holder ? "2026-10-01T09:00:00Z" : null };
  }

  /** One item of `GET /api/admin/reviews` (expert item shape). */
  item(id: string) {
    const review = this.byId(id);
    if (review) {
      const s = review.summary;
      return { ...s, kind: "Scenario", revision: s.status === "Submitted" ? 1 : 2, revisionId: "rev-1", infrastructureId: null, ...this.holder(id) };
    }
    const infra = this.infrastructures.find((entry) => entry.reviewId === id);
    if (!infra) return null;
    return {
      reviewId: infra.reviewId, kind: "Infrastructure", status: infra.status, revision: 3, scenarioVersionId: null, revisionId: "rev-1", contentHash: hex("e"), rubricHash: null,
      submittedBy: SUBMITTER, submittedByName: "Nguyễn Văn A (gửi)", submittedAt: infra.submittedAt, decidedBy: null, decidedByName: null, decidedAt: null, reason: null,
      organizationId: ORG_1, organizationName: infra.organizationName, buildingId: "bld-11", buildingName: infra.buildingName,
      scenarioId: null, scenarioName: null, versionNumber: infra.versionNumber, infrastructureId: infra.reviewId, ...this.holder(id),
    };
  }

  assignmentList(url: URL) {
    const query = url.searchParams;
    this.assignmentQueries.push(query);
    const status = query.get("status") ?? "Submitted";
    const ids = [
      ...this.reviews.filter((review) => review.summary.status === status).map((review) => ({ id: review.summary.reviewId, at: review.summary.submittedAt })),
      ...this.infrastructures.filter((entry) => entry.status === status).map((entry) => ({ id: entry.reviewId, at: entry.submittedAt })),
    ].sort((a, b) => (a.at < b.at ? -1 : 1)); // waiting items oldest first
    return { items: ids.map(({ id }) => this.item(id)), totalCount: ids.length, page: 1, pageSize: 20 };
  }

  statusOf(id: string) { return this.byId(id)?.summary.status ?? this.infrastructures.find((entry) => entry.reviewId === id)?.status; }

  byId(id: string) { return this.reviews.find((review) => review.summary.reviewId === id); }
  byVersion(id: string) { return this.reviews.find((review) => review.summary.scenarioVersionId === id); }

  list(url: URL) {
    const query = url.searchParams;
    if (query.get("pageSize") !== "1") this.listQueries.push(query); // pageSize=1 is the per-status total probe of the KPI tiles
    const status = query.get("status");
    if (status && !["Submitted", "Approved", "Rejected"].includes(status)) return { status: 400, body: { title: "Review validation failed.", code: "VALIDATION_ERROR" } };
    const organizationId = query.get("organizationId");
    const page = Number(query.get("page") ?? 1);
    const pageSize = Number(query.get("pageSize") ?? 20);
    const filtered = this.reviews
      .filter((review) => (!status || review.summary.status === status) && (!organizationId || review.summary.organizationId === organizationId))
      .map((review) => review.summary)
      .sort((a, b) => (a.submittedAt === b.submittedAt ? (a.reviewId < b.reviewId ? 1 : -1) : a.submittedAt < b.submittedAt ? 1 : -1));
    return { status: 200, body: { items: filtered.slice((page - 1) * pageSize, page * pageSize), totalCount: filtered.length, page, pageSize } };
  }

  decide(action: "approve" | "reject", versionId: string, key: string | null, body: Record<string, unknown>): { status: number; body: Record<string, unknown>; drop?: boolean; headers?: Record<string, string> } {
    this.decisionRequests.push({ action, versionId, key, body });
    if (!key) return { status: 400, body: { title: "Idempotency-Key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" } };
    const fingerprint = JSON.stringify([action, versionId, body]);
    const receipt = this.receipts.get(key);
    if (receipt) return receipt.fingerprint === fingerprint ? { status: 200, body: receipt.response } : { status: 409, body: { title: "Idempotency-Key reused.", code: "IDEMPOTENCY_KEY_CONFLICT" } };
    if (this.faults.rateLimitNext) { this.faults.rateLimitNext = false; return { status: 429, body: { title: "Too many requests." }, headers: { ...EXPOSED, "Retry-After": "2" } }; }
    if (this.faults.failNext) { const fail = this.faults.failNext; this.faults.failNext = undefined; return { status: fail.status, body: { title: "Injected error.", ...(fail.code ? { code: fail.code } : {}) } }; }
    const review = this.byVersion(versionId);
    if (!review) return { status: 404, body: { title: "Not found.", code: "NOT_FOUND" } };
    if (action === "reject" && (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 4000)) return { status: 400, body: { title: "Review validation failed.", code: "VALIDATION_ERROR", errors: { reason: ["A rejection reason of 1-4000 characters is required."] } } };
    if (review.summary.status !== "Submitted") return { status: 409, body: { title: "Not pending.", code: "CONTENT_REVIEW_NOT_PENDING" } };
    if (body.contentHash !== review.summary.contentHash || body.rubricHash !== review.summary.rubricHash) return { status: 409, body: { title: "Hash mismatch.", code: "CONTENT_HASH_MISMATCH" } };
    review.summary.status = action === "approve" ? "Approved" : "Rejected";
    review.summary.decidedBy = ADMIN_ID;
    review.summary.decidedAt = "2026-10-14T10:00:00Z";
    review.summary.reason = action === "reject" ? String(body.reason).trim() : null;
    const response = { code: "OK", reviewId: review.summary.reviewId, status: review.summary.status, contentHash: review.summary.contentHash, rubricHash: review.summary.rubricHash };
    this.receipts.set(key, { fingerprint, response });
    this.applied.push({ action, versionId });
    if (this.faults.dropNextResponse) { this.faults.dropNextResponse = false; return { status: 200, body: response, drop: true }; }
    return { status: 200, body: response };
  }
}

const problem = (route: Route, status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  route.fulfill({ status, headers: { "Content-Type": "application/problem+json", ...headers }, body: JSON.stringify({ status, ...body }) });

async function install(page: Page, server: ReviewServer, user: object = admin) {
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: "ops-access", refreshToken: "ops-refresh" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ...EXPOSED, ETag: '"1"' } }));
  await page.route((url) => url.pathname === "/api/organizations", (route) => route.fulfill({ json: { items: [
    { id: ORG_1, name: "Trường THPT Lê Quý Đôn", slug: "le-quy-don", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    { id: ORG_2, name: "Công ty Sao Mai", slug: "sao-mai", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  ], totalCount: 2, page: 1, pageSize: 100 } }));
  await page.route((url) => /^\/api\/accounts\/[^/]+$/.test(url.pathname), (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const name = id === SUBMITTER ? "Nguyễn Văn A (gửi)" : id === ADMIN_ID ? "Quản trị Duyệt" : null;
    if (!name) return problem(route, 404, { title: "Not found." });
    return route.fulfill({ json: { id, email: `${id?.slice(0, 4)}@fire3d.test`, fullName: name, role: "OrganizationUser", organizationId: ORG_1, isActive: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } });
  });
  await page.route((url) => url.pathname === "/api/admin/scenario-reviews", (route) => {
    if (server.faults.listStatus) return problem(route, server.faults.listStatus, { title: "Injected list failure.", code: server.faults.listStatus === 500 ? "INTERNAL_ERROR" : "FORBIDDEN" });
    const result = server.list(new URL(route.request().url()));
    return route.fulfill({ status: result.status, json: result.body });
  });
  await page.route((url) => /^\/api\/admin\/scenario-reviews\/[^/]+$/.test(url.pathname), async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop() as string;
    const delay = server.faults.detailDelayMs?.[id];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (server.faults.detailStatus) return problem(route, server.faults.detailStatus, { title: "Injected detail failure.", code: "NOT_FOUND" });
    const review = server.byId(id);
    if (!review) return problem(route, 404, { title: "Not found.", code: "NOT_FOUND" });
    const { summary, content, rubric, learningObjectives, learnerInstructions, readiness } = review;
    return route.fulfill({ json: { review: summary, content, rubric, learningObjectives, learnerInstructions, readiness } });
  });
  // Active Chuyên viên PCCC for the "Gán lại" picker (admin accounts API, role + status filters).
  await page.route((url) => url.pathname === "/api/accounts", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const items = EXPERTS.filter((account) => (!query.get("role") || account.role === query.get("role")) && (query.get("isActive") !== "true" || account.isActive));
    return route.fulfill({ json: { items, totalCount: items.length, page: 1, pageSize: 100 } });
  });
  // BE#242 AdminExpertReviewsController: both kinds with their assignee, then reassign (400/404/409/422 as documented).
  await page.route((url) => url.pathname === "/api/admin/reviews", (route) => route.fulfill({ json: server.assignmentList(new URL(route.request().url())) }));
  await page.route((url) => /^\/api\/admin\/reviews\/[^/]+\/reassign$/.test(url.pathname), (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2) as string;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    server.reassignRequests.push({ id, body });
    if (server.reassignFailNext) { const fail = server.reassignFailNext; server.reassignFailNext = undefined; return problem(route, fail.status, { title: "Injected error.", code: fail.code }); }
    const status = server.statusOf(id);
    if (!status) return problem(route, 404, { title: "Not found.", code: "NOT_FOUND" });
    if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500) return problem(route, 400, { title: "Validation failed.", code: "VALIDATION_ERROR", errors: { reason: ["Reason must be 1-500 characters."] } });
    if (status !== "Submitted") return problem(route, 409, { title: "Not pending.", code: "REVIEW_NOT_PENDING" });
    const target = EXPERTS.find((account) => account.id === body.expertId && account.isActive);
    if (!target) return problem(route, 422, { title: "Expert not available.", code: "EXPERT_NOT_AVAILABLE", errors: { expertId: ["Choose an active FireSafetyExpert whose email is verified."] } });
    server.assignments[id] = { id: target.id, fullName: target.fullName };
    return route.fulfill({ json: server.item(id) });
  });
  await page.route((url) => /^\/api\/admin\/scenario-versions\/[^/]+\/(approve|reject)$/.test(url.pathname), (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const action = parts.pop() as "approve" | "reject";
    const versionId = parts.pop() as string;
    const result = server.decide(action, versionId, route.request().headers()["idempotency-key"] ?? null, route.request().postDataJSON() as Record<string, unknown>);
    if (result.drop) return route.abort("failed");
    return route.fulfill({ status: result.status, headers: { "Content-Type": result.status === 200 ? "application/json" : "application/problem+json", ...(result.headers ?? {}) }, body: JSON.stringify(result.body) });
  });
}

const baseSeeds = (): Seed[] => [
  { n: 1, scenarioName: "Sơ tán giờ ra chơi", versionNumber: 2 },
  { n: 2, org: ORG_2, scenarioName: "Cháy kho hàng giờ cao điểm", ready: false },
  { n: 3, status: "Approved", scenarioName: "Mất điện và khói" },
  { n: 4, status: "Rejected", scenarioName: "Thoát nạn tầng hầm", reason: "Thiếu tiêu chí thời gian phản ứng." },
];

const drawer = (page: Page) => page.getByTestId("review-drawer");
/** Queue rows of the DataTable: table rows at desktop width, cards under 640px (`cardBelow`). */
const rows = (page: Page) => page.getByTestId("review-table").locator("tbody tr, li.ops-dt-card");
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const orgFilter = (page: Page) => page.getByRole("combobox", { name: "Tổ chức" });

test.describe("queue", () => {
  test("defaults to Submitted, shows the required columns and loads detail only on demand", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(page.getByRole("heading", { level: 1, name: "Theo dõi thẩm định" })).toBeVisible();
    await expect(page.getByTestId("pending-module")).toHaveCount(0);
    await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);
    expect(server.listQueries[0].get("status")).toBe("Submitted");
    expect(server.listQueries[0].get("pageSize")).toBe("20");
    await expect(page.getByRole("group", { name: "Tổng theo trạng thái" })).toContainText("Tổng mọi thời điểm");
    const first = rows(page).first();
    await expect(first).toContainText("Công ty Sao Mai"); // newest submittedAt first
    await expect(first).toContainText("Kho hàng");
    await expect(first).toContainText("Chờ thẩm định");
    await expect(rows(page).nth(1)).toContainText("v2");
    await expect(page.getByRole("navigation", { name: "Quản trị hệ thống" }).getByRole("link", { name: /Theo dõi thẩm định/ })).not.toContainText("Sắp có");
  });

  test("status and organization filters live in the URL and drive the query", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(rows(page)).toHaveCount(2);

    await pick(page, "Trạng thái", { value: "Approved" });
    await expect(page).toHaveURL(/status=Approved/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Mất điện và khói");
    await expect(rows(page).first()).toContainText("Đạt thẩm định");

    await pick(page, "Trạng thái", { value: "" }); // "Tất cả" removes the status filter
    await expect(page).toHaveURL(/status=all/);
    await expect(rows(page)).toHaveCount(4);
    expect(server.listQueries.at(-1)?.has("status")).toBe(false);

    await orgFilter(page).click();
    await page.getByRole("option", { name: "Công ty Sao Mai" }).click();
    await expect(page).toHaveURL(new RegExp(`organizationId=${ORG_2}`));
    await expect(rows(page)).toHaveCount(1);
    expect(server.listQueries.at(-1)?.get("organizationId")).toBe(ORG_2);

    await page.reload();
    await expectChipValue(page, "Trạng thái", "");
    await expect(orgFilter(page)).toContainText("Công ty Sao Mai");
    await expect(rows(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Về mặc định (chờ thẩm định)" }).click();
    await expect(page).not.toHaveURL(/status=|organizationId=/);
    await expect(rows(page)).toHaveCount(2);
  });

  test("pagination keeps page and filter in the URL and survives a reload", async ({ page }) => {
    const server = new ReviewServer(Array.from({ length: 45 }, (_, index) => ({ n: index + 1 })));
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(rows(page)).toHaveCount(20);
    await expect(page.getByTestId("review-table").getByText("Trang 1/3")).toBeVisible();
    await page.getByTestId("review-table").getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("review-table").getByText("Trang 2/3")).toBeVisible();
    expect(server.listQueries.at(-1)?.get("page")).toBe("2");
    await page.reload();
    await expect(page.getByTestId("review-table").getByText("Trang 2/3")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
    await page.getByTestId("review-table").getByRole("button", { name: "Trang sau" }).click();
    await expect(rows(page)).toHaveCount(5);
    await page.goBack();
    await expect(page.getByTestId("review-table").getByText("Trang 2/3")).toBeVisible();
  });

  test("empty, error with retry, 403, 401 and organization users", async ({ page }) => {
    const server = new ReviewServer([{ n: 1, status: "Approved" }]);
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(page.getByText("Chưa có tình huống nào chờ thẩm định")).toBeVisible();
    await pick(page, "Trạng thái", { value: "Approved" });
    await expect(rows(page)).toHaveCount(1);
    await pick(page, "Trạng thái", { value: "Rejected" });
    await expect(page.getByText("Không có mục nào phù hợp.")).toBeVisible();

    server.faults.listStatus = 500;
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByText("Không tải được danh sách thẩm định")).toBeVisible();
    server.faults.listStatus = undefined;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Không tải được danh sách thẩm định")).toHaveCount(0);

    server.faults.listStatus = 403;
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByText("Chỉ quản trị FET3D xem được danh sách thẩm định tình huống.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Thử lại" })).toHaveCount(0);
  });

  test("401 on the queue asks to sign in again", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    server.faults.listStatus = 401;
    await page.goto("/admin/reviews");
    await expect(page.getByText("Phiên đăng nhập đã hết hạn")).toBeVisible();
  });

  test("organization users never see the screen or call the API", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server, owner);
    await page.goto("/admin/reviews");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    expect(server.listQueries).toHaveLength(0);
    expect(server.assignmentQueries).toHaveLength(0);
  });
});

test.describe("detail", () => {
  test("opens by deep link with metadata, hashes, frozen content and a separate readiness block", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    const target = server.reviews[0].summary;
    await page.goto(`/admin/reviews?review=${target.reviewId}`);
    const dialog = drawer(page);
    await expect(dialog.getByRole("heading", { name: "Sơ tán giờ ra chơi" })).toBeVisible();
    await expect(dialog.locator(".ops-dialog-eyebrow")).toContainText("Chờ thẩm định"); // status and version are the drawer's eyebrow chips
    await expect(dialog.locator(".ops-dialog-eyebrow")).toContainText("v2");
    await expect(dialog.getByText("Trường THPT Lê Quý Đôn · Nhà A")).toBeVisible();
    await expect(dialog.getByText("Tài khoản tổ chức").first()).toBeVisible(); // the API has no display names; ids sit in the support line
    await dialog.getByTestId("review-support").locator("summary").click();
    await expect(dialog.locator(".rev-hash", { hasText: target.scenarioVersionId.slice(0, 8) })).toBeVisible();

    const contentHash = dialog.getByTestId("hash-content");
    await expect(contentHash).not.toHaveText(target.contentHash);
    await contentHash.locator("xpath=following-sibling::button").click();
    await expect(contentHash).toHaveText(target.contentHash);
    await dialog.getByTestId("hash-rubric").locator("xpath=following-sibling::button").click();
    await expect(dialog.getByTestId("hash-rubric")).toHaveText(target.rubricHash);

    await expect(dialog.getByText("Nhận biết tín hiệu báo cháy và sơ tán ngay.")).toBeVisible();
    await expect(dialog.getByTestId("review-instructions")).toHaveText("Bạn đang ở khu làm việc khi chuông báo cháy vang lên.");
    const rubric = dialog.getByRole("table", { name: "Tiêu chí chấm điểm đã khóa" });
    await expect(rubric.getByRole("row")).toHaveCount(3);
    await expect(rubric).toContainText("evac_time");
    await expect(rubric).toContainText("≤ 180");
    await expect(dialog.getByText("Điểm đạt tối thiểu:")).toBeVisible();

    const readiness = dialog.getByTestId("readiness-block");
    await expect(readiness.getByTestId("technical-ready")).toHaveText("Sẵn sàng kỹ thuật");
    await expect(readiness.getByTestId("readiness-outcome")).toContainText("Kiểm tra tự động đạt");
    await expect(readiness.getByTestId("readiness-blockers")).toHaveText("0");
    await expect(readiness.getByTestId("readiness-confirmation")).toContainText("Đã xác nhận");
    await expect(readiness.getByTestId("readiness-artifact")).toContainText("Đã có tệp");
    await expect(readiness.getByText("Điều kiện kỹ thuật, thẩm định nội dung và điều kiện phát hành là ba việc tách biệt")).toBeVisible();
    await expect(dialog.getByTestId("gate-separation")).toContainText("Không đánh giá ở màn này");
    await expect(dialog.getByTestId("review-status")).toHaveText("Chờ thẩm định");
  });

  test("JSON content is a collapsible summary rendered as text, never HTML", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    const dialog = drawer(page);
    await expect(dialog.getByText("2 mục", { exact: true })).toBeVisible();
    await dialog.getByText("hazards", { exact: true }).click();
    await expect(dialog.locator('pre[aria-label*="hazards"]')).toContainText('"smoke-1"');
    await expect(dialog.getByText("<img src=x", { exact: false }).first()).toBeVisible();
    await expect(dialog.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test("technical readiness not met is shown as such and does not hide or block the content decision", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto(`/admin/reviews?review=${server.reviews[1].summary.reviewId}`);
    const dialog = drawer(page);
    await expect(dialog.getByTestId("technical-ready")).toHaveText("Chưa sẵn sàng kỹ thuật");
    await expect(dialog.getByTestId("readiness-outcome")).toHaveText("Chưa có kết quả kiểm tra tự động");
    await expect(dialog.getByTestId("readiness-confirmation")).toContainText("Chưa xác nhận");
    await expect(dialog.getByTestId("readiness-artifact")).toContainText("Chưa có tệp cho ứng dụng");
    await expect(dialog.getByTestId("readiness-strip")).toContainText("Chưa đủ điều kiện kỹ thuật");
    await expect(dialog.getByTestId("review-status")).toHaveText("Chờ thẩm định");
  });

  test("legacy snapshots with null content are shown as missing, not invented", async ({ page }) => {
    const server = new ReviewServer([{ n: 1, legacy: true }]);
    await install(page, server);
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    const dialog = drawer(page);
    await expect(dialog.getByText("Phiên bản này không có mục tiêu học tập")).toBeVisible();
    await expect(dialog.getByText("Phiên bản này không có hướng dẫn")).toBeVisible();
    await expect(dialog.getByText("Phiên bản này không có tiêu chí chấm điểm")).toBeVisible();
    await expect(dialog.getByText("Phiên bản này không có nội dung kịch bản")).toBeVisible();
  });

  test("a decided review shows its immutable result and the rejection reason, with no decision buttons", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto(`/admin/reviews?status=Rejected&review=${server.reviews[3].summary.reviewId}`);
    const dialog = drawer(page);
    await expect(dialog.getByTestId("decision-result")).toContainText("chưa đạt thẩm định");
    await expect(dialog.getByTestId("reject-reason")).toContainText("Thiếu tiêu chí thời gian phản ứng.");
    await expect(dialog.getByText("Chuyên viên PCCC", { exact: true })).toBeVisible(); // the decider's id sits in the support line
  });

  test("opening a row sets ?review= and closing clears it; 404 and 403 are explained", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto("/admin/reviews");
    await row(page, "Sơ tán giờ ra chơi").click();
    await expect(page).toHaveURL(/review=/);
    await expect(drawer(page).getByTestId("review-detail")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Đóng", exact: true }).last().click();
    await expect(page).not.toHaveURL(/review=/);

    await page.goto("/admin/reviews?review=00000000-0000-4000-8000-00000000ffff");
    await expect(drawer(page).getByRole("heading", { name: "Không tìm thấy mục này" })).toBeVisible();
    await drawer(page).getByRole("button", { name: "Về danh sách" }).click();
    await expect(page).not.toHaveURL(/review=/);

    server.faults.detailStatus = 403;
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    await expect(drawer(page).getByText("Chỉ quản trị FET3D xem được danh sách thẩm định tình huống.")).toBeVisible();
  });

  test("a late detail response for a previous review never overwrites the one now open", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    server.faults.detailDelayMs = { [server.reviews[0].summary.reviewId]: 1200 };
    await page.goto("/admin/reviews");
    await row(page, "Sơ tán giờ ra chơi").click();
    await page.keyboard.press("Escape");
    await row(page, "Cháy kho hàng giờ cao điểm").click();
    await expect(drawer(page).getByRole("heading", { name: /Cháy kho hàng giờ cao điểm/ })).toBeVisible();
    await page.waitForTimeout(1600);
    await expect(drawer(page).getByRole("heading", { name: /Cháy kho hàng giờ cao điểm/ })).toBeVisible();
    await expect(drawer(page).getByRole("heading", { name: /Sơ tán giờ ra chơi/ })).toHaveCount(0);
  });
});

test("the admin screen is read-only since BE#211: no decision buttons and no decision request", async ({ page }) => {
  const server = new ReviewServer(baseSeeds());
  await install(page, server);
  await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
  const dialog = drawer(page);
  await expect(dialog.getByTestId("review-detail")).toHaveAttribute("data-review-status", "Submitted");
  await expect(dialog.getByTestId("review-readonly")).toContainText("Chuyên viên PCCC thẩm định nội dung này.");
  await expect(dialog.getByRole("button", { name: /thẩm định|chưa đạt|từ chối|duyệt/i })).toHaveCount(0);
  expect(server.decisionRequests).toHaveLength(0);
});

test.describe("assignment (BE#242)", () => {
  /** Rows of the "Đang chờ thẩm định — người được giao" panel (`GET /api/admin/reviews`). */
  const heldRows = (page: Page) => page.getByTestId("assignment-table").locator("tbody tr, li.ops-dt-card");
  const heldRow = (page: Page, name: string) => heldRows(page).filter({ hasText: name });
  const openReassign = async (page: Page, name: string) => {
    await heldRow(page, name).getByRole("button", { name: "Thao tác" }).click();
    await page.getByRole("menuitem", { name: "Gán lại" }).click();
    return page.getByRole("dialog", { name: "Gán lại cho Chuyên viên khác" });
  };
  const INFRA_ID = "cccccccc-0000-4000-8000-000000000009";
  const withInfrastructure = (server: ReviewServer) => {
    server.infrastructures = [{ reviewId: INFRA_ID, status: "Submitted", buildingName: "Nhà B", organizationName: "Trường THPT Lê Quý Đôn", versionNumber: 3, submittedAt: "2026-10-01T07:00:00Z" }];
    return server;
  };

  test("the panel lists waiting items of both kinds with their holder; the scenario list stays without it", async ({ page }) => {
    const server = withInfrastructure(new ReviewServer(baseSeeds()));
    const [first, second] = server.reviews.map((review) => review.summary.reviewId);
    server.assignments = { [first]: { id: EXPERT_A.id, fullName: EXPERT_A.fullName }, [second]: null, [INFRA_ID]: { id: EXPERT_B.id, fullName: EXPERT_B.fullName } };
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByTestId("review-table").getByText("Người được giao")).toHaveCount(0);

    const panel = page.getByTestId("assignment-panel");
    await expect(panel.getByRole("heading", { name: "Đang chờ thẩm định — người được giao" })).toBeVisible();
    await expect(heldRows(page)).toHaveCount(3);
    await expect(heldRow(page, "Hạ tầng PCCC · Nhà B")).toContainText("Chuyên viên Trần Thị B");
    await expect(heldRow(page, "Sơ tán giờ ra chơi")).toContainText("Chuyên viên Lê Văn T");
    await expect(heldRow(page, "Cháy kho hàng giờ cao điểm")).toContainText("Chưa giao");
    // Only waiting items: the server's default status (Submitted) is used, decided items never appear.
    expect(server.assignmentQueries.every((query) => (query.get("status") ?? "Submitted") === "Submitted")).toBe(true);
    await expect(heldRow(page, "Mất điện và khói")).toHaveCount(0);

    // A scenario row also opens the existing drawer (same reviewId); an infrastructure row offers Gán lại only.
    await heldRow(page, "Sơ tán giờ ra chơi").getByRole("button", { name: "Thao tác" }).click();
    await page.getByRole("menuitem", { name: "Mở chi tiết" }).click();
    await expect(page).toHaveURL(new RegExp(`review=${first}`));
    await expect(drawer(page).getByTestId("review-detail")).toBeVisible();
  });

  test("reassigns a waiting scenario with a reason", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    const [first, second] = server.reviews.map((review) => review.summary.reviewId);
    server.assignments = { [first]: { id: EXPERT_A.id, fullName: EXPERT_A.fullName }, [second]: null };
    await install(page, server);
    await page.goto("/admin/reviews");

    const dialog = await openReassign(page, "Sơ tán giờ ra chơi");
    await dialog.getByTestId("reassign-submit").click();
    await expect(dialog.getByText("Chọn Chuyên viên PCCC nhận mục này.")).toBeVisible();
    await expect(dialog.getByText("Nhập lý do gán lại (1–500 ký tự).")).toBeVisible();
    expect(server.reassignRequests).toHaveLength(0);

    await dialog.getByRole("combobox", { name: "Chuyên viên PCCC" }).click();
    // The current holder and inactive experts are not offered.
    await expect(page.getByRole("option", { name: /Chuyên viên Lê Văn T/ })).toHaveCount(0);
    await expect(page.getByRole("option", { name: /Chuyên viên đã nghỉ/ })).toHaveCount(0);
    await page.getByRole("option", { name: /Chuyên viên Trần Thị B/ }).click();
    await dialog.getByTestId("reassign-reason").fill("  Chuyên viên T nghỉ phép tuần này.  ");
    await dialog.getByTestId("reassign-submit").click();
    await expect(dialog).toHaveCount(0);
    expect(server.reassignRequests).toEqual([{ id: first, body: { expertId: EXPERT_B.id, reason: "Chuyên viên T nghỉ phép tuần này." } }]);
    await expect(heldRow(page, "Sơ tán giờ ra chơi")).toContainText("Chuyên viên Trần Thị B");
  });

  test("reassigns a waiting infrastructure item", async ({ page }) => {
    const server = withInfrastructure(new ReviewServer(baseSeeds()));
    server.assignments = { [INFRA_ID]: { id: EXPERT_A.id, fullName: EXPERT_A.fullName } };
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(heldRow(page, "Hạ tầng PCCC · Nhà B")).toContainText("Chuyên viên Lê Văn T");

    await heldRow(page, "Hạ tầng PCCC · Nhà B").getByRole("button", { name: "Thao tác" }).click();
    await expect(page.getByRole("menuitem", { name: "Mở chi tiết" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Gán lại" }).click();
    const dialog = page.getByRole("dialog", { name: "Gán lại cho Chuyên viên khác" });
    await expect(dialog).toContainText("Hạ tầng PCCC · Nhà B");
    await dialog.getByRole("combobox", { name: "Chuyên viên PCCC" }).click();
    await page.getByRole("option", { name: /Chuyên viên Trần Thị B/ }).click();
    await dialog.getByTestId("reassign-reason").fill("Chia đều việc giữa hai Chuyên viên.");
    await dialog.getByTestId("reassign-submit").click();
    await expect(dialog).toHaveCount(0);
    expect(server.reassignRequests).toEqual([{ id: INFRA_ID, body: { expertId: EXPERT_B.id, reason: "Chia đều việc giữa hai Chuyên viên." } }]);
    await expect(heldRow(page, "Hạ tầng PCCC · Nhà B")).toContainText("Chuyên viên Trần Thị B");
  });

  test("422 EXPERT_NOT_AVAILABLE keeps the dialog open with its sentence; 409 REVIEW_NOT_PENDING closes and reloads", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    const [first] = server.reviews.map((review) => review.summary.reviewId);
    server.assignments = { [first]: { id: EXPERT_A.id, fullName: EXPERT_A.fullName } };
    await install(page, server);
    await page.goto("/admin/reviews");

    let dialog = await openReassign(page, "Sơ tán giờ ra chơi");
    await dialog.getByRole("combobox", { name: "Chuyên viên PCCC" }).click();
    await page.getByRole("option", { name: /Chuyên viên Trần Thị B/ }).click();
    await dialog.getByTestId("reassign-reason").fill("Cân bằng khối lượng việc.");
    server.reassignFailNext = { status: 422, code: "EXPERT_NOT_AVAILABLE" };
    await dialog.getByTestId("reassign-submit").click();
    await expect(dialog.getByText("Chuyên viên này chưa nhận thẩm định được (tài khoản đã khóa, đã xóa hoặc chưa xác minh email). Hãy chọn người khác.")).toBeVisible();
    await expect(dialog.getByTestId("reassign-reason")).toHaveValue("Cân bằng khối lượng việc.");

    server.reassignFailNext = { status: 409, code: "REVIEW_NOT_PENDING" };
    const listsBefore = server.listQueries.length;
    const panelBefore = server.assignmentQueries.length;
    await dialog.getByTestId("reassign-submit").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Mục này đã có kết quả thẩm định nên không gán lại được. Danh sách đã được tải lại.")).toBeVisible();
    await expect.poll(() => server.listQueries.length).toBeGreaterThan(listsBefore);
    await expect.poll(() => server.assignmentQueries.length).toBeGreaterThan(panelBefore);
    expect(server.reassignRequests).toHaveLength(2);
    expect(server.assignments[first]?.id).toBe(EXPERT_A.id);
    dialog = page.getByRole("dialog", { name: "Gán lại cho Chuyên viên khác" });
    await expect(dialog).toHaveCount(0);
  });
});

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"] as const) {
    test(`queue and detail fit ${width}px in the ${theme} theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      const server = new ReviewServer(baseSeeds());
      await install(page, server);
      const noOverflow = async (label: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${label} overflows horizontally`).toBeLessThanOrEqual(0);
      };
      await page.goto("/admin/reviews");
      await expect(rows(page)).toHaveCount(2);
      await noOverflow("queue");
      await page.screenshot({ path: testInfo.outputPath(`reviews-queue-${width}-${theme}.png`), fullPage: true });

      await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
      await expect(drawer(page).getByTestId("review-detail")).toBeVisible();
      await noOverflow("detail");
      const box = await drawer(page).evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      expect(box.scroll - box.client, "drawer overflows horizontally").toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`reviews-detail-${width}-${theme}.png`) });

    });
  }
}
