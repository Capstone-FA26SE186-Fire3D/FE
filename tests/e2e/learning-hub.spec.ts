import { expect, test, type Page } from "@playwright/test";
import { installLearnBackend, LearnBackend, signIn, type Actor } from "./learn-mock";

/*
 * Learning Hub + public Learn layout. Bookmarks are REAL (mock backend, learn-mock.ts). Q&A and history/results wait for
 * the Trainee AI and session-list contracts (BE#77/#78), so those views must say "chưa khả dụng" with the reason and next
 * steps, and must not show a chat, a composer, sample answers or any sample result.
 */

const slug = "doc-khong-gian";

function seed(backend: LearnBackend) {
  backend.seedPost(slug, { title: "Đọc không gian trước khi hành động", summary: "Vì sao làm quen với không gian giúp quyết định rõ hơn.", status: "Published" });
  backend.seedPost("mot-luot-hoc", { title: "Một lượt học có ý nghĩa", summary: "Cấu trúc ba nhịp.", status: "Published" });
  backend.seedPost("tu-bai-doc", { title: "Từ bài đọc đến lượt tập", summary: "Nối kiến thức với trải nghiệm.", status: "Published" });
}

async function restore(page: Page, who: Actor = "trainee", extra: (backend: LearnBackend) => void = () => undefined) {
  const backend = new LearnBackend();
  seed(backend);
  extra(backend);
  await signIn(page, backend, who);
  await installLearnBackend(page, backend);
  return backend;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 980, height: 650 }, { width: 820, height: 650 }, { width: 375, height: 667 }]) {
  test(`hub and login fit ${viewport.width}px with the Google visible and the unavailable view fitting`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    const google = page.getByRole("button", { name: "Tiếp tục với Google" });
    await expect(google).toBeVisible();
    const googleBox = await google.boundingBox();
    expect(googleBox!.y + googleBox!.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`login-${viewport.width}.png`), fullPage: true });

    await restore(page);
    await page.goto(`/learning-hub?view=questions&article=${slug}`);
    const unavailable = page.getByTestId("capability-unavailable");
    await expect(unavailable).toContainText("Chưa khả dụng");
    await expect(page.getByTestId("capability-context")).toContainText("Đọc không gian trước khi hành động");
    await expect(unavailable.getByRole("link", { name: "Xem trang ứng dụng" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`hub-${viewport.width}.png`), fullPage: true });
    if (viewport.width < 768) await page.getByRole("button", { name: "Mở menu học tập" }).click();
    await page.getByRole("link", { name: /^Lịch sử/ }).click();
    await expect(page.getByTestId("capability-unavailable")).toContainText("Lịch sử và kết quả cá nhân chưa khả dụng");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test("Q&A and history say why they are unavailable, offer next steps and show no demo content", async ({ page }) => {
  await restore(page);
  await page.goto("/learning-hub?view=questions");
  const panel = page.getByTestId("capability-unavailable");
  await expect(panel).toContainText("Hỏi đáp AI cho học viên chưa khả dụng");
  await expect(panel).toContainText("AI cho Trainee đang chờ hệ thống");
  await expect(panel.getByRole("link", { name: "Đọc bài trong Learn" })).toHaveAttribute("href", "/learn");
  await expect(panel.getByRole("link", { name: "Xem bài đã lưu" })).toHaveAttribute("href", "/learning-hub?view=saved");
  await expect(panel.getByRole("link", { name: "Xem trang ứng dụng" })).toHaveAttribute("href", "/download");
  await expect(page.getByLabel("Câu hỏi trong Góc học tập")).toHaveCount(0);
  await expect(page.getByRole("log")).toHaveCount(0);
  await expect(page.getByText(/minh họa|soạn sẵn|mô phỏng/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Hỏi đáp/ })).toContainText(/chưa khả dụng/i);

  await page.getByRole("link", { name: /^Lịch sử/ }).click();
  await expect(page).toHaveURL(/view=history/);
  await expect(panel).toContainText("Lịch sử và kết quả cá nhân chưa khả dụng");
  await expect(panel).toContainText("một danh sách trống không có nghĩa là bạn chưa tập");
  await expect(page.getByText(/Chưa có câu hỏi|Kết quả mô phỏng|minh họa/i)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("prototype")))).toEqual([]);
});

