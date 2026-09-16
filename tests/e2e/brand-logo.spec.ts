import { expect, test } from "@playwright/test";

test("FET3D lockup remains accessible and inside the viewport", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/learn");

    const headerLogo = page.getByRole("link", { name: "FET3D, về trang chủ" });
    await expect(headerLogo).toBeVisible();
    await expect(headerLogo.getByRole("img", { name: "FET3D" })).toBeVisible();
    await expect(page.locator("footer .fet3d-logo__asset")).toHaveAttribute("alt", "FET3D");

    const geometry = await headerLogo.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test("landing page exposes the FET3D brand and production favicon", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "FET3D, về trang chủ" })).toBeVisible();
  await expect(page.locator(".fet3d-logo__asset").first()).toHaveAttribute("alt", "FET3D");
  expect(await page.locator(".fet3d-logo__asset").first().getAttribute("src")).toContain("fet3d-lockup");

  const icon = await page.request.get("/icon.png");
  expect(icon.ok()).toBeTruthy();
  expect(icon.headers()["content-type"]).toContain("image/png");
});
