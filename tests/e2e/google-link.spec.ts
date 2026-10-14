/**
 * Explicit Google link and first local password in the profile (FR-AUTH-08, FR-AUTH-10).
 * Evidence level: the real AccountProfile + AuthSessionProvider are bundled with a mock Firebase identity
 * (tests/fixtures/google) and the Fire3D API is a stateful Playwright route mock of GoogleLinkController and
 * GooglePasswordController. It does not prove Firebase, the deployed API or the provider.
 */
import { expect, test, type Page } from "@playwright/test";
import { googleFixtureBundle } from "../fixtures/google/build.mjs";

let bundle: string;
test.beforeAll(async () => { bundle = await googleFixtureBundle("account-entry.tsx"); });

type Server = {
  user: Record<string, unknown>;
  revoked: boolean;
  linkedUid: string | null;
  linkCalls: { auth: string | undefined; body: Record<string, unknown> }[];
  passwordCalls: { auth: string | undefined; body: Record<string, unknown> }[];
  meCalls: number;
  hasPassword: boolean;
  delayMs: number;
};

const localUser = { id: "u-1", email: "trainee@fire3d.test", fullName: "Học Viên", username: "hoc.vien", role: "Trainee", organizationId: null, profileRevision: 3, hasLocalLogin: true, googleLinked: false };
const problem = (status: number, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => ({ status, headers, json: { title: "Lỗi từ máy chủ (English text must not be shown)", status, code, traceId: "t-1", ...extra } });

async function openProfile(page: Page, user: Record<string, unknown> = localUser, query = "") {
  const server: Server = { user: { ...user }, revoked: false, linkedUid: user.googleLinked ? "uid-own" : null, linkCalls: [], passwordCalls: [], meCalls: 0, hasPassword: user.hasLocalLogin !== false, delayMs: 0 };
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "link-access", refreshToken: "link-refresh" })));
  await page.route("**/account-test**", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<meta charset="utf-8"><div id="root"></div><script src="/account-fixture.js"></script>' }));
  await page.route("**/account-fixture.js", (route) => route.fulfill({ contentType: "text/javascript; charset=utf-8", body: bundle }));
  await page.route("**/api/auth/me", async (route) => {
    server.meCalls++;
    if (server.revoked) return route.fulfill(problem(401, "UNAUTHORIZED"));
    return route.fulfill({ json: server.user, headers: { ETag: `"${server.user.profileRevision}"` } });
  });
  await page.route("**/api/me/link-google", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    server.linkCalls.push({ auth: await route.request().headerValue("authorization") ?? undefined, body });
    if (server.delayMs) await new Promise((resolve) => setTimeout(resolve, server.delayMs));
    const uid = String(body.idToken);
    if (body.currentPassword === "wrong-pass") return route.fulfill(problem(401, "INVALID_CURRENT_PASSWORD"));
    if (uid === "uid-validation") return route.fulfill(problem(400, "VALIDATION_ERROR", { errors: { currentPassword: ["Mật khẩu hiện tại là bắt buộc."] } }));
    if (uid === "uid-other") return route.fulfill(problem(409, "GOOGLE_ALREADY_LINKED"));
    if (uid === "uid-replace") return route.fulfill(problem(409, "GOOGLE_ACCOUNT_REPLACEMENT_FORBIDDEN"));
    if (uid === "uid-reset") return route.fulfill(problem(409, "PASSWORD_RESET_PENDING"));
    if (uid === "uid-invalid") return route.fulfill(problem(401, "INVALID_FIREBASE_TOKEN"));
    if (uid === "uid-503") return route.fulfill(problem(503, "GOOGLE_PROVIDER_UNAVAILABLE", {}, { "Retry-After": "2" }));
    if (uid === "uid-429") return route.fulfill(problem(429, "RATE_LIMITED", {}, { "Retry-After": "2" }));
    if (uid === "uid-unverified") return route.fulfill(problem(403, "EMAIL_NOT_VERIFIED"));
    if (uid === "uid-abort") return route.abort("connectionreset");
    if (server.linkedUid === uid) return route.fulfill({ json: { user: server.user, alreadyLinked: true, requiresLogin: false }, headers: { ETag: `"${server.user.profileRevision}"` } });
    server.linkedUid = uid; server.revoked = true;
    server.user = { ...server.user, googleLinked: true, profileRevision: Number(server.user.profileRevision) + 1 };
    return route.fulfill({ json: { user: server.user, alreadyLinked: false, requiresLogin: true }, headers: { ETag: `"${server.user.profileRevision}"` } });
  });
  await page.route("**/api/me/password", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    server.passwordCalls.push({ auth: await route.request().headerValue("authorization") ?? undefined, body });
    const uid = String(body.idToken);
    if (uid === "uid-recent") return route.fulfill(problem(401, "RECENT_LOGIN_REQUIRED"));
    if (uid === "uid-invalid") return route.fulfill(problem(401, "INVALID_FIREBASE_TOKEN"));
    if (uid === "uid-reset") return route.fulfill(problem(409, "PASSWORD_RESET_PENDING"));
    if (uid === "uid-503") return route.fulfill(problem(503, "GOOGLE_PROVIDER_UNAVAILABLE", {}, { "Retry-After": "2" }));
    if (uid === "uid-weak") return route.fulfill(problem(400, "VALIDATION_ERROR", { errors: { newPassword: ["Mật khẩu quá yếu."] } }));
    if (uid === "uid-set") { server.user = { ...server.user, hasLocalLogin: true, profileRevision: Number(server.user.profileRevision) + 1 }; server.hasPassword = true; return route.fulfill(problem(409, "PASSWORD_ALREADY_SET")); }
    if (server.hasPassword) return route.fulfill(problem(409, "PASSWORD_ALREADY_SET"));
    server.hasPassword = true; server.revoked = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto(`/account-test${query}`);
  return server;
}

