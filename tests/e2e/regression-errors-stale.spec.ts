import { expect, test, type Page, type Route } from "@playwright/test";
import { CallLog, delay, page1, tokenSession } from "./regression-helpers";

/*
 * Regression: shared failure handling of list screens (401 / 403 / 429 + Retry-After / 5xx / network) and stale data:
 * rows that answer another query, or that the session just lost the right to read, must not stay on screen next to an
 * error, and a late answer of an older query must never overwrite the newer one. Route-mock evidence only.
 */

const orgUser = { id: "u-org", email: "org@fire3d.test", fullName: "Chủ tổ chức", role: 1, organizationId: "org-1", profileRevision: 1 };
const adminUser = { id: "u-adm", email: "adm@fire3d.test", fullName: "Quản trị", role: 0, organizationId: null, profileRevision: 1 };

const building = (id: string, name: string, isActive = true) => ({ id, name, buildingType: "Trường học", totalFloors: 2, isActive, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: { id: `l-${id}`, address: "1 Test", city: null, district: null, latitude: null, longitude: null, geojson: null }, contact: null });
const ACTIVE = [building("b1", "Tòa đang hoạt động 1"), building("b2", "Tòa đang hoạt động 2")];
const ARCHIVED = [building("b9", "Tòa đã lưu trữ", false)];

