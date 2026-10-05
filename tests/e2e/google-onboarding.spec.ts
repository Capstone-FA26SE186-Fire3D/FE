import { expect, test, type Page } from "@playwright/test";
import { googleFixtureBundle } from "../fixtures/google/build.mjs";

let bundle: string;
const authentication = { accessToken: "test-access", refreshToken: "test-refresh", user: { id: "google-user", email: "google@fire3d.test", fullName: "Google User", role: "Trainee", organizationId: null } };
const proof = () => ({ token: "mock-onboarding-proof", expiresAt: new Date(Date.now() + 60_000).toISOString(), email: "google@fire3d.test", displayName: "Google User" });

test.beforeAll(async () => { bundle = await googleFixtureBundle(); });

async function openFixture(page: Page, result: unknown, query = "", status = 200) {
  // Bundle real LoginForm + AuthSessionProvider, replacing only Firebase and Next router.
  await page.route("**/google-test**", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<meta charset="utf-8"><div id="root"></div><script src="/google-fixture.js"></script>' }));
  await page.route("**/google-fixture.js", (route) => route.fulfill({ contentType: "text/javascript; charset=utf-8", body: bundle }));
  await page.route("**/api/auth/login-firebase", (route) => route.fulfill({ status, json: result }));
  await page.goto(`/google-test${query}`);
  await page.getByRole("button", { name: "Tiếp tục với Google" }).click();
}

async function noSession(page: Page) {
  expect(await page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).toBeNull();
}

test("status-only onboarding renders both account types and blocks completion without a session", async ({ page }) => {
  let completionCalls = 0;
  await page.route("**/api/auth/google/onboarding/complete", () => { completionCalls++; });
  await openFixture(page, { status: "OnboardingRequired" });
  await expect(page.getByRole("heading", { name: "Hoàn thiện tài khoản Google" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
  await expect(page.getByText(/Hiện chưa thể tạo tài khoản Google/)).toBeVisible();
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Mã OTP")).toHaveCount(0);
  await page.getByRole("radio", { name: /Tổ chức/ }).check();
  await expect(page.getByLabel("Địa chỉ tổ chức")).toBeVisible();
  await noSession(page);
  expect(completionCalls).toBe(0);
  await page.getByRole("button", { name: "Đăng ký bằng email" }).click();
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toBeVisible();
});

for (const accountType of ["trainee", "organization"] as const) {
  test(`valid proof completes ${accountType} and stores only the authenticated Fire3D session`, async ({ page }) => {
    let request: unknown;
    await page.route("**/api/auth/google/onboarding/complete", async (route) => {
      request = route.request().postDataJSON();
      await route.fulfill({ json: { status: "Authenticated", authentication: { ...authentication, user: { ...authentication.user, role: accountType === "trainee" ? "Trainee" : "OrganizationUser", organizationId: accountType === "organization" ? "org-1" : null } } } });
    });
    await openFixture(page, { status: "OnboardingRequired", onboarding: proof() }, "?next=https://evil.test");
    await noSession(page);
    if (accountType === "trainee") await page.getByLabel("Tên người dùng").fill("google_user");
    else {
      await page.getByRole("radio", { name: /Tổ chức/ }).check();
      await page.getByLabel("Tên tổ chức").fill("FET3D Lab");
      await page.getByLabel("Địa chỉ tổ chức").fill("1 Test Street");
      await page.getByLabel("Điện thoại tổ chức").fill("+84123456789");
    }
    await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
    await expect.poll(() => request).toEqual(accountType === "trainee"
      ? { onboardingToken: "mock-onboarding-proof", accountType, username: "google_user" }
      : { onboardingToken: "mock-onboarding-proof", accountType, organizationName: "FET3D Lab", organizationAddress: "1 Test Street", organizationPhoneNumber: "+84123456789" });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).toBe(JSON.stringify({ accessToken: "test-access", refreshToken: "test-refresh" }));
    expect(await page.evaluate(() => Object.values(sessionStorage).join(" "))).not.toContain("mock-onboarding-proof");
    expect(page.url()).not.toContain("mock-onboarding-proof");
    await expect.poll(() => page.evaluate(() => (window as unknown as { googleTestDestinations: string[] }).googleTestDestinations.at(-1))).toBe(accountType === "trainee" ? "/learning-hub" : "/workspace/buildings");
  });
}

test("linked Google authenticates and checks the role before redirecting", async ({ page }) => {
  await openFixture(page, { status: "Authenticated", authentication }, "?next=/admin/accounts");
  await expect.poll(() => page.evaluate(() => (window as unknown as { googleTestDestinations: string[] }).googleTestDestinations.at(-1))).toBe("/learning-hub");
});

test("expired proof disables completion and can be refreshed by retrying Google", async ({ page }) => {
  await openFixture(page, { status: "OnboardingRequired", onboarding: { ...proof(), expiresAt: new Date(Date.now() - 1000).toISOString() } });
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
  await expect(page.getByText(/Xác minh đã hết hạn/)).toBeVisible();
  await noSession(page);
  await page.route("**/api/auth/login-firebase", (route) => route.fulfill({ json: { status: "OnboardingRequired", onboarding: proof() } }));
  await page.getByRole("button", { name: "Thử lại Google" }).click();
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeEnabled();
});

test("server expiry and field errors leave onboarding unauthenticated", async ({ page }) => {
  await page.route("**/api/auth/google/onboarding/complete", (route) => route.fulfill({ status: 409, json: { code: "USERNAME_EXISTS", title: "Tên đã có người dùng", errors: { username: ["Chọn tên khác"] } } }));
  await openFixture(page, { status: "OnboardingRequired", onboarding: proof() });
  await page.getByLabel("Tên người dùng").fill("used_name");
  await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
  await expect(page.getByText("Chọn tên khác")).toBeVisible();
  await noSession(page);
  await page.route("**/api/auth/google/onboarding/complete", (route) => route.fulfill({ status: 400, json: { code: "ONBOARDING_TOKEN_EXPIRED", title: "Expired" } }));
  await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("hết hạn");
  await noSession(page);
});

test("local email collision requires email login without automatic linking", async ({ page }) => {
  await openFixture(page, { code: "ACCOUNT_LINK_REQUIRED", title: "Link required" }, "", 409);
  await expect(page.getByRole("alert")).toContainText("Đăng nhập bằng email");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await noSession(page);
});

test("proof expiring while editing disables completion", async ({ page }) => {
  await page.clock.install({ time: new Date() });
  await openFixture(page, { status: "OnboardingRequired", onboarding: { ...proof(), expiresAt: new Date(Date.now() + 5000).toISOString() } });
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeEnabled();
  await page.clock.fastForward(6000);
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
  await noSession(page);
});

test("invalid proof fails closed and completion network failure can retry", async ({ page }) => {
  await openFixture(page, { status: "OnboardingRequired", onboarding: { ...proof(), token: 42 } });
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
  await page.route("**/api/auth/login-firebase", (route) => route.fulfill({ json: { status: "OnboardingRequired", onboarding: proof() } }));
  await page.getByRole("button", { name: "Thử lại Google" }).click();
  await page.getByLabel("Tên người dùng").fill("network_user");
  await page.route("**/api/auth/google/onboarding/complete", (route) => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
  await expect(page.getByRole("alert")).toContainText("Kiểm tra mạng");
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeEnabled();
  await noSession(page);
});

for (const [code, text] of [["auth/popup-closed-by-user", "hủy đăng nhập"], ["auth/network-request-failed", "Kiểm tra mạng"], ["auth/popup-blocked", "chặn cửa sổ"]]) {
  test(`provider failure ${code} remains recoverable without a session`, async ({ page }) => {
    await openFixture(page, { status: "OnboardingRequired" }, `?providerError=${encodeURIComponent(code)}`);
    await expect(page.getByRole("alert")).toContainText(text);
    await expect(page.getByRole("button", { name: "Tiếp tục với Google" })).toBeEnabled();
    await noSession(page);
  });
}

test("cancelling Google retry keeps onboarding recoverable and discards the old proof", async ({ page }) => {
  await openFixture(page, { status: "OnboardingRequired", onboarding: proof() });
  await page.evaluate(() => history.replaceState(null, "", "?providerError=auth%2Fpopup-closed-by-user"));
  await page.getByRole("button", { name: "Thử lại Google" }).click();
  await expect(page.getByRole("heading", { name: "Hoàn thiện tài khoản Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Thử lại Google" })).toBeEnabled();
  await noSession(page);
});

test("completion without valid authentication never creates a session", async ({ page }) => {
  await openFixture(page, { status: "OnboardingRequired", onboarding: proof() });
  await page.getByLabel("Tên người dùng").fill("valid_user");
  await page.route("**/api/auth/google/onboarding/complete", (route) => route.fulfill({ json: { status: "Authenticated", authentication: { ...authentication, accessToken: 42 } } }));
  await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
  await expect(page.getByRole("alert")).toContainText("phiên đăng nhập hợp lệ");
  await noSession(page);
});
