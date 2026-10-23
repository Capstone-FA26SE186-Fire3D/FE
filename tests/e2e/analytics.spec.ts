/**
 * F14: training, operations and revenue analytics for Organization and Admin.
 * Evidence level: Playwright route mocks shaped like LearnerAnalytics.sql / OperationsQueries (OpenAPI types the training and
 * revenue bodies only as JsonElement, so the shape comes from BE source and docs/learner-analytics.md). Not an integration test.
 */
import { chip, chipOptions, expectChipValue, openChip, pick } from "./chip-helpers";
import { expect, test, type Page, type Route } from "@playwright/test";
import { parseOperations, parseRevenue, parseTraining } from "../../src/features/analytics/parse";

const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const owner = { id: "owner-1", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", role: 1, organizationId: "org-1", profileRevision: 1 };
const trainee = { id: "t-1", email: "t@fire3d.test", fullName: "Học Viên", role: 2, organizationId: null, profileRevision: 1 };

async function signIn(page: Page, user: object) {
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: "an-access", refreshToken: "an-refresh" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
  // The organization report's building/scenario selects read the tenant lists; tests that care override these.
  await page.route("**/api/buildings*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 100 } }));
}

const head = { asOf: "2026-10-12T03:00:00Z", from: "2026-09-12T03:00:00Z", to: "2026-10-12T03:00:00Z", activeWindowSeconds: 120, definitions: { plays: "Contract-7 learner sessions started in UTC [from,to); prepare and playtest are not counted." } };
const aiUsage = { settledUnits: [{ quotaUnit: "tokens", units: 12000 }], openReservations: [{ quotaUnit: "tokens", units: 500 }], needsReconcile: { requests: 1, reservedUnits: 200 }, requests: { Accepted: 0, Processing: 1, Succeeded: 11, Failed: 1, NeedsReconcile: 1, SafetyRejected: 0 } };
const training = (over: Record<string, unknown> = {}) => ({
  ...head, plays: 40, uniqueTrainees: 18, completed: 30, completionRate: 0.75, activeSessions: 3,
  outcomes: { Passed: 14, NotPassed: 6, Incomplete: 7, NotAssessed: 3 },
  assessment: { assessed: 20, passed: 14, passRate: 0.7 },
  duration: { sessions: 30, averageSeconds: 215.5, medianSeconds: 190 },
  byMode: [{ mode: "Learn", plays: 10, completed: 9 }, { mode: "Guided", plays: 12, completed: 8 }, { mode: "Assessment", plays: 18, completed: 13 }],
  byTraining: [{ trainingId: "11111111-1111-4111-8111-111111111111", plays: 25, completed: 20, passed: 9 }, { trainingId: "22222222-2222-4222-8222-222222222222", plays: 15, completed: 10, passed: 5 }],
  aiUsage, ...over,
});
const emptyTraining = () => training({ plays: 0, uniqueTrainees: 0, completed: 0, completionRate: null, activeSessions: 0, outcomes: { Passed: 0, NotPassed: 0, Incomplete: 0, NotAssessed: 0 }, assessment: { assessed: 0, passed: 0, passRate: null }, duration: { sessions: 0, averageSeconds: null, medianSeconds: null }, byMode: [{ mode: "Learn", plays: 0, completed: 0 }, { mode: "Guided", plays: 0, completed: 0 }, { mode: "Assessment", plays: 0, completed: 0 }], byTraining: [], aiUsage: { settledUnits: [], openReservations: [], needsReconcile: { requests: 0, reservedUnits: 0 }, requests: { Queued: 0 } } });
const operations = (extra: Record<string, unknown> = {}) => ({
  ...head, buildings: [{ isActive: true, count: 4 }, { isActive: false, count: 1 }],
  processingJobs: [{ kind: "IfcProcessing", status: "Succeeded", count: 6 }, { kind: "IfcProcessing", status: "Failed", count: 1 }, { kind: "PackageBuild", status: "Running", count: 2 }],
  tickets: [{ status: "Open", count: 2 }, { status: "Resolved", count: 3 }], created: { buildings: 1, processingJobs: 9, tickets: 5 }, ...extra,
});
const platformOps = () => operations({ accounts: [{ role: "Trainee", isActive: true, count: 40 }, { role: "OrganizationUser", isActive: true, count: 5 }], organizations: [{ isActive: true, count: 5 }, { isActive: false, count: 1 }], created: { accounts: 3, organizations: 1, buildings: 1, processingJobs: 9, tickets: 5 } });
const platformTraining = () => training({ byOrganization: [{ organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", plays: 30, uniqueTrainees: 12, completed: 24 }, { organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", plays: 10, uniqueTrainees: 6, completed: 6 }] });
const revenue = () => ({
  ...head, totals: [{ currency: "USD", amount: 120.5, transactions: 2 }, { currency: "VND", amount: 3500000, transactions: 5 }],
  byPurpose: [{ purpose: "Purchase", currency: "VND", amount: 3000000, transactions: 4 }, { purpose: "Renewal", currency: "VND", amount: 500000, transactions: 1 }, { purpose: "Purchase", currency: "USD", amount: 120.5, transactions: 2 }],
  byDay: [{ date: "2026-10-01", currency: "VND", amount: 2000000, transactions: 3 }, { date: "2026-10-03", currency: "VND", amount: 1500000, transactions: 2 }, { date: "2026-10-02", currency: "USD", amount: 120.5, transactions: 2 }],
  payingOrganizations: 4,
});

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("parsers", () => {
  test("a rate or average without samples stays null (not 0) and a missing outcome becomes 0", () => {
    const parsed = parseTraining({ ...emptyTraining(), outcomes: { Passed: 1 } });
    expect(parsed.completionRate).toBeNull();
    expect(parsed.assessment.passRate).toBeNull();
    expect(parsed.duration.averageSeconds).toBeNull();
    expect(parsed.outcomes).toEqual({ Passed: 1, NotPassed: 0, Incomplete: 0, NotAssessed: 0 });
    expect(parsed.byOrganization).toBeNull();
  });
  test("a body that is not a report fails instead of showing zeros", () => {
    expect(() => parseTraining("<html>")).toThrow();
    expect(() => parseTraining({ asOf: "x" })).toThrow();
    expect(() => parseRevenue({ plays: 1 })).toThrow();
  });
  test("operations prefers processingJobs, still reads the old ifcJobs, and accepts the older {key,count} building shape", () => {
    expect(parseOperations({ ...operations(), ifcJobs: [{ status: "Failed", count: 99 }] }).processingJobs).toHaveLength(3);
    expect(parseOperations({ ...head, ifcJobs: [{ status: "Failed", count: 2 }], buildings: [{ key: true, count: 3 }] })).toMatchObject({ processingJobs: [{ kind: "Không rõ", status: "Failed", count: 2 }], buildings: [{ isActive: true, count: 3 }] });
  });
});

test.describe("organization analytics", () => {
  test("training and operations come only from the tenant endpoints with from/to; reload restores tab and period from the URL", async ({ page }) => {
    const urls: string[] = [];
    await signIn(page, owner);
    await page.route("**/api/**/analytics/**", (route) => {
      const url = new URL(route.request().url());
      urls.push(`${url.pathname}${url.search}`);
      return route.fulfill({ json: url.pathname.endsWith("/training") ? training() : operations() });
    });
    await page.goto("/workspace/analytics?from=2026-09-01&to=2026-09-30");
    await expect(page.getByRole("heading", { name: "Báo cáo huấn luyện", exact: true })).toBeVisible();
    await expect(page.locator(".ops-stat", { hasText: "Lượt chơi (trong kỳ)" }).locator("strong")).toHaveText("40");
    await expect(page.locator(".ops-stat", { hasText: "Học viên khác nhau" }).locator("strong")).toHaveText("18");
    await expect(page.locator(".ops-stat", { hasText: "Đã có kết quả" })).toContainText("75%");
    await expect(page.locator(".ops-stat", { hasText: "Đang chơi (hiện tại)" }).locator("strong")).toHaveText("3");
    await expect(page.getByText(/Không tính.*playtest/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Chú giải kết quả" })).toContainText("Chưa đạt");
    await expect(page.getByText("70%").first()).toBeVisible();
    await expect(page.getByText("3 phút 36 giây")).toBeVisible();
    await expect(page.getByText("Sử dụng AI")).toBeVisible();
    const aiStatuses = page.getByRole("list", { name: "Yêu cầu AI theo trạng thái (tạo trong kỳ)" });
    await expect(aiStatuses).toContainText("Đang xử lý");
    await expect(aiStatuses).not.toContainText("Bị chặn an toàn"); // pre-v7 key from the BE aggregate is hidden
    expect(urls).toEqual(["/api/organizations/me/analytics/training?from=2026-09-01T00%3A00%3A00.000Z&to=2026-10-01T00%3A00%3A00.000Z"]);

    await page.getByRole("tab", { name: "Vận hành" }).click();
    await expect(page).toHaveURL(/tab=operations/);
    await expect(page.locator(".ops-stat", { hasText: "Công trình (hiện tại)" }).locator("strong")).toHaveText("5");
    await expect(page.getByText("Tài khoản theo vai trò")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Tiến trình PackageBuild theo trạng thái" })).toContainText("Đang chạy");
    expect(urls.at(-1)).toContain("/api/organizations/me/analytics/operations?from=");
    for (const url of urls) expect(Array.from(new URL(`http://x${url}`).searchParams.keys()).sort()).toEqual(["from", "to"]);

    await page.reload();
    await expect(page.getByRole("tab", { name: "Vận hành" })).toHaveAttribute("aria-selected", "true");
    await openChip(page, "Thời gian");
    await expect(page.getByLabel("Từ ngày")).toHaveValue("2026-09-01");
    await expect(page.locator(".ops-stat", { hasText: "Công trình (hiện tại)" }).locator("strong")).toHaveText("5");
  });

  test("building and scenario filters narrow the report and the CSV, the scenario depends on the building, groupBy adds the cohort table", async ({ page }) => {
    const reports: URLSearchParams[] = [];
    const exports: URLSearchParams[] = [];
    await signIn(page, owner);
    const buildingsRoute = (route: Route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname.endsWith("/scenarios")) return route.fulfill({ json: { items: [{ id: "sc-1", buildingId: "b-1", name: "Thoát hiểm tầng 3", createdAt: "2026-10-01T00:00:00Z" }, { id: "sc-2", buildingId: "b-1", name: "Hành lang có khói", createdAt: "2026-10-02T00:00:00Z" }], totalCount: 2, page: 1, pageSize: 100 } });
      return route.fulfill({ json: { items: [{ id: "b-1", name: "Tòa nhà A", buildingType: null, totalFloors: 5, isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }, { id: "b-2", name: "Tòa nhà B", buildingType: null, totalFloors: 3, isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }], totalCount: 2, page: 1, pageSize: 100 } });
    };
    await page.route("**/api/buildings*", buildingsRoute);
    await page.route("**/api/buildings/**", buildingsRoute);
    await page.route("**/api/organizations/me/analytics/training/export*", (route) => { exports.push(new URL(route.request().url()).searchParams); return route.fulfill({ body: "groupBy,key\nday,2026-10-01\n", contentType: "text/csv" }); });
    await page.route("**/api/organizations/me/analytics/training?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      reports.push(params);
      const grouped = params.get("groupBy") === "week";
      return route.fulfill({ json: training({
        byScenario: [{ scenarioId: "sc-1", scenarioName: "Thoát hiểm tầng 3", plays: 25, uniqueTrainees: 9, completed: 20, passed: 9 }],
        byBuilding: [{ buildingId: "b-1", buildingName: "Tòa nhà A", plays: 25, uniqueTrainees: 9, completed: 20 }],
        ...(grouped ? { filters: { groupBy: "week" }, cohorts: [{ key: "2026-09-28", label: "2026-09-28", plays: 12, uniqueTrainees: 5, completed: 9, abandoned: 1, awaitingSync: 0, assessed: 6, passed: 4, passRate: 0.6667, averageDurationSeconds: 200 }] } : {}),
      }) });
    });
    await page.goto("/workspace/analytics?from=2026-09-01&to=2026-09-30");
    const filters = page.getByRole("group", { name: "Bộ lọc báo cáo" });
    await expect(chip(filters, "Kịch bản")).toBeDisabled();
    await expect(page.getByRole("table", { name: "Lượt chơi theo kịch bản" })).toContainText("Thoát hiểm tầng 3");
    await expect.poll(() => reports.length).toBe(1);
    expect(reports[0].has("buildingId")).toBe(false);

    await pick(filters, "Công trình", { value: "b-1" });
    await expect(page).toHaveURL(/building=b-1/);
    await expect(chip(filters, "Kịch bản")).toBeEnabled();
    await openChip(filters, "Kịch bản");
    await expect(chipOptions(filters, "Kịch bản")).toHaveText(["tất cả", "Thoát hiểm tầng 3", "Hành lang có khói"]);
    await pick(filters, "Kịch bản", { value: "sc-1" });
    await pick(filters, "Nhóm theo", { value: "week" });
    await expect(page.getByRole("table", { name: "Số liệu theo nhóm" })).toContainText("2026-09-28");
    const last = reports.at(-1) as URLSearchParams;
    expect(last.get("buildingId")).toBe("b-1");
    expect(last.get("scenarioId")).toBe("sc-1");
    expect(last.get("groupBy")).toBe("week");

    await page.getByRole("button", { name: "Xuất CSV" }).click();
    await expect.poll(() => exports.length).toBe(1);
    expect(Object.fromEntries(exports[0])).toMatchObject({ buildingId: "b-1", scenarioId: "sc-1", groupBy: "week" });

    // Changing the building drops the scenario of the old one; reload restores the rest from the URL.
    await pick(filters, "Công trình", { value: "b-2" });
    await expect(page).not.toHaveURL(/scenario=/);
    await expect((reports.at(-1) as URLSearchParams).has("scenarioId")).toBe(false);
    await page.reload();
    await expectChipValue(filters, "Công trình", "b-2");
    await expectChipValue(filters, "Nhóm theo", "week");
  });

  test("every chart has a table with the same numbers", async ({ page }) => {
    await signIn(page, owner);
    await page.route("**/api/organizations/me/analytics/training*", (route) => route.fulfill({ json: training() }));
    await page.goto("/workspace/analytics");
    await page.getByText("Xem bảng số liệu").first().click();
    const table = page.getByRole("table", { name: "Kết quả của phiên" });
    await expect(table.getByRole("row", { name: /Đạt\s*14/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Chưa đạt\s*6/ })).toBeVisible();
    const chart = page.getByRole("img", { name: /Kết quả của 30 phiên/ });
    await expect(chart).toHaveAccessibleName(/Đạt 14.*Chưa đạt 6.*Chưa hoàn tất 7.*Không chấm điểm 3/);
  });

  test("an empty period is explained and shows 'chưa có mẫu' instead of 0 %", async ({ page }) => {
    await signIn(page, owner);
    await page.route("**/api/organizations/me/analytics/training*", (route) => route.fulfill({ json: emptyTraining() }));
    await page.goto("/workspace/analytics");
    await expect(page.getByText("Chưa có lượt chơi trong khoảng thời gian này")).toBeVisible();
    await expect(page.getByText("không phải lỗi")).toBeVisible();
    await expect(page.locator(".ops-stat", { hasText: "Đã có kết quả" })).toContainText("chưa có mẫu");
    await expect(page.getByText("Không tải được")).toHaveCount(0);
  });

  test("a period over 90 days, a half-filled period and a deep link never reach the API; presets send from/to", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await signIn(page, owner);
    await page.route("**/api/organizations/me/analytics/training*", (route) => { queries.push(new URL(route.request().url()).searchParams); return route.fulfill({ json: training() }); });
    await page.goto("/workspace/analytics?from=2026-01-01&to=2026-09-30");
    await expect(page.getByText("Khoảng thời gian trong đường dẫn không hợp lệ")).toBeVisible();
    expect(queries).toHaveLength(0);

    await page.goto("/workspace/analytics?from=2026-09-01&to=2026-09-30");
    await expect.poll(() => queries.length).toBe(1);
    await openChip(page, "Thời gian");
    await page.getByLabel("Từ ngày").fill("2026-01-01");
    await page.getByRole("button", { name: "Áp dụng" }).click();
    await expect(page.getByText(/Khoảng thời gian tối đa 90 ngày/)).toBeVisible();
    expect(queries).toHaveLength(1);

    await openChip(page, "Thời gian");

    await page.getByRole("button", { name: "7 ngày" }).click();
    await expect.poll(() => queries.length).toBe(2);
    expect(queries[1].get("from")).toMatch(/T00:00:00\.000Z$/);
    expect(queries[1].get("to")).toMatch(/T00:00:00\.000Z$/);
  });

  test("a late response for an old period never replaces the newer one", async ({ page }) => {
    await signIn(page, owner);
    await page.route("**/api/organizations/me/analytics/training*", async (route) => {
      const from = new URL(route.request().url()).searchParams.get("from");
      if (from?.startsWith("2026-08-01")) { await new Promise((resolve) => setTimeout(resolve, 900)); return route.fulfill({ json: training({ plays: 111 }) }); }
      return route.fulfill({ json: training({ plays: 222 }) });
    });
    await page.goto("/workspace/analytics?from=2026-08-01&to=2026-08-30");
    await openChip(page, "Thời gian");
    await page.getByLabel("Từ ngày").fill("2026-09-01");
    await page.getByLabel("Đến ngày").fill("2026-09-30");
    await page.getByRole("button", { name: "Áp dụng" }).click();
    await expect(page.locator(".ops-stat", { hasText: "Lượt chơi (trong kỳ)" }).locator("strong")).toHaveText("222");
    await page.waitForTimeout(1200);
    await expect(page.locator(".ops-stat", { hasText: "Lượt chơi (trong kỳ)" }).locator("strong")).toHaveText("222");
  });

  test("errors: 500 offers retry, a failed refresh keeps the last numbers with a warning, 403 and 400 are explained", async ({ page }) => {
    let mode: "fail" | "ok" | "403" | "400" = "fail";
    await signIn(page, owner);
    await page.route("**/api/organizations/me/analytics/training*", (route) => {
      if (mode === "ok") return route.fulfill({ json: training() });
      if (mode === "403") return route.fulfill({ status: 403, json: { code: "FORBIDDEN", title: "x" } });
      if (mode === "400") return route.fulfill({ status: 400, json: { code: "VALIDATION_ERROR", title: "x" } });
      return route.fulfill({ status: 500, json: { title: "x" } });
    });
    await page.goto("/workspace/analytics");
    await expect(page.getByText("Không tải được báo cáo huấn luyện")).toBeVisible();
    mode = "ok";
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.locator(".ops-stat", { hasText: "Lượt chơi (trong kỳ)" }).locator("strong")).toHaveText("40");
    mode = "403";
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByText("Không làm mới được báo cáo huấn luyện")).toBeVisible();
    await expect(page.getByText("không có quyền xem báo cáo này")).toBeVisible();
    await expect(page.locator(".ops-stat", { hasText: "Lượt chơi (trong kỳ)" }).locator("strong")).toHaveText("40");
    mode = "400";
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByText(/tối đa 90 ngày/).first()).toBeVisible();
  });

  test("an admin or trainee gets no organization report and no analytics call", async ({ page }) => {
    let calls = 0;
    await signIn(page, admin);
    await page.route("**/api/**/analytics/**", (route) => { calls += 1; return route.fulfill({ json: {} }); });
    await page.goto("/workspace/analytics");
    await expect(page.getByText("Báo cáo này dành cho tài khoản tổ chức")).toBeVisible();
    expect(calls).toBe(0);

    const other = await page.context().newPage();
    await signIn(other, trainee);
    await other.route("**/api/**/analytics/**", (route) => { calls += 1; return route.fulfill({ json: {} }); });
    await other.goto("/workspace/analytics");
    await expect(other.getByRole("heading", { name: "Báo cáo", exact: true })).toHaveCount(0);
    expect(calls).toBe(0);
  });
});

