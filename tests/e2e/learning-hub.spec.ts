import { expect, test, type Page } from "@playwright/test";
import { installLearnBackend, LearnBackend, signIn, type Actor } from "./learn-mock";
import { installTraineeAi, TraineeAiBackend } from "./trainee-ai-mock";
import { installTrainingBackend, TrainingBackend } from "./training-history-mock";

/*
 * Learning Hub + public Learn layout. Bookmarks (learn-mock.ts), history/result (training-history-mock.ts) and the Trainee
 * AI Q&A (trainee-ai-mock.ts, BE#77) all run against stateful mock backends. Mock evidence only.
 */

const slug = "doc-khong-gian";

function seed(backend: LearnBackend) {
  backend.seedPost(slug, { title: "Đọc không gian trước khi hành động", summary: "Vì sao làm quen với không gian giúp quyết định rõ hơn.", status: "Published" });
  backend.seedPost("mot-luot-hoc", { title: "Một lượt học có ý nghĩa", summary: "Cấu trúc ba nhịp.", status: "Published" });
  backend.seedPost("tu-bai-doc", { title: "Từ bài đọc đến lượt tập", summary: "Nối kiến thức với trải nghiệm.", status: "Published" });
}

async function restore(page: Page, who: Actor = "trainee", extra: (backend: LearnBackend) => void = () => undefined, ai = new TraineeAiBackend()) {
  const backend = new LearnBackend();
  seed(backend);
  extra(backend);
  await signIn(page, backend, who);
  await installLearnBackend(page, backend);
  await installTrainingBackend(page, new TrainingBackend());
  await installTraineeAi(page, ai);
  return backend;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 980, height: 650 }, { width: 820, height: 650 }, { width: 375, height: 667 }]) {
  test(`hub and login fit ${viewport.width}px with the Google visible and the Q&A view fitting`, async ({ page }, testInfo) => {
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
    await expect(page.getByTestId("trainee-ai-context")).toContainText("Đọc không gian trước khi hành động");
    await expect(page.getByTestId("trainee-ai-quota")).toContainText("160 tokens");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`hub-${viewport.width}.png`), fullPage: true });
    if (viewport.width < 768) await page.getByRole("button", { name: "Mở menu học tập" }).click();
    await page.getByRole("link", { name: /^Lịch sử/ }).click();
    await expect(page.getByTestId("history-empty")).toContainText("Bạn chưa có lượt tập nào");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test("Q&A shows today's allowance, asks with the article as context and polls the answer with a Learn citation", async ({ page }) => {
  const ai = new TraineeAiBackend();
  let ids = { post: "", version: "" };
  await restore(page, "trainee", (backend) => { const seeded = backend.seedPost("hoi-dap", { title: "Thang máy khi có cháy", summary: "x", status: "Published" }); ids = { post: seeded.post.id, version: seeded.version.id }; }, ai);
  await page.goto("/learning-hub?view=questions&article=hoi-dap");
  await expect(page.getByRole("link", { name: /^Hỏi đáp/ })).not.toContainText(/chưa khả dụng/i);
  await expect(page.getByTestId("trainee-ai-quota")).toContainText("Hôm nay còn 160 tokens / 200 tokens");
  await expect(page.getByTestId("trainee-ai-context")).toContainText("Thang máy khi có cháy");
  await page.getByLabel("Câu hỏi", { exact: true }).fill("  Vì sao không nên dùng thang máy?  ");
  await page.getByTestId("ai-send").click();
  await expect(page.getByTestId("ai-answer")).toContainText("Không dùng thang máy", { timeout: 15_000 });
  await expect(page.getByTestId("ai-citation-link").first()).toHaveAttribute("href", "/learn/doc-khong-gian");
  expect(ai.posts()).toHaveLength(1);
  expect(ai.posts()[0].body).toEqual({ question: "Vì sao không nên dùng thang máy?", context: { kind: "Learn", postId: ids.post, versionId: ids.version } });
  expect(ai.posts()[0].headers["idempotency-key"]).toBeTruthy();
  await expect(page).toHaveURL(/request=eeeeeeee/);
  await page.reload();
  await expect(page.getByTestId("ai-answer")).toBeVisible();
  await expect(page.getByTestId("trainee-ai-recent")).toContainText("Vì sao không nên dùng thang máy?");
});

test("a result or a Training from the URL becomes the context; 'Hỏi chung' drops it", async ({ page }) => {
  const ai = new TraineeAiBackend();
  await restore(page, "trainee", () => undefined, ai);
  const session = "aaaaaaaa-0000-4000-8000-000000000001";
  await page.goto(`/learning-hub?view=questions&session=${session}`);
  await expect(page.getByTestId("trainee-ai-context")).toContainText("một kết quả tập huấn của bạn");
  await page.getByLabel("Câu hỏi", { exact: true }).fill("Vì sao tôi chưa đạt?");
  await page.getByTestId("ai-send").click();
  await expect.poll(() => ai.posts().length).toBe(1);
  expect(ai.posts()[0].body).toEqual({ question: "Vì sao tôi chưa đạt?", context: { kind: "Result", sessionId: session } });

  await page.goto("/learning-hub?view=questions&training=bbbbbbbb-0000-4000-8000-000000000001");
  await expect(page.getByTestId("trainee-ai-context")).toContainText("bài tập huấn bạn đã chọn");
  await page.getByRole("button", { name: "Hỏi chung" }).click();
  await expect(page.getByTestId("trainee-ai-context")).toHaveCount(0);
  await page.getByLabel("Câu hỏi", { exact: true }).fill("Bình chữa cháy CO2 dùng thế nào?");
  await page.getByTestId("ai-send").click();
  await expect.poll(() => ai.posts().length).toBe(2);
  expect(ai.posts()[1].body).toEqual({ question: "Bình chữa cháy CO2 dùng thế nào?" });
});

