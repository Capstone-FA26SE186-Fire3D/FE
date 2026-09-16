import { expect, test } from "@playwright/test";

test("learn save action resumes after demo login", async ({ page }) => {
  await page.goto("/learn");
  const firstArticle = page.locator(".article-card").first();
  await firstArticle.getByRole("button", { name: "Lưu bài viết" }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByRole("button", { name: "Đăng nhập trải nghiệm" }).click();
  await expect(page).toHaveURL(/\/learn\/doc-khong-gian-truoc-khi-hanh-dong/);
  await expect(page.getByRole("button", { name: "Bỏ lưu bài viết" })).toBeVisible();
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
