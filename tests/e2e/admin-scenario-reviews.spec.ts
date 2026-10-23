/**
 * Admin scenario reviews (/admin/reviews): queue, detail, approve/reject.
 * Evidence level: Playwright route mocks that keep SERVER STATE (statuses, receipts by Idempotency-Key) and follow the
 * BE contract (ScenarioReviewQueriesController, ScenarioContentReviewsController, OpenAPI @1eaf988). Not an integration
 * test against the real API. Run against a production build (`NEXT_PUBLIC_API_BASE_URL=` empty so the mock is same-origin).
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { expectChipValue, pick } from "./chip-helpers";

const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const owner = { id: "owner-1", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", role: 1, organizationId: "org-1", profileRevision: 1 };

const ORG_1 = "11111111-1111-4111-8111-111111111111";
const ORG_2 = "22222222-2222-4222-8222-222222222222";
const SUBMITTER = "aaaaaaaa-0000-4000-8000-000000000001";
const ADMIN_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const hex = (seed: string) => (seed.repeat(64)).slice(0, 64);

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

  constructor(seeds: Seed[]) {
    this.reviews = seeds.map(buildReview);
  }

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
    if (this.faults.rateLimitNext) { this.faults.rateLimitNext = false; return { status: 429, body: { title: "Too many requests." }, headers: { "Retry-After": "2" } }; }
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
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
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
/** The decision modal is titled after the version ("Từ chối phiên bản v2?"). */
const confirmDialog = (page: Page, action: "approve" | "reject") => page.getByRole("dialog", { name: action === "reject" ? /^Từ chối phiên bản v\d+\?/ : /^Duyệt nội dung phiên bản v\d+\?/ });

