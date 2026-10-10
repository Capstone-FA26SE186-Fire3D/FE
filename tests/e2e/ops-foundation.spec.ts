import { expect, test, type Page } from "@playwright/test";
import { parseFieldErrors, parseRetryAfter } from "../../src/api/errors";
import { stableStringify } from "../../src/api/idempotency";
import { nextPollDelay } from "../../src/api/use-polling";

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };

async function signIn(page: Page, user: typeof owner | typeof admin) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

const buildings = Array.from({ length: 3 }, (_, index) => ({ id: `b-${index}`, name: `Công trình ${index + 1}`, buildingType: "Trường học", totalFloors: 3, isActive: true, createdAt: "2026-10-05T00:00:00Z" }));

async function mockBuildings(page: Page) {
  await page.route("**/api/buildings?*", (route) => route.fulfill({ json: { items: buildings, totalCount: 3, page: 1, pageSize: 20 } }));
}

test.describe("API helpers", () => {
  test("parses ProblemDetails maps and {code,path,message} arrays", () => {
    expect(parseFieldErrors({ code: "VALIDATION_ERROR", errors: { phoneNumber: ["Trùng số"] } })).toEqual([{ code: "VALIDATION_ERROR", path: "phoneNumber", message: "Trùng số" }]);
    expect(parseFieldErrors({ issues: [], errors: [{ code: "REQUIRED", path: "$.goals[0]", message: "Thiếu" }, { message: "x" }, 5] })).toEqual([
      { code: "REQUIRED", path: "$.goals[0]", message: "Thiếu" },
      { code: "validation_error", path: "", message: "x" },
    ]);
    expect(parseFieldErrors(undefined)).toEqual([]);
    expect(parseFieldErrors("<html>502</html>")).toEqual([]);
  });

  test("reads Retry-After as seconds or HTTP date", () => {
    expect(parseRetryAfter("7")).toBe(7);
    expect(parseRetryAfter(" 0 ")).toBe(0);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
    const now = Date.parse("2026-10-10T00:00:00Z");
    expect(parseRetryAfter("Sat, 10 Oct 2026 00:00:30 GMT", now)).toBe(30);
    expect(parseRetryAfter("Fri, 09 Oct 2026 00:00:00 GMT", now)).toBe(0);
  });

  test("stable serialization ignores key order so retries keep the same idempotency key", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe(stableStringify({ a: { c: undefined, d: [1, { y: 2, z: 1 }] }, b: 1 }));
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });

  test("poll delay starts at the base interval, backs off on failure and honors Retry-After", () => {
    expect(nextPollDelay(3000, 0, 30000)).toBe(3000);
    expect(nextPollDelay(3000, 1, 30000)).toBe(6000);
    expect(nextPollDelay(3000, 2, 30000)).toBe(12000);
    expect(nextPollDelay(3000, 9, 30000)).toBe(30000);
    expect(nextPollDelay(3000, 1, 30000, 45)).toBe(45000);
    expect(nextPollDelay(3000, 1, 30000, 1)).toBe(3000);
  });
});

test.describe("theme", () => {
  test("follows the system by default, can be switched and is remembered", async ({ page }) => {
    await signIn(page, owner);
    await mockBuildings(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/workspace/buildings");
    const scope = page.locator(".ops-theme");
    await expect(scope).toHaveAttribute("data-theme", "system");
    await expect(scope).toHaveAttribute("data-resolved-theme", "light");
    const light = await scope.evaluate((node) => getComputedStyle(node).backgroundColor);

    await page.getByRole("button", { name: "Giao diện tối" }).click();
    await expect(scope).toHaveAttribute("data-theme", "dark");
    const dark = await scope.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(dark).not.toBe(light);

    await page.reload();
    await expect(page.locator(".ops-theme")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Giao diện tối" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Theo hệ thống" }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator(".ops-theme")).toHaveAttribute("data-resolved-theme", "dark");
  });

  test("tokens stay scoped to the operations area", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    expect(await page.locator(".ops-theme").count()).toBe(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(20, 23, 25)");
  });
});

