import { expect, test, type Page } from "@playwright/test";
import { installLearnBackend, LearnBackend, mockTraineeLogin, signIn } from "./learn-mock";

const slug = "doc-khong-gian-truoc-khi-hanh-dong";

async function guestWithPost(page: Page) {
  const backend = new LearnBackend();
  backend.seedPost(slug, { title: "Đọc không gian trước khi hành động", summary: "Tóm tắt bài.", status: "Published" });
  await signIn(page, backend, "guest");
  await installLearnBackend(page, backend);
  await mockTraineeLogin(page, backend);
  return backend;
}

async function login(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("learner@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("learn save: a guest signs in and returns to the same article, then saves through the API", async ({ page }) => {
  const backend = await guestWithPost(page);
  await page.goto("/learn");
  await page.locator(".learn-card").first().getByRole("button", { name: "Lưu bài viết" }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await login(page);
  await expect(page).toHaveURL(new RegExp(`/learn/${slug}$`));
  await page.getByRole("button", { name: "Lưu bài viết" }).click();
  await expect(page.getByRole("button", { name: "Bỏ lưu bài viết" })).toBeVisible();
  expect(backend.bookmarks).toHaveLength(1);
  await page.getByRole("button", { name: "Bỏ lưu bài viết" }).click();
  await expect(page.getByRole("button", { name: "Lưu bài viết" })).toBeVisible();
  expect(backend.bookmarks).toHaveLength(0);
});

// The FastAPI prototype exists on a development server only (production answers 404: demo-rag-gate.spec.ts).
test("RAG demo keeps the chat contract (development server only)", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_SERVER_MODE !== "dev", "/demo/rag is 404 on a production build");
  await page.route("**/chat", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ answer: "Đây là câu trả lời mẫu có nguồn.", sources: [{ document_name: "guide.md", chunk_index: 0, content: "sample" }] }) });
  });
  await page.goto("/demo/rag");
  await page.getByLabel("Câu hỏi RAG").fill("Tôi nên bắt đầu từ đâu?");
  await page.getByRole("button", { name: "Hỏi tài liệu" }).click();
  await expect(page.getByText("Đây là câu trả lời mẫu có nguồn.")).toBeVisible();
  await expect(page.getByText("guide.md · chunk 0")).toBeVisible();
});

test("an article offers no ask button while Trainee AI is unavailable, and the hub explains it", async ({ page }) => {
  await guestWithPost(page);
  await page.goto(`/learn/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Đọc không gian trước khi hành động" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu bài viết" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hỏi về bài này" })).toHaveCount(0);
  await page.goto("/learning-hub?view=questions");
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  await page.getByRole("link", { name: "Đăng nhập" }).click();
  await login(page);
  await expect(page).toHaveURL(/\/learning-hub\?view=questions/);
  await expect(page.getByTestId("capability-unavailable")).toContainText("Hỏi đáp AI cho học viên chưa khả dụng");
  expect(await page.evaluate(() => sessionStorage.getItem("fire3d-prototype-content"))).toBeNull();
});
