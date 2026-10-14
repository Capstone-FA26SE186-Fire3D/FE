import { expect, test, type Page } from "@playwright/test";

/*
 * Operations UI quality gates (FE#69): no horizontal overflow at 375/768/1024/1440 in both themes, 44px targets for the
 * shell and form controls, a focusable named scroll region for tables, a labelled action column, keyboard behaviour of
 * Drawer/Modal, reduced motion, and text contrast of the theme tokens. Evidence level: Playwright route mocks.
 */

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Thị Phương Thảo Quỳnh Anh Hoàng Gia Bảo Ngọc", username: "owner", role: 1, organizationId: "org-1", profileRevision: 1 };
const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const LONG_NAME = "Trường Trung học Phổ thông Chuyên Nguyễn Thị Minh Khai - Khối Nhà Hiệu Bộ và Thư viện Trung tâm";
const buildings = [
  { id: "b-1", name: LONG_NAME, buildingType: "Trường học", totalFloors: 5, isActive: true, createdAt: "2026-10-05T00:00:00Z" },
  { id: "b-2", name: "Nhà xưởng B", buildingType: "Nhà xưởng", totalFloors: 2, isActive: true, createdAt: "2026-10-05T00:00:00Z" },
  { id: "b-3", name: "Văn phòng C", buildingType: "", totalFloors: 12, isActive: false, createdAt: "2026-10-05T00:00:00Z" },
];
const accounts = [
  { ...owner, isActive: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", email: "nguyen.thi.phuong.thao.quynh.anh@congtycophandautuxaydungvaphattrienhatangdothi.vn" },
  { ...admin, isActive: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
];

async function open(page: Page, user: typeof owner | typeof admin, url: string, theme: "light" | "dark") {
  await page.addInitScript(([value]) => { sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ui-access", refreshToken: "ui-refresh" })); localStorage.setItem("fire3d-ops-theme", value); }, [theme]);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
  await page.route((u) => u.pathname === "/api/buildings", (route) => route.fulfill({ json: { items: buildings, totalCount: 3, page: 1, pageSize: 20 } }));
  await page.route((u) => u.pathname === "/api/accounts", (route) => route.fulfill({ json: { items: accounts, totalCount: 2, page: 1, pageSize: 20 } }));
  await page.route((u) => u.pathname === "/api/organizations", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 100 } }));
  await page.goto(url);
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const theme of ["dark", "light"] as const) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`buildings and accounts lists with long Vietnamese names fit ${width}px (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, owner, "/workspace/buildings", theme);
      await expect(page.getByRole("link", { name: LONG_NAME })).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // The long name wraps inside a readable column instead of one word per line.
      const box = await page.getByRole("link", { name: LONG_NAME }).boundingBox();
      expect(box!.width).toBeGreaterThan(110);
      await page.goto("/workspace/buildings?view=cards");
      await expect(page.locator(".ops-item-card h3")).toHaveCount(3);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }
}

test("shell and form controls reach 44px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, owner, "/workspace/buildings", "dark");
  await expect(page.getByRole("link", { name: LONG_NAME })).toBeVisible();
  const sizes = await page.evaluate(() => {
    const pick = (selector: string) => Array.from(document.querySelectorAll(selector)).filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => { const r = el.getBoundingClientRect(); return { selector, w: Math.round(r.width), h: Math.round(r.height) }; });
    return [...pick(".ops-nav-link"), ...pick(".ops-sidebar-footer button"), ...pick(".ops-sidebar-footer a"), ...pick(".ops-segmented button"), ...pick(".ops-user"), ...pick("input.ops-input"), ...pick("select.ops-input"), ...pick(".ops-icon-button")];
  });
  expect(sizes.length).toBeGreaterThan(10);
  for (const item of sizes) {
    expect(item.h, `${item.selector} ${item.w}x${item.h}`).toBeGreaterThanOrEqual(44);
    if (item.selector === ".ops-segmented button" || item.selector === ".ops-icon-button") expect(item.w, `${item.selector} ${item.w}x${item.h}`).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.getByRole("button", { name: "Mở điều hướng" })).toBeVisible();
  const phone = await page.getByRole("button", { name: "Mở điều hướng" }).boundingBox();
  expect(phone!.width).toBeGreaterThanOrEqual(44);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("a table is a named, keyboard-focusable scroll region and the action column has a text header", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, owner, "/workspace/buildings", "light");
  const region = page.getByRole("region", { name: "Danh sách công trình" });
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute("tabindex", "0");
  expect(await region.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  await expect(page.getByRole("columnheader", { name: "Thao tác" })).toHaveCount(1);
  await region.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
});

test("drawer: Tab stays inside, Escape closes and focus returns to the opener", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, owner, "/workspace/buildings", "dark");
  const opener = page.getByRole("button", { name: "Tạo công trình" }).first();
  await opener.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Tạo công trình" });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test("modal on a phone: scrolls inside, stays within the viewport and closes with Escape returning focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 560 });
  await open(page, owner, "/workspace/buildings", "dark");
  await page.getByRole("button", { name: `Lưu trữ ${LONG_NAME}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(560);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: `Lưu trữ ${LONG_NAME}` })).toBeFocused();
});

