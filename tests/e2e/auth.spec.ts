import { expect, test } from "@playwright/test";
import { authApi } from "../../src/features/auth/api";

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

test("login displays the backend ProblemDetails message unchanged", async ({ page }) => {
  await page.route("**/api/auth/login", (route) => route.fulfill({
    status: 403,
    contentType: "application/problem+json",
    body: JSON.stringify({
      title: "Verify your email before signing in.",
      detail: "Check the fields listed below.",
      code: "EMAIL_NOT_VERIFIED",
    }),
  }));

  await page.goto("/login");
  await page.getByLabel("Email").fill("pending@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.getByText("Thông báo từ Fire3D")).toBeVisible();
  await expect(page.getByRole("alert", { name: "Lỗi xác thực" })).toContainText("Verify your email before signing in.");
  await expect
    .poll(() => page.locator(".form-message").evaluate((node) => node.previousElementSibling?.id))
    .toBe("auth-note");
});

test("header shows the personal account state for a restored Fire3D session", async ({ page }) => {
  const user = {
    id: "trainee-test",
    email: "trainee@fire3d.test",
    fullName: "Người dùng thử",
    role: 2,
    organizationId: null,
  };

  await page.addInitScript((tokens) => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(tokens));
  }, { accessToken: "test-access-token", refreshToken: "test-refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user }));

  await page.goto("/learning-hub");

  await expect(
    page.getByRole("button", { name: "Mở menu tài khoản của Người dùng thử" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toHaveCount(0);
});

test("Google login unwraps the authenticated session returned by Fire3D", async () => {
  const authentication = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    user: { id: "trainee-test", email: "trainee@fire3d.test", fullName: "Người dùng thử", role: 2 as const, organizationId: null },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "Authenticated", authentication }), {
    headers: { "content-type": "application/json" },
  });

  try {
    await expect(authApi.loginFirebase("firebase-id-token")).resolves.toEqual(authentication);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("trainee registration verifies an OTP before creating an account", async ({ page }) => {
  let otpRequestPayload: unknown;
  let otpVerificationPayload: unknown;
  let registrationPayload: unknown;
  const requestOrder: string[] = [];

  await page.route("**/api/auth/registration/request-otp", async (route) => {
    otpRequestPayload = route.request().postDataJSON();
    await route.fulfill({ status: 202 });
  });
  await page.route("**/api/auth/registration/verify-otp", async (route) => {
    requestOrder.push("verify-otp");
    otpVerificationPayload = route.request().postDataJSON();
    await route.fulfill({ json: { registrationToken: "registration-proof", expiresAt: "2026-10-01T12:00:00Z" } });
  });

  await page.route("**/api/auth/register/trainee", async (route) => {
    requestOrder.push("register");
    registrationPayload = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "trainee-1", email: "trainee@fire3d.test", fullName: "Trainee", role: "Trainee", organizationId: null } });
  });
  await page.route("**/api/auth/login", (route) => {
    requestOrder.push("login");
    return route.fulfill({ json: { accessToken: "access", refreshToken: "refresh", user: { id: "trainee-1", email: "trainee@fire3d.test", fullName: "Trainee", role: 2, organizationId: null } } });
  });

  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();
  await page.getByLabel("Họ và tên").fill("Trainee Test");
  await page.getByLabel("Tên người dùng").fill("trainee_test");
  await page.getByLabel("Email", { exact: true }).fill("trainee@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Gửi mã OTP" }).click();

  await expect.poll(() => otpRequestPayload).toEqual({ email: "trainee@fire3d.test" });
  await page.getByLabel("Mã OTP").fill("123456");
  await page.getByRole("button", { name: "Xác thực và tạo tài khoản" }).click();
  await expect.poll(() => otpVerificationPayload).toEqual({ email: "trainee@fire3d.test", otp: "123456" });

  await expect.poll(() => registrationPayload).toEqual({
    email: "trainee@fire3d.test",
    password: "123456",
    confirmPassword: "123456",
    fullName: "Trainee Test",
    username: "trainee_test",
    registrationToken: "registration-proof",
  });
  await expect.poll(() => requestOrder).toEqual(["verify-otp", "register", "login"]);
});

