/**
 * Chuyên viên PCCC overview (/expert/overview): tiles, KPIs and charts built only from `GET /api/expert/reviews`.
 * Evidence level: Playwright route mocks following the BE contract (ExpertReviewsController: status, assignee=me|all,
 * pageSize 1-100, totalCount). Not an integration test against the real API.
 */
import { expect, test, type Page } from "@playwright/test";

import { EXPOSED } from "./api-headers";
import { decisionsByWeek, formatDuration, handlingBuckets, median, weekStart } from "../../src/features/expert-reviews/overview-stats";
import type { ExpertReviewItem } from "../../src/features/expert-reviews/api";

const expert = { id: "expert-1", email: "expert@fire3d.test", fullName: "Chuyên viên Lê Văn T", role: "FireSafetyExpert", organizationId: null, profileRevision: 1 };
const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

function item(id: string, patch: Partial<ExpertReviewItem>): ExpertReviewItem {
  return {
    reviewId: id, assigneeId: "expert-1", assigneeName: "Chuyên viên Lê Văn T", assignedAt: ago(30), kind: "Scenario", status: "Submitted", revision: 1,
    scenarioVersionId: "ver", revisionId: "rev", submittedBy: "owner-1", submittedByName: "Nguyễn Văn A", submittedAt: ago(30), decidedBy: null, decidedByName: null,
    decidedAt: null, reason: null, organizationId: "org-1", organizationName: "Trường THPT Lê Quý Đôn", buildingId: "bld-1", buildingName: "Nhà A",
    scenarioId: "scn", scenarioName: `Tình huống ${id}`, versionNumber: 1, infrastructureId: null, ...patch,
  };
}

function seed(): ExpertReviewItem[] {
  return [
    item("wait-1", { submittedAt: ago(50), scenarioName: "Cháy bếp tầng 3" }),
    item("wait-2", { kind: "Infrastructure", scenarioName: null, organizationId: "org-2", organizationName: "Chung cư Hòa Bình" }),
    item("wait-other", { assigneeId: "expert-2", assigneeName: "Chuyên viên B" }),
    // Mine: 2 approved (2 h and 30 h after assignment), 1 rejected (30 min). The other expert's decision is not counted.
    item("ok-1", { status: "Approved", assignedAt: ago(10), decidedAt: ago(8), decidedBy: "expert-1" }),
    item("ok-2", { status: "Approved", kind: "Infrastructure", assignedAt: ago(40), decidedAt: ago(10), decidedBy: "expert-1", organizationId: "org-2", organizationName: "Chung cư Hòa Bình" }),
    item("no-1", { status: "Rejected", assignedAt: ago(3), decidedAt: ago(2.5), decidedBy: "expert-1", reason: "Thiếu lối thoát." }),
    item("ok-other", { status: "Approved", assigneeId: "expert-2", decidedAt: ago(5), decidedBy: "expert-2" }),
  ];
}

async function install(page: Page, reviews: ExpertReviewItem[], options: { failDecided?: boolean; approvedTotal?: number } = {}) {
  const calls: string[] = [];
  const queries: URLSearchParams[] = [];
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: "ops-access", refreshToken: "ops-refresh" });
  await page.route("**/api/**", (route) => { calls.push(new URL(route.request().url()).pathname); return route.fallback(); });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: expert, headers: { ...EXPOSED, ETag: '"1"' } }));
  await page.route((url) => url.pathname === "/api/expert/reviews", (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    const status = query.get("status") ?? "Submitted";
    if (options.failDecided && status !== "Submitted") return route.fulfill({ status: 500, headers: { "Content-Type": "application/problem+json" }, body: JSON.stringify({ status: 500, title: "Server error." }) });
    const pageSize = Number(query.get("pageSize") ?? 20);
    const pageNumber = Number(query.get("page") ?? 1);
    const all = reviews.filter((review) => review.status === status && ((query.get("assignee") ?? "me") === "all" || review.assigneeId === expert.id));
    const items = all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
    const totalCount = status === "Approved" && options.approvedTotal ? options.approvedTotal : all.length;
    return route.fulfill({ json: { items: pageNumber === 1 || !options.approvedTotal ? items : [], totalCount, page: pageNumber, pageSize } });
  });
  return { calls, queries };
}

