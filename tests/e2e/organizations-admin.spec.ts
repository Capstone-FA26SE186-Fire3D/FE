import { expect, test, type Page } from "@playwright/test";

const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null };
const organization = { id: "org-1", name: "Fire3D Lab", slug: "fire3d-lab", isActive: true, createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" };
const created = { id: "org-2", name: "Trường An Toàn", slug: "truong-an-toan", isActive: true, createdAt: "2026-09-28T01:00:00Z", updatedAt: "2026-09-28T01:00:00Z" };

async function signIn(page: Page, user: object = admin) {
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: "platform-admin-token", refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));
}

test("PlatformAdmin creates, reviews and locks an Organization through the Fire3D API (mock)", async ({ page }) => {
  let createPayload: unknown;
  let statusPayload: unknown;
  const listQueries: string[] = [];

  await signIn(page);
  await page.route("**/api/organizations?*", (route) => { listQueries.push(new URL(route.request().url()).search); return route.fulfill({ json: { items: [organization], totalCount: 1, page: 1, pageSize: 20 } }); });
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
  await page.route("**/api/organizations/org-2", (route) => route.fulfill({ json: created }));

  await page.goto("/admin/organizations");
  await expect(page.getByRole("heading", { name: "Tổ chức", exact: true })).toBeVisible();

  // Row links: owner handoff and building list (page owned by another task, link only).
  await expect(page.getByRole("link", { name: "Tạo owner cho Fire3D Lab" })).toHaveAttribute("href", "/admin/accounts?organizationId=org-1");
  await expect(page.getByRole("link", { name: "Xem công trình của Fire3D Lab" })).toHaveAttribute("href", "/admin/organizations/org-1/buildings");

  // Detail drawer is deep-linkable and only shows fields the API returns.
  await page.getByRole("button", { name: "Fire3D Lab fire3d-lab" }).click();
  await expect(page).toHaveURL(/organization=org-1/);
  const detail = page.getByRole("dialog", { name: "Thông tin tổ chức" });
  await expect(detail.getByRole("link", { name: "Tạo OrganizationUser" })).toHaveAttribute("href", "/admin/accounts?organizationId=org-1");
  await expect(detail.getByText("Chờ BE: địa chỉ và số điện thoại")).toBeVisible();

  // Locking needs an explicit confirmation.
  await detail.getByRole("button", { name: "Vô hiệu hóa tổ chức" }).click();
  const confirm = page.getByRole("dialog", { name: "Vô hiệu hóa tổ chức?" });
  expect(statusPayload).toBeUndefined();
  await confirm.getByRole("button", { name: "Vô hiệu hóa", exact: true }).click();
  await expect.poll(() => statusPayload).toEqual({ isActive: false });
  await expect(page.getByText("Đã vô hiệu hóa tổ chức")).toBeVisible();

  // Create.
  await page.goto("/admin/organizations");
  await page.getByRole("button", { name: "Tạo tổ chức", exact: true }).first().click();
  const form = page.getByRole("dialog", { name: "Tạo tổ chức" });
  await form.getByLabel("Tên tổ chức").fill("Trường An Toàn");
  await expect(form.getByLabel("Slug tổ chức")).toHaveValue("truong-an-toan");
  await form.getByRole("button", { name: "Tạo tổ chức" }).click();
  await expect.poll(() => createPayload).toEqual({ name: "Trường An Toàn", slug: "truong-an-toan" });
  await expect(page.getByText("Đã tạo tổ chức", { exact: true })).toBeVisible();
  expect(listQueries.length).toBeGreaterThan(0);
});

test("organization list keeps filters and page in the URL and queries the API with them", async ({ page }) => {
  const queries: URLSearchParams[] = [];
  await signIn(page);
  await page.route("**/api/organizations?*", (route) => { queries.push(new URL(route.request().url()).searchParams); return route.fulfill({ json: { items: [organization], totalCount: 45, page: 2, pageSize: 20 } }); });

  await page.goto("/admin/organizations?page=2&status=false&q=lab");
  await expect(page.getByLabel("Trạng thái")).toHaveValue("false");
  await expect(page.getByLabel("Tìm tổ chức")).toHaveValue("lab");
  await expect.poll(() => queries.at(-1)?.toString()).toContain("page=2");
  expect(queries.at(-1)?.get("isActive")).toBe("false");
  expect(queries.at(-1)?.get("search")).toBe("lab");

  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(page).toHaveURL(/page=3/);
  await page.getByLabel("Trạng thái").selectOption("true");
  await expect(page).not.toHaveURL(/page=/);
  await expect(page).toHaveURL(/status=true/);
});

test("organization admin shows empty, error-with-retry and rejects duplicate slugs without losing input", async ({ page }) => {
  let fail = true;
  await signIn(page);
  await page.route("**/api/organizations?*", (route) => {
    if (fail) return route.fulfill({ status: 500, json: { title: "boom" } });
    return route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } });
  });
  await page.route("**/api/organizations", (route) => route.fulfill({ status: 409, json: { code: "SLUG_EXISTS", title: "Slug exists" } }));

  await page.goto("/admin/organizations");
  await expect(page.getByText("Không tải được danh sách tổ chức")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByText("Chưa có tổ chức")).toBeVisible();

  await page.getByRole("button", { name: "Tạo tổ chức", exact: true }).first().click();
  const form = page.getByRole("dialog", { name: "Tạo tổ chức" });
  await form.getByLabel("Tên tổ chức").fill("Trùng");
  await form.getByRole("button", { name: "Tạo tổ chức" }).click();
  await expect(form.getByText(/Slug này đã được dùng/)).toBeVisible();
  await expect(form.getByLabel("Tên tổ chức")).toHaveValue("Trùng");
});

test("organization admin denies non-admin roles", async ({ page }) => {
  await signIn(page, { id: "o", email: "o@fire3d.test", fullName: "Org", role: 1, organizationId: "org-1" });
  await page.goto("/admin/organizations");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
});

test("Accounts form receives Organization scope from the admin handoff", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [organization], totalCount: 1, page: 1, pageSize: 100 } }));
  await page.route("**/api/accounts?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 50 } }));

  await page.goto("/admin/accounts?organizationId=org-1");

  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Tạo tài khoản" });
  await expect(form.getByLabel("Vai trò")).toHaveValue("1");
  await expect(form.getByLabel("Tổ chức")).toHaveValue("org-1");
});
