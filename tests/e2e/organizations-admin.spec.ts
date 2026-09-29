import { expect, test } from "@playwright/test";

test("PlatformAdmin creates, reviews and provisions an Organization through the Fire3D API", async ({ page }) => {
  const token = "platform-admin-token";
  const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null };
  const organization = { id: "org-1", name: "Fire3D Lab", slug: "fire3d-lab", isActive: true, createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" };
  const created = { id: "org-2", name: "Trường An Toàn", slug: "truong-an-toan", isActive: true, createdAt: "2026-09-28T01:00:00Z", updatedAt: "2026-09-28T01:00:00Z" };
  let createPayload: unknown;
  let statusPayload: unknown;

  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: admin }));
  await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [organization], totalCount: 1, page: 1, pageSize: 20 } }));
  await page.route("**/api/organizations/org-1", (route) => route.fulfill({ json: organization }));
  await page.route("**/api/organizations", async (route) => {
    if (route.request().method() === "POST") {
      createPayload = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/organizations/org-1/status", async (route) => {
    statusPayload = route.request().postDataJSON();
    await route.fulfill({ json: { ...organization, isActive: false } });
  });

  await page.goto("/admin/organizations");

  await expect(page.getByRole("heading", { name: "Organization", exact: true })).toBeVisible();
  await expect(page.getByText("Tổng tổ chức")).toBeVisible();
  await page.getByRole("button", { name: "Fire3D Lab" }).click();
  await expect(page.getByRole("heading", { name: "Thông tin tổ chức" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tạo OrganizationUser" })).toHaveAttribute("href", "/admin/accounts?organizationId=org-1");
  await page.getByRole("button", { name: "Vô hiệu hóa tổ chức" }).click();
  await expect.poll(() => statusPayload).toEqual({ isActive: false });

  await page.getByLabel("Tên tổ chức").fill("Trường An Toàn");
  await page.getByLabel("Slug tổ chức").fill("truong-an-toan");
  await page.getByRole("button", { name: "Tạo Organization" }).click();
  await expect.poll(() => createPayload).toEqual({ name: "Trường An Toàn", slug: "truong-an-toan" });
  await expect(page.getByText("Đã tạo tổ chức. Hãy tạo OrganizationUser owner để bắt đầu quản lý Building.")).toBeVisible();
});

test("Accounts form receives Organization scope from the admin handoff", async ({ page }) => {
  const token = "platform-admin-token";
  const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null };
  const organization = { id: "org-1", name: "Fire3D Lab", slug: "fire3d-lab", isActive: true, createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" };

  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: admin }));
  await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [organization], totalCount: 1, page: 1, pageSize: 100 } }));
  await page.route("**/api/accounts?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 50 } }));

  await page.goto("/admin/accounts?organizationId=org-1");

  const form = page.locator(".admin-form");
  await expect(form.getByLabel("Vai trò")).toHaveValue("1");
  await expect(form.getByRole("combobox").nth(1)).toHaveValue("org-1");
});
