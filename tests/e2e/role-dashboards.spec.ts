import { expect, test } from "@playwright/test";

function restoreSession(page: import("@playwright/test").Page, user: { email: string; fullName: string; organizationId: string | null; role: number }) {
  return page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), {
    accessToken: "dashboard-access-token",
    refreshToken: "dashboard-refresh-token",
    user,
  });
}

test("Trainee sees a learning dashboard after opening their role page", async ({ page }) => {
  const user = { email: "trainee@fire3d.test", fullName: "Trainee", organizationId: null, role: 2 };
  await restoreSession(page, user);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "trainee-1", ...user } }));

  await page.goto("/dashboard/trainee");

  await expect(page).toHaveURL(/\/learning-hub$/);
  await expect(page.getByRole("heading", { name: "Bài đã lưu", exact: true })).toBeVisible();
});

test("OrganizationUser sees the BIM workspace dashboard", async ({ page }) => {
  const user = { email: "owner@fire3d.test", fullName: "Owner", organizationId: "org-1", role: 1 };
  await restoreSession(page, user);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "organization-user-1", ...user } }));

  await page.goto("/dashboard/organization");

  await expect(page.getByRole("heading", { name: "Không gian tổ chức" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quản lý công trình" })).toHaveAttribute("href", "/workspace/buildings");
  await expect(page.getByRole("link", { name: "Quét mô hình IFC" })).toHaveAttribute("href", "/workspace/ifc");
});

test("restored OrganizationUser session accepts the string role returned by the API", async ({ page }) => {
  const storedUser = { email: "owner@fire3d.test", fullName: "Owner", organizationId: "org-1", role: 1 };
  await restoreSession(page, storedUser);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "organization-user-1", ...storedUser, role: "OrganizationUser" } }));

  await page.goto("/dashboard/organization");

  await expect(page.getByRole("heading", { name: "Không gian tổ chức" })).toBeVisible();
});

test("password login without a next route redirects OrganizationUser to its dashboard", async ({ page }) => {
  const user = { id: "organization-user-1", email: "owner@fire3d.test", fullName: "Owner", organizationId: "org-1", role: 1 };
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "access", refreshToken: "refresh", user } }));

  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL(/\/dashboard\/organization$/);
});

test("string OrganizationUser role from the API opens the organization dashboard", async ({ page }) => {
  const user = { id: "organization-user-1", email: "owner@fire3d.test", fullName: "Owner", organizationId: "org-1", role: "OrganizationUser" };
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "access", refreshToken: "refresh", user } }));

  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL(/\/dashboard\/organization$/);
});

test("OrganizationUser cannot be redirected to the admin account page by next", async ({ page }) => {
  const user = { id: "organization-user-1", email: "owner@fire3d.test", fullName: "Owner", organizationId: "org-1", role: "OrganizationUser" };
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "access", refreshToken: "refresh", user } }));

  await page.goto("/login?next=/admin/accounts");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL(/\/dashboard\/organization$/);
});

for (const [role, destination] of [[2, "/learning-hub"], [0, "/admin/accounts"]] as const) {
  test(`password login role ${role} opens destination directly`, async ({ page }) => {
    const user = { id: "role-user", email: "role@fire3d.test", fullName: "Role", organizationId: null, role };
    await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "access", refreshToken: "refresh", user } }));
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(destination + "$"));
  });
}
