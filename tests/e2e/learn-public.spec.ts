import { expect, test, type Page } from "@playwright/test";
import { installLearnBackend, LearnBackend, mockTraineeLogin, signIn, type Actor } from "./learn-mock";

/*
 * Public Learn (/learn, /learn/[slug]) and Trainee bookmarks against the STATEFUL MOCK in learn-mock.ts.
 * Mock evidence only; the real read-only smoke is listed in the task report.
 */

async function setup(page: Page, who: Actor = "guest", seed: (backend: LearnBackend) => void = () => undefined) {
  const backend = new LearnBackend();
  seed(backend);
  await signIn(page, backend, who);
  await installLearnBackend(page, backend);
  return backend;
}

const cards = (page: Page) => page.locator("[data-learn-post]");

test.describe("public list", () => {
  test("shows only Published posts, newest first, with a labelled search box", async ({ page }) => {
    const backend = await setup(page, "guest", (b) => {
      b.seedPost("cu", { title: "Bài cũ", status: "Published" });
      b.seedPost("moi", { title: "Bài mới", status: "Published" });
      b.seedPost("nhap", { title: "Bài nháp" });
      b.seedPost("an", { title: "Bài ẩn", status: "Hidden" });
      b.seedPost("xoa", { title: "Bài xóa", status: "Deleted" });
    });
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText("Bài mới");
    for (const hidden of ["Bài nháp", "Bài ẩn", "Bài xóa"]) await expect(page.getByText(hidden)).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Tìm bài học" })).toBeVisible();
    await expect(page.getByText("sẽ được bổ sung khi máy chủ hỗ trợ")).toHaveCount(0);
    expect(backend.calls.every((call) => !call.headers.authorization)).toBe(true); // anonymous reads
  });

  test("a post that turns Hidden or Deleted disappears from the list after reload", async ({ page }) => {
    const backend = await setup(page, "guest", (b) => { b.seedPost("a", { title: "Bài A", status: "Published" }); b.seedPost("b", { title: "Bài B", status: "Published" }); });
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(2);
    backend.externalLifecycle(backend.bySlug("a")!.id, "Hidden");
    backend.externalLifecycle(backend.bySlug("b")!.id, "Deleted");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Chưa có bài nào được đăng" })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });

  test("filters by situation through the API (several = OR) and keeps it in the URL", async ({ page }) => {
    const backend = await setup(page, "guest", (b) => {
      const a = b.seedSituation("chay-nha", "Cháy trong nhà");
      const c = b.seedSituation("thang-may", "Thang máy");
      b.seedSituation("cu", "Ngừng dùng", { isActive: false });
      b.seedPost("p1", { title: "Bài nhà", status: "Published", situationIds: [a.id] });
      b.seedPost("p2", { title: "Bài thang", status: "Published", situationIds: [c.id] });
      b.seedPost("p3", { title: "Bài cả hai", status: "Published", situationIds: [a.id, c.id] });
      b.seedPost("p4", { title: "Bài không gắn", status: "Published" });
    });
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Ngừng dùng" })).toHaveCount(0); // only active situations
    await page.getByRole("button", { name: "Cháy trong nhà", exact: true }).click();
    await expect(page).toHaveURL(/situation=chay-nha/);
    await expect(cards(page)).toHaveCount(2);
    expect(backend.callsTo("GET", /^\/api\/learn\/posts$/).at(-1)!.search).toContain("situation=chay-nha");
    await page.reload();
    await expect(page.getByRole("button", { name: "Cháy trong nhà", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole("button", { name: "Thang máy", exact: true }).click();
    await expect(cards(page)).toHaveCount(3);
    await page.getByRole("button", { name: "Tất cả", exact: true }).click();
    await expect(cards(page)).toHaveCount(4);
  });

  test("an empty situation and an unknown situation explain themselves", async ({ page }) => {
    await setup(page, "guest", (b) => { b.seedSituation("trong", "Tình huống trống"); b.seedPost("p", { status: "Published" }); });
    await page.goto("/learn?situation=trong");
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
    await page.locator(".learn-state").getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(cards(page)).toHaveCount(1);
    await page.goto("/learn?situation=khong-ton-tai");
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
  });

  test("pagination: page in the URL, reload recovers, out-of-range page is explained", async ({ page }) => {
    await setup(page, "guest", (b) => { for (let i = 1; i <= 14; i += 1) b.seedPost(`bai-${i}`, { title: `Bài số ${i}`, status: "Published" }); });
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(12);
    await expect(page.getByText("Trang 1/2 · 14 bài")).toBeVisible();
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(cards(page)).toHaveCount(2);
    await page.reload();
    await expect(cards(page)).toHaveCount(2);
    await page.goto("/learn?page=9");
    await expect(page.getByRole("heading", { name: "Trang này không có bài" })).toBeVisible();
    await page.getByRole("button", { name: "Về trang đầu" }).click();
    await expect(cards(page)).toHaveCount(12);
  });

  test("loading skeleton, then error with retry", async ({ page }) => {
    const backend = await setup(page, "guest", (b) => { b.seedPost("p", { title: "Bài sau lỗi", status: "Published" }); });
    backend.failNext("GET", /^\/api\/learn\/posts$/, { status: 200, delayMs: 800, json: { items: [], total: 0, page: 1, pageSize: 12 } });
    await page.goto("/learn");
    await expect(page.getByRole("status", { name: "Đang tải bài viết" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chưa có bài nào được đăng" })).toBeVisible();
    backend.failNext("GET", /^\/api\/learn\/posts$/, { status: 500, json: { code: "BOOM", title: "boom" } });
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "Không tải được nội dung" })).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(cards(page)).toHaveCount(1);
  });
});

test.describe("reader", () => {
  const rich = (b: LearnBackend) => {
    const s = b.seedSituation("chay-nha", "Cháy trong nhà");
    const source = b.seedSource("QCVN 06:2022", { versionLabel: "2022" });
    b.seedPost("doc-day-du", {
      kind: "Video", title: "Đọc đầy đủ", summary: "Tóm tắt thay cho video khi không nhúng được.", status: "Published", situationIds: [s.id], sources: [{ sourceId: source.id, role: "Primary", locator: {} }],
      blocks: [
        { type: "heading", text: "Mục chính", level: 2 }, { type: "heading", text: "Mục phụ", level: 3 },
        { type: "paragraph", text: "Dòng một\nDòng hai <b>không phải html</b> và <script>window.__pwned = 1</script>" },
        { type: "list", ordered: true, items: ["Bước một", "Bước hai"] }, { type: "list", ordered: false, items: ["Ý A"] },
        { type: "callout", tone: "danger", text: "Cảnh báo quan trọng" },
        { type: "image", url: "https://example.com/a.png", alt: "Sơ đồ minh họa" },
        { type: "image", url: "javascript:alert(1)", alt: "Ảnh độc hại" },
        { type: "video", provider: "YouTube", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
        { type: "video", provider: "YouTube", videoId: "xxxxxxxxxxx", url: "https://evil.example/watch?v=xxxxxxxxxxx" },
        { type: "carousel", slides: [] },
      ],
    });
  };

  test("renders blocks from the allowlist as text, never raw HTML; video is a link-out card with the summary as fallback", async ({ page }) => {
    await setup(page, "guest", rich);
    await page.addInitScript(() => { (window as unknown as { __pwned?: number }).__pwned = 0; });
    await page.goto("/learn/doc-day-du");
    await expect(page.getByRole("heading", { level: 1, name: "Đọc đầy đủ" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Mục chính" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Mục phụ" })).toBeVisible();
    await expect(page.getByText("<b>không phải html</b>", { exact: false })).toBeVisible(); // shown literally
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBe(0);
    await expect(page.locator(".article-body script, .article-body b")).toHaveCount(0);
    await expect(page.locator("ol.learn-list li")).toHaveCount(2);
    await expect(page.locator("ul.learn-list li")).toHaveCount(1);
    await expect(page.getByRole("note")).toContainText("Cảnh báo quan trọng");
    await expect(page.getByAltText("Sơ đồ minh họa")).toHaveAttribute("src", "https://example.com/a.png");
    await expect(page.getByAltText("Ảnh độc hại")).toHaveCount(0);
    // Video: one card (the off-allowlist host and the unknown block are dropped), no iframe.
    const video = page.getByTestId("video-fallback");
    await expect(video).toHaveCount(1);
    await expect(video).toContainText("Tóm tắt thay cho video khi không nhúng được.");
    await expect(video.getByRole("link", { name: /Xem video trên YouTube/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(video.getByRole("link")).toHaveAttribute("rel", /noopener/);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByText("3 phần nội dung không hiển thị được")).toBeVisible();
    // Situation and source.
    await expect(page.getByRole("link", { name: "Cháy trong nhà" })).toHaveAttribute("href", "/learn?situation=chay-nha");
    await expect(page.getByRole("heading", { name: "Nguồn tham khảo" })).toBeVisible();
    await expect(page.getByText("QCVN 06:2022")).toBeVisible();
  });

  test("tab title and description follow the post (basic SEO)", async ({ page }) => {
    await setup(page, "guest", rich);
    await page.goto("/learn/doc-day-du");
    await expect(page).toHaveTitle("Đọc đầy đủ — FET3D");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Tóm tắt thay cho video khi không nhúng được.");
    await page.goto("/learn");
    await expect(page).toHaveTitle("Bài học — FET3D");
  });

  test("Hidden shows the unavailable message, Deleted/Unpublished/unknown show not found, a bad slug is a 404 page", async ({ page }) => {
    await setup(page, "guest", (b) => { b.seedPost("an", { status: "Hidden" }); b.seedPost("xoa", { status: "Deleted" }); b.seedPost("nhap"); });
    await page.goto("/learn/an");
    await expect(page.getByRole("heading", { name: "Bài tạm thời không hiển thị" })).toBeVisible();
    for (const slug of ["xoa", "nhap", "khong-co"]) {
      await page.goto(`/learn/${slug}`);
      await expect(page.getByRole("heading", { name: "Không tìm thấy bài" })).toBeVisible();
    }
    const response = await page.goto("/learn/Bad_Slug!");
    expect(response?.status()).toBe(404);
  });

  test("a post that becomes Hidden is gone on the next read; a server error offers retry", async ({ page }) => {
    const backend = await setup(page, "guest", (b) => { b.seedPost("sap-an", { title: "Sắp ẩn", status: "Published" }); });
    await page.goto("/learn/sap-an");
    await expect(page.getByRole("heading", { level: 1, name: "Sắp ẩn" })).toBeVisible();
    backend.externalLifecycle(backend.bySlug("sap-an")!.id, "Hidden");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Bài tạm thời không hiển thị" })).toBeVisible();
    await expect(page.getByText("Sắp ẩn")).toHaveCount(0);
    backend.externalLifecycle(backend.bySlug("sap-an")!.id, "Published");
    backend.failNext("GET", /\/api\/learn\/posts\/sap-an$/, { status: 500, json: { code: "BOOM", title: "boom" } });
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "Không tải được nội dung" })).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sắp ẩn" })).toBeVisible();
  });

  test("related posts come from the API and exclude the current one", async ({ page }) => {
    await setup(page, "guest", (b) => { b.seedPost("a", { title: "Bài A", status: "Published" }); b.seedPost("b", { title: "Bài B", status: "Published" }); });
    await page.goto("/learn/a");
    const related = page.getByRole("region", { name: "Bài liên quan" });
    await expect(related.getByRole("link", { name: "Bài B", exact: true })).toBeVisible();
    await expect(related.getByRole("link", { name: /Bài A/ })).toHaveCount(0);
  });
});

test.describe("bookmarks", () => {
  const seedPosts = (b: LearnBackend) => { b.seedPost("bai-mot", { title: "Bài một", status: "Published" }); b.seedPost("bai-hai", { title: "Bài hai", status: "Published" }); };

  test("a guest who saves is sent to sign in and returns to the same article, where saving works", async ({ page }) => {
    const backend = await setup(page, "guest", seedPosts);
    await mockTraineeLogin(page, backend);
    await page.goto("/learn/bai-mot");
    await page.getByRole("button", { name: "Lưu bài viết" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Flearn%2Fbai-mot/);
    expect(backend.callsTo("PUT", /bookmarks/)).toHaveLength(0);
    await page.getByLabel("Email", { exact: true }).fill("learner@fire3d.test");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/learn\/bai-mot$/);
    await expect(page.getByRole("heading", { level: 1, name: "Bài một" })).toBeVisible();
    await page.getByRole("button", { name: "Lưu bài viết" }).click();
    await expect(page.getByRole("button", { name: "Bỏ lưu bài viết" })).toHaveAttribute("aria-pressed", "true");
    expect(backend.bookmarks).toHaveLength(1);
    expect(backend.callsTo("PUT", /bookmarks/)[0].headers.authorization).toBe("Bearer learn-access");
    // Reload: the state comes back from the server, not from the browser.
    await page.reload();
    await expect(page.getByRole("button", { name: "Bỏ lưu bài viết" })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(sessionStorage).concat(Object.keys(localStorage)).filter((key) => /bookmark/i.test(key)))).toEqual([]);
    await page.getByRole("button", { name: "Bỏ lưu bài viết" }).click();
    await expect(page.getByRole("button", { name: "Lưu bài viết" })).toBeVisible();
    expect(backend.bookmarks).toHaveLength(0);
  });

  test("a card on the list saves too, and PUT/DELETE are repeatable", async ({ page }) => {
    const backend = await setup(page, "trainee", seedPosts);
    await page.goto("/learn");
    const first = cards(page).first();
    await first.getByRole("button", { name: "Lưu bài viết" }).click();
    await expect(first.getByRole("button", { name: "Bỏ lưu bài viết" })).toBeVisible();
    // Idempotent on the server: the same PUT twice leaves one bookmark.
    const id = backend.bySlug("bai-mot")!.id; // the list is newest first, so the card above saved bai-hai
    for (let i = 0; i < 2; i += 1) expect((await page.evaluate(async (postId) => (await fetch(`/api/learn/bookmarks/${postId}`, { method: "PUT", headers: { Authorization: "Bearer learn-access" } })).status, id))).toBe(200);
    expect(backend.bookmarks).toHaveLength(2);
    for (let i = 0; i < 2; i += 1) expect((await page.evaluate(async (postId) => (await fetch(`/api/learn/bookmarks/${postId}`, { method: "DELETE", headers: { Authorization: "Bearer learn-access" } })).status, id))).toBe(200);
    expect(backend.bookmarks).toHaveLength(1);
  });

  test("a post that is no longer public cannot be saved and the user is told", async ({ page }) => {
    const backend = await setup(page, "trainee", seedPosts);
    await page.goto("/learn/bai-hai");
    await expect(page.getByRole("button", { name: "Lưu bài viết" })).toBeEnabled();
    backend.externalLifecycle(backend.bySlug("bai-hai")!.id, "Hidden");
    await page.getByRole("button", { name: "Lưu bài viết" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "không còn công khai" })).toBeVisible();
    expect(backend.bookmarks).toHaveLength(0);
  });

  test("organization accounts see an explained disabled save", async ({ page }) => {
    await setup(page, "org", seedPosts);
    await page.goto("/learn/bai-mot");
    await expect(page.getByRole("button", { name: "Lưu bài viết" })).toBeDisabled();
    await expect(page.getByText("Chỉ tài khoản học viên lưu được bài.")).toBeVisible();
  });
});

for (const width of [1440, 375]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`public Learn stays dark and fits ${width}px with the ${scheme} system theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await setup(page, "trainee", (b) => {
        const s = b.seedSituation("chay-nha", "Cháy trong nhà");
        b.seedPost("dai", { title: "Một tiêu đề rất dài để kiểm tra việc xuống dòng ở màn hình hẹp mà không làm tràn ngang trang đọc", summary: "Tóm tắt khá dài ".repeat(20), status: "Published", situationIds: [s.id], kind: "Video", coverImageUrl: "https://example.com/not-reachable.png",
          blocks: [{ type: "heading", text: "Mục", level: 2 }, { type: "paragraph", text: "Một-chuỗi-rất-dài-không-có-khoảng-trắng-".repeat(8) }, { type: "list", ordered: true, items: ["Một", "Hai"] }, { type: "callout", tone: "warning", text: "Lưu ý" }, { type: "video", provider: "TikTok", videoId: "1234567890", url: "https://www.tiktok.com/@fet3d/video/1234567890" }] });
        for (let i = 0; i < 5; i += 1) b.seedPost(`them-${i}`, { title: `Bài thêm ${i}`, status: "Published" });
        b.addBookmark("dai");
        b.addBookmark("them-0");
        b.externalLifecycle(b.bySlug("them-0")!.id, "Hidden");
      });
      for (const path of ["/learn", "/learn?situation=chay-nha", "/learn?search=chay&kind=Video", "/learn/dai", "/learning-hub"]) {
        await page.goto(path);
        await expect(page.locator("main, .learning-main").first()).toBeVisible();
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(background, `${path} must keep the global dark palette`).toBe("rgb(20, 23, 25)");
      }
      await page.goto("/learn/dai");
      await page.screenshot({ path: testInfo.outputPath(`reader-${width}-${scheme}.png`), fullPage: true });
    });
  }
}
