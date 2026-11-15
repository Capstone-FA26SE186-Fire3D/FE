import { expect, test } from "@playwright/test";

// Public page, no API: evidence for the copy and the links only, not for the Google Play state itself.

test.describe("Download page (/download)", () => {
  test("says the Android app is in testing on Google Play, how to get it and what it needs; no 'coming soon'", async ({ page }) => {
    await page.goto("/download");
    await expect(page).toHaveTitle(/Ứng dụng FET3D cho Android/);
    const main = page.locator("main");

    await expect(main.getByRole("heading", { level: 1 })).toHaveText(/Tập thoát nạn\s*trên điện thoại\./);
    await expect(main).toContainText("Ứng dụng đang được thử nghiệm trên Google Play, nên chưa có trên cửa hàng cho mọi người.");
    await expect(main.getByRole("heading", { name: "Cách nhận ứng dụng" })).toBeVisible();
    await expect(main).toContainText("Người học cài ứng dụng qua lời mời do tổ chức của mình hoặc nhóm FET3D gửi.");
    await expect(main).toContainText("ứng dụng chưa hiện khi tìm trên cửa hàng và trang này chưa có tệp cài đặt để tải");
    await expect(page.getByTestId("download-state")).toContainText("Đang thử nghiệm trên Google Play");

    // What it does, what the phone needs, and the Building QR.
    await expect(main.getByRole("heading", { name: "Ứng dụng làm gì" })).toBeVisible();
    await expect(main).toContainText("Điện thoại Android 10 trở lên.");
    await expect(main).toContainText("Khi đã cài ứng dụng, quét mã này trong ứng dụng là mở được danh sách bài của công trình.");
    await expect(main.locator(".download-steps li")).toHaveCount(3);
    await expect(main.locator(".download-steps")).toContainText("Quét mã QR của công trình bằng chức năng quét trong ứng dụng, rồi chọn bài để bắt đầu.");

    // The old state is gone.
    for (const stale of ["sắp có", "Chưa khả dụng", "Hiện chưa có bản ứng dụng Android", "sẽ sớm mở"]) await expect(main).not.toContainText(stale);
  });

  test("has no dead button and no store, file or app link; the only link in the page body works", async ({ page }) => {
    await page.goto("/download");
    const main = page.locator("main");
    await expect(main.getByRole("button")).toHaveCount(0);
    await expect(main.locator('a[href*="play.google"], a[href*="apps.apple"], a[href$=".apk"], a[href$=".aab"], a[href^="intent:"], a[href^="fet3d:"], a[href^="market:"], a[href="#"], a[href=""]')).toHaveCount(0);
    const links = main.getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links).toHaveText("đọc bài học trên web");
    await expect(links).toHaveAttribute("href", "/learn");
    const response = await page.request.get("/learn");
    expect(response.status()).toBe(200);
  });

  for (const width of [375, 1440]) {
    test(`layout ${width}px: no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 760 });
      await page.goto("/download");
      await expect(page.getByRole("heading", { name: "Cách nhận ứng dụng" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (process.env.QR_SHOTS_DIR) await page.screenshot({ path: `${process.env.QR_SHOTS_DIR}/download-${width}.png`, fullPage: true });
    });
  }
});
