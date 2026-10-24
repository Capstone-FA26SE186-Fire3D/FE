import { expect, test, type Page } from "@playwright/test";

// All network is mocked with Playwright routes: evidence for UI behaviour, not for BE integration.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const buildings = [
  { id: "b-1", name: "Trường Học GOT", buildingType: "Trường học", totalFloors: 3, isActive: true, createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" },
  { id: "b-2", name: "Nhà ở", buildingType: "Nhà ở", totalFloors: 4, isActive: true, createdAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z" },
];

async function signIn(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" }));
    localStorage.setItem("fire3d-org-tour", "done"); // the spotlight tour must not cover the palette
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
}

async function mockBuildings(page: Page) {
  await page.route("**/api/buildings?*", (route) => {
    const search = new URL(route.request().url()).searchParams.get("search")?.toLowerCase() ?? "";
    const items = buildings.filter((item) => !search || item.name.toLowerCase().includes(search));
    return route.fulfill({ json: { items, totalCount: items.length, page: 1, pageSize: 20 } });
  });
  await page.route("**/api/buildings/*", (route) => route.fulfill({ json: { ...buildings[0], organizationId: "org-1", location: null, contact: null }, headers: { ETag: '"1"' } }));
  await page.route("**/api/buildings/*/**", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
  await page.route("**/api/releases?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
  await page.route("**/api/billing/**", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 50 } }));
}

const palette = (page: Page) => page.getByTestId("command-palette");

test.describe("command palette", () => {
  test("Ctrl+K opens the palette with navigation; typing searches buildings", async ({ page }) => {
    await signIn(page);
    await mockBuildings(page);
    await page.goto("/workspace/buildings");
    await expect(page.getByRole("navigation", { name: "Quản lý tổ chức" })).toBeVisible();

    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).getByText("Điều hướng")).toBeVisible();
    await expect(palette(page).getByText("Báo cáo")).toBeVisible();
    await expect(palette(page).getByText("↑↓ chọn")).toBeVisible();
    // No building is open: contextual actions are absent.
    await expect(palette(page).getByText("Hành động")).toHaveCount(0);

    await page.getByPlaceholder("Tìm công trình, kịch bản, hành động…").fill("trường");
    await expect(palette(page).getByText("Công trình", { exact: true })).toBeVisible();
    await expect(palette(page).getByText("Trường Học GOT")).toBeVisible();
    await expect(palette(page).getByText("Nhà ở")).toHaveCount(0);
    // Accent-insensitive: "bao cao" still finds "Báo cáo" in navigation.
    await page.getByPlaceholder("Tìm công trình, kịch bản, hành động…").fill("bao cao");
    await expect(palette(page).getByText("Báo cáo")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
  });

  test("topbar button opens it; Enter navigates to the selected item", async ({ page }) => {
    await signIn(page);
    await mockBuildings(page);
    await page.goto("/workspace/buildings");
    await page.getByRole("button", { name: "Tìm nhanh (Ctrl K)" }).click();
    await expect(palette(page)).toBeVisible();
    await page.getByPlaceholder("Tìm công trình, kịch bản, hành động…").fill("tro ly");
    await expect(palette(page).getByText("Trợ lý AI")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/workspace\/ai$/);
    await expect(palette(page)).toHaveCount(0);
  });

  test("shows contextual actions and recent buildings while a building is open", async ({ page }) => {
    await signIn(page);
    await mockBuildings(page);
    await page.addInitScript(() => localStorage.setItem("fire3d-recent-buildings", JSON.stringify([{ id: "b-2", name: "Nhà ở", floors: 4 }])));
    await page.goto("/workspace/buildings/b-1");
    // The shortcut lives in the shell: wait until the session is restored and the shell is mounted.
    await expect(page.getByRole("navigation", { name: "Quản lý tổ chức" })).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).getByText("Hành động")).toBeVisible();
    await expect(palette(page).getByText("Tải IFC mới cho công trình đang mở")).toBeVisible();
    await expect(palette(page).getByText("Tạo kịch bản")).toBeVisible();
    await expect(palette(page).getByText("Công trình gần đây")).toBeVisible();
    await expect(palette(page).getByText("Nhà ở")).toBeVisible();
    await expect(palette(page).getByText("4 tầng")).toBeVisible();

    await palette(page).getByText("Tải IFC mới cho công trình đang mở").click();
    await expect(page).toHaveURL(/\/workspace\/buildings\/b-1\?tab=ifc&upload=1$/);
  });
});
