import { expect, test, type Page } from "@playwright/test";

const slug = "doc-khong-gian-truoc-khi-hanh-dong";
async function restore(page: Page) {
  await page.addInitScript((articleSlug) => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "hub-access", refreshToken: "hub-refresh" }));
    if (!sessionStorage.getItem("hub-fixture-seeded")) sessionStorage.setItem("fire3d-prototype-content", JSON.stringify({ bookmarks: [articleSlug], pendingAction: null, chat: [{ id: "previous", question: "Câu hỏi trước đó", articleSlug, createdAt: "2026-10-05T00:00:00Z" }] }));
    sessionStorage.setItem("hub-fixture-seeded", "yes");
  }, slug);
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "learner", email: "learner@fire3d.test", fullName: "Học viên", role: 2, organizationId: null } }));
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 980, height: 650 }, { width: 820, height: 650 }, { width: 375, height: 667 }]) {
  test(`hub and login fit ${viewport.width}px with the composer and Google visible`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    const google = page.getByRole("button", { name: "Tiếp tục với Google" });
    await expect(google).toBeVisible();
    const googleBox = await google.boundingBox();
    expect(googleBox!.y + googleBox!.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`login-${viewport.width}.png`), fullPage: true });

    await restore(page);
    await page.goto("/learning-hub?view=questions");
    const composer = page.getByLabel("Câu hỏi trong Góc học tập");
    await expect(composer).toBeVisible();
    const box = await composer.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`hub-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Bài này nói về điều gì?" }).click();
    await expect(page.getByRole("log")).toContainText("Trích đoạn minh họa");
    await expect(page.getByRole("log").getByRole("link", { name: /Nguồn bài mẫu/ })).toBeVisible();
    if (viewport.width < 768) await page.getByRole("button", { name: "Mở menu học tập" }).click();
    await page.getByRole("link", { name: "Lịch sử", exact: true }).click();
    await page.getByRole("link", { name: /Câu hỏi trước đó/ }).click();
    await expect(page.getByTestId("article-context")).toContainText("Đang hỏi theo bài");
    await expect(page.getByRole("log")).toContainText("Câu hỏi trước đó");
  });
}

test("keyboard submission respects reduced motion and logout returns home even on backend failure", async ({ page }) => {
  await restore(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/learning-hub?article=${slug}`);
  const composer = page.getByLabel("Câu hỏi trong Góc học tập");
  await composer.fill("Câu hỏi bàn phím");
  await composer.press("Enter");
  await expect(page.getByRole("log")).toContainText("Câu hỏi bàn phím");
  expect(await page.locator(".chat-bubble").first().evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 503 }));
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).toBeNull();
});

test("mobile organization form and OTP step scroll without overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route("**/api/auth/registration/request-otp", (route) => route.fulfill({ status: 202 }));
  await page.goto("/login");
  await page.getByRole("tab", { name: "Tạo tài khoản" }).click();
  await page.getByRole("radio", { name: /Tổ chức/ }).check();
  await page.getByLabel("Tên tổ chức").fill("Tổ chức thử");
  await page.getByLabel("Địa chỉ tổ chức").fill("1 Test Street");
  await page.getByLabel("Điện thoại tổ chức").fill("+84123456789");
  await page.getByLabel("Email", { exact: true }).fill("owner@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("123456");
  await page.screenshot({ path: testInfo.outputPath("register-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.getByRole("button", { name: "Gửi mã OTP" }).click();
  await expect(page.getByLabel("Mã OTP")).toBeVisible();
  await expect(page.getByLabel("Tên tổ chức")).toBeHidden();
  await page.getByRole("button", { name: "Sửa thông tin" }).click();
  await expect(page.getByLabel("Tên tổ chức")).toHaveValue("Tổ chức thử");
});

test("saved library default, search, browser navigation and confirmed reset", async ({ page }) => {
  await restore(page);
  await page.goto("/learning-hub");
  await expect(page.getByRole("heading", { name: "Bài đã lưu", exact: true })).toBeVisible();
  await expect(page.locator(".learn-card")).toHaveCount(1);
  await page.getByLabel("Tìm bài đã lưu").fill("không tồn tại");
  await expect(page.getByRole("status")).toContainText("Chưa có bài phù hợp");
  await page.getByLabel("Tìm bài đã lưu").clear();
  await page.getByRole("link", { name: "Lịch sử", exact: true }).click();
  await expect(page).toHaveURL(/view=history/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lịch sử", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Bài đã lưu", exact: true })).toBeVisible();
  await page.goForward();
  await page.getByRole("button", { name: "Xóa dữ liệu demo", exact: true }).click();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByRole("link", { name: /Câu hỏi trước đó/ })).toBeVisible();
  await page.getByRole("button", { name: "Xóa dữ liệu demo", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận xóa dữ liệu demo" }).click();
  await expect(page.getByText("Chưa có câu hỏi trong phiên.")).toBeVisible();
  await page.getByRole("link", { name: "Bài đã lưu", exact: true }).click();
  await expect(page.getByText("Chưa có bài đã lưu trong phiên trải nghiệm này.")).toBeVisible();
});

test("mobile menu Escape returns focus and profile scrolls without overflow", async ({ page }, testInfo) => {
  await restore(page);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/learning-hub");
  const toggle = page.getByRole("button", { name: "Mở menu học tập" });
  await toggle.click();
  await expect(page.getByRole("link", { name: "Bài đã lưu", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await page.getByRole("link", { name: "Hồ sơ", exact: true }).click();
  await expect(page.getByLabel("Họ và tên")).toBeVisible();
  await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: testInfo.outputPath("profile-mobile.png"), fullPage: true });
});

for (const width of [375, 640, 820, 1024, 1440]) {
  test(`Learn grid columns at ${width}px, search and article links`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/learn");
    await expect(page.locator(".learn-card")).toHaveCount(3);
    const columns = await page.locator(".learn-grid").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width >= 1024 ? 3 : width >= 640 ? 2 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`learn-${width}.png`), fullPage: true });
    await page.getByLabel("Tìm bài Learn").fill("không có bài");
    await expect(page.locator(".learn-card")).toHaveCount(0);
    await page.getByLabel("Tìm bài Learn").fill("Đọc không gian");
    await expect(page.locator(".learn-card")).toHaveCount(1);
    await page.getByRole("link", { name: "Đọc Đọc không gian trước khi hành động", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/learn/" + slug + "$"));
  });
}

test("saved removal and reduced motion hover", async ({ page }) => {
  await restore(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/learning-hub");
  await page.locator(".learn-card").hover();
  expect(await page.locator(".learn-card").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  await page.getByRole("button", { name: "Bỏ lưu bài viết" }).click();
  await expect(page.locator(".learn-card")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Chưa có bài đã lưu trong phiên trải nghiệm này.")).toBeVisible();
});

for (const width of [1440, 820, 375]) {
  test(`saved library and profile visual review at ${width}px`, async ({ page }, testInfo) => {
    await restore(page);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 667 });
    await page.goto("/learning-hub");
    await expect(page.locator(".learn-card")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`saved-${width}.png`), fullPage: true });
    await page.goto("/learning-hub?view=profile");
    await expect(page.getByLabel("Họ và tên")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`profile-${width}.png`), fullPage: true });
  });
}