test("overview: tiles, my results and charts come from the review list; another expert's decisions are not mine", async ({ page }) => {
  const { calls, queries } = await install(page, seed());
  await page.goto("/expert/overview");
  await expect(page.getByRole("heading", { name: "Tổng quan thẩm định" })).toBeVisible();
  await expect(page.getByTestId("expert-tile-mine")).toContainText("2");
  await expect(page.getByTestId("expert-tile-mine")).toHaveAttribute("href", "/expert/reviews");
  await expect(page.getByTestId("expert-tile-queue")).toContainText("3");
  await expect(page.getByTestId("expert-kpi-decided")).toContainText("3");
  await expect(page.getByTestId("expert-kpi-approved")).toContainText("67%");
  await expect(page.getByTestId("expert-kpi-rejected")).toContainText("33%");
  await expect(page.getByTestId("expert-kpi-median")).toContainText("2 giờ");
  for (const id of ["expert-chart-weeks", "expert-chart-result", "expert-chart-time", "expert-chart-kind"]) await expect(page.getByTestId(id).locator(".recharts-surface").first()).toBeVisible();
  await expect(page.getByTestId("expert-chart-organizations")).toContainText("Trường THPT Lê Quý Đôn");
  await expect(page.getByTestId("expert-chart-organizations")).toContainText("Chung cư Hòa Bình");
  const oldest = page.getByTestId("expert-oldest").getByRole("link");
  await expect(oldest).toHaveCount(2);
  await expect(oldest.first()).toHaveText("Cháy bếp tầng 3");
  await expect(oldest.first()).toHaveAttribute("href", "/expert/reviews/wait-1");
  // The sidebar has the new first entry.
  await expect(page.getByRole("link", { name: "Tổng quan" }).first()).toHaveAttribute("href", "/expert/overview");
  expect(calls.every((path) => path.startsWith("/api/expert/") || path.startsWith("/api/auth/") || path === "/api/expert/reviews" || path.startsWith("/api/me"))).toBe(true);
  const decided = queries.filter((query) => query.get("status") !== "Submitted");
  expect(decided.every((query) => query.get("assignee") === "all" && query.get("pageSize") === "100")).toBe(true);
});

test("overview: a decided list longer than one page is read page by page", async ({ page }) => {
  const { queries } = await install(page, seed(), { approvedTotal: 150 });
  await page.goto("/expert/overview");
  await expect(page.getByTestId("expert-kpi-decided")).toContainText("3");
  expect(queries.filter((query) => query.get("status") === "Approved").map((query) => query.get("page"))).toEqual(["1", "2"]);
});

test("overview: no decisions yet shows empty charts and an em dash, never a guessed time", async ({ page }) => {
  await install(page, seed().filter((review) => review.status === "Submitted"));
  await page.goto("/expert/overview");
  await expect(page.getByTestId("expert-kpi-decided")).toContainText("0");
  await expect(page.getByTestId("expert-kpi-median")).toContainText("—");
  await expect(page.getByTestId("expert-chart-weeks")).toContainText("8 tuần gần nhất bạn chưa thẩm định mục nào");
  await expect(page.getByTestId("expert-chart-result")).toContainText("Bạn chưa thẩm định mục nào");
});

test("overview: a failed read of decisions is said plainly and the waiting tiles still work", async ({ page }) => {
  await install(page, seed(), { failDecided: true });
  await page.goto("/expert/overview");
  await expect(page.getByRole("alert").filter({ hasText: "Không tải được kết quả thẩm định" })).toBeVisible();
  await expect(page.getByTestId("expert-tile-mine")).toContainText("2");
  await expect(page.getByTestId("expert-kpi-decided")).toContainText("—");
});

test("overview: phone width has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await install(page, seed());
  await page.goto("/expert/overview");
  await expect(page.getByTestId("expert-kpi-decided")).toContainText("3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("stats: weeks start on Monday, buckets and durations read in Vietnamese", () => {
  const monday = weekStart(new Date(2026, 10, 26, 15));
  expect(monday.getDay()).toBe(1);
  expect(monday.getDate()).toBe(23);
  const now = new Date(2026, 10, 28, 12);
  const rows = decisionsByWeek([item("a", { status: "Approved", decidedAt: new Date(2026, 10, 24, 9).toISOString() }), item("b", { status: "Rejected", decidedAt: new Date(2026, 8, 1).toISOString() })], now);
  expect(rows).toHaveLength(8);
  expect(rows[7]).toEqual({ week: "23/11", approved: 1, rejected: 0 });
  expect(rows.reduce((total, row) => total + row.rejected, 0)).toBe(0);
  expect(handlingBuckets([item("c", { assignedAt: ago(2), decidedAt: ago(1.5) }), item("d", { assignedAt: ago(100), decidedAt: ago(1) })]).map((row) => row.count)).toEqual([1, 0, 0, 1]);
  expect(median([3, 1, 2])).toBe(2);
  expect(median([])).toBeNull();
  expect(formatDuration(30 * 60_000)).toBe("30 phút");
  expect(formatDuration(5.5 * HOUR)).toBe("5,5 giờ");
  expect(formatDuration(50 * HOUR)).toBe("2,1 ngày");
});
