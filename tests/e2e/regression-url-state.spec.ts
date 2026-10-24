import { expect, test, type Page } from "@playwright/test";
import { admin, callsTo, ids, mockBilling, newMock, owner, queue, signIn as billingSignIn } from "./billing-mock";
import { installLibraryBackend, LibraryBackend, signIn as librarySignIn } from "./library-mock";
import { page1, tokenSession } from "./regression-helpers";

/*
 * Regression: state that lives in the URL (a drawer opened from `?quotation=`, `?item=`, `?request=`) must follow the URL.
 * Moving from one resource to another in the same mounted screen (link, Back, Forward) may never show the previous
 * resource's data or error under the new URL, not even while the new one is loading. Route-mock evidence only.
 */

/** Client-side navigation to another URL of the app, as a link or Back/Forward does (Next syncs useSearchParams with pushState). */
const pushUrl = (page: Page, url: string) => page.evaluate((target) => window.history.pushState({}, "", target), url);

/** A request that stays pending until `open()`: the assertions run while "the second resource is still loading". */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { opened, open };
}
const holdUntil = (page: Page, pattern: string, gated: { opened: Promise<void> }) => page.route(pattern, async (route) => { await gated.opened; await route.fallback(); });

const Q1 = "FET-Q-0001";
const Q2 = "FET-Q-0002";

test.describe("resource drawers never show the previous resource", () => {
  test("organization billing: opening quotation 2 after quotation 1 shows a skeleton, then quotation 2 only", async ({ page }) => {
    const mock = newMock();
    await billingSignIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    const drawer = page.getByRole("dialog", { name: "Chi tiết báo giá" });
    await expect(drawer.getByText(Q1).first()).toBeVisible();

    const second = gate();
    await holdUntil(page, `**/api/billing/quotations/${ids.quoteDraft}`, second);
    await pushUrl(page, `/workspace/billing?quotation=${ids.quoteDraft}`);
    await expect(drawer.getByText("Đang tải báo giá…")).toBeVisible();
    await expect(drawer.getByText(Q1)).toHaveCount(0); // quotation 1 must be gone while 2 is loading
    second.open();
    await expect(drawer.getByText(Q2).first()).toBeVisible();
  });

  test("organization billing: a 404 for quotation 2 is shown as an error, not as quotation 1", async ({ page }) => {
    const mock = newMock();
    await billingSignIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    const drawer = page.getByRole("dialog", { name: "Chi tiết báo giá" });
    await expect(drawer.getByText(Q1).first()).toBeVisible();

    queue(mock, `GET /api/billing/quotations/${ids.quoteDraft}`, { status: 404, json: { code: "BILLING_RESOURCE_NOT_FOUND", title: "Not found" } });
    await pushUrl(page, `/workspace/billing?quotation=${ids.quoteDraft}`);
    await expect(drawer.getByText("Không tải được báo giá")).toBeVisible();
    await expect(drawer.getByText(Q1)).toHaveCount(0);
    expect(callsTo(mock, "GET", `/api/billing/quotations/${ids.quoteDraft}`)).toHaveLength(1); // a 404 is not retried in a loop
  });

  test("PlatformAdmin quotations: switching quotation drops the previous snapshot and its checkout history", async ({ page }) => {
    const mock = newMock();
    await billingSignIn(page, admin);
    await mockBilling(page, mock);
    await page.goto(`/admin/commerce?tab=quotes&quotation=${ids.quote}`);
    const drawer = page.getByRole("dialog", { name: "Chi tiết báo giá" });
    await expect(drawer.getByText(Q1).first()).toBeVisible();

    const second = gate();
    await holdUntil(page, `**/api/billing/quotations/${ids.quoteDraft}`, second);
    await pushUrl(page, `/admin/commerce?tab=quotes&quotation=${ids.quoteDraft}`);
    await expect(drawer.getByText("Đang tải báo giá…")).toBeVisible();
    await expect(drawer.getByText(Q1)).toHaveCount(0);
    second.open();
    await expect(drawer.getByText(Q2).first()).toBeVisible();
  });

  test("Library sample drawer: moving to another sample never shows the first one, and a 404 is an error", async ({ page }) => {
    const backend = new LibraryBackend();
    backend.seedItem("Equipment", "BINH-CO2");
    backend.seedVersion("BINH-CO2", { name: "Bình CO2 5 kg", payload: { description: "Bình chữa cháy CO2." }, publish: true });
    backend.seedItem("Equipment", "MAT-NA");
    backend.seedVersion("MAT-NA", { name: "Mặt nạ lọc khói", payload: { description: "Mặt nạ dùng một lần." }, publish: true });
    await librarySignIn(page, backend, "org");
    await installLibraryBackend(page, backend);
    const first = backend.item("BINH-CO2").id;
    const second = backend.item("MAT-NA").id;

    await page.goto(`/workspace/library?item=${first}`);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "Bình CO2 5 kg" })).toBeVisible();

    // The second sample answers late; a route added later runs first and hands over to the mock once released.
    const held = gate();
    await holdUntil(page, `**/api/library/items/${second}`, held);
    await pushUrl(page, `/workspace/library?item=${second}`);
    await expect(drawer.getByText("Đang tải mẫu…")).toBeVisible();
    await expect(drawer.getByRole("heading", { name: "Bình CO2 5 kg" })).toHaveCount(0);
    held.open();
    await expect(drawer.getByRole("heading", { name: "Mặt nạ lọc khói" })).toBeVisible();

    await pushUrl(page, "/workspace/library?item=00000000-0000-4000-8000-0000000000ff");
    await expect(drawer.getByText("Mẫu không còn khả dụng")).toBeVisible();
    await expect(drawer.getByRole("heading", { name: "Mặt nạ lọc khói" })).toHaveCount(0);
  });
});

