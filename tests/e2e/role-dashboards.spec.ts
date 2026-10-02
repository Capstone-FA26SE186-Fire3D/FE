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

  await expect(page.getByRole("heading", { name: "Không gian học tập" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở Góc học tập" })).toHaveAttribute("href", "/learning-hub");
  await expect(page.getByRole("link", { name: "Xem hồ sơ" })).toHaveAttribute("href", "/account");
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

test("password login without a next route redirects OrganizationUser to its dashboard", async ({ page }) => {
  const user = { id: "organization-user-1", email: "owner@fire3d.test", fullName: "Owner", organizationId: "org-1", role: 1 };
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "access", refreshToken: "refresh", user } }));

  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL(/\/dashboard\/organization$/);
});