const identity = (page: Page, uid: string) => page.evaluate((value) => { (window as unknown as { googleTestIdentity?: string }).googleTestIdentity = value; }, uid);
const popups = (page: Page) => page.evaluate(() => (window as unknown as { googleTestPopups?: number }).googleTestPopups ?? 0);
const destinations = (page: Page) => page.evaluate(() => (window as unknown as { googleTestDestinations: string[] }).googleTestDestinations);
const panel = (page: Page) => page.getByTestId("google-link-panel");
const sessionTokens = (page: Page) => page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"));

async function submitLink(page: Page, password = "S3cret-pass") {
  await panel(page).getByLabel("Mật khẩu hiện tại", { exact: true }).fill(password);
  await panel(page).getByRole("button", { name: "Xác thực Google và liên kết" }).click();
}

test.describe("link Google", () => {
  test("success sends Bearer + password + idToken, revokes the local session and routes to login with a notice", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (message) => logs.push(message.text()));
    const server = await openProfile(page);
    await expect(panel(page).getByText("Chưa liên kết Google")).toBeVisible();
    await identity(page, "uid-new");
    await submitLink(page);
    await expect.poll(() => destinations(page)).toEqual(["/login?notice=google-linked"]);
    expect(server.linkCalls).toHaveLength(1);
    expect(server.linkCalls[0]).toEqual({ auth: "Bearer link-access", body: { idToken: "uid-new", currentPassword: "S3cret-pass" } });
    expect(await sessionTokens(page)).toBeNull();
    // The token and the password never reach storage, the URL or the console.
    const stored = await page.evaluate(() => JSON.stringify([Object.entries(sessionStorage), Object.entries(localStorage)]));
    for (const secret of ["uid-new", "S3cret-pass"]) {
      expect(stored).not.toContain(secret);
      expect(page.url()).not.toContain(secret);
      expect(logs.join("\n")).not.toContain(secret);
    }
    expect(await page.evaluate(() => document.body.innerText)).not.toContain("uid-new");
  });

  test("login page explains why the session ended", async ({ page }) => {
    await page.goto("/login?notice=google-linked");
    await expect(page.getByRole("status").filter({ hasText: "Google đã được liên kết" })).toContainText("đăng nhập lại");
    await page.goto("/login?notice=password-set");
    await expect(page.getByRole("status").filter({ hasText: "Mật khẩu Fire3D đã được đặt" })).toBeVisible();
    await page.goto("/login?notice=unknown");
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("empty password is rejected locally without opening Google or calling the API", async ({ page }) => {
    const server = await openProfile(page);
    await panel(page).getByRole("button", { name: "Xác thực Google và liên kết" }).click();
    await expect(panel(page).getByText("Nhập mật khẩu hiện tại.")).toBeVisible();
    expect(await popups(page)).toBe(0);
    expect(server.linkCalls).toHaveLength(0);
  });

  test("wrong current password stays on the field, keeps the session and does not link", async ({ page }) => {
    const server = await openProfile(page);
    await submitLink(page, "wrong-pass");
    await expect(panel(page).getByText("Mật khẩu hiện tại không đúng.")).toBeVisible();
    expect(await sessionTokens(page)).not.toBeNull();
    expect(await destinations(page)).toEqual([]);
    await expect(panel(page).getByText("Chưa liên kết Google")).toBeVisible();
    expect(server.linkCalls).toHaveLength(1);
  });

  for (const [uid, text] of [
    ["uid-other", "đã được liên kết với một tài khoản Fire3D khác"],
    ["uid-replace", "không cho thay thế"],
    ["uid-reset", "yêu cầu khôi phục mật khẩu chưa hoàn tất"],
    ["uid-invalid", "Xác thực Google không hợp lệ hoặc đã hết hạn"],
    ["uid-unverified", "chưa được xác minh"],
    ["uid-validation", "Mật khẩu hiện tại là bắt buộc."],
  ] as const) {
    test(`${uid} shows a Vietnamese reason and keeps the session`, async ({ page }) => {
      await openProfile(page);
      await identity(page, uid);
      await submitLink(page);
      await expect(panel(page).getByRole("alert").filter({ hasText: text }).first()).toBeVisible();
      await expect(panel(page)).not.toContainText("English text");
      expect(await sessionTokens(page)).not.toBeNull();
      expect(await destinations(page)).toEqual([]);
    });
  }

  for (const uid of ["uid-503", "uid-429"]) {
    test(`${uid} disables the action for Retry-After then allows a retry`, async ({ page }) => {
      const server = await openProfile(page);
      await identity(page, uid);
      await submitLink(page);
      await expect(panel(page).getByText(/Có thể thử lại sau \d+ giây/)).toBeVisible();
      await expect(panel(page).getByRole("button", { name: "Xác thực Google và liên kết" })).toBeDisabled();
      await expect(panel(page).getByRole("button", { name: "Xác thực Google và liên kết" })).toBeEnabled({ timeout: 6000 });
      await identity(page, "uid-new");
      await panel(page).getByRole("button", { name: "Xác thực Google và liên kết" }).click();
      await expect.poll(() => destinations(page)).toEqual(["/login?notice=google-linked"]);
      expect(server.linkCalls.map((call) => call.body.idToken)).toEqual([uid, "uid-new"]);
    });
  }

  test("closing the Google popup shows the provider message and never calls the API", async ({ page }) => {
    const server = await openProfile(page, localUser, "?providerError=auth%2Fpopup-closed-by-user");
    await submitLink(page);
    await expect(panel(page).getByRole("alert")).toContainText("hủy đăng nhập Google");
    expect(server.linkCalls).toHaveLength(0);
    await page.evaluate(() => history.replaceState(null, "", "/account-test"));
    await identity(page, "uid-new");
    await panel(page).getByRole("button", { name: "Xác thực Google và liên kết" }).click();
    await expect.poll(() => destinations(page)).toEqual(["/login?notice=google-linked"]);
  });

  test("a double click opens Google and calls the API once; the late response still ends the session", async ({ page }) => {
    const server = await openProfile(page);
    server.delayMs = 800;
    await identity(page, "uid-slow");
    await panel(page).getByLabel("Mật khẩu hiện tại", { exact: true }).fill("S3cret-pass");
    const button = panel(page).getByRole("button", { name: "Xác thực Google và liên kết" });
    await button.dblclick();
    await expect(panel(page).getByRole("button", { name: "Đang xác thực…" })).toBeDisabled();
    await expect.poll(() => destinations(page)).toEqual(["/login?notice=google-linked"]);
    expect(await popups(page)).toBe(1);
    expect(server.linkCalls).toHaveLength(1);
  });

  test("replaying the same Google account reports it as already linked and keeps the session", async ({ page }) => {
    const server = await openProfile(page);
    await expect.poll(() => server.meCalls).toBeGreaterThanOrEqual(2); // session restore + profile load are done
    server.linkedUid = "uid-same"; // server already linked it (for example the first response was lost)
    server.user = { ...server.user, googleLinked: true };
    await identity(page, "uid-same");
    await submitLink(page);
    await expect(panel(page).getByText("đã được liên kết từ trước")).toBeVisible();
    await expect(panel(page).getByText("Đã liên kết Google").first()).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Xác thực Google và liên kết" })).toHaveCount(0);
    expect(await destinations(page)).toEqual([]);
    expect(await sessionTokens(page)).not.toBeNull();
  });

  test("a lost response says the outcome is unknown and, after reload, the revoked session asks for login", async ({ page }) => {
    const server = await openProfile(page);
    await identity(page, "uid-abort");
    await submitLink(page);
    await expect(panel(page).getByRole("alert")).toContainText("Không nhận được phản hồi");
    expect(await destinations(page)).toEqual([]);
    server.revoked = true; // the server did finish and revoke everything
    await page.reload();
    await expect(page.getByText("Bạn cần đăng nhập để xem trang này.")).toBeVisible();
  });

  test("an already-linked account shows its status with no link form, and reload restores it from the server", async ({ page }) => {
    await openProfile(page, { ...localUser, googleLinked: true });
    await expect(panel(page).getByText("Đã liên kết Google").first()).toBeVisible();
    await expect(panel(page).getByLabel("Mật khẩu hiện tại")).toHaveCount(0);
    await page.reload();
    await expect(panel(page).getByText("Đã liên kết Google").first()).toBeVisible();
  });

  test("the panel stays hidden when the API does not report the link state", async ({ page }) => {
    await openProfile(page, { ...localUser, googleLinked: undefined, hasLocalLogin: undefined });
    await expect(page.getByRole("heading", { name: "Bảo mật" })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });
});

test.describe("first local password for a Google-only account", () => {
  const googleOnly = { ...localUser, hasLocalLogin: false, googleLinked: true };

  async function submitPassword(page: Page, password = "Matkhau-moi1", confirm = password) {
    await panel(page).getByLabel("Mật khẩu mới", { exact: true }).fill(password);
    await panel(page).getByLabel("Xác nhận mật khẩu mới", { exact: true }).fill(confirm);
    await panel(page).getByRole("button", { name: "Xác thực Google và đặt mật khẩu" }).click();
  }

  test("replaces change-password with set-password, revokes sessions and routes to login", async ({ page }) => {
    const server = await openProfile(page, googleOnly);
    await expect(panel(page).getByText("Chỉ đăng nhập bằng Google")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bảo mật" })).toHaveCount(0);
    await expect(page.getByLabel("Mật khẩu hiện tại")).toHaveCount(0);
    await identity(page, "uid-own");
    await submitPassword(page);
    await expect.poll(() => destinations(page)).toEqual(["/login?notice=password-set"]);
    expect(server.passwordCalls).toEqual([{ auth: "Bearer link-access", body: { idToken: "uid-own", newPassword: "Matkhau-moi1" } }]);
    expect(await sessionTokens(page)).toBeNull();
    expect(await page.evaluate(() => JSON.stringify([Object.entries(sessionStorage), Object.entries(localStorage)]))).not.toContain("Matkhau-moi1");
  });

  test("validates length and confirmation locally before opening Google", async ({ page }) => {
    const server = await openProfile(page, googleOnly);
    await submitPassword(page, "abc", "abc");
    await expect(panel(page).getByText("từ 6 đến 128 ký tự", { exact: false }).last()).toBeVisible();
    await submitPassword(page, "Matkhau-moi1", "Khac-hoan-toan");
    await expect(panel(page).getByText("Xác nhận mật khẩu chưa khớp.")).toBeVisible();
    expect(await popups(page)).toBe(0);
    expect(server.passwordCalls).toHaveLength(0);
  });

  test("PASSWORD_ALREADY_SET reloads the profile and brings back change-password", async ({ page }) => {
    await openProfile(page, googleOnly);
    await identity(page, "uid-set");
    await submitPassword(page);
    await expect(page.getByRole("heading", { name: "Bảo mật" })).toBeVisible();
    await expect(panel(page).getByText("Tài khoản đã có mật khẩu")).toBeVisible();
    expect(await destinations(page)).toEqual([]);
    expect(await sessionTokens(page)).not.toBeNull();
  });

  for (const [uid, text] of [
    ["uid-recent", "đăng nhập Google lại trong vòng 5 phút"],
    ["uid-invalid", "đúng tài khoản Google đã liên kết"],
    ["uid-reset", "yêu cầu khôi phục mật khẩu chưa hoàn tất"],
    ["uid-weak", "Mật khẩu quá yếu."],
  ] as const) {
    test(`${uid} keeps the form and session`, async ({ page }) => {
      await openProfile(page, googleOnly);
      await identity(page, uid);
      await submitPassword(page);
      await expect(panel(page).getByText(text).first()).toBeVisible();
      await expect(panel(page).getByLabel("Mật khẩu mới", { exact: true })).toHaveValue("Matkhau-moi1");
      expect(await sessionTokens(page)).not.toBeNull();
    });
  }

  test("provider outage honours Retry-After", async ({ page }) => {
    await openProfile(page, googleOnly);
    await identity(page, "uid-503");
    await submitPassword(page);
    await expect(panel(page).getByRole("button", { name: "Xác thực Google và đặt mật khẩu" })).toBeDisabled();
    await expect(panel(page).getByRole("button", { name: "Xác thực Google và đặt mật khẩu" })).toBeEnabled({ timeout: 6000 });
  });
});

test.describe("layout on the real profile page", () => {
  // Real Next page: Firebase is not configured here, so the action is disabled with an explanation. Layout only.
  const owner = { id: "o-1", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", role: 1, organizationId: "org-1", profileRevision: 2 };
  for (const [label, flags] of [["unlinked", { hasLocalLogin: true, googleLinked: false }], ["google-only", { hasLocalLogin: false, googleLinked: true }], ["linked", { hasLocalLogin: true, googleLinked: true }]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      for (const width of [375, 1440]) {
        test(`${label} has no horizontal overflow in ${scheme} at ${width}px`, async ({ page }, testInfo) => {
          await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "a", refreshToken: "r" })));
          await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...owner, ...flags }, headers: { ETag: '"2"' } }));
          await page.route("**/api/organizations/me", (route) => route.fulfill({ json: { id: "org-1", name: "Fire3D Lab", slug: "f", address: "Đà Nẵng", phoneNumber: "+842361234567", isActive: true, profileRevision: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }, headers: { ETag: '"1"' } }));
          await page.emulateMedia({ colorScheme: scheme });
          await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
          await page.goto("/workspace/profile");
          const section = page.getByTestId("google-link-panel");
          await expect(section).toBeVisible();
          await expect(section.getByText(label === "google-only" ? "Chỉ đăng nhập bằng Google" : label === "linked" ? "Đã liên kết Google" : "Chưa liên kết Google", { exact: true })).toBeVisible();
          // The build may or may not carry a public Firebase config (.env): only when it does not, the Google button is locked with an explanation.
          if (label !== "linked" && (await section.getByText("Google chưa được cấu hình").count()) > 0) await expect(section.getByRole("button", { name: /Xác thực Google/ })).toBeDisabled();
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await section.scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`google-${label}-${scheme}-${width}.png`) });
        });
      }
    }
  }
});