async function session(page: Page, user: typeof orgUser) {
  await tokenSession(page, "tok");
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

type Plan = (route: Route, call: number) => Promise<void> | void;

/** One list endpoint whose answer is decided per call, so a test can fail the Nth request. */
async function listEndpoint(page: Page, pattern: string, plan: Plan, log = new CallLog()) {
  let count = 0;
  await page.route(pattern, async (route) => {
    log.record(route);
    count += 1;
    await plan(route, count);
  });
  return log;
}

const ok = (items: unknown[]) => (route: Route) => route.fulfill({ json: page1(items) });
const fail = (status: number, headers?: Record<string, string>) => (route: Route) => route.fulfill({ status, headers, json: { title: "x", code: "X" } });

const screens = [
  { name: "buildings", user: orgUser, url: "/workspace/buildings", api: "**/api/buildings?*", rows: ACTIVE, row: "Tòa đang hoạt động 1" },
  { name: "accounts", user: adminUser, url: "/admin/accounts", api: "**/api/accounts?*", rows: [{ id: "acc-1", email: "hoc.vien@fire3d.test", fullName: "Học viên Một", role: "Trainee", isActive: true, organizationId: null, createdAt: "2026-10-01T00:00:00Z" }], row: "hoc.vien@fire3d.test" },
  { name: "organizations", user: adminUser, url: "/admin/organizations", api: "**/api/organizations?*", rows: [{ id: "org-1", name: "Trường Mẫu", slug: "truong-mau", isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }], row: "Trường Mẫu" },
] as const;

for (const screen of screens) {
  test.describe(`${screen.name} list: what the error says`, () => {
    const cases: Array<{ name: string; plan: (route: Route) => Promise<void> | void; text: RegExp }> = [
      { name: "401 says the session expired", plan: fail(401), text: /Phiên đăng nhập đã hết hạn/ },
      { name: "403 says there is no permission", plan: fail(403), text: /không có quyền/ },
      { name: "429 shows the server's Retry-After", plan: fail(429, { "Retry-After": "7" }), text: /7 giây/ },
      { name: "500 says the server failed", plan: fail(500), text: /Máy chủ gặp lỗi/ },
      { name: "a dropped connection says the network is down", plan: (route) => route.abort("connectionreset"), text: /Mất kết nối/ },
    ];
    for (const item of cases) {
      test(item.name, async ({ page }) => {
        await session(page, screen.user);
        await page.route("**/api/**", (route) => (route.request().url().includes("/api/auth/me") ? route.fallback() : route.fulfill({ json: page1([]) })));
        await listEndpoint(page, screen.api, item.plan);
        await page.goto(screen.url);
        const alert = page.getByRole("alert").filter({ hasText: item.text });
        await expect(alert.first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Thử lại" }).first()).toBeVisible(); // never an endless skeleton
        await expect(page.locator('#ops-main [aria-busy="true"]')).toHaveCount(0);
      });
    }

    test("5xx then retry loads the rows (exactly one extra request)", async ({ page }) => {
      await session(page, screen.user);
      await page.route("**/api/**", (route) => (route.request().url().includes("/api/auth/me") ? route.fallback() : route.fulfill({ json: page1([]) })));
      const log = await listEndpoint(page, screen.api, (route, call) => (call === 1 ? fail(503)(route) : route.fulfill({ json: page1([...screen.rows]) })));
      await page.goto(screen.url);
      await page.locator("#ops-main").getByRole("button", { name: "Thử lại" }).first().click();
      await expect(page.getByText(screen.row).first()).toBeVisible();
      expect(log.calls.filter((call) => call.method === "GET")).toHaveLength(2);
    });
  });
}

test.describe("stale rows and late answers (buildings list)", () => {
  test("a filter whose request fails does not leave the previous filter's rows on screen", async ({ page }) => {
    await session(page, orgUser);
    await listEndpoint(page, "**/api/buildings?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      return params.get("isActive") === "false" ? fail(500)(route) : route.fulfill({ json: page1(ACTIVE) });
    });
    await page.goto("/workspace/buildings");
    await expect(page.getByText("Tòa đang hoạt động 1")).toBeVisible();

    await page.getByLabel("Trạng thái", { exact: true }).selectOption("archived");
    await expect(page.getByRole("alert").filter({ hasText: "Máy chủ gặp lỗi" })).toBeVisible();
    await expect(page.getByText("Tòa đang hoạt động 1")).toHaveCount(0);

    await page.getByLabel("Trạng thái", { exact: true }).selectOption("active");
    await expect(page.getByText("Tòa đang hoạt động 1")).toBeVisible();
  });

  test("losing access (403 on reload) removes the rows instead of showing them next to the error", async ({ page }) => {
    await session(page, orgUser);
    await listEndpoint(page, "**/api/buildings?*", (route, call) => (call === 1 ? ok(ACTIVE)(route) : fail(403)(route)));
    await page.goto("/workspace/buildings");
    await expect(page.getByText("Tòa đang hoạt động 1")).toBeVisible();
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "không có quyền" })).toBeVisible();
    await expect(page.getByText("Tòa đang hoạt động 1")).toHaveCount(0);
  });

  test("a transient failure of the SAME query keeps its rows visible with a retry", async ({ page }) => {
    await session(page, orgUser);
    await listEndpoint(page, "**/api/buildings?*", (route, call) => (call === 1 ? ok(ACTIVE)(route) : fail(500)(route)));
    await page.goto("/workspace/buildings");
    await expect(page.getByText("Tòa đang hoạt động 1")).toBeVisible();
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Máy chủ gặp lỗi" })).toBeVisible();
    await expect(page.getByText("Tòa đang hoạt động 1")).toBeVisible();
  });

  test("an older query answering late never overwrites the newer filter", async ({ page }) => {
    await session(page, orgUser);
    await listEndpoint(page, "**/api/buildings?*", async (route) => {
      const archived = new URL(route.request().url()).searchParams.get("isActive") === "false";
      if (!archived) { await delay(1500); return route.fulfill({ json: page1(ACTIVE) }); } // the first (default) query is slow
      return route.fulfill({ json: page1(ARCHIVED) });
    });
    await page.goto("/workspace/buildings");
    await page.getByLabel("Trạng thái", { exact: true }).selectOption("archived");
    await expect(page.getByText("Tòa đã lưu trữ")).toBeVisible();
    await page.waitForTimeout(2200); // the slow answer for the old filter has arrived by now
    await expect(page.getByText("Tòa đã lưu trữ")).toBeVisible();
    await expect(page.getByText("Tòa đang hoạt động 1")).toHaveCount(0);
  });

  test("filter and search live in the URL: reload keeps them, Back/Forward restore them, with one request per URL state", async ({ page }) => {
    await session(page, orgUser);
    const log = await listEndpoint(page, "**/api/buildings?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      const rows = params.get("isActive") === "false" ? ARCHIVED : ACTIVE;
      const term = params.get("search");
      return route.fulfill({ json: page1(term ? rows.filter((item) => item.name.includes(term)) : rows) });
    });
    await page.goto("/workspace/buildings");
    await expect(page.getByText("Tòa đang hoạt động 1")).toBeVisible();
    await page.getByLabel("Trạng thái", { exact: true }).selectOption("archived");
    await expect(page).toHaveURL(/status=archived/);
    await expect(page.getByText("Tòa đã lưu trữ")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Trạng thái", { exact: true })).toHaveValue("archived");
    await expect(page.getByText("Tòa đã lưu trữ")).toBeVisible();

    await page.goBack();
    await expect(page.getByLabel("Trạng thái", { exact: true })).toHaveValue("active");
    await expect(page.getByText("Tòa đang hoạt động 1")).toBeVisible();
    await expect(page.getByText("Tòa đã lưu trữ")).toHaveCount(0);
    await page.goForward();
    await expect(page.getByLabel("Trạng thái", { exact: true })).toHaveValue("archived");
    await expect(page.getByText("Tòa đã lưu trữ")).toBeVisible();
    await expect(page.getByText("Tòa đang hoạt động 1")).toHaveCount(0);

    // initial active, archived, reload archived, back to active, forward to archived: nothing extra and no request loop.
    await page.waitForTimeout(500);
    expect(log.calls.length).toBeLessThanOrEqual(5);
  });
});