test.describe("queue", () => {
  test("defaults to Submitted, shows the required columns and loads detail only on demand", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(page.getByRole("heading", { level: 1, name: "Duyệt kịch bản" })).toBeVisible();
    await expect(page.getByTestId("pending-module")).toHaveCount(0);
    await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
    await expect(rows(page)).toHaveCount(2);
    expect(server.listQueries[0].get("status")).toBe("Submitted");
    expect(server.listQueries[0].get("pageSize")).toBe("20");
    await expect(page.getByRole("group", { name: "Tổng theo trạng thái" })).toContainText("Tổng từ máy chủ");
    const first = rows(page).first();
    await expect(first).toContainText("Công ty Sao Mai"); // newest submittedAt first
    await expect(first).toContainText("Kho hàng");
    await expect(first).toContainText("Chờ duyệt");
    await expect(rows(page).nth(1)).toContainText("v2");
    await expect(page.getByRole("navigation", { name: "Quản trị hệ thống" }).getByRole("link", { name: /Duyệt kịch bản/ })).not.toContainText("Chờ BE");
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
    await expect(rows(page).first()).toContainText("Đã duyệt nội dung");

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

    await page.getByRole("button", { name: "Về mặc định (chờ duyệt)" }).click();
    await expect(page).not.toHaveURL(/status=|organizationId=/);
    await expect(rows(page)).toHaveCount(2);
  });

  test("pagination keeps page and filter in the URL and survives a reload", async ({ page }) => {
    const server = new ReviewServer(Array.from({ length: 45 }, (_, index) => ({ n: index + 1 })));
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(rows(page)).toHaveCount(20);
    await expect(page.getByText("Trang 1/3")).toBeVisible();
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Trang 2/3")).toBeVisible();
    expect(server.listQueries.at(-1)?.get("page")).toBe("2");
    await page.reload();
    await expect(page.getByText("Trang 2/3")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(rows(page)).toHaveCount(5);
    await page.goBack();
    await expect(page.getByText("Trang 2/3")).toBeVisible();
  });

  test("empty, error with retry, 403, 401 and organization users", async ({ page }) => {
    const server = new ReviewServer([{ n: 1, status: "Approved" }]);
    await install(page, server);
    await page.goto("/admin/reviews");
    await expect(page.getByText("Chưa có kịch bản nào chờ duyệt")).toBeVisible();
    await pick(page, "Trạng thái", { value: "Approved" });
    await expect(rows(page)).toHaveCount(1);
    await pick(page, "Trạng thái", { value: "Rejected" });
    await expect(page.getByText("Không có bản duyệt phù hợp.")).toBeVisible();

    server.faults.listStatus = 500;
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByText("Không tải được hàng chờ duyệt")).toBeVisible();
    server.faults.listStatus = undefined;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Không tải được hàng chờ duyệt")).toHaveCount(0);

    server.faults.listStatus = 403;
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByText("Chỉ PlatformAdmin xem và quyết định được bản duyệt kịch bản.")).toBeVisible();
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
    await expect(dialog.locator(".ops-dialog-eyebrow")).toContainText("Chờ duyệt"); // status and version are the drawer's eyebrow chips
    await expect(dialog.locator(".ops-dialog-eyebrow")).toContainText("v2");
    await expect(dialog.getByText("Trường THPT Lê Quý Đôn · Nhà A")).toBeVisible();
    await expect(dialog.getByText(`${target.submittedBy.slice(0, 8)}…`).first()).toBeVisible(); // ids only: the API has no display names
    await expect(dialog.locator(".rev-hash", { hasText: target.scenarioVersionId })).toBeVisible();

    const contentHash = dialog.getByTestId("hash-content");
    await expect(contentHash).not.toHaveText(target.contentHash);
    await contentHash.locator("xpath=following-sibling::button").click();
    await expect(contentHash).toHaveText(target.contentHash);
    await dialog.getByTestId("hash-rubric").locator("xpath=following-sibling::button").click();
    await expect(dialog.getByTestId("hash-rubric")).toHaveText(target.rubricHash);

    await expect(dialog.getByText("Nhận biết tín hiệu báo cháy và sơ tán ngay.")).toBeVisible();
    await expect(dialog.getByTestId("review-instructions")).toHaveText("Bạn đang ở khu làm việc khi chuông báo cháy vang lên.");
    const rubric = dialog.getByRole("table", { name: "Tiêu chí rubric đã đóng băng" });
    await expect(rubric.getByRole("row")).toHaveCount(3);
    await expect(rubric).toContainText("evac_time");
    await expect(rubric).toContainText("≤ 180");
    await expect(dialog.getByText("Ngưỡng đạt:")).toBeVisible();

    const readiness = dialog.getByTestId("readiness-block");
    await expect(readiness.getByTestId("technical-ready")).toHaveText("Sẵn sàng kỹ thuật");
    await expect(readiness.getByTestId("readiness-outcome")).toContainText("Passed");
    await expect(readiness.getByTestId("readiness-blockers")).toHaveText("0");
    await expect(readiness.getByTestId("readiness-confirmation")).toContainText("eeeeeeee-0000");
    await expect(readiness.getByTestId("readiness-artifact")).toContainText("ffffffff-0000");
    await expect(readiness.getByText("Readiness kỹ thuật ≠ duyệt nội dung ≠ publish gate")).toBeVisible();
    await expect(dialog.getByTestId("gate-separation")).toContainText("Không đánh giá ở màn này");
    await expect(dialog.getByTestId("review-status")).toHaveText("Chờ duyệt");
  });

  test("JSON content is a collapsible summary rendered as text, never HTML", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    const dialog = drawer(page);
    await expect(dialog.getByText("Danh sách · 2 phần tử")).toBeVisible();
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
    await expect(dialog.getByTestId("readiness-outcome")).toHaveText("Chưa có kết quả QA");
    await expect(dialog.getByTestId("readiness-confirmation")).toContainText("Chưa xác nhận");
    await expect(dialog.getByTestId("readiness-artifact")).toContainText("Chưa có artifact runtime");
    await dialog.getByRole("button", { name: "Duyệt nội dung" }).click();
    await expect(confirmDialog(page, "approve").getByText("Readiness kỹ thuật chưa đạt")).toBeVisible();
  });

  test("legacy snapshots with null content are shown as missing, not invented", async ({ page }) => {
    const server = new ReviewServer([{ n: 1, legacy: true }]);
    await install(page, server);
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    const dialog = drawer(page);
    await expect(dialog.getByText("Snapshot này không có mục tiêu học tập")).toBeVisible();
    await expect(dialog.getByText("Snapshot này không có hướng dẫn")).toBeVisible();
    await expect(dialog.getByText("Snapshot không có rubric")).toBeVisible();
    await expect(dialog.getByText("Snapshot không có nội dung kịch bản")).toBeVisible();
  });

  test("a decided review shows its immutable result and the rejection reason, with no decision buttons", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto(`/admin/reviews?status=Rejected&review=${server.reviews[3].summary.reviewId}`);
    const dialog = drawer(page);
    await expect(dialog.getByTestId("decision-result")).toContainText("đã bị từ chối");
    await expect(dialog.getByTestId("reject-reason")).toContainText("Thiếu tiêu chí thời gian phản ứng.");
    await expect(dialog.getByText(`${ADMIN_ID.slice(0, 8)}…`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Duyệt nội dung" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Từ chối", exact: true })).toHaveCount(0);
  });

  test("opening a row sets ?review= and closing clears it; 404 and 403 are explained", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto("/admin/reviews");
    await row(page, "Sơ tán giờ ra chơi").click();
    await expect(page).toHaveURL(/review=/);
    await expect(drawer(page).getByTestId("review-detail")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(page).not.toHaveURL(/review=/);

    await page.goto("/admin/reviews?review=00000000-0000-4000-8000-00000000ffff");
    await expect(drawer(page).getByText("Không tìm thấy bản duyệt")).toBeVisible();
    await drawer(page).getByRole("button", { name: "Về hàng chờ" }).click();
    await expect(page).not.toHaveURL(/review=/);

    server.faults.detailStatus = 403;
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    await expect(drawer(page).getByText("Chỉ PlatformAdmin xem và quyết định được bản duyệt kịch bản.")).toBeVisible();
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

test.describe("decisions", () => {
  test("approve pins the server hashes, confirms with consequences, and reload keeps the result", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    const target = server.reviews[0].summary;
    await page.goto(`/admin/reviews?review=${target.reviewId}`);
    await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
    const confirm = confirmDialog(page, "approve");
    await expect(confirm).toContainText("đúng nội dung và rubric đã đóng băng");
    await expect(confirm).toContainText("không đổi được");
    await expect(confirm).toContainText("không phải");
    expect(server.decisionRequests).toHaveLength(0); // opening the dialog is not a decision
    await confirm.getByRole("button", { name: "Duyệt nội dung" }).click();

    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Approved");
    await expect(drawer(page).getByTestId("decision-result")).toContainText("đã được duyệt");
    expect(server.decisionRequests).toHaveLength(1);
    const request = server.decisionRequests[0];
    expect(request.action).toBe("approve");
    expect(request.versionId).toBe(target.scenarioVersionId); // the VERSION id, not the review id
    expect(request.body).toEqual({ contentHash: target.contentHash, rubricHash: target.rubricHash }); // hashes from the server, no reason
    expect(request.key).toMatch(/\S{8,}/);
    await expect(drawer(page).getByRole("button", { name: "Duyệt nội dung" })).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(rows(page)).toHaveCount(1); // queue refreshed from the server: the approved review left Submitted
    await expect(rows(page).first()).toContainText("Cháy kho hàng giờ cao điểm");

    await page.goto(`/admin/reviews?status=Approved&review=${target.reviewId}`);
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Approved");
    await expect(drawer(page).getByTestId("decision-result")).toContainText("đã được duyệt");
  });

  test("a lost response is retried with the SAME Idempotency-Key and writes once", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    server.faults.dropNextResponse = true;
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
    const confirm = confirmDialog(page, "approve");
    await confirm.getByRole("button", { name: "Duyệt nội dung" }).click();
    await expect(confirm.getByText("Chưa xác nhận được quyết định")).toBeVisible();
    await expect(confirm.getByText("không bị ghi hai lần")).toBeVisible();
    await confirm.getByRole("button", { name: "Thử lại (cùng mã thao tác)" }).click();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Approved");
    expect(server.decisionRequests).toHaveLength(2);
    expect(server.decisionRequests[1].key).toBe(server.decisionRequests[0].key);
    expect(server.decisionRequests[1].body).toEqual(server.decisionRequests[0].body);
    expect(server.applied).toHaveLength(1);
  });

  test("closing and reopening the dialog after a lost response still replays the same key", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    server.faults.dropNextResponse = true;
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
    await confirmDialog(page, "approve").getByRole("button", { name: "Duyệt nội dung" }).click();
    await expect(page.getByText("Chưa xác nhận được quyết định")).toBeVisible();
    await page.getByRole("button", { name: "Hủy" }).click();
    await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
    await confirmDialog(page, "approve").getByRole("button", { name: "Duyệt nội dung" }).click();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Approved");
    expect(server.decisionRequests[1].key).toBe(server.decisionRequests[0].key);
    expect(server.applied).toHaveLength(1);
  });

  test("reject requires a 1-4000 character reason, counts characters, and sends the trimmed reason", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    const target = server.reviews[0].summary;
    await page.goto(`/admin/reviews?review=${target.reviewId}`);
    await drawer(page).getByRole("button", { name: "Từ chối", exact: true }).click();
    const confirm = confirmDialog(page, "reject");
    await expect(confirm).toContainText("phiên bản mới");
    await expect(confirm).toContainText("0/4000 ký tự");

    await confirm.getByRole("button", { name: "Từ chối phiên bản" }).click();
    await expect(confirm.getByText("Nhập lý do từ chối (1–4000 ký tự).")).toBeVisible();
    await confirm.getByLabel(/Lý do từ chối/).fill("    \n  ");
    await confirm.getByRole("button", { name: "Từ chối phiên bản" }).click();
    await expect(confirm.getByText("Nhập lý do từ chối (1–4000 ký tự).")).toBeVisible();

    await confirm.getByLabel(/Lý do từ chối/).fill("x".repeat(4001));
    await expect(confirm).toContainText("4001/4000 ký tự");
    await confirm.getByRole("button", { name: "Từ chối phiên bản" }).click();
    await expect(confirm.getByText("Lý do tối đa 4000 ký tự (đang 4001).")).toBeVisible();
    expect(server.decisionRequests).toHaveLength(0);

    await confirm.getByLabel(/Lý do từ chối/).fill("  Thiếu tiêu chí thời gian phản ứng.  ");
    await expect(confirm).toContainText("34/4000 ký tự");
    await confirm.getByRole("button", { name: "Từ chối phiên bản" }).click();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Rejected");
    expect(server.decisionRequests).toHaveLength(1);
    expect(server.decisionRequests[0].action).toBe("reject");
    expect(server.decisionRequests[0].body).toEqual({ contentHash: target.contentHash, rubricHash: target.rubricHash, reason: "Thiếu tiêu chí thời gian phản ứng." });
    await expect(drawer(page).getByTestId("reject-reason")).toContainText("Thiếu tiêu chí thời gian phản ứng.");

    await page.goto(`/admin/reviews?status=Rejected&review=${target.reviewId}`);
    await expect(drawer(page).getByTestId("reject-reason")).toContainText("Thiếu tiêu chí thời gian phản ứng.");
  });

  test("a reason of exactly 4000 characters is accepted", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    await drawer(page).getByRole("button", { name: "Từ chối", exact: true }).click();
    const confirm = confirmDialog(page, "reject");
    await confirm.getByLabel(/Lý do từ chối/).fill("y".repeat(4000));
    await confirm.getByRole("button", { name: "Từ chối phiên bản" }).click();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Rejected");
    expect((server.decisionRequests[0].body.reason as string).length).toBe(4000);
  });

  test("429 keeps the dialog and the key; changing the reason mints a new key", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    server.faults.rateLimitNext = true;
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    await drawer(page).getByRole("button", { name: "Từ chối", exact: true }).click();
    const confirm = confirmDialog(page, "reject");
    await confirm.getByLabel(/Lý do từ chối/).fill("Cần bổ sung rubric.");
    await confirm.getByRole("button", { name: "Từ chối phiên bản" }).click();
    await expect(confirm.getByText("Thử lại sau 2 giây")).toBeVisible();
    await expect(confirm.getByLabel(/Lý do từ chối/)).toHaveValue("Cần bổ sung rubric.");

    await confirm.getByLabel(/Lý do từ chối/).fill("Cần bổ sung rubric và thời gian.");
    server.faults.rateLimitNext = true;
    await confirm.getByRole("button", { name: /Thử lại/ }).click();
    await expect(confirm.getByText("Thử lại sau 2 giây")).toBeVisible();
    expect(server.decisionRequests[1].key).not.toBe(server.decisionRequests[0].key);

    await confirm.getByRole("button", { name: /Thử lại/ }).click();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Rejected");
    expect(server.decisionRequests[2].key).toBe(server.decisionRequests[1].key);
    expect(server.applied).toHaveLength(1);
  });

  test("409 not pending: another admin decided first, so the screen reloads and shows the real state", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    const target = server.reviews[0];
    await page.goto(`/admin/reviews?review=${target.summary.reviewId}`);
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Submitted");
    target.summary.status = "Rejected"; // someone else rejected it after this admin opened the detail
    target.summary.decidedBy = ADMIN_ID;
    target.summary.decidedAt = "2026-10-14T09:00:00Z";
    target.summary.reason = "Từ chối bởi quản trị viên khác.";
    await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
    await confirmDialog(page, "approve").getByRole("button", { name: "Duyệt nội dung" }).click();
    await expect(drawer(page).getByText("Quyết định chưa được ghi")).toBeVisible();
    await expect(drawer(page).getByText("không còn ở trạng thái chờ duyệt")).toBeVisible();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Rejected");
    await expect(drawer(page).getByTestId("reject-reason")).toContainText("Từ chối bởi quản trị viên khác.");
    await expect(drawer(page).getByRole("button", { name: "Duyệt nội dung" })).toHaveCount(0);
    expect(server.applied).toHaveLength(0);
    await page.keyboard.press("Escape");
    await expect(rows(page)).toHaveCount(1); // queue also refreshed
  });

  test("409 hash mismatch reloads the detail so the admin reviews the current hashes before deciding again", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    const target = server.reviews[0];
    const original = target.summary.contentHash;
    await page.goto(`/admin/reviews?review=${target.summary.reviewId}`);
    await expect(drawer(page).getByTestId("review-detail")).toBeVisible();
    target.summary.contentHash = hex("f0");
    await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
    await confirmDialog(page, "approve").getByRole("button", { name: "Duyệt nội dung" }).click();
    await expect(drawer(page).getByText("Hash không khớp nội dung đã đóng băng")).toBeVisible();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Submitted");
    await drawer(page).getByTestId("hash-content").locator("xpath=following-sibling::button").click();
    await expect(drawer(page).getByTestId("hash-content")).toHaveText(hex("f0"));
    await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
    await confirmDialog(page, "approve").getByRole("button", { name: "Duyệt nội dung" }).click();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Approved");
    expect(server.decisionRequests[0].body.contentHash).toBe(original);
    expect(server.decisionRequests[1].body.contentHash).toBe(hex("f0"));
    expect(server.decisionRequests[1].key).not.toBe(server.decisionRequests[0].key);
  });

  for (const [status, code, text] of [[404, "NOT_FOUND", "Không tìm thấy phiên bản này"], [403, "FORBIDDEN", "Chỉ PlatformAdmin được duyệt hoặc từ chối"], [401, "UNAUTHORIZED", "Phiên đăng nhập đã hết hạn hoặc bị thu hồi"]] as const) {
    test(`${status} on a decision is explained and nothing is guessed`, async ({ page }) => {
      const server = new ReviewServer(baseSeeds());
      await install(page, server);
      server.faults.failNext = { status, code };
      await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
      await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
      await confirmDialog(page, "approve").getByRole("button", { name: "Duyệt nội dung" }).click();
      await expect(drawer(page).getByText("Quyết định chưa được ghi")).toBeVisible();
      await expect(drawer(page).getByText(text)).toBeVisible();
      await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Submitted"); // server state, not an assumed success
      expect(server.applied).toHaveLength(0);
    });
  }

  test("buttons are locked while the detail is reloading and double clicks send one request", async ({ page }) => {
    const server = new ReviewServer(baseSeeds());
    await install(page, server);
    await page.goto(`/admin/reviews?review=${server.reviews[0].summary.reviewId}`);
    await drawer(page).getByRole("button", { name: "Duyệt nội dung" }).click();
    const confirm = confirmDialog(page, "approve");
    await confirm.getByTestId("confirm-decision").dblclick();
    await expect(drawer(page).getByTestId("review-detail")).toHaveAttribute("data-review-status", "Approved");
    expect(server.decisionRequests).toHaveLength(1);
  });
});

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"] as const) {
    test(`queue, detail and dialogs fit ${width}px in the ${theme} theme`, async ({ page }, testInfo) => {
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

      await drawer(page).getByRole("button", { name: "Từ chối", exact: true }).click();
      const confirm = confirmDialog(page, "reject");
      await confirm.getByLabel(/Lý do từ chối/).fill("Thiếu tiêu chí thời gian phản ứng. ".repeat(6));
      await noOverflow("reject dialog");
      const dialogBox = await confirm.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      expect(dialogBox.scroll - dialogBox.client, "dialog overflows horizontally").toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`reviews-reject-${width}-${theme}.png`) });
    });
  }
}
