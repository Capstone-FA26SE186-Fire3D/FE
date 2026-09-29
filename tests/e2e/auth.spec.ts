import { expect, test } from "@playwright/test";

test("login screen uses a Fire3D password session and keeps Google optional", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByText("Đăng nhập Fire3D")).toBeVisible();
  await expect(page.getByText("Tài khoản trải nghiệm")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tiếp tục với Google" })).toBeVisible();
});

test("password login posts credentials directly to the Fire3D API", async ({ page }) => {
  let payload: unknown;

  await page.route("**/api/auth/login", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      json: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: { id: "org-user", email: "owner@fire3d.test", fullName: "Owner", role: 1, organizationId: "org-1" },
      },
    });
  });

  await page.goto("/login?next=/workspace/buildings");
  await page.getByLabel("Email").fill("owner@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect.poll(() => payload).toEqual({ email: "owner@fire3d.test", password: "safe-password-123" });
});

test("trainee registration uses the current VPS contract before creating a session", async ({ page }) => {
  let payload: unknown;

  await page.route("**/api/auth/register/trainee", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "trainee-1" } });
  });
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "access", refreshToken: "refresh", user: { id: "trainee-1", email: "trainee@fire3d.test", fullName: "Trainee", role: 2, organizationId: null } } }));

  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();
  await page.getByLabel("Họ và tên").fill("Trainee Test");
  await page.getByLabel("Tên người dùng").fill("Trainee_Test");
  await page.getByLabel("Email").fill("trainee@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByLabel("Xác nhận mật khẩu").fill("safe-password-123");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect.poll(() => payload).toEqual({
    email: "trainee@fire3d.test",
    password: "safe-password-123",
    confirmPassword: "safe-password-123",
    fullName: "Trainee Test",
    username: "trainee_test",
  });
});

test("accounts administration is protected before rendering account data", async ({ page }) => {
  await page.goto("/admin/accounts");

  await expect(page.getByRole("heading", { name: "Quản lý tài khoản" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  await expect(page.getByText("Không có tài khoản phù hợp.")).toHaveCount(0);
});

test("platform admin loads and manages accounts through Fire3D endpoints", async ({ page }) => {
  const token = "fire3d-access-token";
  const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null };
  const account = { id: "account-1", email: "trainee@fire3d.test", fullName: "Trainee", role: 2, organizationId: null, isActive: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
  const organization = { id: "org-1", name: "Fire3D Lab", slug: "fire3d-lab", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
  let createPayload: unknown;

  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    await route.fulfill({ json: admin });
  });
  await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [organization], totalCount: 1, page: 1, pageSize: 100 } }));
  await page.route("**/api/accounts?*", (route) => route.fulfill({ json: { items: [account], totalCount: 1, page: 1, pageSize: 50 } }));
  await page.route("**/api/accounts/account-1", (route) => route.fulfill({ json: account }));
  await page.route("**/api/accounts", async (route) => {
    createPayload = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    await route.fulfill({ status: 201, json: { id: "created-1" } });
  });

  await page.goto("/admin/accounts");
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trainee" })).toBeVisible();
  await page.getByRole("button", { name: "Trainee" }).click();
  await expect(page.getByText(/Đăng nhập gần nhất/)).toBeVisible();
  await page.getByLabel("Email").fill("member@fire3d.test");
  await page.getByLabel("Mật khẩu").fill("long-enough-password");
  await page.getByLabel("Họ và tên").fill("New Member");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText("Đã tạo tài khoản. Danh sách đã được tải lại.")).toBeVisible();
  expect(createPayload).toMatchObject({ email: "member@fire3d.test", password: "long-enough-password", fullName: "New Member", role: 2, organizationId: null });
});
