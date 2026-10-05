import { expect, test } from "@playwright/test";

test("learn save action resumes after Fire3D login", async ({ page }) => {
  await page.goto("/learn");
  const firstArticle = page.locator(".learn-card").first();
  await firstArticle.getByRole("button", { name: "Lưu bài viết" }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "save-access", refreshToken: "save-refresh", user: { id: "learner", email: "learner@fire3d.test", fullName: "Learner", role: 2, organizationId: null } } }));
  await page.getByLabel("Email", { exact: true }).fill("learner@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/doc-khong-gian-truoc-khi-hanh-dong/);
  await expect(page.getByRole("button", { name: "Bỏ lưu bài viết" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fire3d-prototype-content")!).pendingAction)).toBeNull();
  await page.getByRole("button", { name: "Bỏ lưu bài viết" }).click();
  await expect(page.getByRole("button", { name: "Lưu bài viết" })).toBeVisible();
});

test("RAG demo keeps the chat contract", async ({ page }) => {
  await page.route("**/chat", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ answer: "Đây là câu trả lời mẫu có nguồn.", sources: [{ document_name: "guide.md", chunk_index: 0, content: "sample" }] }) });
  });
  await page.goto("/demo/rag");
  await page.getByLabel("Câu hỏi RAG").fill("Tôi nên bắt đầu từ đâu?");
  await page.getByRole("button", { name: "Hỏi tài liệu" }).click();
  await expect(page.getByText("Đây là câu trả lời mẫu có nguồn.")).toBeVisible();
  await expect(page.getByText("guide.md · chunk 0")).toBeVisible();
});

test("asking about an article resumes its context after Fire3D login", async ({ page }) => {
  await page.goto("/learn/doc-khong-gian-truoc-khi-hanh-dong");
  await page.getByRole("button", { name: "Hỏi về bài này" }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { accessToken: "ask-access", refreshToken: "ask-refresh", user: { id: "learner", email: "learner@fire3d.test", fullName: "Learner", role: 2, organizationId: null } } }));
  await page.getByLabel("Email", { exact: true }).fill("learner@fire3d.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByTestId("article-context")).toContainText("Đọc không gian trước khi hành động");
  await expect(page.getByLabel("Câu hỏi trong Góc học tập")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fire3d-prototype-content")!).pendingAction)).toBeNull();
});
