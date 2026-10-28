import { expect, test } from "@playwright/test";

/* Login skin (Figma 20:6911): art panel + themed form card, no overflow, theme follows the stored learning-area preference. */

for (const scheme of ["dark", "light"] as const) {
  for (const width of [1440, 375]) {
    test(`login fits ${width}px in the ${scheme} theme without horizontal overflow`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 760 });
      await page.addInitScript((mode) => { try { localStorage.setItem("fire3d-ops-theme", mode); } catch { /* ignore */ } }, scheme);
      await page.goto("/login");
      await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập FET3D" })).toBeVisible();
      await expect(page.locator(".ops-theme.login-theme")).toHaveAttribute("data-resolved-theme", scheme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width === 1440) await expect(page.getByText("Học bài, luyện tập, xem kết quả")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`login-${scheme}-${width}.png`) });
    });
  }
}

test("login keeps its form labels and does not change the stored theme by itself", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tiếp tục với Google" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Tạo tài khoản|Đăng ký/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("fire3d-ops-theme"))).toBeNull();
});

test("the pixel evacuation scene loops beside the form and holds still with reduced motion", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  const scene = page.getByTestId("login-pixel-scene");
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute("aria-hidden", "true");
  const snapshot = () => scene.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const first = await snapshot();
  await expect.poll(snapshot, { timeout: 3000 }).not.toBe(first);

  const still = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  await still.goto("/login");
  const stillScene = still.getByTestId("login-pixel-scene");
  await expect(stillScene).toBeVisible();
  const frame = await stillScene.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await still.waitForTimeout(600);
  expect(await stillScene.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(frame);
  await still.close();
});