test("no allowance left, an Assessment in progress or no policy blocks before anything is sent", async ({ page }) => {
  const ai = new TraineeAiBackend();
  ai.quota = { ...ai.quota, remainingUnits: 0, canSubmit: false };
  await restore(page, "trainee", () => undefined, ai);
  await page.goto("/learning-hub?view=questions");
  await expect(page.getByTestId("trainee-ai-blocked")).toContainText("Đã hết lượt hỏi hôm nay");
  await page.getByLabel("Câu hỏi", { exact: true }).fill("Còn lượt không?");
  await expect(page.getByTestId("ai-send")).toBeDisabled();

  ai.quota = { ...ai.quota, canSubmit: false, blockedByAssessment: true };
  await page.reload();
  await expect(page.getByTestId("trainee-ai-blocked")).toContainText("AI tạm khóa trong bài đánh giá");

  ai.quota = { ...ai.quota, policyActive: false, blockedByAssessment: false };
  await page.reload();
  await expect(page.getByTestId("trainee-ai-blocked")).toContainText("Hỏi đáp AI chưa được bật");
  expect(ai.posts()).toHaveLength(0);
});

test("a lost response is recovered with the same key or found again by its text, never sent twice", async ({ page }) => {
  const ai = new TraineeAiBackend();
  ai.submitFaults.push("lost-response");
  await restore(page, "trainee", () => undefined, ai);
  await page.goto("/learning-hub?view=questions");
  await page.getByLabel("Câu hỏi", { exact: true }).fill("Câu hỏi bị mất phản hồi");
  await page.getByTestId("ai-send").click();
  await expect(page.getByTestId("ai-unknown")).toBeVisible();
  await page.getByRole("button", { name: "Tra yêu cầu gần nhất của tôi" }).click();
  await expect(page.getByTestId("ai-candidate")).toHaveCount(1);
  await page.getByRole("button", { name: "Theo dõi yêu cầu này" }).click();
  await expect(page.getByTestId("ai-answer")).toBeVisible({ timeout: 15_000 });
  expect(ai.posts()).toHaveLength(1);
  expect(ai.requests.filter((item) => (item.input as { text: string }).text === "Câu hỏi bị mất phản hồi")).toHaveLength(1);
});

test("a withheld answer (access lost) is explained without content; other roles are pointed to their own AI", async ({ page }) => {
  const ai = new TraineeAiBackend();
  const withheld = ai.seed({ resultWithheld: true, result: null, citations: [] });
  await restore(page, "trainee", () => undefined, ai);
  await page.goto(`/learning-hub?view=questions&request=${withheld.requestId}`);
  await expect(page.getByTestId("ai-withheld")).toContainText("không còn truy cập được");
  await expect(page.getByTestId("ai-citations")).toHaveCount(0);

  await restore(page, "org");
  await page.goto("/learning-hub?view=questions");
  await expect(page.getByText("Hỏi đáp AI ở đây dành cho tài khoản học viên")).toBeVisible();
});

test("an unknown article from Learn is explained and the question is sent without it", async ({ page }) => {
  const ai = new TraineeAiBackend();
  await restore(page, "trainee", () => undefined, ai);
  await page.goto("/learning-hub?article=khong-co-bai-nay");
  await expect(page.getByTestId("trainee-ai-article-missing")).toContainText("Không tìm thấy bài bạn mở từ Learn");
  await page.getByLabel("Câu hỏi", { exact: true }).fill("Hỏi chung");
  await page.getByTestId("ai-send").click();
  await expect.poll(() => ai.posts().length).toBe(1);
  expect(ai.posts()[0].body).toEqual({ question: "Hỏi chung" });
});

test("history is a real view with no demo content", async ({ page }) => {
  await restore(page);
  await page.goto("/learning-hub?view=history");
  await expect(page.getByTestId("history-empty")).toContainText("Bạn chưa có lượt tập nào");
  await expect(page.getByText(/minh họa|soạn sẵn/i)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("prototype")))).toEqual([]);
});

test("an article page offers saving but no fake ask button", async ({ page }) => {
  await restore(page, "trainee");
  await page.goto(`/learn/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Đọc không gian trước khi hành động" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu bài viết" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hỏi về bài này" })).toHaveCount(0);
});

test("logout returns home even on backend failure and the Q&A view respects reduced motion", async ({ page }) => {
  await restore(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/learning-hub?view=questions");
  await expect(page.getByTestId("trainee-ai")).toBeVisible();
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
  test("default view lists the bookmarks from the server; the other views do not touch them", async ({ page }) => {
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

for (const width of [375, 1440]) {
  test(`Trainee Q&A fits ${width}px without page overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const ai = new TraineeAiBackend();
    ai.seed();
    await restore(page, "trainee", () => undefined, ai);
    await page.goto(`/learning-hub?view=questions&article=${slug}&request=${ai.requests[0].requestId}`);
    await expect(page.getByTestId("ai-answer")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`trainee-ai-${width}.png`), fullPage: true });
  });
}
