/**
 * Chuyên viên PCCC review queue (/expert/reviews): list, detail, thẩm định with If-Match + Idempotency-Key.
 * Evidence level: Playwright route mocks that keep SERVER STATE (status, ETag revision) and follow the BE contract
 * (ExpertReviewsController, BE main @ 3786664). Not an integration test against the real API.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

import { EXPOSED } from "./api-headers";

const expert = { id: "expert-1", email: "expert@fire3d.test", fullName: "Chuyên viên Lê Văn T", role: "FireSafetyExpert", organizationId: null, profileRevision: 1 };
const owner = { id: "owner-1", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", role: 1, organizationId: "org-1", profileRevision: 1 };

const placement = (floorId: string) => ({ floorId, position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
type Review = { reviewId: string; kind: "Scenario" | "Infrastructure"; status: string; revision: number; reason: string | null; decidedBy: string | null; decidedByName: string | null; decidedAt: string | null } & Record<string, unknown>;

function seed(): Review[] {
  const base = { revisionId: "rev-1", submittedBy: "owner-1", submittedByName: "Nguyễn Văn A", organizationId: "org-1", organizationName: "Trường THPT Lê Quý Đôn", buildingId: "bld-1", buildingName: "Nhà A", contentHash: "c".repeat(64), reason: null, decidedBy: null, decidedByName: null, decidedAt: null };
  return [
    { ...base, reviewId: "infra-1", kind: "Infrastructure", status: "Submitted", revision: 4, submittedAt: "2026-11-24T02:00:00Z", scenarioVersionId: null, rubricHash: null, scenarioId: null, scenarioName: null, versionNumber: 1, infrastructureId: "infra-1" },
    { ...base, reviewId: "review-2", kind: "Scenario", status: "Submitted", revision: 1, submittedAt: "2026-11-24T03:00:00Z", scenarioVersionId: "ver-2", rubricHash: "d".repeat(64), scenarioId: "scn-2", scenarioName: "Cháy bếp tầng 3", versionNumber: 2, infrastructureId: null },
    { ...base, reviewId: "review-3", kind: "Scenario", status: "Rejected", revision: 2, submittedAt: "2026-11-23T03:00:00Z", scenarioVersionId: "ver-3", rubricHash: "d".repeat(64), scenarioId: "scn-3", scenarioName: "Mất điện và khói", versionNumber: 1, infrastructureId: null, reason: "Thiếu lối thoát thứ hai ở tầng 2.", decidedBy: "expert-9", decidedByName: "Chuyên viên khác", decidedAt: "2026-11-23T05:00:00Z" },
  ];
}

class Server {
  reviews = seed();
  listQueries: URLSearchParams[] = [];
  decisions: Array<{ id: string; action: string; ifMatch: string | null; key: string | null; body: unknown }> = [];
  /** Another expert decides right before the next decision arrives. */
  raceNext = false;
  calls: string[] = [];
}

const problem = (route: Route, status: number, body: Record<string, unknown>) => route.fulfill({ status, headers: { "Content-Type": "application/problem+json" }, body: JSON.stringify({ status, ...body }) });