test.describe("admin analytics", () => {
  test("overview tabs: training with organization names and links, revenue per currency, revenue is requested only when its tab opens", async ({ page }) => {
    const urls: string[] = [];
    await signIn(page, admin);
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Trường An Toàn", slug: "an-toan", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }], totalCount: 1, page: 1, pageSize: 100 } }));
    await page.route("**/api/admin/analytics/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      urls.push(path);
      return route.fulfill({ json: path.endsWith("/operations") ? platformOps() : path.endsWith("/training") ? platformTraining() : revenue() });
    });
    await page.goto("/admin/overview");
    await expect(page.locator(".ops-stat", { hasText: "Tài khoản (hiện tại)" }).locator("strong")).toHaveText("45");
    await expect(page.locator("#ops-main").getByText("Chờ BE")).toHaveCount(0);
    // The report section asks for operations; the "Phiên 30 ngày" tile reads the default training report. Revenue waits for its tab.
    expect([...urls].sort()).toEqual(["/api/admin/analytics/operations", "/api/admin/analytics/training"]);

    await page.getByRole("tab", { name: "Huấn luyện" }).click();
    await expect(page.getByRole("link", { name: "Trường An Toàn" })).toHaveAttribute("href", "/admin/organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/analytics");
    await expect(page.getByText("Tổ chức bbbbbbbb…")).toBeVisible();
    await expect(page.getByText("Sử dụng AI")).toBeVisible();

    await page.getByRole("tab", { name: "Doanh thu" }).click();
    await expect(page).toHaveURL(/tab=revenue/);
    await expect(page.locator(".ops-stat", { hasText: "Đã nhận (VND)" })).toContainText("5 giao dịch");
    await expect(page.locator(".ops-stat", { hasText: "Đã nhận (USD)" })).toContainText("2 giao dịch");
    await expect(page.getByText(/Không tính.*báo giá/)).toBeVisible();
    await expect(page.getByRole("img", { name: /bằng VND: 2 ngày/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /bằng USD: 1 ngày/ })).toBeVisible();
    await expect(page.getByRole("table", { name: "Doanh thu theo mục đích" }).getByRole("row", { name: /Renewal/ })).toBeVisible();
    await page.getByText("Xem bảng số liệu").first().click();
    await expect(page.getByRole("table", { name: /Doanh thu theo ngày/ }).first()).toBeVisible();
    expect(urls).toContain("/api/admin/analytics/revenue");

    await page.reload();
    await expect(page.getByRole("tab", { name: "Doanh thu" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".ops-stat", { hasText: "Đã nhận (VND)" })).toBeVisible();
  });

  test("an empty revenue period is explained and an organization user cannot open the admin overview", async ({ page }) => {
    await signIn(page, admin);
    await page.route("**/api/admin/analytics/revenue*", (route) => route.fulfill({ json: { ...head, totals: [], byPurpose: [], byDay: [], payingOrganizations: 0 } }));
    await page.goto("/admin/overview?tab=revenue");
    await expect(page.getByText("Chưa có khoản thu nào trong khoảng thời gian này")).toBeVisible();

    const other = await page.context().newPage();
    let calls = 0;
    await signIn(other, owner);
    await other.route("**/api/admin/**", (route) => { calls += 1; return route.fulfill({ status: 403 }); });
    await other.goto("/admin/overview");
    await expect(other.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    expect(calls).toBe(0);
  });

  test("one organization: tenant-scoped endpoints, the organization name, inactive note and a 404 explanation", async ({ page }) => {
    const urls: string[] = [];
    let missing = false;
    await signIn(page, admin);
    await page.route("**/api/admin/organizations/org-9/analytics/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      urls.push(path);
      if (missing) return route.fulfill({ status: 404, json: { code: "NOT_FOUND", title: "x" } });
      const organization = { id: "org-9", name: "Trường Cũ", isActive: false };
      return route.fulfill({ json: path.endsWith("/training") ? training({ organization }) : operations({ organization }) });
    });
    await page.goto("/admin/organizations/org-9/analytics");
    await expect(page.getByRole("heading", { name: "Báo cáo của tổ chức" })).toBeVisible();
    await expect(page.getByText("Trường Cũ")).toBeVisible();
    await expect(page.getByText("đã vô hiệu hóa (vẫn đọc được số liệu)")).toBeVisible();
    await page.getByRole("tab", { name: "Vận hành" }).click();
    await expect(page.getByText("Tài khoản theo vai trò")).toHaveCount(0);
    await expect(page.getByText("Ticket gắn với tổ chức này")).toBeVisible();
    expect(urls).toEqual(["/api/admin/organizations/org-9/analytics/training", "/api/admin/organizations/org-9/analytics/operations"]);

    missing = true;
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByText("Không tìm thấy tổ chức hoặc tổ chức đã bị xóa")).toBeVisible();
  });

  test("the organization drawer links to its report", async ({ page }) => {
    await signIn(page, admin);
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [{ id: "org-1", name: "Fire3D Lab", slug: "fire3d-lab", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }], totalCount: 1, page: 1, pageSize: 20 } }));
    await page.route("**/api/organizations/org-1", (route) => route.fulfill({ json: { id: "org-1", name: "Fire3D Lab", slug: "fire3d-lab", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }, headers: { ETag: '"1"' } }));
    await page.goto("/admin/organizations?organization=org-1");
    await expect(page.getByRole("region", { name: "Thông tin tổ chức" }).getByRole("link", { name: "Xem báo cáo" })).toHaveAttribute("href", "/admin/organizations/org-1/analytics");
  });
});

