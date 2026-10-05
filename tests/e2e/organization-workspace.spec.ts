import { expect, test, type Page } from "@playwright/test";
import { safeNext, postLoginRoute } from "../../src/features/auth/redirect";

const building = { id: "building-1", name: "Trường Tiểu học", buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: null, contact: null };
const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
async function session(page: Page, role = 1) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "workspace-access", refreshToken: "workspace-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...owner, role }, headers: { ETag: '"1"' } }));
  await page.route("**/api/organizations/me", (route) => route.fulfill({ json: { id: "org-1", name: "FET3D Lab", address: "1 Test Street", phoneNumber: "+84123456789", profileRevision: 1 }, headers: { ETag: '"1"' } }));
  await page.route("**/api/buildings?*", (route) => {
    const search = new URL(route.request().url()).searchParams.get("search");
    return route.fulfill({ json: { items: search && !building.name.includes(search) ? [] : [building], totalCount: 1, page: 1, pageSize: 50 } });
  });
  await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building }));
  await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
}

test("list-first workspace searches, opens create form and creates a building", async ({ page }) => {
  await session(page);
  let input: unknown;
  await page.route("**/api/buildings", async (route) => { input = route.request().postDataJSON(); await route.fulfill({ status: 201, json: building }); });
  await page.goto("/workspace/buildings");
  await expect(page.getByLabel("Tên công trình", { exact: true })).toBeHidden();
  await expect(page.getByRole("link", { name: building.name })).toBeVisible();
  await page.getByLabel("Tìm công trình").fill("không có");
  await expect(page.getByText("Chưa có công trình phù hợp.")).toBeVisible();
  await page.getByLabel("Tìm công trình").clear();
  await page.getByRole("button", { name: "Tạo công trình", exact: true }).click();
  await page.getByLabel("Tên công trình", { exact: true }).fill("Công trình mới");
  await page.getByLabel("Loại công trình").fill("Trường học");
  await page.getByLabel("Số tầng").fill("3");
  await page.getByRole("button", { name: "Tạo và thêm IFC" }).click();
  await expect.poll(() => input).toEqual({ name: "Công trình mới", buildingType: "Trường học", totalFloors: 3, location: null, contact: null });
  await expect(page).toHaveURL(/\/workspace\/buildings\/building-1$/);
  await expect(page.getByRole("navigation", { name: "Quản lý tổ chức" }).getByRole("link", { name: "Công trình", exact: true })).toHaveAttribute("aria-current", "page");
});

for (const width of [1440, 820, 375]) {
  test(`organization workspace navigation and responsive screens at ${width}px`, async ({ page }, testInfo) => {
    await session(page);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 667 });
    await page.goto("/dashboard/organization");
    await expect(page).toHaveURL(/\/workspace\/buildings$/);
    await expect(page.getByRole("link", { name: building.name })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`buildings-${width}.png`), fullPage: true });
    if (width < 768) {
      const toggle = page.getByRole("button", { name: "Mở menu tổ chức" });
      await toggle.click();
      await expect(page.getByRole("link", { name: "Công trình", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(toggle).toBeFocused();
      await toggle.click();
    }
    await page.getByRole("link", { name: "Quét mô hình IFC", exact: true }).click();
    await expect(page.getByLabel("Chọn tệp IFC")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`ifc-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.goBack();
    await expect(page).toHaveURL(/\/workspace\/buildings$/);
    await page.goForward();
    await page.reload();
    await expect(page.getByLabel("Chọn tệp IFC")).toBeVisible();
    if (width < 768) await page.getByRole("button", { name: "Mở menu tổ chức" }).click();
    await page.getByRole("link", { name: "Hồ sơ tổ chức", exact: true }).click();
    await expect(page.getByLabel("Tên tổ chức", { exact: true })).toHaveValue("FET3D Lab");
    await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`profile-${width}.png`), fullPage: true });
  });
}

test("anonymous deep link keeps its login destination and does not load protected resources", async ({ page }) => {
  let privateCalls = 0;
  await page.route("**/api/buildings**", (route) => { privateCalls++; return route.fulfill({ status: 403 }); });
  await page.goto("/workspace/buildings/building-1/scenarios?draft=sample");
  await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toHaveAttribute("href", "/login?next=%2Fworkspace%2Fbuildings%2Fbuilding-1%2Fscenarios%3Fdraft%3Dsample");
  expect(privateCalls).toBe(0);
});

test("trainee cannot mount protected workspace pages", async ({ page }) => {
  await session(page, 2);
  let privateCalls = 0;
  await page.route("**/api/buildings**", (route) => { privateCalls++; return route.fulfill({ status: 403 }); });
  for (const path of ["/workspace/buildings", "/workspace/buildings/building-1", "/workspace/buildings/building-1/scenarios", "/workspace/ifc", "/workspace/profile"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  }
  expect(privateCalls).toBe(0);
});

test("PlatformAdmin can still open local IFC and logout clears the session", async ({ page }) => {
  await session(page, 0);
  await page.goto("/workspace/ifc");
  await expect(page.getByLabel("Chọn tệp IFC")).toBeVisible();
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 204 }));
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).toBeNull();
});

test("next permits workspace details, scenarios and profile while rejecting unrelated paths", () => {
  for (const path of ["/workspace/profile", "/workspace/buildings/building-1", "/workspace/buildings/building-1/scenarios?draft=one"]) expect(safeNext(path)).toBe(path);
  for (const path of ["https://evil.test", "//evil.test/workspace/profile", "/workspace/buildings/building-1/admin", "/workspace/other"]) expect(safeNext(path)).toBe("/learning-hub");
  expect(postLoginRoute({ role: 2 }, "/workspace/profile")).toBe("/learning-hub");
  expect(postLoginRoute({ role: 1 }, "https://evil.test")).toBe("/workspace/buildings");
  expect(postLoginRoute({ role: 0 }, "https://evil.test")).toBe("/admin/accounts");
  expect(postLoginRoute({ role: 1 }, "/workspace/buildings/building-1/scenarios")).toBe("/workspace/buildings/building-1/scenarios");
});