test.describe("tenant switch inside one mounted screen", () => {
  test("PlatformAdmin moving to another organization never shows the previous organization's buildings or name", async ({ page }) => {
    const orgs = [{ id: "org-a", name: "Tổ chức Alpha", slug: "alpha", isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }, { id: "org-b", name: "Tổ chức Beta", slug: "beta", isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }];
    const buildingOf = (id: string, name: string, organizationId: string) => ({ id, name, buildingType: "Trường học", totalFloors: 2, isActive: true, organizationId, createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: { id: `l-${id}`, address: "1 Test", city: null, district: null, latitude: null, longitude: null, geojson: null }, contact: null });
    await tokenSession(page, "tok-admin");
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "adm", email: "adm@fire3d.test", fullName: "Quản trị", role: 0, organizationId: null, profileRevision: 1 }, headers: { ETag: '"1"' } }));
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: page1(orgs) }));
    await page.route(/\/api\/organizations\/org-[ab]$/, (route) => route.fulfill({ json: orgs.find((item) => route.request().url().endsWith(item.id)) }));
    await page.route("**/api/buildings?*", (route) => {
      const organizationId = new URL(route.request().url()).searchParams.get("organizationId");
      return route.fulfill({ json: page1(organizationId === "org-a" ? [buildingOf("a1", "Tòa của Alpha", "org-a")] : [buildingOf("b1", "Tòa của Beta", "org-b")]) });
    });

    await page.goto("/workspace/buildings?org=org-a");
    await expect(page.getByText("Tòa của Alpha")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Công trình · Tổ chức Alpha", level: 1 })).toBeVisible();

    const beta = gate();
    await holdUntil(page, "**/api/buildings?*organizationId=org-b*", beta);
    await holdUntil(page, "**/api/organizations/org-b", beta);
    await pushUrl(page, "/workspace/buildings?org=org-b");
    await expect(page.getByTestId("buildings-table")).toHaveAttribute("data-loading", "true"); // skeleton, no rows of the other tenant
    await expect(page.getByText("Tòa của Alpha")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Công trình · Tổ chức Alpha", level: 1 })).toHaveCount(0);
    beta.open();
    await expect(page.getByText("Tòa của Beta")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Công trình · Tổ chức Beta", level: 1 })).toBeVisible();
  });

  test("paging inside one organization still keeps the previous page visible while the next one loads", async ({ page }) => {
    await tokenSession(page, "tok-org");
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "o", email: "o@fire3d.test", fullName: "Chủ", role: 1, organizationId: "org-1", profileRevision: 1 }, headers: { ETag: '"1"' } }));
    const row = (id: string, name: string) => ({ id, name, buildingType: "Trường học", totalFloors: 2, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: { id: `l-${id}`, address: "1 Test", city: null, district: null, latitude: null, longitude: null, geojson: null }, contact: null });
    const second = gate();
    await page.route("**/api/buildings?*", async (route) => {
      const pageNo = Number(new URL(route.request().url()).searchParams.get("page") ?? 1);
      if (pageNo === 2) await second.opened;
      return route.fulfill({ json: { items: [row(`p${pageNo}`, pageNo === 1 ? "Tòa trang một" : "Tòa trang hai")], totalCount: 40, page: pageNo, pageSize: 20 } });
    });
    await page.goto("/workspace/buildings");
    await expect(page.getByText("Tòa trang một")).toBeVisible();
    await pushUrl(page, "/workspace/buildings?page=2");
    // DataTable v2: the table is marked loading and the pager is disabled while the next page is pending.
    await expect(page.getByTestId("buildings-table")).toHaveAttribute("data-loading", "true");
    await expect(page.getByRole("navigation", { name: "Phân trang" }).getByRole("button", { name: "Trang sau" })).toBeDisabled();
    await expect(page.getByText("Tòa trang một")).toBeVisible(); // same tenant: no flash of an empty table
    second.open();
    await expect(page.getByText("Tòa trang hai")).toBeVisible();
    await expect(page.getByText("Tòa trang một")).toHaveCount(0);
  });
});