test("the article the learner came from is kept as context, and an unknown one is explained", async ({ page }) => {
  await restore(page);
  await page.goto("/learning-hub?article=khong-co-bai-nay");
  await expect(page.getByTestId("capability-context")).toContainText("Không tìm thấy bài bạn mở từ Learn");
  await expect(page.getByTestId("capability-unavailable")).toContainText("Hỏi đáp AI cho học viên chưa khả dụng");
  await page.goto(`/learning-hub?article=${slug}`);
  await expect(page.getByTestId("capability-context")).toContainText("Đọc không gian trước khi hành động");
  await expect(page.getByTestId("capability-unavailable").getByRole("link", { name: "Đọc lại bài này" })).toHaveAttribute("href", `/learn/${slug}`);
});

test("an article page offers saving but no fake ask button", async ({ page }) => {
  await restore(page, "trainee");
  await page.goto(`/learn/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Đọc không gian trước khi hành động" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu bài viết" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hỏi về bài này" })).toHaveCount(0);
});

test("logout returns home even on backend failure and unavailable views respect reduced motion", async ({ page }) => {
  await restore(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/learning-hub?view=questions");
  await expect(page.getByTestId("capability-unavailable")).toBeVisible();
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

test.describe("saved posts (real bookmark API)", () => {
  test("default view lists the bookmarks from the server; the unavailable views do not touch them", async ({ page }) => {
    const backend = await restore(page, "trainee", (b) => b.addBookmark(slug));
    await page.goto("/learning-hub");
    await expect(page.getByRole("heading", { name: "Bài đã lưu", exact: true })).toBeVisible();
    await expect(page.locator(".learn-card")).toHaveCount(1);
    await expect(page.locator(".learn-card")).toContainText("Đọc không gian trước khi hành động");
    expect(backend.callsTo("GET", /bookmarks$/).length).toBeGreaterThan(0);
    await page.getByRole("link", { name: /^Lịch sử/ }).click();
    await expect(page).toHaveURL(/view=history/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Lịch sử", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Bài đã lưu", exact: true })).toBeVisible();
    await page.goForward();
    await page.getByRole("link", { name: "Bài đã lưu", exact: true }).click();
    await expect(page.locator(".learn-card")).toHaveCount(1);
    expect(backend.bookmarks).toHaveLength(1);
  });

  test("empty, loading and error states", async ({ page }) => {
    const backend = await restore(page);
    backend.failNext("GET", /bookmarks$/, { status: 200, delayMs: 700, json: { items: [], total: 0, page: 1, pageSize: 12 } });
    await page.goto("/learning-hub");
    await expect(page.getByRole("status", { name: "Đang tải bài đã lưu" })).toBeVisible();
    await expect(page.getByText("Bạn chưa lưu bài nào.")).toBeVisible();
    backend.failNext("GET", /bookmarks$/, { status: 500, json: { code: "BOOM", title: "boom" } });
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "Không tải được bài đã lưu" })).toBeVisible();
    backend.addBookmark(slug);
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.locator(".learn-card")).toHaveCount(1);
  });

  test("removing a saved post calls DELETE and the list stays correct after reload", async ({ page }) => {
    const backend = await restore(page, "trainee", (b) => { b.addBookmark(slug); b.addBookmark("mot-luot-hoc"); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/learning-hub");
    await expect(page.locator(".learn-card")).toHaveCount(2);
    await page.locator(".learn-card").first().hover();
    expect(await page.locator(".learn-card").first().evaluate((node) => getComputedStyle(node).transform)).toBe("none");
    await page.getByRole("button", { name: /Bỏ lưu bài viết: Đọc không gian/ }).click();
    await expect(page.locator(".learn-card")).toHaveCount(1);
    expect(backend.callsTo("DELETE", /bookmarks\//)).toHaveLength(1);
    await page.reload();
    await expect(page.locator(".learn-card")).toHaveCount(1);
    await expect(page.locator(".learn-card")).toContainText("Một lượt học có ý nghĩa");
  });

  test("a bookmark whose post became Hidden or Deleted is shown as unavailable and can be removed; it returns if the post is shown again", async ({ page }) => {
    const backend = await restore(page, "trainee", (b) => { b.addBookmark(slug); b.addBookmark("mot-luot-hoc"); b.addBookmark("tu-bai-doc"); });
    backend.externalLifecycle(backend.bySlug("mot-luot-hoc")!.id, "Hidden");
    backend.externalLifecycle(backend.bySlug("tu-bai-doc")!.id, "Deleted");
    await page.goto("/learning-hub");
    await expect(page.locator(".learn-card")).toHaveCount(1);
    const unavailable = page.getByTestId("saved-unavailable");
    await expect(unavailable).toHaveCount(2);
    await expect(unavailable.first()).toContainText("Bài này không còn hiển thị");
    await expect(unavailable.first()).not.toContainText("Một lượt học"); // no title or summary leaks
    await unavailable.first().getByRole("button", { name: "Bỏ lưu bài không còn hiển thị" }).click();
    await expect(unavailable).toHaveCount(1);
    expect(backend.callsTo("DELETE", /bookmarks\//)).toHaveLength(1);
    // The newest bookmark (the Deleted one) was removed; the other comes back when its post is public again.
    backend.externalLifecycle(backend.bySlug("mot-luot-hoc")!.id, "Published");
    await page.reload();
    await expect(page.locator(".learn-card")).toHaveCount(2);
    await expect(page.getByTestId("saved-unavailable")).toHaveCount(0);
  });

  test("bookmarks are paged and removing the last row of a later page steps back", async ({ page }) => {
    const backend = await restore(page, "trainee", (b) => { for (let i = 1; i <= 13; i += 1) { b.seedPost(`luu-${i}`, { title: `Bài lưu ${i}`, status: "Published" }); b.addBookmark(`luu-${i}`); } });
    await page.goto("/learning-hub");
    await expect(page.locator(".learn-card")).toHaveCount(12);
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/view=saved|learning-hub\?/);
    await expect(page.locator(".learn-card")).toHaveCount(1);
    await page.locator(".learn-card").getByRole("button", { name: /Bỏ lưu bài viết/ }).click();
    await expect(page.locator(".learn-card")).toHaveCount(12);
    await expect(page).not.toHaveURL(/page=2/);
    expect(backend.bookmarks).toHaveLength(12);
  });

  test("an organization account gets an explanation, a guest is asked to sign in", async ({ page }) => {
    await restore(page, "org");
    await page.goto("/learning-hub");
    await expect(page.getByRole("heading", { name: "Bài đã lưu dành cho tài khoản học viên" })).toBeVisible();
    const guest = await page.context().newPage();
    await restore(guest, "guest");
    await guest.goto("/learning-hub");
    await expect(guest.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  });
});

for (const width of [375, 640, 820, 1024, 1440]) {
  test(`Learn grid columns at ${width}px and article links`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await restore(page, "guest");
    await page.goto("/learn");
    await expect(page.locator(".learn-card")).toHaveCount(3);
    const columns = await page.locator(".learn-grid").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(width >= 1024 ? 3 : width >= 640 ? 2 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`learn-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Đọc Đọc không gian trước khi hành động", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/learn/" + slug + "$"));
    await expect(page.getByRole("heading", { level: 1, name: "Đọc không gian trước khi hành động" })).toBeVisible();
  });
}

for (const width of [1440, 820, 375]) {
  test(`saved library and profile visual review at ${width}px`, async ({ page }, testInfo) => {
    await restore(page, "trainee", (b) => { b.addBookmark(slug); });
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
