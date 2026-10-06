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
      await route.fulfill({ status: 201, json: { status: "Authenticated", authentication: { ...authentication, user: { ...authentication.user, role: accountType === "trainee" ? "Trainee" : "OrganizationUser", organizationId: accountType === "organization" ? "org-1" : null } } } });
    });
    await openFixture(page, { status: "OnboardingRequired", onboarding: { ...proof(), displayName: null } }, "?next=https://evil.test");
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
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tiếp tục với Google", exact: true })).toBeEnabled();
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

for (const failure of ["ONBOARDING_ALREADY_COMPLETED", "IDEMPOTENCY_KEY_CONFLICT", "lost-response"] as const) {
  test(`${failure} recovers after a Google click without another completion`, async ({ page }) => {
    let calls = 0;
    await openFixture(page, { status: "OnboardingRequired", onboarding: proof() }, "?next=/learn/tu-bai-doc-den-luot-tap");
    await page.getByLabel("Tên người dùng").fill("recovery_user");
    await page.route("**/api/auth/google/onboarding/complete", (route) => {
      calls++;
      return failure === "lost-response" ? route.abort("internetdisconnected") : route.fulfill({ status: 409, json: { code: failure, title: "Complete conflict" } });
    });
    await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
    await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
    await noSession(page);
    await page.route("**/api/auth/login-firebase", (route) => route.fulfill({ json: { status: "Authenticated", authentication } }));
    await page.getByRole("button", { name: "Tiếp tục với Google", exact: true }).click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).not.toBeNull();
    await expect.poll(() => page.evaluate(() => (window as unknown as { googleTestDestinations: string[] }).googleTestDestinations.at(-1))).toBe("/learn/tu-bai-doc-den-luot-tap");
    expect(calls).toBe(1);
  });
}