async function install(page: Page, server: Server, user: object = expert) {
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: "ops-access", refreshToken: "ops-refresh" });
  await page.route("**/api/**", (route) => { server.calls.push(new URL(route.request().url()).pathname); return route.fallback(); });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ...EXPOSED, ETag: '"1"' } }));
  await page.route((url) => url.pathname === "/api/expert/reviews", (route) => {
    const query = new URL(route.request().url()).searchParams;
    server.listQueries.push(query);
    const status = query.get("status") ?? "Submitted";
    const kind = query.get("kind");
    const items = server.reviews.filter((review) => review.status === status && (!kind || review.kind === kind));
    return route.fulfill({ json: { items, totalCount: items.length, page: 1, pageSize: 20 } });
  });
  await page.route((url) => /^\/api\/expert\/reviews\/[^/]+$/.test(url.pathname), (route) => {
    const review = server.reviews.find((item) => item.reviewId === new URL(route.request().url()).pathname.split("/").pop());
    if (!review) return problem(route, 404, { title: "Not found.", code: "NOT_FOUND" });
    const infrastructure = review.kind === "Infrastructure";
    return route.fulfill({ headers: { ...EXPOSED, ETag: `"${review.revision}"` }, json: {
      review,
      content: infrastructure
        ? { geometry: null, runtimeVersion: "2.5.0", items: [{ id: "exit-1", kind: "Goal", label: "Cửa thoát phía Đông", category: "Exit", placement: placement("f1") }, { id: "ext-1", kind: "Equipment", label: "IfcBuildingElementProxy", category: "Equipment", capability: { id: "extinguisher.portable", version: "1.0.0" }, placement: placement("f1") }] }
        : { schemaVersion: "fet3d.editor/1", objects: [{ id: "spawn-1", kind: "Spawn", label: "Phòng 301", placement: placement("f1") }, { id: "exit-1", kind: "Goal", label: "Cửa thoát phía Đông", placement: placement("f1") }] },
      rubric: infrastructure ? null : { pass_threshold: 70, criteria: [{ id: "evac_time", metric: "evacuation_time_seconds", operator: "lte", threshold: 180, weight: 1, mandatory: true }] },
      learningObjectives: infrastructure ? null : ["Thoát ra ngoài an toàn."],
      learnerInstructions: infrastructure ? null : "Bạn đang ở phòng 301 khi có khói.",
    } });
  });
  // No accepted Geometry in this mock: the page must still list the objects.
  await page.route((url) => /^\/api\/expert\/reviews\/[^/]+\/preview$/.test(url.pathname), (route) => problem(route, 404, { title: "No preview.", code: "NOT_FOUND" }));
  await page.route((url) => /^\/api\/expert\/reviews\/[^/]+\/(approve|reject)$/.test(url.pathname), (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const action = parts.pop() as string;
    const id = parts.pop() as string;
    const headers = route.request().headers();
    const body = route.request().postDataJSON() as { reason?: string } | null;
    server.decisions.push({ id, action, ifMatch: headers["if-match"] ?? null, key: headers["idempotency-key"] ?? null, body });
    const review = server.reviews.find((item) => item.reviewId === id);
    if (!review) return problem(route, 404, { title: "Not found.", code: "NOT_FOUND" });
    if (server.raceNext) {
      server.raceNext = false;
      Object.assign(review, { status: "Approved", revision: review.revision + 1, decidedBy: "expert-9", decidedByName: "Chuyên viên khác", decidedAt: "2026-11-24T04:00:00Z" });
    }
    if (headers["if-match"] !== `"${review.revision}"`) return problem(route, 412, { title: "Precondition failed.", code: "PRECONDITION_FAILED" });
    Object.assign(review, { status: action === "approve" ? "Approved" : "Rejected", revision: review.revision + 1, reason: action === "reject" ? body?.reason ?? null : null, decidedBy: "expert-1", decidedByName: "Chuyên viên Lê Văn T", decidedAt: "2026-11-24T04:30:00Z" });
    return route.fulfill({ headers: { ...EXPOSED, ETag: `"${review.revision}"` }, json: review });
  });
}

const rows = (page: Page) => page.getByTestId("expert-review-table").locator("tbody tr, li.ops-dt-card");
const detail = (page: Page) => page.getByTestId("expert-review-page");

