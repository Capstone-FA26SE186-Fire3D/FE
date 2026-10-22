import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { installLibraryBackend, LibraryBackend, signIn } from "./library-mock";

/*
 * Runs against a PRODUCTION build (`pnpm build` + `next start`). Every operations screen that used to be a prototype is a real
 * screen now (Reviews F3, Learn CMS F6, Library F7), so nothing may be reachable that shows sample data, a prototype banner or the
 * old "pending module" blocker, and none of that code may ship in the client bundles. Evidence type: route-mocked auth/API.
 */

const SAMPLE_MARKERS = ["Dữ liệu mẫu · chỉ môi trường phát triển", "Đặt lại dữ liệu mẫu", "Trường THPT Lê Quý Đôn (mẫu)", "Sơ tán giờ ra chơi", "Thoát nạn khi có khói dày", "school-evacuation", "Giả lập: người khác sửa bài này", "Rubric sơ tán cơ bản", "Khói tại văn phòng nhiều tầng", "smoke-hood"];

test("production /admin/library is the real screen: no banner, no sample rows, no pending blocker, no fake success buttons", async ({ page }) => {
  const backend = new LibraryBackend();
  await signIn(page, backend, "admin");
  await installLibraryBackend(page, backend);
  await page.goto("/admin/library");
  await expect(page.getByRole("heading", { level: 1, name: "Thư viện tổ chức" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thư viện chưa có mục nào" })).toBeVisible();
  await expect(page.getByTestId("pending-module")).toHaveCount(0);
  await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
  await expect(page.getByTestId("prototype-badge")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Chưa thể mở tính năng này" })).toHaveCount(0);
  const body = await page.locator("body").innerText();
  for (const marker of SAMPLE_MARKERS) expect(body).not.toContain(marker);
  await expect(page.getByRole("navigation", { name: "Quản trị hệ thống" }).getByRole("link", { name: /Thư viện mẫu/ })).not.toContainText("Chờ BE");
  expect(backend.items).toHaveLength(0);
  expect(backend.calls.some((call) => call.path.startsWith("/api/admin/library"))).toBe(true); // it asked the server, it did not invent rows
});

test("no admin navigation entry is marked as waiting for the backend", async ({ page }) => {
  const backend = new LibraryBackend();
  await signIn(page, backend, "admin");
  await installLibraryBackend(page, backend);
  await page.goto("/admin/library");
  await expect(page.getByRole("navigation", { name: "Quản trị hệ thống" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Quản trị hệ thống" })).not.toContainText("Chờ BE");
});

test("production client bundles contain no sample-data or prototype markers", async () => {
  const root = join(process.cwd(), ".next", "static");
  test.skip(!existsSync(root), "needs a production build in .next");
  const files: string[] = [];
  const walk = (dir: string) => { for (const entry of readdirSync(dir)) { const full = join(dir, entry); if (statSync(full).isDirectory()) walk(full); else if (full.endsWith(".js")) files.push(full); } };
  walk(root);
  expect(files.length).toBeGreaterThan(0);
  const markers = [...SAMPLE_MARKERS, "(mẫu)", "prototype-banner", "Chưa thể mở tính năng này", "Dữ liệu mẫu"];
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const marker of markers) if (text.includes(marker)) hits.push(`${marker} @ ${file}`);
  }
  expect(hits).toEqual([]);
});