test.describe("layout", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      test(`organization training, admin revenue and admin operations do not overflow in ${scheme} at ${width}px`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
        await signIn(page, owner);
        await page.route("**/api/organizations/me/analytics/training*", (route) => route.fulfill({ json: training() }));
        await page.goto("/workspace/analytics");
        await expect(page.getByRole("list", { name: "Chú giải kết quả" })).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`org-training-${scheme}-${width}.png`), fullPage: true });

        const admins = await page.context().newPage();
        await admins.emulateMedia({ colorScheme: scheme });
        await admins.setViewportSize({ width, height: width < 768 ? 800 : 900 });
        await signIn(admins, admin);
        await admins.route("**/api/admin/analytics/revenue*", (route) => route.fulfill({ json: revenue() }));
        await admins.route("**/api/admin/analytics/operations*", (route) => route.fulfill({ json: platformOps() }));
        await admins.goto("/admin/overview?tab=revenue");
        await expect(admins.getByRole("img", { name: /bằng VND/ })).toBeVisible();
        expect(await overflow(admins)).toBeLessThanOrEqual(0);
        await admins.screenshot({ path: testInfo.outputPath(`admin-revenue-${scheme}-${width}.png`), fullPage: true });
        await admins.goto("/admin/overview");
        await expect(admins.getByText("Tài khoản theo vai trò")).toBeVisible();
        expect(await overflow(admins)).toBeLessThanOrEqual(0);
        await admins.screenshot({ path: testInfo.outputPath(`admin-ops-${scheme}-${width}.png`), fullPage: true });
      });
    }
  }
});