test.describe("polling stops on a lost session or permission and keeps going on transient errors", () => {
  const rev = { id: "rev-1", buildingId: "building-1", versionLabel: "IFC rev. 01", status: "Processing", createdAt: "2026-10-01T00:00:00Z", sourceDocument: { id: "src-1", originalFilename: "a.ifc", fileSizeBytes: 128, quarantineStatus: "Accepted", createdAt: "2026-10-01T00:00:00Z" } };

  async function openBuilding(page: Page, jobsStatus: number) {
    await session(page, orgUser);
    await page.route("**/api/**", (route) => (route.request().url().includes("/api/auth/me") ? route.fallback() : route.fulfill({ json: page1([]) })));
    await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building("building-1", "Tòa theo dõi") }));
    await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: page1([rev]) }));
    const log = await listEndpoint(page, "**/api/revisions/rev-1/processing-jobs?*", fail(jobsStatus));
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    await expect(page.getByRole("heading", { name: "Tòa theo dõi", level: 1 })).toBeVisible();
    return log;
  }

  test("403 while polling: one request, a clear message, no endless retries and no auto-update label", async ({ page }) => {
    const log = await openBuilding(page, 403);
    await expect(page.getByText("Không cập nhật được trạng thái xử lý")).toBeVisible();
    await expect(page.getByText("Bạn không có quyền thực hiện thao tác này.")).toBeVisible();
    await page.waitForTimeout(7500); // the first retry would come after 6 s of backoff
    expect(log.calls).toHaveLength(1);
    await expect(page.getByText("Tự cập nhật mỗi 3 giây…")).toHaveCount(0);
    await page.getByRole("button", { name: "Thử lại" }).first().click(); // an explicit retry polls again
    await expect.poll(() => log.calls.length).toBe(2);
  });

  test("a transient 503 keeps polling with backoff", async ({ page }) => {
    const log = await openBuilding(page, 503);
    await expect(page.getByText("Không cập nhật được trạng thái xử lý")).toBeVisible();
    await expect.poll(() => log.calls.length, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);
  });
});
