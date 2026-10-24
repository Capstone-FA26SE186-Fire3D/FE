import { expect, test } from "@playwright/test";

// While the session is restored the shell shows the brand spinner (Figma 02b "Loading / Brand spinner"), not plain text.
for (const [path, title] of [["/workspace/buildings", "Không gian tổ chức"], ["/admin/overview", "Quản trị hệ thống"]] as const) {
  test(`${path}: the session check shows the animated brand spinner`, async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "a", refreshToken: "r" })));
    await page.route("**/api/auth/me", () => new Promise<void>(() => undefined)); // the session never resolves
    await page.goto(path);
    const status = page.getByRole("status").filter({ hasText: "Đang kiểm tra phiên đăng nhập…" });
    await expect(status).toBeVisible();
    const heading = page.getByRole("heading", { name: title });
    await expect(heading).toBeVisible();
    // Title and spinner share one centre line (the title is not left-aligned above a centred spinner).
    expect(await heading.evaluate((node) => getComputedStyle(node).textAlign)).toBe("center");
    const ring = status.locator(".ops-spinner-ring");
    await expect(ring).toBeVisible();
    // The ring really animates (a plain paragraph would have no animation at all).
    expect(await ring.evaluate((node) => getComputedStyle(node).animationName)).toContain("ops-spin");
  });
}