test("registration can resend an OTP and clears the previous code", async ({ page }) => {
  let resendPayload: unknown;

  await page.route("**/api/auth/registration/request-otp", (route) => route.fulfill({ status: 202 }));
  await page.route("**/api/auth/resend-verification", async (route) => {
    resendPayload = route.request().postDataJSON();
    await route.fulfill({ status: 202 });
  });

  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();
  await page.getByLabel("Họ và tên").fill("Trainee Test");
  await page.getByLabel("Tên người dùng").fill("trainee_test");
  await page.getByLabel("Email", { exact: true }).fill("trainee@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByRole("button", { name: "Gửi mã OTP" }).click();
  await page.getByLabel("Mã OTP").fill("123456");

  await page.getByRole("button", { name: "Gửi lại mã OTP" }).click();

  await expect.poll(() => resendPayload).toEqual({ email: "trainee@fire3d.test" });
  await expect(page.getByLabel("Mã OTP")).toHaveValue("");
  await expect(page.getByRole("status")).toContainText("Đã yêu cầu mã OTP mới");
});

test("registration presents an existing-email response and returns to login", async ({ page }) => {
  await page.route("**/api/auth/registration/request-otp", (route) => route.fulfill({
    status: 409,
    contentType: "application/problem+json",
    body: JSON.stringify({ title: "Email already exists.", code: "EMAIL_EXISTS", errors: { email: ["Email already exists."] } }),
  }));

  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();
  await page.getByLabel("Tên người dùng").fill("existing-user");
  await page.getByLabel("Email", { exact: true }).fill("existing@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Gửi mã OTP" }).click();

  await expect(page.getByRole("alert", { name: "Lỗi xác thực" })).toContainText("Email already exists.");
  await expect(page.getByRole("tab", { name: "Đăng nhập" })).toBeVisible();
  await page.getByRole("tab", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Đăng nhập Fire3D" })).toBeVisible();
});

test("registration fields reflect the backend password and username limits", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();

  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute("minlength", "6");
  await expect(page.getByLabel("Tên người dùng")).toHaveAttribute("maxlength", "30");
  await expect(page.getByLabel("Tên người dùng")).toHaveAttribute("pattern", "[a-z0-9._-]{3,30}");
});

test("registration keeps the successful-create outcome when the follow-up login fails", async ({ page }) => {
  await page.route("**/api/auth/registration/request-otp", (route) => route.fulfill({ status: 202 }));
  await page.route("**/api/auth/registration/verify-otp", (route) => route.fulfill({ json: { registrationToken: "registration-proof", expiresAt: "2026-10-01T12:00:00Z" } }));
  await page.route("**/api/auth/register/trainee", (route) => route.fulfill({ status: 201, json: { id: "trainee-1", email: "trainee@fire3d.test", fullName: null, role: "Trainee", organizationId: null } }));
  await page.route("**/api/auth/login", (route) => route.fulfill({ status: 401, contentType: "application/problem+json", body: JSON.stringify({ title: "Invalid credentials." }) }));

  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();
  await page.getByLabel("Tên người dùng").fill("trainee_test");
  await page.getByLabel("Email", { exact: true }).fill("trainee@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Gửi mã OTP" }).click();
  await page.getByLabel("Mã OTP").fill("123456");
  await page.getByRole("button", { name: "Xác thực và tạo tài khoản" }).click();

  await expect(page.getByRole("tab", { name: "Đăng nhập" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("alert", { name: "Lỗi xác thực" })).toContainText("Tài khoản đã được tạo.");
  await expect(page.getByLabel("Email")).toHaveValue("trainee@fire3d.test");
});

test("organization registration includes the verified OTP proof", async ({ page }) => {
  let registrationPayload: unknown;

  await page.route("**/api/auth/registration/request-otp", (route) => route.fulfill({ status: 202 }));
  await page.route("**/api/auth/registration/verify-otp", (route) => route.fulfill({
    json: { registrationToken: "organization-proof", expiresAt: "2026-10-01T12:00:00Z" },
  }));
  await page.route("**/api/auth/register/organization", async (route) => {
    registrationPayload = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "organization-owner-1", email: "owner@fire3d.test", fullName: "Organization Owner", role: "OrganizationUser", organizationId: "org-1" } });
  });
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: {
    accessToken: "access", refreshToken: "refresh",
    user: { id: "organization-owner-1", email: "owner@fire3d.test", fullName: "Organization Owner", role: 1, organizationId: "org-1" },
  } }));

  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();
  await page.getByRole("radio", { name: /Tổ chức/ }).check();
  await page.getByLabel("Họ và tên").fill("Organization Owner");
  await page.getByLabel("Tên tổ chức").fill("Fire3D Lab");
  await page.getByLabel("Địa chỉ tổ chức").fill("1 Fire Street");
  await page.getByLabel("Điện thoại tổ chức").fill("+84123456789");
  await page.getByLabel("Email", { exact: true }).fill("owner@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("safe-password-123");
  await page.getByRole("button", { name: "Gửi mã OTP" }).click();
  await page.getByLabel("Mã OTP").fill("123456");
  await page.getByRole("button", { name: "Xác thực và tạo tài khoản" }).click();

  await expect.poll(() => registrationPayload).toEqual({
    email: "owner@fire3d.test",
    password: "safe-password-123",
    confirmPassword: "safe-password-123",
    fullName: "Organization Owner",
    organizationName: "Fire3D Lab",
    organizationAddress: "1 Fire Street",
    organizationPhoneNumber: "+84123456789",
    registrationToken: "organization-proof",
  });
});

test("registration presents account types as descriptive selection cards", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();

  await expect(page.getByText("Học kiến thức và tham gia tập huấn.")).toBeVisible();
  await expect(page.getByText("Quản lý BIM, IFC và kịch bản diễn tập.")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Học viên/ })).toBeChecked();

  await page.getByRole("radio", { name: /Tổ chức/ }).check();
  await expect(page.getByRole("radio", { name: /Tổ chức/ })).toBeChecked();
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
