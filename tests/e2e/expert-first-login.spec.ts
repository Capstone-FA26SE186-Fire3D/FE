/**
 * First sign-in of a Chuyên viên PCCC account created by an admin (BE#235): code step, forced password change, and the
 * admin side (unverified state, fixing a mistyped email).
 * Evidence level: Playwright route mocks that follow the BE contract (AuthController first-login/*, PasswordChangeGuard,
 * AccountsController PATCH email; BE main @ 41ed934). Not an integration test against the real API.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

import { EXPOSED } from "./api-headers";

const problem = (route: Route, status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  route.fulfill({ status, headers: { "Content-Type": "application/problem+json", ...EXPOSED, ...headers }, body: JSON.stringify({ status, ...body }) });

const expert = { id: "expert-1", email: "chuyenvien@fire3d.test", fullName: "Lê Văn T", role: "FireSafetyExpert", organizationId: null, profileRevision: 1, emailVerifiedAt: "2026-11-26T10:00:00Z" };
const challenge = { challengeToken: "challenge-1", challengeExpiresAt: "2099-01-01T00:30:00Z", codeExpiresAt: "2099-01-01T00:10:00Z", emailHint: "c***@fire3d.test", resendAfterSeconds: 0 };

async function signInWithInitialPassword(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("chuyenvien@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("initial-password-1");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test.describe("first sign-in of an expert account", () => {
  test("the code opens a session that only changes the initial password, then the person signs in again", async ({ page }) => {
    const verifyBodies: unknown[] = [];
    let passwordBody: unknown;
    let passwordAuth: string | undefined;
    let expertCalls = 0;

    await page.route("**/api/auth/login", (route) => problem(route, 403, { title: "Enter the code sent to the account email.", code: "FIRST_LOGIN_VERIFICATION_REQUIRED", ...challenge }));
    await page.route("**/api/auth/first-login/verify", (route) => {
      const body = route.request().postDataJSON() as { code: string };
      verifyBodies.push(body);
      if (body.code !== "123456") return problem(route, 400, { title: "The code is wrong.", code: "FIRST_LOGIN_CODE_INVALID", attemptsRemaining: 4 });
      return route.fulfill({ json: { accessToken: "first-access", refreshToken: "first-refresh", user: { ...expert, firstLoginStep: "ChangePassword" } } });
    });
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...expert, firstLoginStep: "ChangePassword" }, headers: { ...EXPOSED, ETag: '"1"' } }));
    await page.route("**/api/expert/**", (route) => { expertCalls++; return problem(route, 403, { title: "Change the initial password.", code: "PASSWORD_CHANGE_REQUIRED" }); });
    await page.route("**/api/auth/change-password", (route) => {
      passwordBody = route.request().postDataJSON();
      passwordAuth = route.request().headers().authorization;
      return route.fulfill({ status: 204 });
    });

    await signInWithInitialPassword(page);

    const step = page.getByTestId("first-login-verify");
    await expect(step.getByRole("heading", { name: "Xác minh email" })).toBeVisible();
    await expect(step).toContainText("c***@fire3d.test");
    await expect(step.getByRole("button", { name: "Xác minh", exact: true })).toBeDisabled();

    await step.getByLabel("Mã xác minh").fill("000000");
    await step.getByRole("button", { name: "Xác minh", exact: true }).click();
    await expect(step.getByRole("alert")).toContainText("Bạn còn 4 lần thử");
    await expect(step.getByLabel("Mã xác minh")).toHaveValue("");

    await step.getByLabel("Mã xác minh").fill("123456");
    await step.getByRole("button", { name: "Xác minh", exact: true }).click();

    // The workspace of the role shows only the password step; no expert data is requested behind it.
    await expect(page).toHaveURL(/\/expert\/reviews/);
    const change = page.getByTestId("first-password-change");
    await expect(change.getByRole("heading", { name: "Đổi mật khẩu ban đầu" })).toBeVisible();
    await expect(change).toContainText("chuyenvien@fire3d.test");
    expect(verifyBodies).toEqual([{ challengeToken: "challenge-1", code: "000000" }, { challengeToken: "challenge-1", code: "123456" }]);
    expect(expertCalls).toBe(0);

    await change.getByRole("textbox", { name: "Mật khẩu ban đầu" }).fill("initial-password-1");
    await change.getByRole("textbox", { name: "Mật khẩu mới", exact: false }).first().fill("initial-password-1");
    await change.getByRole("textbox", { name: "Xác nhận mật khẩu mới" }).fill("initial-password-1");
    await change.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(change.getByText("Mật khẩu mới phải khác mật khẩu ban đầu.")).toBeVisible();
    expect(passwordBody).toBeUndefined();

    await change.getByRole("textbox", { name: "Mật khẩu mới", exact: false }).first().fill("my-own-password-9");
    await change.getByRole("textbox", { name: "Xác nhận mật khẩu mới" }).fill("my-own-password-9");
    await change.getByRole("button", { name: "Đổi mật khẩu" }).click();

    await expect(page).toHaveURL(/\/login\?notice=first-password-changed/);
    await expect(page.getByText("Mật khẩu đã được đổi. Hãy đăng nhập lại bằng email và mật khẩu mới.")).toBeVisible();
    expect(passwordBody).toEqual({ currentPassword: "initial-password-1", newPassword: "my-own-password-9" });
    expect(passwordAuth).toBe("Bearer first-access");
    expect(await page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).toBeNull();
  });

  test("a new code waits for the server's cooldown, and a locked code asks for a new one", async ({ page }) => {
    let resends = 0;
    await page.route("**/api/auth/login", (route) => problem(route, 403, { title: "Enter the code.", code: "FIRST_LOGIN_VERIFICATION_REQUIRED", ...challenge, resendAfterSeconds: 2 }));
    await page.route("**/api/auth/first-login/resend", (route) => {
      resends++;
      if (resends === 1) return route.fulfill({ status: 202, json: { ...challenge, resendAfterSeconds: 60 } });
      return problem(route, 429, { title: "Too many codes.", code: "OTP_RATE_LIMITED" }, { "Retry-After": "120" });
    });
    await page.route("**/api/auth/first-login/verify", (route) => problem(route, 400, { title: "Locked.", code: "FIRST_LOGIN_CODE_LOCKED", resendAfterSeconds: 0 }));

    await signInWithInitialPassword(page);
    const step = page.getByTestId("first-login-verify");
    await expect(step.getByRole("button", { name: /Gửi lại mã sau \d+ giây/ })).toBeDisabled();
    await expect(step.getByRole("button", { name: "Gửi lại mã", exact: true })).toBeEnabled({ timeout: 6000 });

    await step.getByRole("button", { name: "Gửi lại mã", exact: true }).click();
    await expect(step.getByRole("status")).toContainText("Đã gửi mã mới");
    await expect(step.getByRole("button", { name: /Gửi lại mã sau \d+ giây/ })).toBeDisabled();
    expect(resends).toBe(1);

    await step.getByLabel("Mã xác minh").fill("111111");
    await step.getByRole("button", { name: "Xác minh", exact: true }).click();
    await expect(step.getByRole("alert")).toContainText("Hãy bấm Gửi lại mã để nhận mã mới");
  });

  test("an expired step goes back to email and password with the reason", async ({ page }) => {
    await page.route("**/api/auth/login", (route) => problem(route, 403, { title: "Enter the code.", code: "FIRST_LOGIN_VERIFICATION_REQUIRED", ...challenge }));
    await page.route("**/api/auth/first-login/verify", (route) => problem(route, 401, { title: "This sign-in step has expired.", code: "FIRST_LOGIN_CHALLENGE_INVALID" }));

    await signInWithInitialPassword(page);
    await page.getByTestId("first-login-verify").getByLabel("Mã xác minh").fill("123456");
    await page.getByRole("button", { name: "Xác minh", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Đăng nhập FET3D" })).toBeVisible();
    await expect(page.getByRole("alert", { name: "Lỗi xác thực" })).toContainText("Bước xác minh đã hết hạn");
    // The password is not kept while the code step is open.
    await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveValue("");
  });

  test("a saved session that still has the initial password opens the password step after a reload", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "first-access", refreshToken: "first-refresh" })));
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...expert, firstLoginStep: "ChangePassword" }, headers: { ...EXPOSED, ETag: '"1"' } }));
    await page.goto("/expert/reviews");
    await expect(page.getByRole("heading", { name: "Đổi mật khẩu ban đầu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  });
});

test.describe("admin: unverified expert accounts", () => {
  test("the list shows the state and the admin fixes a mistyped email with If-Match", async ({ page }) => {
    const account = { id: "acc-9", email: "chuyenvein@fire3d.test", fullName: "Lê Văn T", role: "FireSafetyExpert", organizationId: null, isActive: true, lastLoginAt: null, createdAt: "2026-11-26T09:00:00Z", updatedAt: "2026-11-26T09:00:00Z", profileRevision: 3, emailVerifiedAt: null as string | null, firstLoginStep: "VerifyEmail" as string | null };
    const patches: Array<{ ifMatch: string | undefined; body: unknown }> = [];

    await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "a", refreshToken: "r" })));
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "admin", email: "admin@fire3d.test", fullName: "Admin", role: "PlatformAdmin", organizationId: null, profileRevision: 1 } }));
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 100 } }));
    await page.route("**/api/accounts?*", (route) => route.fulfill({ json: { items: [
      account,
      { ...account, id: "acc-8", email: "dangdoi@fire3d.test", emailVerifiedAt: "2026-11-26T09:30:00Z", firstLoginStep: "ChangePassword" },
      { ...account, id: "acc-7", email: "binhthuong@fire3d.test", emailVerifiedAt: null, firstLoginStep: null },
    ], totalCount: 3, page: 1, pageSize: 20 } }));
    await page.route((url) => url.pathname === "/api/accounts/acc-9", (route) => route.fulfill({ json: account, headers: { ...EXPOSED, ETag: `"${account.profileRevision}"` } }));
    await page.route((url) => url.pathname === "/api/accounts/acc-9/email", (route) => {
      const body = route.request().postDataJSON() as { email: string };
      patches.push({ ifMatch: route.request().headers()["if-match"], body });
      if (body.email === "trung@fire3d.test") return problem(route, 409, { title: "Email is used.", code: "EMAIL_EXISTS" });
      account.email = body.email;
      account.profileRevision += 1;
      return route.fulfill({ json: account, headers: { ...EXPOSED, ETag: `"${account.profileRevision}"` } });
    });

    await page.goto("/admin/accounts");
    const table = page.getByTestId("accounts-table");
    await expect(table.getByText("Chưa xác minh email")).toHaveCount(1);
    await expect(table.getByText("Chưa đổi mật khẩu ban đầu")).toHaveCount(1);
    await expect(table.getByText("Hoạt động")).toHaveCount(1);

    await table.getByText("chuyenvein@fire3d.test").click();
    const drawer = page.getByTestId("account-drawer");
    await expect(drawer.getByText("chuyenvein@fire3d.test · Chưa xác minh")).toBeVisible();
    await drawer.getByRole("button", { name: "Sửa email" }).click();

    const dialog = page.getByRole("dialog", { name: "Sửa email" });
    await expect(dialog.getByLabel("Email mới")).toHaveValue("chuyenvein@fire3d.test");
    await dialog.getByLabel("Email mới").fill("trung@fire3d.test");
    await dialog.getByRole("button", { name: "Lưu email" }).click();
    await expect(dialog.getByText("Email này đã được đăng ký.")).toBeVisible();

    await dialog.getByLabel("Email mới").fill("chuyenvien@fire3d.test");
    await dialog.getByRole("button", { name: "Lưu email" }).click();
    await expect(dialog).toBeHidden();
    await expect(drawer.getByText("chuyenvien@fire3d.test · Chưa xác minh")).toBeVisible();
    expect(patches).toEqual([
      { ifMatch: '"3"', body: { email: "trung@fire3d.test" } },
      { ifMatch: '"3"', body: { email: "chuyenvien@fire3d.test" } },
    ]);

    // The next save carries the revision the server just returned.
    await drawer.getByRole("button", { name: "Sửa email" }).click();
    await dialog.getByLabel("Email mới").fill("chuyenvien2@fire3d.test");
    await dialog.getByRole("button", { name: "Lưu email" }).click();
    await expect(dialog).toBeHidden();
    expect(patches.at(-1)).toEqual({ ifMatch: '"4"', body: { email: "chuyenvien2@fire3d.test" } });
  });
});

