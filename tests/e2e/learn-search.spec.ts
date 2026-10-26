import { expect, test, type Page } from "@playwright/test";
import { fold, installLearnBackend, LearnBackend, signIn } from "./learn-mock";

/*
 * Public Learn search and filters (FE#55, BE#79) against the STATEFUL MOCK in learn-mock.ts, whose GET /api/learn/posts follows the BE
 * source (ContentController.Posts + learn_public_gate): search 2-100 chars on title+summary ignoring case/diacritics, situation and kind
 * repeated (OR inside a filter, AND between filters), filters before paging, exact `total`, 400 VALIDATION_ERROR with `errors`.
 * Mock evidence only; the same queries are listed in the report for a read-only smoke against the deployed API.
 */

const LIST = /^\/api\/learn\/posts$/;
const cards = (page: Page) => page.locator("[data-learn-post]");
const count = (page: Page) => page.locator(".learn-result-count");
const box = (page: Page) => page.getByRole("searchbox", { name: "Tìm bài học" });
const listCalls = (backend: LearnBackend) => backend.callsTo("GET", LIST).map((call) => new URLSearchParams(call.search));
const titles = (page: Page) => cards(page).locator("[data-learn-title]").allTextContents();

async function setup(page: Page, seed: (backend: LearnBackend) => void) {
  const backend = new LearnBackend();
  seed(backend);
  await signIn(page, backend, "guest");
  await installLearnBackend(page, backend);
  return backend;
}

/** The BE test fixture (LearnSearchTests) plus a draft and a hidden post that must never match. */
function seedLibrary(b: LearnBackend) {
  const home = b.seedSituation("fire-at-home", "Cháy tại nhà");
  const smoke = b.seedSituation("smoke", "Khói");
  b.seedSituation("cu", "Tình huống ngừng dùng", { isActive: false });
  b.seedPost("thoat-hiem", { kind: "Article", title: "Thoát hiểm khi CHÁY", summary: "Tóm tắt thoát hiểm", status: "Published", situationIds: [home.id] });
  b.seedPost("duong-thoat-khoi", { kind: "Tip", title: "Đường thoát khói", summary: "Tóm tắt đường thoát khói", status: "Published", situationIds: [smoke.id] });
  b.seedPost("binh-chua-chay", { kind: "Video", title: "Video bình chữa cháy", summary: "Tóm tắt video", status: "Published", blocks: [{ type: "video", url: "https://youtu.be/dQw4w9WgXcQ" }] });
  b.seedPost("chay-ban-nhap", { kind: "Article", title: "Cháy bản nháp", situationIds: [home.id] });
  b.seedPost("chay-bi-an", { kind: "Article", title: "Cháy bị ẩn", status: "Hidden", situationIds: [home.id] });
}

test.describe("the BE fold used by the mock", () => {
  test("lower-cases and strips Vietnamese diacritics, đ becomes d", () => {
    expect(fold("Thoát hiểm khi CHÁY, Đường")).toBe("thoat hiem khi chay, duong");
  });
});

