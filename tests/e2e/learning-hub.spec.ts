import { expect, test, type Page } from "@playwright/test";

const slug = "doc-khong-gian-truoc-khi-hanh-dong";
async function restore(page: Page) {
  await page.addInitScript((articleSlug) => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "hub-access", refreshToken: "hub-refresh" }));
    sessionStorage.setItem("fire3d-prototype-content", JSON.stringify({ bookmarks: [articleSlug], pendingAction: null, chat: [{ id: "previous", question: "Câu hỏi trước đó", articleSlug, createdAt: "2026-10-05T00:00:00Z" }] }));
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
    await page.goto("/learning-hub");
    const composer = page.getByLabel("Câu hỏi trong Góc học tập");
    await expect(composer).toBeVisible();
    const box = await composer.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`hub-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Bài này nói về điều gì?" }).click();
    await expect(page.getByRole("log")).toContainText("Trích đoạn minh họa");
    await expect(page.getByRole("log").getByRole("link", { name: /Nguồn bài mẫu/ })).toBeVisible();
    if (viewport.width === 375) {
      await page.getByRole("button", { name: "Bài đã lưu", exact: true }).click();
      await expect(composer).toBeHidden();
      await expect(page.locator(".hub-saved a")).toBeVisible();
      await page.getByRole("button", { name: "Lịch sử", exact: true }).click();
      await page.getByRole("link", { name: "Câu hỏi trước đó" }).click();
      await expect(composer).toBeVisible();
    } else await page.getByRole("link", { name: "Câu hỏi trước đó" }).click();
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
