import { expect, test, type Page } from "@playwright/test";
import { storedSession } from "./session";

import { accessTokenExpiry } from "../../src/features/auth/token-expiry";
import { installTrainingBackend, signInAs, TrainingBackend } from "./training-history-mock";

/*
 * fix/fe-polish: proactive access-token refresh, Retry-After countdown on retry buttons, EmptyState heading level,
 * URL filters changed in quick succession, live refresh of the Trainee history. Route MOCKS only.
 */

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "owner", role: 1, organizationId: "org-1", profileRevision: 1 };

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** A JWT-shaped token whose payload carries `exp`; the signature is irrelevant to the client. */
const jwt = (expSeconds: number, tag: string) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: owner.id, exp: expSeconds, tag })}.sig-${tag}`;

async function seed(page: Page, accessToken: string) {
  await page.addInitScript(([access]) => {
    if (!sessionStorage.getItem("__polish_seeded")) {
      sessionStorage.setItem("__polish_seeded", "1");
      sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: access, refreshToken: "refresh-1" }));
    }
  }, [accessToken]);
}

async function mockOrg(page: Page, buildings: () => { status: number; headers?: Record<string, string>; json: unknown }) {
  const authHeaders: string[] = [];
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
  await page.route("**/api/buildings?*", (route) => {
    authHeaders.push(route.request().headers()["authorization"] ?? "");
    const answer = buildings();
    return route.fulfill({ status: answer.status, headers: answer.headers, contentType: "application/json", body: JSON.stringify(answer.json) });
  });
  await page.route("**/api/organizations/me", (route) => route.fulfill({ json: { id: "org-1", name: "Tổ chức 1", slug: "org-1", address: "", phoneNumber: "", isActive: true, revision: 1 }, headers: { ETag: '"1"' } }));
  return authHeaders;
}

const emptyPage = () => ({ status: 200, json: { items: [], totalCount: 0, page: 1, pageSize: 20 } });

test.describe("access token refresh during the session", () => {
  test("accessTokenExpiry reads exp from a JWT and refuses anything else", () => {
    expect(accessTokenExpiry(jwt(1_800_000_000, "a"))).toBe(1_800_000_000_000);
    expect(accessTokenExpiry("not-a-jwt")).toBeNull();
    expect(accessTokenExpiry(`${b64url({})}.${b64url({ exp: "soon" })}.x`)).toBeNull();
  });

  test("a token close to expiry is renewed before it lapses and the next request carries the new token", async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const first = jwt(now + 62, "first");
    const second = jwt(now + 3600, "second");
    let refreshCalls = 0;
    await seed(page, first);
    const headers = await mockOrg(page, emptyPage);
    await page.route("**/api/auth/refresh", (route) => {
      refreshCalls += 1;
      expect(route.request().postDataJSON()).toEqual({ refreshToken: "refresh-1" });
      return route.fulfill({ json: { accessToken: second, refreshToken: "refresh-2", user: owner } });
    });
    await page.goto("/workspace/buildings");
    await expect(page.getByRole("heading", { level: 1, name: "Công trình" })).toBeVisible();
    await expect.poll(() => storedSession(page).then((raw) => JSON.parse(raw ?? "{}").accessToken), { timeout: 10_000 }).toBe(second);
    expect(refreshCalls).toBe(1);
    // The next request after a full reload is made with the renewed token read back from the stored session.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Công trình" })).toBeVisible();
    await expect.poll(() => headers.at(-1)).toBe(`Bearer ${second}`);
  });

  test("a rejected refresh ends the session instead of leaving a dead token behind", async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    await seed(page, jwt(now + 61, "dying"));
    await mockOrg(page, emptyPage);
    await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: { title: "Unauthorized", code: "REFRESH_TOKEN_INVALID" } }));
    await page.goto("/workspace/buildings");
    await expect.poll(() => storedSession(page), { timeout: 10_000 }).toBeNull();
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true }).first()).toBeVisible();
  });

  test("a transient refresh failure keeps the current session", async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(now + 61, "keep");
    let calls = 0;
    await seed(page, token);
    await mockOrg(page, emptyPage);
    await page.route("**/api/auth/refresh", (route) => { calls += 1; return route.fulfill({ status: 503, json: { title: "Unavailable" } }); });
    await page.goto("/workspace/buildings");
    await expect.poll(() => calls, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(await storedSession(page).then((raw) => JSON.parse(raw ?? "{}").accessToken)).toBe(token);
    await expect(page.getByRole("heading", { level: 1, name: "Công trình" })).toBeVisible();
  });
});

test("retry waits for the server's Retry-After window before it can be pressed", async ({ page }) => {
  let failures = 1;
  await seed(page, "plain-token");
  await mockOrg(page, () => (failures-- > 0 ? { status: 429, headers: { "Retry-After": "2" }, json: { title: "Too many", code: "RATE_LIMITED" } } : emptyPage()));
  await page.goto("/workspace/buildings");
  const retry = page.getByTestId("retry-button").first();
  await expect(retry).toBeDisabled();
  await expect(retry).toContainText(/sau [12] giây/);
  await expect(retry).toBeEnabled({ timeout: 5_000 });
  await expect(retry).toHaveText("Thử lại");
  await retry.click();
  await expect(page.getByTestId("retry-button")).toHaveCount(0);
});

test("EmptyState titles are level-2 headings (no skipped heading level under the page h1)", async ({ page }) => {
  await seed(page, "plain-token");
  await mockOrg(page, emptyPage);
  await page.goto("/workspace/buildings");
  const title = page.locator(".ops-empty-title").first();
  await expect(title).toBeVisible();
  expect(await title.evaluate((node) => node.tagName)).toBe("H2");
});

test("two URL filters changed before the router settles both survive", async ({ page }) => {
  await seed(page, "plain-token");
  await mockOrg(page, emptyPage);
  await page.goto("/workspace/buildings");
  // Open the status chip so its options exist, then fire both changes in the same task, before Next applies the first navigation.
  await page.getByRole("button", { name: /^Trạng thái:/ }).click();
  const second = "archived";
  await page.evaluate((value) => {
    document.querySelector<HTMLButtonElement>(`[role=listbox][aria-label="Trạng thái"] [role=option][data-value="${value}"]`)!.click();
    document.querySelector<HTMLButtonElement>('button[aria-label="Dạng thẻ"]')!.click();
  }, second);
  await expect(page).toHaveURL(/view=cards/);
  await expect(page).toHaveURL(new RegExp(`status=${second}`));
});

test("Trainee history re-reads a running session on its own (visible tab, drawer closed)", async ({ page }) => {
  await page.clock.install();
  const backend = new TrainingBackend();
  backend.add({ id: "aaaaaaaa-0000-4000-8000-000000000005", status: "Running", mode: "Guided", startedAt: "2026-10-10T09:00:00Z", training: "Luyện thoát hiểm" });
  await signInAs(page, backend, "trainee");
  await installTrainingBackend(page, backend);
  await page.goto("/learning-hub?view=history");
  await expect(page.getByText("Luyện thoát hiểm").first()).toBeVisible();
  const before = backend.calls.filter((call) => call.path === "/api/training/sessions").length;
  await page.clock.runFor(16_000);
  await expect.poll(() => backend.calls.filter((call) => call.path === "/api/training/sessions").length).toBeGreaterThan(before);
});