test.describe("search", () => {
  test("finds posts with or without diacritics and shows titles exactly as the API returns them", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(3);
    await expect(count(page)).toHaveText("3 bài");

    await box(page).fill("chay");
    await expect(page).toHaveURL(/search=chay/);
    await expect(cards(page)).toHaveCount(2);
    expect((await titles(page)).sort()).toEqual(["Thoát hiểm khi CHÁY", "Video bình chữa cháy"]);
    await expect(count(page)).toHaveText("2 bài khớp bộ lọc");
    expect(listCalls(backend).at(-1)!.get("search")).toBe("chay"); // sent as typed, no extra normalisation

    await box(page).fill("CHÁY");
    await expect(page).toHaveURL(/search=CH%C3%81Y/);
    await expect(cards(page)).toHaveCount(2);
    expect(listCalls(backend).at(-1)!.get("search")).toBe("CHÁY");

    await box(page).fill("duong thoat");
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Đường thoát khói");
    await box(page).fill("đường");
    await expect(cards(page)).toHaveCount(1);
    await box(page).fill("tóm tắt thoát");
    await expect(cards(page)).toHaveCount(1); // summaries are searched too: only "Tóm tắt thoát hiểm" contains this phrase
    await box(page).fill("50%");
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible(); // % is a literal character
  });

  test("a draft or hidden post never matches", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn?search=ban%20nhap");
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
    await page.goto("/learn?search=bi%20an");
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
  });

  test("typing is debounced into one request, one character waits, Enter and the clear button apply at once", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(3);
    const before = listCalls(backend).length;
    await box(page).pressSequentially("chay", { delay: 40 });
    await expect(page).toHaveURL(/search=chay/);
    await expect(cards(page)).toHaveCount(2);
    const searched = listCalls(backend).slice(before).map((params) => params.get("search"));
    expect(searched).toEqual(["chay"]); // no request for "c", "ch", "cha"

    // One character: nothing is sent, the reader is told why, the previous result stays.
    await box(page).fill("c");
    await expect(page.getByText("Nhập ít nhất 2 ký tự để tìm.")).toBeVisible();
    await page.waitForTimeout(600);
    expect(listCalls(backend).every((params) => params.get("search") !== "c")).toBe(true);
    await expect(page).toHaveURL(/search=chay/);
    await expect(box(page)).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Tìm", exact: true }).click();
    expect(listCalls(backend).every((params) => params.get("search") !== "c")).toBe(true);

    // Enter applies without waiting for the debounce.
    await box(page).fill("duong");
    await box(page).press("Enter");
    await expect(page).toHaveURL(/search=duong/);
    await expect(cards(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Xóa từ khóa" }).click();
    await expect(page).not.toHaveURL(/search=/);
    await expect(box(page)).toHaveValue("");
    await expect(cards(page)).toHaveCount(3);
    await box(page).fill("chay");
    await expect(cards(page)).toHaveCount(2);
    await box(page).press("Escape");
    await expect(box(page)).toHaveValue("");
    await expect(cards(page)).toHaveCount(3);
  });

  test("the input limits the length to the 100 characters the API accepts", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(box(page)).toHaveAttribute("maxlength", "100");
    await box(page).fill("x".repeat(100));
    await expect(box(page)).toHaveValue("x".repeat(100));
  });
});