test.describe("roles and deep links", () => {
  test("an OrganizationUser cannot open the admin area and sees no admin data requests", async ({ page }) => {
    await signIn(page, owner);
    let accountCalls = 0;
    await page.route("**/api/accounts**", (route) => { accountCalls++; return route.fulfill({ status: 403 }); });
    await page.goto("/admin/accounts");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    expect(accountCalls).toBe(0);
  });

  test("admin shell marks the current page and filters/pagination live in the URL", async ({ page }) => {
    await signIn(page, admin);
    const requests: URL[] = [];
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 100 } }));
    await page.route("**/api/accounts?*", (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const pageNumber = Number(url.searchParams.get("page") ?? 1);
      const items = Array.from({ length: 20 }, (_, index) => ({ id: `u-${pageNumber}-${index}`, email: `user${pageNumber}-${index}@fire3d.test`, fullName: `Người dùng ${pageNumber}-${index}`, role: 2, isActive: true, organizationId: null, lastLoginAt: null }));
      return route.fulfill({ json: { items, totalCount: 45, page: pageNumber, pageSize: 20 } });
    });

    await page.goto("/admin/accounts?page=2&q=user");
    await expect(page.getByRole("navigation", { name: "Quản trị hệ thống" }).getByRole("link", { name: "Tài khoản" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("user2-0@fire3d.test")).toBeVisible();
    expect(requests.at(-1)?.searchParams.get("page")).toBe("2");
    expect(requests.at(-1)?.searchParams.get("search")).toBe("user");

    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=3/);
    await expect(page.getByText("user3-0@fire3d.test")).toBeVisible();

    await page.getByLabel("Vai trò", { exact: true }).selectOption("1");
    await expect(page).toHaveURL(/role=1/);
    await expect(page).not.toHaveURL(/page=/); // changing a filter returns to page 1
    await page.goBack();
    await expect(page).toHaveURL(/page=3/);
  });
});

test.describe("layout and accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const width of [375, 768, 1024, 1440]) {
      test(`buildings screen has no horizontal overflow in ${scheme} at ${width}px`, async ({ page }, testInfo) => {
        await signIn(page, owner);
        await mockBuildings(page);
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: width < 768 ? 700 : 860 });
        await page.goto("/workspace/buildings");
        await expect(page.getByRole("link", { name: "Công trình 1" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: testInfo.outputPath(`buildings-${scheme}-${width}.png`), fullPage: true });

        await page.getByRole("button", { name: "Tạo công trình", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Tạo công trình" });
        await expect(dialog).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.waitForTimeout(400); // let the drawer entrance animation finish before the screenshot
        await page.screenshot({ path: testInfo.outputPath(`create-${scheme}-${width}.png`) });
      });
    }
  }

  test("keyboard: skip link, drawer focus trap and Escape return focus to the opener", async ({ page }) => {
    await signIn(page, owner);
    await mockBuildings(page);
    await page.setViewportSize({ width: 1440, height: 860 });
    await page.goto("/workspace/buildings");
    await expect(page.getByRole("link", { name: "Công trình 1" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Bỏ qua điều hướng" })).toBeFocused();

    const opener = page.getByRole("button", { name: "Tạo công trình", exact: true });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Tạo công trình" });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("reduced motion removes animated transitions", async ({ page }) => {
    await signIn(page, owner);
    await mockBuildings(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/workspace/buildings");
    await expect(page.getByRole("link", { name: "Công trình 1" })).toBeVisible();
    const durations = await page.locator(".ops-nav-link").first().evaluate((node) => getComputedStyle(node).transitionDuration);
    expect(parseFloat(durations)).toBeLessThan(0.01);
  });

  test("sidebar collapses to an icon rail and remembers the choice", async ({ page }) => {
    await signIn(page, owner);
    await mockBuildings(page);
    await page.setViewportSize({ width: 1440, height: 860 });
    await page.goto("/workspace/buildings");
    const shell = page.locator(".ops-shell");
    await expect(shell).toHaveAttribute("data-collapsed", "false");
    await page.getByRole("button", { name: "Thu gọn thanh bên" }).click();
    await expect(shell).toHaveAttribute("data-collapsed", "true");
    await page.reload();
    await expect(page.locator(".ops-shell")).toHaveAttribute("data-collapsed", "true");
    await expect(page.getByRole("link", { name: "Công trình", exact: true })).toBeVisible();
  });
});