test.describe("admin: creating an account says what went wrong", () => {
  test("a server error is reported as one, with the trace id; a taken email and a trainee without a user name are explained", async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    let answer: "500" | "409" | "201" = "500";
    await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "a", refreshToken: "r" })));
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "admin", email: "admin@fire3d.test", fullName: "Admin", role: "PlatformAdmin", organizationId: null, profileRevision: 1 } }));
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 100 } }));
    await page.route("**/api/accounts?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
    await page.route((url) => url.pathname === "/api/accounts", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      if (answer === "500") return problem(route, 500, { title: "An unexpected error occurred.", traceId: "00-trace-abc-01" });
      if (answer === "409") return problem(route, 409, { title: "Email is already registered.", code: "EMAIL_EXISTS" });
      return route.fulfill({ status: 201, json: { id: "new-1", ...bodies.at(-1), isActive: true } });
    });

    await page.goto("/admin/accounts");
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();
    const dialog = page.getByRole("dialog", { name: "Tạo tài khoản" });
    await dialog.getByLabel("Email").fill("hocvien@fire3d.test");
    await dialog.getByLabel("Mật khẩu").fill("initial-password-1");

    // Học viên is the default role: the user name is asked for before anything is sent.
    await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(dialog.getByText(/Tên người dùng dài 3 đến 30 ký tự/)).toBeVisible();
    expect(bodies).toHaveLength(0);
    await dialog.getByLabel("Tên người dùng").fill("HocVien.01");

    await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(dialog.getByText(/Máy chủ gặp lỗi khi tạo tài khoản\. Lỗi này không do thông tin bạn nhập/)).toBeVisible();
    await dialog.getByText("Thông tin cho bộ phận hỗ trợ").click();
    await expect(dialog.getByText("00-trace-abc-01")).toBeVisible();
    expect(bodies[0]).toMatchObject({ email: "hocvien@fire3d.test", role: "Trainee", username: "hocvien.01", organizationId: null });

    answer = "409";
    await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(dialog.getByText("Email này đã được đăng ký.")).toBeVisible();
    await expect(dialog.getByText("00-trace-abc-01")).toHaveCount(0);

    answer = "201";
    await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(dialog).toBeHidden();
  });
});