test("an expert signs in by role name, sees the waiting queue and calls nothing outside the expert API", async ({ page }) => {
  const server = new Server();
  await install(page, server);
  await page.goto("/expert/reviews");
  await expect(page.getByRole("heading", { name: "Hàng chờ thẩm định" })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText("Hạ tầng PCCC · Nhà A");
  await expect(rows(page).nth(1)).toContainText("Cháy bếp tầng 3");
  expect(server.listQueries[0].get("status")).toBe("Submitted");
  // The API answers 403 to this role everywhere else (ExpertRouteGuard): the area must not even ask.
  expect(server.calls.filter((path) => !path.startsWith("/api/expert") && !path.startsWith("/api/auth") && !path.startsWith("/api/me"))).toEqual([]);
});

test("the kind and status filters live in the URL and drive the query", async ({ page }) => {
  const server = new Server();
  await install(page, server);
  await page.goto("/expert/reviews?kind=Scenario&status=Rejected");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Mất điện và khói");
  const query = server.listQueries.at(-1) as URLSearchParams;
  expect([query.get("kind"), query.get("status")]).toEqual(["Scenario", "Rejected"]);
  await rows(page).first().click();
  await expect(page).toHaveURL(/\/expert\/reviews\/review-3$/);
  await expect(detail(page).getByTestId("expert-reason")).toContainText("Thiếu lối thoát thứ hai ở tầng 2.");
  await expect(detail(page).getByTestId("expert-approve")).toHaveCount(0);
});

test("a row opens the review on its own page; approving an infrastructure pins the revision read and locks it", async ({ page }) => {
  const server = new Server();
  await install(page, server);
  await page.goto("/expert/reviews");
  await rows(page).first().click();
  await expect(page).toHaveURL(/\/expert\/reviews\/infra-1$/);
  await expect(page.getByRole("heading", { name: "Hạ tầng PCCC · Nhà A" })).toBeVisible();
  // The 3D model is unavailable in this mock; the objects are still listed by category.
  await expect(detail(page).getByTestId("review-object")).toHaveCount(2);
  await expect(detail(page).getByTestId("review-object").first()).toContainText("Lối thoát nạn");
  // The backend seeds the label with the IFC class: the expert reads what the device is instead.
  await expect(detail(page).getByTestId("review-object").nth(1)).toContainText("Bình chữa cháy xách tay");
  await expect(detail(page).getByTestId("review-object").nth(1)).not.toContainText("IfcBuildingElementProxy");
  await detail(page).getByTestId("expert-approve").click();
  await page.getByTestId("expert-confirm").click();
  await expect(detail(page).getByTestId("expert-result")).toContainText("đã khoá");
  expect(server.decisions).toHaveLength(1);
  expect(server.decisions[0]).toMatchObject({ id: "infra-1", action: "approve", ifMatch: '"4"', body: null });
  expect(server.decisions[0].key).toBeTruthy();
  await expect(detail(page).getByTestId("expert-approve")).toHaveCount(0);
  await detail(page).getByRole("link", { name: "Hàng chờ thẩm định" }).click();
  await expect(page).toHaveURL(/\/expert\/reviews$/);
  await expect(rows(page)).toHaveCount(1); // the queue reloaded: only the scenario still waits
});

test("rejecting needs a reason and sends it trimmed", async ({ page }) => {
  const server = new Server();
  await install(page, server);
  await page.goto("/expert/reviews/review-2");
  await expect(detail(page).getByTestId("review-instructions")).toContainText("phòng 301");
  // Plain words only: the threshold as a percentage, field names in Vietnamese, the format version hidden.
  await expect(detail(page).getByText("70%", { exact: true })).toBeVisible();
  await expect(detail(page).getByText("Đối tượng trên mô hình", { exact: true })).toBeVisible();
  await expect(detail(page).getByText("schemaVersion")).toHaveCount(0);
  await detail(page).getByTestId("expert-reject").click();
  await page.getByTestId("expert-confirm").click();
  await expect(page.getByText("Nhập lý do chưa đạt (1–2000 ký tự).")).toBeVisible();
  expect(server.decisions).toHaveLength(0);
  await page.getByTestId("expert-reason-input").fill("  Chưa có điểm tập kết ngoài nhà.  ");
  await page.getByTestId("expert-confirm").click();
  await expect(detail(page).getByTestId("expert-reason")).toContainText("Chưa có điểm tập kết ngoài nhà.");
  expect(server.decisions[0]).toMatchObject({ id: "review-2", action: "reject", ifMatch: '"1"', body: { reason: "Chưa có điểm tập kết ngoài nhà." } });
});

test("when another expert decided first, the 412 reloads and shows their result", async ({ page }) => {
  const server = new Server();
  await install(page, server);
  await page.goto("/expert/reviews/review-2");
  await detail(page).getByTestId("expert-approve").click();
  server.raceNext = true;
  await page.getByTestId("expert-confirm").click();
  await expect(detail(page).getByText("Một Chuyên viên PCCC khác vừa thẩm định mục này trước bạn.", { exact: false })).toBeVisible();
  await expect(detail(page).getByTestId("expert-result")).toContainText("Tình huống đạt thẩm định.");
  await expect(detail(page).getByText("Chuyên viên khác")).toBeVisible();
  await expect(detail(page).getByTestId("expert-approve")).toHaveCount(0);
});

test("an old ?review= link is sent to the review page", async ({ page }) => {
  const server = new Server();
  await install(page, server);
  await page.goto("/expert/reviews?review=review-2");
  await expect(page).toHaveURL(/\/expert\/reviews\/review-2$/);
  await expect(detail(page).getByTestId("expert-review-detail")).toBeVisible();
  await expect(detail(page).getByTestId("expert-approve")).toBeVisible();
});

test("an organization account is refused and the queue is never requested", async ({ page }) => {
  const server = new Server();
  await install(page, server, owner);
  await page.goto("/expert/reviews");
  await expect(page.getByText("Khu này chỉ dành cho Chuyên viên PCCC.")).toBeVisible();
  expect(server.listQueries).toHaveLength(0);
});