for (const [code, status, header, seconds] of [
  ["ONBOARDING_RETRY_REQUIRED", 503, "2", 2],
  ["ONBOARDING_RETRY_REQUIRED", 503, "invalid", 1],
  ["GOOGLE_ONBOARDING_RATE_LIMITED", 429, "2", 2],
  ["GOOGLE_ONBOARDING_RATE_LIMITED", 429, undefined, 60],
] as const) {
  test(`${code} waits ${seconds}s with Retry-After ${header}`, async ({ page }) => {
    await page.clock.install();
    await openFixture(page, { status: "OnboardingRequired", onboarding: { ...proof(), expiresAt: new Date(Date.now() + 120_000).toISOString() } });
    await page.getByLabel("Tên người dùng").fill("waiting_user");
    let calls = 0;
    await page.route("**/api/auth/google/onboarding/complete", (route) => {
      calls++;
      return route.fulfill({ status, headers: header ? { "Retry-After": header } : {}, json: { code, title: "Wait" } });
    });
    await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
    await expect(page.getByText(`Có thể thử lại sau ${seconds} giây.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Thử lại Google" })).toBeDisabled();
    await page.clock.fastForward(seconds * 1000 + 300);
    await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeEnabled();
    await expect(page.getByLabel("Tên người dùng")).toHaveValue("waiting_user");
    expect(calls).toBe(1);
    await noSession(page);
  });
}

test("recovery cancellation keeps Google available and a new identity clears the form", async ({ page }) => {
  await openFixture(page, { status: "OnboardingRequired", onboarding: proof() });
  await page.getByLabel("Tên người dùng").fill("old_user");
  await page.route("**/api/auth/google/onboarding/complete", (route) => route.fulfill({ status: 409, json: { code: "ONBOARDING_ALREADY_COMPLETED" } }));
  await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
  await page.evaluate(() => history.replaceState(null, "", "?providerError=auth%2Fpopup-closed-by-user"));
  await page.getByRole("button", { name: "Tiếp tục với Google", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("hủy đăng nhập");
  await expect(page.getByRole("button", { name: "Tiếp tục với Google", exact: true })).toBeEnabled();
  await page.evaluate(() => history.replaceState(null, "", "/google-test"));
  await page.route("**/api/auth/login-firebase", (route) => route.fulfill({ json: { status: "OnboardingRequired", onboarding: { ...proof(), email: "other@fire3d.test" } } }));
  await page.getByRole("button", { name: "Tiếp tục với Google", exact: true }).click();
  await expect(page.getByText("Đang hoàn thiện cho other@fire3d.test")).toBeVisible();
  await expect(page.getByLabel("Tên người dùng")).toHaveValue("");
  await noSession(page);
});

test("proof expiry during cooldown still requires Google verification", async ({ page }) => {
  await page.clock.install();
  await openFixture(page, { status: "OnboardingRequired", onboarding: { ...proof(), expiresAt: new Date(Date.now() + 3000).toISOString() } });
  await page.getByLabel("Tên người dùng").fill("expiry_user");
  await page.route("**/api/auth/google/onboarding/complete", (route) => route.fulfill({ status: 503, headers: { "Retry-After": "5" }, json: { code: "ONBOARDING_RETRY_REQUIRED" } }));
  await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
  await page.clock.fastForward(5500);
  await expect(page.getByRole("button", { name: "Hoàn tất tài khoản" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Thử lại Google" })).toBeEnabled();
  await noSession(page);
});

test("pending completion blocks duplicate submissions and disabled accounts never save a session", async ({ page }) => {
  await openFixture(page, { status: "OnboardingRequired", onboarding: proof() });
  await page.getByLabel("Tên người dùng").fill("pending_user");
  let calls = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/auth/google/onboarding/complete", async (route) => {
    calls++;
    await blocked;
    await route.fulfill({ status: 403, json: { code: "ACCOUNT_DISABLED" } });
  });
  await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
  await expect.poll(() => calls).toBe(1);
  await page.locator("form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  release();
  await expect(page.getByRole("alert")).toContainText("đã bị khóa");
  expect(calls).toBe(1);
  await noSession(page);
});

test("Google exchange rate limiting waits before another popup", async ({ page }) => {
  await page.clock.install();
  await openFixture(page, { status: "OnboardingRequired", onboarding: proof() });
  let calls = 0;
  await page.route("**/api/auth/login-firebase", (route) => {
    calls++;
    return route.fulfill({ status: 429, headers: { "Retry-After": "3" }, json: { code: "GOOGLE_ONBOARDING_RATE_LIMITED" } });
  });
  await page.getByRole("button", { name: "Thử lại Google" }).click();
  await expect(page.getByText("Có thể thử lại sau 3 giây.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại Google" })).toBeDisabled();
  await page.clock.fastForward(3500);
  await expect(page.getByRole("button", { name: "Thử lại Google" })).toBeEnabled();
  expect(calls).toBe(1);
  await noSession(page);
});

for (const width of [1440, 375]) {
  test(`recovery is accessible without horizontal overflow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await openFixture(page, { status: "OnboardingRequired", onboarding: proof() });
    const loginHtml = await (await page.request.get("/login")).text();
    const stylesheets = [...loginHtml.matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
    expect(stylesheets.length).toBeGreaterThan(0);
    for (const url of stylesheets) await page.addStyleTag({ url });
    await page.locator("#root").evaluate((root) => {
      root.className = "page-main login-page-main";
      root.style.display = "grid";
      root.style.justifyItems = "center";
    });
    await page.getByLabel("Tên người dùng").fill("visual_user");
    await page.route("**/api/auth/google/onboarding/complete", (route) => route.fulfill({ status: 409, json: { code: "ONBOARDING_ALREADY_COMPLETED" } }));
    await page.getByRole("button", { name: "Hoàn tất tài khoản" }).click();
    const recover = page.getByRole("button", { name: "Tiếp tục với Google", exact: true });
    await recover.scrollIntoViewIfNeeded();
    await recover.focus();
    await expect(recover).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`recovery-${width}.png`), fullPage: true });
  });
}