test.describe("kind and situation filters", () => {
  test("kind filters one at a time and together (OR) with Vietnamese labels", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(3);
    await page.getByRole("button", { name: "Mẹo", exact: true }).click();
    await expect(page).toHaveURL(/kind=Tip/);
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Mẹo", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await expect(cards(page)).toHaveCount(2);
    expect(listCalls(backend).at(-1)!.getAll("kind")).toEqual(["Tip", "Video"]);
    await page.getByRole("button", { name: "Mẹo", exact: true }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Video bình chữa cháy");
    await page.getByRole("button", { name: "Bài viết", exact: true }).click();
    await expect(cards(page)).toHaveCount(2); // Article OR Video
    await expect(count(page)).toHaveText("2 bài khớp bộ lọc");
  });

  test("situations: one, several (OR), only active ones are offered, unknown or inactive slugs match nothing", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(page.getByRole("button", { name: "Tình huống ngừng dùng" })).toHaveCount(0);
    await page.getByRole("button", { name: "Cháy tại nhà", exact: true }).click();
    await expect(page).toHaveURL(/situation=fire-at-home/);
    await expect(cards(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Khói", exact: true }).click();
    await expect(cards(page)).toHaveCount(2);
    expect(listCalls(backend).at(-1)!.getAll("situation")).toEqual(["fire-at-home", "smoke"]);
    await page.getByRole("button", { name: "Tất cả", exact: true }).click();
    await expect(page).not.toHaveURL(/situation=/);
    await expect(cards(page)).toHaveCount(3);

    await page.goto("/learn?situation=cu"); // an inactive situation never matches (and is not an API error)
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
    await page.goto("/learn?situation=khong-ton-tai");
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
    await expect(page.getByRole("button", { name: "khong-ton-tai", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("search, kind and situation combine with AND; values inside one filter combine with OR", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn?search=chay");
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Video bình chữa cháy");
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await page.getByRole("button", { name: "Khói", exact: true }).click(); // "chay" AND situation smoke -> nothing
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
    await page.getByRole("button", { name: "Cháy tại nhà", exact: true }).click(); // smoke OR fire-at-home, AND "chay"
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Thoát hiểm khi CHÁY");
    await page.getByRole("button", { name: "Bài viết", exact: true }).click();
    await expect(cards(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Mẹo", exact: true }).click(); // (Article OR Tip) AND (smoke OR home) AND "chay"
    await expect(cards(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Bài viết", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible(); // Tip AND "chay" -> nothing
  });

  test("a known kind in the URL is accepted in any case and shows as pressed", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn?kind=tip");
    await expect(page.getByRole("button", { name: "Mẹo", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page)).toHaveCount(1);
    expect(listCalls(backend).at(-1)!.getAll("kind")).toEqual(["Tip"]);
  });

  test("at most 10 situations can be chosen", async ({ page }) => {
    await setup(page, (b) => { for (let i = 1; i <= 11; i += 1) b.seedSituation(`tinh-huong-${i}`, `Tình huống ${String(i).padStart(2, "0")}`); b.seedPost("p", { status: "Published" }); });
    await page.goto("/learn");
    for (let i = 1; i <= 10; i += 1) await page.getByRole("button", { name: `Tình huống ${String(i).padStart(2, "0")}`, exact: true }).click();
    await expect(page.getByText("Đã chọn tối đa 10 tình huống.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tình huống 11", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Tình huống 10", exact: true })).toBeEnabled(); // a chosen one can still be removed
  });

  test("the situation list failing is explained and retryable, the posts still load", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    backend.failNext("GET", /^\/api\/learn\/situations$/, { status: 500, json: { code: "BOOM", title: "boom" } });
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByText("Không tải được danh sách tình huống.")).toBeVisible();
    await page.getByRole("group", { name: "Tình huống" }).getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("button", { name: "Khói", exact: true })).toBeVisible();
  });
});

test.describe("applied filters", () => {
  test("a summary lists every applied value, each removable, and Xóa bộ lọc drops them all", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn?search=chay&kind=Article&kind=Video&situation=fire-at-home");
    const summary = page.getByRole("region", { name: "Đang lọc" });
    await expect(summary.getByRole("button")).toHaveCount(5); // 4 values + Xóa bộ lọc
    await expect(summary.getByRole("button", { name: "Bỏ lọc từ khóa: “chay”" })).toBeVisible();
    await expect(summary.getByRole("button", { name: "Bỏ lọc loại: Bài viết" })).toBeVisible();
    await expect(summary.getByRole("button", { name: "Bỏ lọc tình huống: Cháy tại nhà" })).toBeVisible(); // slug shown by its name
    await expect(cards(page)).toHaveCount(1);
    await summary.getByRole("button", { name: "Bỏ lọc tình huống: Cháy tại nhà" }).click();
    await expect(page).not.toHaveURL(/situation=/);
    await expect(cards(page)).toHaveCount(2);
    await summary.getByRole("button", { name: "Bỏ lọc từ khóa: “chay”" }).click();
    await expect(box(page)).toHaveValue(""); // the box follows the URL
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Đang lọc" })).toHaveCount(0);
    await expect(count(page)).toHaveText("3 bài");
  });
});

test.describe("paging after filtering", () => {
  const many = (b: LearnBackend) => {
    for (let i = 1; i <= 14; i += 1) b.seedPost(`chay-${i}`, { title: `Cháy số ${i}`, status: "Published", kind: i % 2 ? "Article" : "Tip" });
    for (let i = 1; i <= 3; i += 1) b.seedPost(`khac-${i}`, { title: `Bài khác ${i}`, status: "Published" });
  };

  test("the total counts the filtered set, pages keep the filters, a filter change returns to page 1", async ({ page }) => {
    const backend = await setup(page, many);
    await page.goto("/learn");
    await expect(page.getByText("Trang 1/2 · 17 bài")).toBeVisible();
    await box(page).fill("chay");
    await expect(page.getByText("Trang 1/2 · 14 bài")).toBeVisible();
    await expect(count(page)).toHaveText("14 bài khớp bộ lọc");
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/search=chay.*page=2|page=2.*search=chay/);
    await expect(cards(page)).toHaveCount(2);
    const last = listCalls(backend).at(-1)!;
    expect([last.get("search"), last.get("page"), last.get("pageSize")]).toEqual(["chay", "2", "12"]);
    await page.reload();
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByText("Trang 2/2 · 14 bài")).toBeVisible();
    await page.getByRole("button", { name: "Mẹo", exact: true }).click(); // 7 Tip posts -> one page, back to page 1
    await expect(page).not.toHaveURL(/page=/);
    await expect(cards(page)).toHaveCount(7);
    await expect(page.getByRole("navigation", { name: "Phân trang" })).toHaveCount(0);
    await expect(count(page)).toHaveText("7 bài khớp bộ lọc");
  });

  test("the count comes from the server total, not from the rows on the page", async ({ page }) => {
    const backend = await setup(page, many);
    const item = (n: number) => ({ id: `fake-${n}`, slug: `fake-${n}`, kind: "Article", title: `Bài giả ${n}`, summary: "", coverImageUrl: null, publishedAt: "2026-10-01T08:00:00Z" });
    backend.failNext("GET", LIST, { status: 200, json: { items: [item(1), item(2)], total: 99, page: 1, pageSize: 12 } });
    await page.goto("/learn?search=chay");
    await expect(cards(page)).toHaveCount(2);
    await expect(count(page)).toHaveText("99 bài khớp bộ lọc");
    await expect(page.getByText("Trang 1/9 · 99 bài")).toBeVisible();
  });

  test("a page past the end of the filtered results is explained", async ({ page }) => {
    await setup(page, many);
    await page.goto("/learn?search=chay&page=5");
    await expect(page.getByRole("heading", { name: "Trang này không có bài" })).toBeVisible();
    await page.getByRole("button", { name: "Về trang đầu" }).click();
    await expect(page).toHaveURL(/search=chay/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(cards(page)).toHaveCount(12);
  });
});

test.describe("states", () => {
  test("nothing published and nothing matching are different messages", async ({ page }) => {
    const backend = await setup(page, () => undefined);
    await page.goto("/learn");
    await expect(page.getByRole("heading", { name: "Chưa có bài nào được đăng" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Xóa bộ lọc" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toHaveCount(0);

    backend.seedPost("co-bai", { title: "Có một bài", status: "Published" });
    await page.goto("/learn?search=zzzz");
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chưa có bài nào được đăng" })).toHaveCount(0);
    await expect(page.getByText("một từ ngắn hơn")).toBeVisible(); // how to widen the filter
    await expect(count(page)).toHaveText("0 bài khớp bộ lọc");
    await page.locator(".learn-state").getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(box(page)).toHaveValue("");
  });

  test("a post that turns Hidden or Deleted drops out of the results and the total", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn?search=chay");
    await expect(cards(page)).toHaveCount(2);
    backend.externalLifecycle(backend.bySlug("thoat-hiem")!.id, "Hidden");
    await page.reload();
    await expect(cards(page)).toHaveCount(1);
    await expect(count(page)).toHaveText("1 bài khớp bộ lọc");
    backend.externalLifecycle(backend.bySlug("binh-chua-chay")!.id, "Deleted");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
    await expect(page.getByText("Video bình chữa cháy")).toHaveCount(0);
  });

  test("400 for a wrong value: says which one, offers a reset that drops only the broken parameter", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn?kind=Podcast&search=chay");
    const alert = page.getByRole("alert").filter({ hasText: "Bộ lọc không hợp lệ" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Loại bài chỉ gồm Bài viết, Mẹo hoặc Video.");
    await expect(alert).toContainText("VALIDATION_ERROR");
    await expect(cards(page)).toHaveCount(0);
    expect(listCalls(backend).at(-1)!.getAll("kind")).toEqual(["Podcast"]); // the API decides, the client does not hide it
    await alert.getByRole("button", { name: "Đặt lại tham số lỗi" }).click();
    await expect(page).toHaveURL(/search=chay/);
    await expect(page).not.toHaveURL(/kind=/);
    await expect(cards(page)).toHaveCount(2); // the valid search survived

    await page.goto("/learn?search=a&kind=Tip");
    await expect(page.getByRole("alert").filter({ hasText: "Từ khóa phải có 2–100 ký tự." })).toBeVisible();
    await page.getByRole("button", { name: "Đặt lại tham số lỗi" }).click();
    await expect(page).toHaveURL(/kind=Tip/);
    await expect(page).not.toHaveURL(/search=/);
    await expect(cards(page)).toHaveCount(1);

    await page.goto(`/learn?search=${"x".repeat(101)}`);
    await expect(page.getByRole("alert").filter({ hasText: "Từ khóa phải có 2–100 ký tự." })).toBeVisible();
    await page.goto("/learn?" + Array.from({ length: 11 }, (_, i) => `situation=s${i}`).join("&"));
    await expect(page.getByRole("alert").filter({ hasText: "tối đa 10 tình huống" })).toBeVisible();
    await page.getByRole("button", { name: "Đặt lại tham số lỗi" }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(cards(page)).toHaveCount(3);
  });

  test("a 400 without field errors resets every filter", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    backend.failNext("GET", LIST, { status: 400, json: { status: 400, title: "page >= 1 and pageSize 1-100.", code: "VALIDATION_ERROR" } });
    await page.goto("/learn?search=chay&page=2");
    await expect(page.getByRole("alert").filter({ hasText: "Bộ lọc không hợp lệ" })).toBeVisible();
    await page.getByRole("button", { name: "Đặt lại bộ lọc" }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(cards(page)).toHaveCount(3);
  });

  test("a server error shows its code and retry keeps the filters", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    backend.failNext("GET", LIST, { status: 500, json: { code: "BOOM", title: "boom" } });
    await page.goto("/learn?search=chay&kind=Video");
    await expect(page.getByRole("alert").filter({ hasText: "Máy chủ đang gặp lỗi" })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByText("khớp bộ lọc")).toHaveCount(0);
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(cards(page)).toHaveCount(1);
    const last = listCalls(backend).at(-1)!;
    expect([last.get("search"), last.getAll("kind")]).toEqual(["chay", ["Video"]]);
  });

  test("an old list stays on screen while a new filter loads, and a late answer to the old filter is ignored", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(3);
    // Request 1 (Tip) is answered late with a row that no longer matches; request 2 (Video) is answered at once.
    backend.failNext("GET", LIST, { status: 200, delayMs: 1500, json: { items: [{ id: "late", slug: "late", kind: "Tip", title: "Kết quả muộn của bộ lọc cũ", summary: "", coverImageUrl: null, publishedAt: "2026-10-01T08:00:00Z" }], total: 1, page: 1, pageSize: 12 } });
    await page.getByRole("button", { name: "Mẹo", exact: true }).click();
    await expect(count(page)).toHaveText("Đang cập nhật kết quả…");
    await expect(cards(page)).toHaveCount(3); // previous list kept, no empty flash, no skeleton
    await expect(page.getByRole("status", { name: "Đang tải bài viết" })).toHaveCount(0);
    await page.getByRole("button", { name: "Mẹo", exact: true }).click(); // untoggle...
    await page.getByRole("button", { name: "Video", exact: true }).click(); // ...and ask for Video
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Video bình chữa cháy");
    await page.waitForTimeout(1800);
    await expect(page.getByText("Kết quả muộn của bộ lọc cũ")).toHaveCount(0);
    await expect(cards(page)).toHaveCount(1);
    await expect(count(page)).toHaveText("1 bài khớp bộ lọc");
  });

  test("first load shows the skeleton", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    backend.failNext("GET", LIST, { status: 200, delayMs: 700, json: { items: [], total: 0, page: 1, pageSize: 12 } });
    await page.goto("/learn?search=chay");
    await expect(page.getByRole("status", { name: "Đang tải bài viết" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
  });
});

test.describe("URL state", () => {
  test("reload, Back and Forward restore search, filters and page", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(3);
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await expect(cards(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Khói", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();
    await box(page).fill("chay");
    await expect(page).toHaveURL(/search=chay/);

    await page.reload();
    await expect(box(page)).toHaveValue("chay");
    await expect(page.getByRole("button", { name: "Video", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Khói", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Không có bài khớp bộ lọc" })).toBeVisible();

    await page.goBack(); // search was a replace of the Khói step: the previous entry has Video only
    await expect(page).toHaveURL(/kind=Video/);
    await expect(page).not.toHaveURL(/situation=/);
    await expect(page.getByRole("button", { name: "Khói", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(box(page)).toHaveValue("");
    await expect(cards(page)).toHaveCount(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByRole("button", { name: "Video", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(cards(page)).toHaveCount(3);
    await page.goForward();
    await expect(page).toHaveURL(/kind=Video/);
    await expect(cards(page)).toHaveCount(1);
  });

  test("Back restores the search text typed before an Enter", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn?search=chay");
    await expect(cards(page)).toHaveCount(2);
    await box(page).fill("duong");
    await box(page).press("Enter");
    await expect(page).toHaveURL(/search=duong/);
    await expect(cards(page)).toHaveCount(1);
    await page.goBack();
    await expect(box(page)).toHaveValue("chay");
    await expect(cards(page)).toHaveCount(2);
  });

  test("two quick filter changes both survive", async ({ page }) => {
    const backend = await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(3);
    await page.getByRole("button", { name: "Mẹo", exact: true }).click();
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await expect(cards(page)).toHaveCount(2);
    expect(listCalls(backend).at(-1)!.getAll("kind")).toEqual(["Tip", "Video"]);
  });

  test("the reader's situation tag opens the list filtered by that situation", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn/thoat-hiem");
    await page.getByRole("link", { name: "Cháy tại nhà" }).click();
    await expect(page).toHaveURL(/\/learn\?situation=fire-at-home/);
    await expect(cards(page)).toHaveCount(1);
  });
});

test.describe("SEO", () => {
  test("the bare list is indexable; search, filter and page variants are noindex", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(page).toHaveTitle("Bài học — FET3D");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Bài viết, mẹo và video ngắn/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    for (const variant of ["?search=chay", "?kind=Tip", "?situation=smoke", "?page=2"]) {
      await page.goto(`/learn${variant}`);
      await expect(page).toHaveTitle("Bài học — FET3D");
      await expect(page.locator('meta[name="robots"]'), variant).toHaveAttribute("content", /noindex/);
    }
  });
});

test.describe("keyboard and touch targets", () => {
  test("search, chips and removal are reachable and operable from the keyboard", async ({ page }) => {
    await setup(page, seedLibrary);
    await page.goto("/learn");
    await expect(cards(page)).toHaveCount(3);
    await box(page).focus();
    await page.keyboard.type("chay");
    await page.keyboard.press("Enter");
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole("button", { name: "Xóa từ khóa" }).focus();
    await page.keyboard.press("Tab"); // submit
    await page.keyboard.press("Tab"); // first kind chip
    const first = page.getByRole("button", { name: "Bài viết", exact: true });
    await expect(first).toBeFocused();
    const outline = await first.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe("none");
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Bỏ lọc loại: Bài viết" }).focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await expect(cards(page)).toHaveCount(2);
  });
});

for (const width of [1440, 375]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`filters fit ${width}px, keep the global dark palette (${scheme} system theme) and have 44px targets`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await setup(page, (b) => {
        seedLibrary(b);
        for (let i = 1; i <= 8; i += 1) b.seedSituation(`tinh-huong-dai-${i}`, `Một tên tình huống khá dài số ${i}`);
        for (let i = 1; i <= 14; i += 1) b.seedPost(`dai-${i}`, { title: `Cháy: một tiêu đề rất dài để kiểm tra việc xuống dòng ở màn hình hẹp ${i}`, summary: "Tóm tắt khá dài ".repeat(15), status: "Published" });
      });
      const url = "/learn?search=" + encodeURIComponent("cháy một-chuỗi-rất-dài-không-có-khoảng-trắng-".repeat(1)) + "&kind=Article&kind=Tip&situation=fire-at-home&situation=smoke";
      for (const path of ["/learn", "/learn?search=chay", url, "/learn?search=a", "/learn?kind=Podcast"]) {
        await page.goto(path);
        await expect(page.getByRole("searchbox", { name: "Tìm bài học" })).toBeVisible();
        await page.waitForTimeout(500);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), `${path} keeps the global dark palette`).toBe("rgb(20, 23, 25)");
      }
      await page.goto(url);
      if (width === 375) {
        const toggle = page.getByRole("button", { name: /^Bộ lọc/ });
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(page.getByRole("button", { name: "Mẹo", exact: true })).toBeHidden(); // collapsed on a phone; the applied filters stay visible
        await expect(page.getByRole("region", { name: "Đang lọc" })).toBeVisible();
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("button", { name: "Mẹo", exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole("button", { name: /^Bộ lọc/ })).toBeHidden();
        await expect(page.getByRole("button", { name: "Mẹo", exact: true })).toBeVisible();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "expanded filters overflow horizontally").toBeLessThanOrEqual(0);
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".learn-search-input, .learn-search-submit, .learn-search-clear, .learn-chip, .learn-active-chip, .learn-inline-action, .learn-filters-toggle")]
        .filter((element) => element.offsetParent !== null)
        .map((element) => ({ name: element.textContent || element.getAttribute("aria-label") || element.className, height: Math.round(element.getBoundingClientRect().height) }))
        .filter((item) => item.height < 44));
      expect(small, "targets under 44px").toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`search-${width}-${scheme}.png`), fullPage: true });
    });
  }
}
