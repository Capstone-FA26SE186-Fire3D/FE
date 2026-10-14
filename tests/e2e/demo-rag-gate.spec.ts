import { expect, test } from "@playwright/test";

/*
 * /demo/rag talks to the FastAPI prototype directly; the production AI path goes through the .NET API. Production builds
 * (the default for this suite, `next start`) must answer 404; a development server (PLAYWRIGHT_SERVER_MODE=dev) still
 * opens it with the prototype label.
 */
const development = process.env.PLAYWRIGHT_SERVER_MODE === "dev";

test("a production build answers 404 for /demo/rag and nothing links to it", async ({ page, request }) => {
  test.skip(development, "development server");
  const response = await request.get("/demo/rag");
  expect(response.status()).toBe(404);
  await page.goto("/demo/rag");
  await expect(page.getByLabel("Câu hỏi RAG")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  for (const route of ["/", "/learn", "/login", "/about", "/download", "/organizations"]) {
    await page.goto(route);
    await expect(page.locator('a[href*="/demo/rag"]')).toHaveCount(0);
  }
});

test("a development server opens /demo/rag and labels it as a prototype", async ({ page }) => {
  test.skip(!development, "production build");
  await page.goto("/demo/rag");
  await expect(page.getByText(/Prototype, không phải tích hợp production/)).toBeVisible();
  await expect(page.getByLabel("Câu hỏi RAG")).toBeVisible();
});
