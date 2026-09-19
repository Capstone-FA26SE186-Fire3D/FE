import { expect, test, type Page } from "@playwright/test";

// Inherit the verified production origin from playwright.config.ts.

test("auth mode is explicit and defaults to local mock", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("auth-mode")).toHaveText("mock");
  expect(await page.evaluate(() => sessionStorage.getItem("fire3d-auth-tokens"))).toBeNull();
});

const slug = "doc-khong-gian-truoc-khi-hanh-dong";
const secondSlug = "mot-luot-hoc-co-y-nghia";
const storageKey = "fire3d-demo-session";
const signIn = async (page: Page) => {
  await page.getByRole("button", { name: "Đăng nhập trải nghiệm", exact: true }).click();
};

test("credentials are checked and unsafe next stays local", async ({ page }) => {
  await page.goto("/login?next=https://example.com/");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
  await signIn(page);
  await expect(page.getByRole("alert", { name: "Lỗi đăng nhập" })).toContainText("chưa đúng");
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("fire3d-demo");
  await signIn(page);
  await expect(page).toHaveURL(/\/learning-hub$/);
});

test("save resumes once and remains saved after refresh and repeated login", async ({ page }) => {
  await page.goto(`/learn/${slug}`);
  await expect(page.getByRole("figure", { name: "Sơ đồ ba bước của bài đọc" })).toBeVisible();
  await page.getByRole("button", { name: "Lưu bài viết", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.reload();
  await signIn(page);
  await expect(page).toHaveURL(new RegExp(`/learn/${slug}$`));
  await expect(page.getByRole("button", { name: "Bỏ lưu bài viết" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Bỏ lưu bài viết" })).toBeEnabled();
  await page.evaluate(({ key, article }) => {
    const session = JSON.parse(sessionStorage.getItem(key)!);
    session.pendingAction = { type: "save", slug: article };
    sessionStorage.setItem(key, JSON.stringify(session));
  }, { key: storageKey, article: slug });
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByRole("button", { name: "Bỏ lưu bài viết" })).toBeVisible();
});

test("ask resumes in article context, persists chat and keeps contexts separate", async ({ page }) => {
  await page.goto(`/learn/${slug}`);
  await page.getByRole("button", { name: "Hỏi về bài này" }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.reload();
  await signIn(page);
  await expect(page).toHaveURL(new RegExp(`/learning-hub\\?article=${slug}$`));
  await expect(page.getByTestId("article-context")).toContainText("Đọc không gian");
  await page.getByLabel("Câu hỏi trong Góc học tập").fill("Tôi muốn hiểu điểm mốc");
  await page.getByRole("button", { name: "Gửi câu hỏi" }).click();
  const log = page.getByRole("log");
  await expect(log.getByRole("link", { name: /Nguồn bài mẫu/ })).toHaveAttribute("href", `/learn/${slug}`);
  await page.reload();
  await expect(log).toContainText("Tôi muốn hiểu điểm mốc");
  await page.goto(`/learning-hub?article=${secondSlug}`);
  await expect(page.getByTestId("article-context")).toContainText("Một lượt học");
  await expect(log).not.toContainText("Tôi muốn hiểu điểm mốc");
  await page.getByRole("link", { name: "Tôi muốn hiểu điểm mốc", exact: true }).click();
  await expect(log).toContainText("Tôi muốn hiểu điểm mốc");
  await page.goBack();
  await expect(page.getByTestId("article-context")).toContainText("Một lượt học");
});

for (const action of ["Đăng xuất", "Đặt lại"]) {
  test(`${action} clears sample data and remains logged out after refresh`, async ({ page }) => {
    await page.goto(`/learn/${slug}`);
    await page.getByRole("button", { name: "Lưu bài viết", exact: true }).click();
    await signIn(page);
    await page.getByRole("button", { name: "Hỏi về bài này" }).click();
    await page.getByLabel("Câu hỏi trong Góc học tập").fill("Một câu hỏi mẫu");
    await page.getByRole("button", { name: "Gửi câu hỏi" }).click();
    await expect(page.getByRole("log")).toContainText("Một câu hỏi mẫu");
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Góc học tập đang chờ bạn." })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Góc học tập đang chờ bạn." })).toBeVisible();
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), storageKey)).toMatchObject({ isAuthenticated: false, bookmarks: [], chat: [], pendingAction: null });
  });
}

test("malformed persisted data cannot crash or authenticate the demo", async ({ page }) => {
  await page.addInitScript((key) => sessionStorage.setItem(key, JSON.stringify({ isAuthenticated: "true", bookmarks: ["missing", null], pendingAction: { type: "save", slug: "missing" }, chat: [{}] })), storageKey);
  await page.goto("/learning-hub");
  await expect(page.getByRole("heading", { name: "Góc học tập đang chờ bạn." })).toBeVisible();
  await page.getByRole("link", { name: /Đăng nhập trải nghiệm/ }).click();
  await signIn(page);
  await expect(page.getByRole("log")).toContainText("Chưa có câu hỏi");
});

test("storage denied preserves in-memory flows and announces refresh limitation", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("denied", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("denied", "SecurityError"); };
  });
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByRole("status")).toContainText("không cho phép lưu phiên");
  await page.getByLabel("Câu hỏi trong Góc học tập").fill("Câu hỏi trong bộ nhớ");
  await page.getByRole("button", { name: "Gửi câu hỏi" }).click();
  await expect(page.getByRole("log")).toContainText("Câu hỏi trong bộ nhớ");
});

test("invalid JSON recovers and valid local next is preserved", async ({ page }) => {
  await page.addInitScript((key) => sessionStorage.setItem(key, "{broken"), storageKey);
  await page.goto(`/login?next=${encodeURIComponent(`/learn/${slug}`)}`);
  await signIn(page);
  await expect(page).toHaveURL(new RegExp(`/learn/${slug}$`));
  await expect(page.getByRole("button", { name: "Lưu bài viết", exact: true })).toBeEnabled();
});

test("restored sample filters unknown bookmarks and invalid chat records", async ({ page }) => {
  await page.addInitScript(({ key, article }) => {
    sessionStorage.setItem(key, JSON.stringify({
      isAuthenticated: true, name: { injected: true }, bookmarks: [article, article, "missing", 42],
      chat: [{ id: "valid", question: "Câu hỏi đã lưu", articleSlug: article, createdAt: "2026-09-15T12:00:00Z" },
        { id: "bad", question: "Không được hiển thị", articleSlug: "missing", createdAt: "bad-date" }],
    }));
  }, { key: storageKey, article: slug });
  await page.goto(`/learning-hub?article=${slug}`);
  await expect(page.getByRole("heading", { name: "Chào Minh Anh." })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("Câu hỏi đã lưu");
  await expect(page.getByRole("log")).not.toContainText("Không được hiển thị");
  expect(await page.evaluate((key) => {
    const stored = JSON.parse(sessionStorage.getItem(key)!);
    return { bookmarks: stored.bookmarks, chatCount: stored.chat.length };
  }, storageKey)).toEqual({ bookmarks: [slug], chatCount: 1 });
});
