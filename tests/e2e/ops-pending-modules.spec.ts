import { expect, test, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * Runs against a PRODUCTION build (`pnpm build` + `next start`). Evidence type: route-mocked auth only.
 * Asserts that no prototype or sample data is reachable in production.
 */
const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };

async function signIn(page: Page, user: typeof admin | typeof owner) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

const modules = [
  { path: "/admin/library", heading: "Thư viện tổ chức", issue: "issues/57", fakeButtons: ["Thêm mục", "Tạo phiên bản mới"] },
];

// Reviews is a real screen now (F3, backed by GET /api/admin/scenario-reviews); only Learn CMS and Library still wait for BE#57.
const SAMPLE_MARKERS = ["Dữ liệu mẫu · chỉ môi trường phát triển", "Đặt lại dữ liệu mẫu", "Trường THPT Lê Quý Đôn (mẫu)", "Sơ tán giờ ra chơi", "Thoát nạn khi có khói dày", "school-evacuation", "Giả lập: người khác sửa bài này"];

for (const mod of modules) {
  test(`production ${mod.path} shows only the pending state`, async ({ page }) => {
    await signIn(page, admin);
    await page.goto(mod.path);
    await expect(page.getByRole("heading", { level: 1, name: mod.heading })).toBeVisible();
    await expect(page.getByTestId("pending-module")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chưa thể mở tính năng này" })).toBeVisible();
    await expect(page.locator("main").getByText("Chờ BE", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Điều kiện mở")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`BE#${mod.issue.split("/")[1]}`) })).toHaveAttribute("href", new RegExp(`${mod.issue}$`));

    await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
    await expect(page.getByTestId("prototype-badge")).toHaveCount(0);
    const body = await page.locator("body").innerText();
    for (const marker of SAMPLE_MARKERS) expect(body).not.toContain(marker);
    for (const name of mod.fakeButtons) await expect(page.locator("main").getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(page.locator("main table")).toHaveCount(0);
  });
}

test("production pending modules make no Learn/Library API calls", async ({ page }) => {
  await signIn(page, admin);
  const calls: string[] = [];
  page.on("request", (request) => { if (/^\/api\/.*(library)/i.test(new URL(request.url()).pathname)) calls.push(request.url()); });
  for (const mod of modules) { await page.goto(mod.path); await expect(page.getByTestId("pending-module")).toBeVisible(); }
  expect(calls).toEqual([]);
});

for (const mod of modules) {
  test(`${mod.path} is denied to organization users`, async ({ page }) => {
    await signIn(page, owner);
    await page.goto(mod.path);
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    await expect(page.getByTestId("pending-module")).toHaveCount(0);
  });
}

test("signed-out visitors are sent to sign in, not shown the mod", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, body: "" }));
  await page.goto("/admin/learn");
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  await expect(page.getByTestId("pending-module")).toHaveCount(0);
});

test("admin navigation marks only the Library as waiting for the backend", async ({ page }) => {
  await signIn(page, admin);
  await page.goto("/admin/library");
  const nav = page.getByRole("navigation", { name: "Quản trị hệ thống" });
  await expect(nav.getByRole("link", { name: /Thư viện tổ chức/ })).toContainText("Chờ BE");
  for (const label of ["Duyệt kịch bản", "Learn CMS"]) await expect(nav.getByRole("link", { name: new RegExp(label) })).not.toContainText("Chờ BE");
});

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"] as const) {
    test(`pending modules fit ${width}px in the ${theme} theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      await signIn(page, admin);
      for (const mod of modules) {
        await page.goto(mod.path);
        await expect(page.getByTestId("pending-module")).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${mod.path} overflows horizontally`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`pending-${mod.path.split("/").pop()}-${width}-${theme}.png`), fullPage: true });
      }
    });
  }
}

test("production client bundles contain no sample-data markers", async () => {
  const root = join(process.cwd(), ".next", "static");
  test.skip(!existsSync(root), "needs a production build in .next");
  const files: string[] = [];
  const walk = (dir: string) => { for (const entry of readdirSync(dir)) { const full = join(dir, entry); if (statSync(full).isDirectory()) walk(full); else if (full.endsWith(".js")) files.push(full); } };
  walk(root);
  expect(files.length).toBeGreaterThan(0);
  const markers = ["Dữ liệu mẫu · chỉ môi trường phát triển", "Đặt lại dữ liệu mẫu", "(mẫu)", "school-evacuation", "Sơ tán giờ ra chơi", "Giả lập: người khác sửa bài này", "prototype-banner"];
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const marker of markers) if (text.includes(marker)) hits.push(`${marker} @ ${file}`);
  }
  expect(hits).toEqual([]);
});