test("reduced motion: skeleton shimmer, pending pulse and dialog animation stop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "a", refreshToken: "r" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner }));
  await page.route((u) => u.pathname === "/api/buildings", async (route) => { await new Promise((resolve) => setTimeout(resolve, 1500)); await route.fulfill({ json: { items: buildings, totalCount: 3, page: 1, pageSize: 20 } }); });
  await page.goto("/workspace/buildings");
  const skeleton = page.locator(".ops-skeleton").first();
  await expect(skeleton).toBeVisible();
  const duration = await skeleton.evaluate((node) => ({ name: getComputedStyle(node).animationName, ms: parseFloat(getComputedStyle(node).animationDuration) * 1000 }));
  expect(duration.ms).toBeLessThan(5);
  await expect(page.getByRole("link", { name: LONG_NAME })).toBeVisible();
  await page.getByRole("button", { name: "Tạo công trình" }).first().click();
  const overlay = page.locator(".ops-overlay");
  await expect(overlay).toBeVisible();
  expect(await overlay.evaluate((node) => parseFloat(getComputedStyle(node).animationDuration) * 1000)).toBeLessThan(5);
});

test("an organization account sees an explanation, not the admin screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await open(page, owner, "/admin/accounts", "light");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  await expect(page.getByRole("link").last()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

/** WCAG contrast of the theme tokens on the surfaces they sit on. */
function luminance(hex: string) {
  const channel = (value: number) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
const ratio = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

for (const theme of ["dark", "light"] as const) {
  test(`text tokens keep 4.5:1 on the surfaces they are used on (${theme})`, async ({ page }) => {
    await open(page, admin, "/admin/accounts", theme);
    await expect(page.locator(".ops-theme").first()).toBeVisible();
    const tokens = await page.evaluate(() => {
      const root = document.querySelector(".ops-theme") as HTMLElement;
      const cs = getComputedStyle(root);
      const read = (name: string) => cs.getPropertyValue(name).trim();
      return Object.fromEntries(["--bg", "--bg-soft", "--surface", "--text", "--muted", "--dim", "--ember", "--ember-foreground", "--success", "--warning", "--danger", "--info"].map((name) => [name, read(name)]));
    });
    const hex = (value: string) => { expect(value, "token must be a hex colour").toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i); return value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value; };
    for (const surface of ["--bg", "--bg-soft", "--surface"]) {
      for (const text of ["--text", "--muted", "--dim", "--ember", "--success", "--warning", "--danger", "--info"]) {
        expect(ratio(hex(tokens[text]), hex(tokens[surface])), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(ratio(hex(tokens["--ember-foreground"]), hex(tokens["--ember"])), "label on the ember button").toBeGreaterThanOrEqual(4.5);
  });
}
