import { expect, test, type Page } from "@playwright/test";
import { installLearnBackend, LearnBackend, signIn } from "./learn-mock";

/*
 * Learn CMS against a STATEFUL MOCK of the real contract (learn-mock.ts). Mock evidence only: it shows the UI sends the
 * right routes, headers (If-Match, Idempotency-Key), payloads and handles the documented responses. It proves nothing
 * about the deployed API.
 */

async function setup(page: Page, seed: (backend: LearnBackend) => void = () => undefined, who: "admin" | "org" | "guest" | "trainee" = "admin") {
  const backend = new LearnBackend();
  seed(backend);
  await signIn(page, backend, who);
  await installLearnBackend(page, backend);
  return backend;
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const publishedCalls = (backend: LearnBackend) => backend.callsTo("POST", /\/api\/admin\/learn\/versions\/[^/]+\/publish$/);

/** Opens the new-post form through the UI (a direct goto can be filled before hydration, which then resets the inputs). */
async function openNew(page: Page, tabName?: string) {
  await page.goto("/admin/learn");
  await page.getByRole("button", { name: "Tạo bài" }).first().click();
  await expect(page.getByRole("heading", { name: "Bài mới" })).toBeVisible();
  if (tabName) await tab(page, tabName).click();
}

async function fillBasics(page: Page, slug: string, title: string, summary: string) {
  await page.getByLabel(/^Slug/).fill(slug);
  await page.getByLabel("Tiêu đề", { exact: true }).fill(title);
  await page.getByLabel(/^Tóm tắt/).fill(summary);
}

async function addParagraph(page: Page, text: string) {
  await tab(page, "Nội dung").click();
  await page.getByLabel("Loại khối").selectOption("paragraph");
  await page.getByRole("button", { name: "Thêm khối" }).click();
  await page.getByTestId("content-block").last().getByLabel(/^Nội dung/).fill(text);
}

test.describe("production Learn CMS", () => {
  test("is no longer a pending module and calls only the real admin routes", async ({ page }) => {
    const backend = await setup(page);
    await page.goto("/admin/learn");
    await expect(page.getByRole("heading", { level: 1, name: "Learn CMS" })).toBeVisible();
    await expect(page.getByTestId("pending-module")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Chưa có bài nào" })).toBeVisible();
    await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
    expect(backend.callsTo("GET", /^\/api\/admin\/learn\/posts$/).length).toBeGreaterThan(0);
    expect(backend.calls.every((call) => /^\/api\/(admin\/learn|auth)/.test(call.path))).toBe(true);
  });

  test("organization users and guests cannot use it", async ({ page }) => {
    await setup(page, () => undefined, "org");
    await page.goto("/admin/learn");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tạo bài" })).toHaveCount(0);
  });

  test("a guest is sent to sign in", async ({ page }) => {
    const backend = await setup(page, () => undefined, "guest");
    await page.goto("/admin/learn");
    await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
    expect(backend.callsTo("GET", /admin\/learn/).length).toBe(0);
  });
});

test.describe("situations", () => {
  test("empty guidance, create with an Idempotency-Key, reload keeps it, duplicate slug is refused", async ({ page }) => {
    const backend = await setup(page);
    await page.goto("/admin/learn?section=situations");
    await expect(page.getByText("Chưa có tình huống nào")).toBeVisible();
    await page.getByRole("button", { name: "Tạo tình huống" }).first().click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Tên tình huống").fill("Cháy trong nhà");
    await drawer.getByLabel("Slug", { exact: true }).fill("chay-trong-nha");
    await drawer.getByRole("button", { name: "Tạo tình huống" }).click();
    await expect(page.getByText("Đã tạo tình huống")).toBeVisible();
    await expect(page.getByRole("table", { name: "Danh mục tình huống Learn" }).getByText("Cháy trong nhà")).toBeVisible();
    const create = backend.callsTo("POST", /\/api\/admin\/learn\/situations$/);
    expect(create).toHaveLength(1);
    expect(create[0].headers["idempotency-key"]).toBeTruthy();
    expect(create[0].body).toMatchObject({ slug: "chay-trong-nha", name: "Cháy trong nhà" });

    await page.reload();
    await expect(page.getByRole("table", { name: "Danh mục tình huống Learn" }).getByText("Cháy trong nhà")).toBeVisible();

    await page.getByRole("button", { name: "Tạo tình huống" }).first().click();
    await page.getByRole("dialog").getByLabel("Tên tình huống").fill("Trùng");
    await page.getByRole("dialog").getByLabel("Slug", { exact: true }).fill("chay-trong-nha");
    await page.getByRole("dialog").getByRole("button", { name: "Tạo tình huống" }).click();
    await expect(page.getByRole("dialog").getByText("Đã có tình huống dùng slug này")).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel("Tên tình huống")).toHaveValue("Trùng");
    expect(backend.situations).toHaveLength(1);
  });

  test("filters by status and search live in the URL", async ({ page }) => {
    await setup(page, (backend) => { backend.seedSituation("a", "Thoát nạn"); backend.seedSituation("b", "Cũ", { isActive: false }); });
    await page.goto("/admin/learn?section=situations&active=false");
    const table = page.getByRole("table", { name: "Danh mục tình huống Learn" });
    await expect(table.getByText("Cũ", { exact: true })).toBeVisible();
    await expect(table.getByText("Thoát nạn")).toHaveCount(0);
    await page.getByLabel("Trạng thái tình huống").selectOption("");
    await expect(table.getByText("Thoát nạn")).toBeVisible();
    await page.getByLabel("Tìm tình huống").fill("thoat");
    await expect(page).toHaveURL(/q=thoat/);
  });
});

test.describe("post lifecycle", () => {
  test("draft -> publish -> hide -> show -> delete -> restore with durable keys and If-Match", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedSituation("chay-nha", "Cháy trong nhà"); b.seedSource("QCVN 06:2022"); });
    await page.goto("/admin/learn");
    await page.getByRole("button", { name: "Tạo bài" }).first().click();
    await expect(page).toHaveURL(/post=new/);
    await fillBasics(page, "thoat-nan-an-toan", "Thoát nạn an toàn", "Ba bước thoát nạn.");
    await addParagraph(page, "Giữ bình tĩnh và đi theo lối thoát gần nhất.");
    await tab(page, "Phân loại và nguồn").click();
    await page.getByRole("checkbox", { name: /Cháy trong nhà/ }).check();
    await page.getByRole("button", { name: "Thêm nguồn QCVN 06:2022" }).click();
    await expect(page.getByTestId("selected-source")).toContainText("Dùng được khi xuất bản");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);

    const created = backend.callsTo("POST", /\/api\/admin\/learn\/posts$/);
    expect(created).toHaveLength(1);
    expect(created[0].headers["idempotency-key"]).toBeTruthy();
    expect(created[0].body).toMatchObject({ slug: "thoat-nan-an-toan", publish: false, version: { kind: "Article", title: "Thoát nạn an toàn", blocks: [{ type: "paragraph", text: "Giữ bình tĩnh và đi theo lối thoát gần nhất." }] } });
    const post = backend.bySlug("thoat-nan-an-toan")!;
    expect(post.status).toBe("Unpublished");

    // Draft is open for editing; publish from the "Xuất bản và hiển thị" tab.
    await expect(page.getByText("Chưa xuất bản").first()).toBeVisible();
    await tab(page, "Xuất bản và hiển thị").click();
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByText("Đã xuất bản", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Đang công khai").first()).toBeVisible();
    expect(post.status).toBe("Published");
    const publish = publishedCalls(backend);
    expect(publish).toHaveLength(1);
    expect(publish[0].headers["if-match"]).toMatch(/^"\d+"$/);
    expect(publish[0].headers["idempotency-key"]).toBeTruthy();

    const lifecycle = async (button: string, confirm: string, expectedStatus: string, operation: string) => {
      await page.getByRole("button", { name: button, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: confirm, exact: true }).click();
      await expect.poll(() => post.status).toBe(expectedStatus);
      const call = backend.callsTo("POST", new RegExp(`/posts/[^/]+/${operation}$`)).at(-1)!;
      expect(call.headers["if-match"]).toMatch(/^"\d+"$/);
      expect(call.headers["idempotency-key"]).toBeTruthy();
    };
    await lifecycle("Ẩn bài", "Ẩn bài", "Hidden", "hide");
    await expect(page.getByText("Đã ẩn", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("status-visibility")).toContainText("vẫn có thể là nguồn RAG hợp lệ theo quyền backend");
    await lifecycle("Hiện lại", "Hiện bài", "Published", "show");
    await lifecycle("Xóa bài", "Xóa bài", "Deleted", "delete");
    await expect(page.getByTestId("status-visibility")).toContainText("loại khỏi RAG");
    await expect(page.getByRole("button", { name: "Xuất bản bản nháp" })).toHaveCount(0);
    await lifecycle("Khôi phục", "Khôi phục", "Hidden", "restore"); // was public once: never straight back to public
    await expect(page.getByText("Đã ẩn", { exact: true }).first()).toBeVisible();

    // Reload recovers the same state from the server.
    await page.reload();
    await expect(page.getByText("Đã ẩn", { exact: true }).first()).toBeVisible();
  });

  test("a never-published post is restored to Unpublished", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("nhap"); });
    const seeded = backend.bySlug("nhap")!;
    backend.externalLifecycle(seeded.id, "Deleted"); // a draft-only post that was soft-deleted: never public
    await page.goto(`/admin/learn?post=${seeded.id}&tab=publish`);
    await page.getByRole("button", { name: "Khôi phục", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Bài chưa từng xuất bản quay về trạng thái Chưa xuất bản");
    await page.getByRole("dialog").getByRole("button", { name: "Khôi phục", exact: true }).click();
    await expect.poll(() => seeded.status).toBe("Unpublished");
  });

  test("create and publish immediately sends publish:true", async ({ page }) => {
    const backend = await setup(page);
    await openNew(page);
    await fillBasics(page, "mot-buoc", "Một bước", "Tóm tắt.");
    await addParagraph(page, "Nội dung.");
    await page.getByRole("button", { name: "Tạo và xuất bản ngay" }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    expect(backend.callsTo("POST", /\/posts$/)[0].body).toMatchObject({ publish: true });
    expect(backend.bySlug("mot-buoc")!.status).toBe("Published");
  });

  test("a duplicate slug is explained at the slug field and the content is kept", async ({ page }) => {
    await setup(page, (b) => { b.seedPost("da-co"); });
    await openNew(page);
    await fillBasics(page, "da-co", "Tiêu đề của tôi", "Tóm tắt của tôi.");
    await addParagraph(page, "Nội dung của tôi.");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã có bài khác dùng slug này").first()).toBeVisible();
    await expect(page).toHaveURL(/post=new/);
    await tab(page, "Thông tin").click();
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Tiêu đề của tôi");
  });
});

test.describe("published versions are immutable", () => {
  test("open a Published version read-only, then create a new draft and publish it; v1 stays unchanged", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("bat-bien", { title: "Bản một", status: "Published" }); });
    const post = backend.bySlug("bat-bien")!;
    await page.goto(`/admin/learn?post=${post.id}`);
    await expect(page.getByText("Đang xem bản đã xuất bản (bất biến)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lưu bản nháp" })).toHaveCount(0);
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toBeDisabled();

    await page.getByRole("button", { name: /Tạo bản nháp mới từ v1/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Tạo bản nháp" }).click();
    await expect(page).toHaveURL(/version=/);
    await expect(page.getByText(/phiên bản 2 \(bản nháp\)/)).toBeVisible();
    const createCall = backend.callsTo("POST", /\/posts\/[^/]+\/versions$/);
    expect(createCall).toHaveLength(1);
    expect(createCall[0].headers["idempotency-key"]).toBeTruthy();

    await page.getByLabel("Tiêu đề", { exact: true }).fill("Bản hai");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    const put = backend.callsTo("PUT", /\/versions\/[^/]+$/)[0];
    expect(put.headers["if-match"]).toBe('"1"');
    expect(put.headers["idempotency-key"]).toBeTruthy();

    await tab(page, "Xuất bản và hiển thị").click();
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect.poll(() => backend.versionsOf(post.id).every((version) => version.status === "Published")).toBe(true);
    const [v1, v2] = backend.versionsOf(post.id);
    expect(v1.title).toBe("Bản một");
    expect(v2.title).toBe("Bản hai");
    expect(post.publishedVersionId).toBe(v2.id);
    // Editing the first version through the API is refused: the UI never even offers it.
    await page.goto(`/admin/learn?post=${post.id}&version=${v1.id}`);
    await expect(page.getByText("Đang xem bản đã xuất bản (bất biến)")).toBeVisible();
    await tab(page, "Phiên bản").click();
    await expect(page.getByRole("table", { name: "Các phiên bản của bài" }).getByText("Đang công khai")).toHaveCount(1);
  });
});

test.describe("412 keeps the editor's work", () => {
  const seedDraft = (b: LearnBackend) => { b.seedPost("xung-dot", { title: "Gốc" }); };

  test("compare, keep mine and save again", async ({ page }) => {
    const backend = await setup(page, seedDraft);
    const post = backend.bySlug("xung-dot")!;
    const [draft] = backend.versionsOf(post.id);
    await page.goto(`/admin/learn?post=${post.id}`);
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Tiêu đề của tôi");
    backend.externalEdit(draft.id, { title: "Tiêu đề người khác" });
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đối chiếu với bản mới nhất trên máy chủ")).toBeVisible();
    await expect(page.getByText(/Khác biệt so với máy chủ: tiêu đề \(máy chủ: “Tiêu đề người khác”\)/)).toBeVisible();
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Tiêu đề của tôi");
    expect(draft.title).toBe("Tiêu đề người khác");
    await page.getByRole("button", { name: "Giữ nội dung của tôi" }).click();
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    expect(draft.title).toBe("Tiêu đề của tôi");
    const puts = backend.callsTo("PUT", /\/versions\//);
    expect(puts[0].headers["if-match"]).toBe('"1"');
    expect(puts[1].headers["if-match"]).toBe('"2"');
    expect(puts[1].headers["idempotency-key"]).not.toBe(puts[0].headers["idempotency-key"]);
  });

  test("take the server version and drop my edit", async ({ page }) => {
    const backend = await setup(page, seedDraft);
    const post = backend.bySlug("xung-dot")!;
    const [draft] = backend.versionsOf(post.id);
    await page.goto(`/admin/learn?post=${post.id}`);
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Bỏ đi");
    backend.externalEdit(draft.id, { title: "Bản máy chủ" });
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await page.getByRole("button", { name: "Tải bản mới (bỏ thay đổi của tôi)" }).click();
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Bản máy chủ");
    await expect(page.getByText("Chưa lưu", { exact: true })).toHaveCount(0);
  });

  test("the draft was published elsewhere: my content survives as a new draft", async ({ page }) => {
    const backend = await setup(page, seedDraft);
    const post = backend.bySlug("xung-dot")!;
    const [draft] = backend.versionsOf(post.id);
    await page.goto(`/admin/learn?post=${post.id}`);
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Nội dung của tôi");
    // Another admin publishes the same draft: its revision moves.
    draft.status = "Published"; draft.revision += 1; post.status = "Published"; post.publishedVersionId = draft.id; post.revision += 1;
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText(/đã được xuất bản ở nơi khác/)).toBeVisible();
    await page.getByRole("button", { name: "Tạo bản nháp mới từ nội dung của tôi" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Tạo bản nháp" }).click();
    await expect.poll(() => backend.versionsOf(post.id).length).toBe(2);
    expect(backend.versionsOf(post.id)[1].title).toBe("Nội dung của tôi");
  });

  test("a stale lifecycle command reloads the post and changes nothing", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("tre", { status: "Published" }); });
    const post = backend.bySlug("tre")!;
    await page.goto(`/admin/learn?post=${post.id}&tab=publish`);
    await expect(page.getByRole("button", { name: "Ẩn bài", exact: true })).toBeVisible();
    backend.externalLifecycle(post.id, "Hidden"); // someone else hid it: revision moved
    await page.getByRole("button", { name: "Ẩn bài", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Ẩn bài", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Đã có thay đổi ở nơi khác")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Đã tải bản mới, đóng" }).click();
    await expect(page.getByRole("button", { name: "Hiện lại", exact: true })).toBeVisible();
    expect(post.status).toBe("Hidden");
  });
});

test.describe("idempotent retry", () => {
  test("publish whose response was lost is retried with the same key and applied once", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("mat-phan-hoi"); });
    const post = backend.bySlug("mat-phan-hoi")!;
    await page.goto(`/admin/learn?post=${post.id}&tab=publish`);
    // The server applies the publish but the answer never reaches the browser.
    backend.failNext("POST", /\/publish$/, { status: 503, json: { code: "UNAVAILABLE", title: "Service unavailable" }, applyFirst: true });
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Máy chủ đang bận")).toBeVisible();
    expect(post.status).toBe("Published"); // applied once already
    await page.getByRole("dialog").getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Đã xuất bản", { exact: true }).first()).toBeVisible();
    const calls = publishedCalls(backend);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers["idempotency-key"]).toBe(calls[0].headers["idempotency-key"]);
    expect(calls[1].headers["if-match"]).toBe(calls[0].headers["if-match"]); // the stale ETag still replays instead of 412
    expect(backend.versionsOf(post.id).filter((version) => version.status === "Published")).toHaveLength(1);
    expect(post.revision).toBe(2);
  });

  test("the key survives closing the dialog and a reload, and changes once the intent changes", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("giu-key"); });
    const post = backend.bySlug("giu-key")!;
    await page.goto(`/admin/learn?post=${post.id}&tab=publish`);
    backend.failNext("POST", /\/publish$/, { status: 503, json: { code: "UNAVAILABLE", title: "x" } });
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Máy chủ đang bận")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Hủy" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByText("Đã xuất bản", { exact: true }).first()).toBeVisible();
    const calls = publishedCalls(backend);
    expect(calls).toHaveLength(2);
    expect(calls[1].headers["idempotency-key"]).toBe(calls[0].headers["idempotency-key"]);
  });

  test("saving the same unsaved content twice after a network error reuses the key", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("luu-lai"); });
    const post = backend.bySlug("luu-lai")!;
    await page.goto(`/admin/learn?post=${post.id}`);
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Tiêu đề mới");
    backend.failNext("PUT", /\/versions\//, { status: 503, json: { code: "UNAVAILABLE", title: "x" }, applyFirst: true });
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Máy chủ đang bận")).toBeVisible();
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    const puts = backend.callsTo("PUT", /\/versions\//);
    expect(puts).toHaveLength(2);
    expect(puts[1].headers["idempotency-key"]).toBe(puts[0].headers["idempotency-key"]);
    expect(backend.versionsOf(post.id)[0].revision).toBe(2); // applied exactly once
  });
});

test.describe("media", () => {
  async function addVideo(page: Page) {
    await tab(page, "Nội dung").click();
    await page.getByLabel("Loại khối").selectOption("video");
    await page.getByRole("button", { name: "Thêm khối" }).click();
    return page.getByTestId("content-block").last();
  }

  test("only YouTube, Facebook and TikTok links pass; the result shows provider and canonical URL; never an iframe", async ({ page }) => {
    const backend = await setup(page);
    await openNew(page);
    await fillBasics(page, "co-video", "Có video", "Tóm tắt video.");
    await page.getByLabel("Loại bài").selectOption("Video");
    const block = await addVideo(page);
    await block.getByLabel(/^Liên kết video/).fill("https://vimeo.com/123456");
    await block.getByLabel(/^Liên kết video/).blur();
    await expect(block.getByText("Dùng liên kết đầy đủ từ YouTube, Facebook hoặc TikTok")).toBeVisible();
    // A refused link blocks saving.
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Có liên kết video bị máy chủ từ chối")).toBeVisible();
    expect(backend.callsTo("POST", /\/posts$/)).toHaveLength(0);

    await block.getByLabel(/^Liên kết video/).fill("https://youtu.be/dQw4w9WgXcQ");
    await block.getByLabel(/^Liên kết video/).blur();
    await expect(block.getByTestId("media-result")).toContainText("YouTube");
    await expect(block.getByTestId("media-result")).toContainText("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    const saved = backend.versionsOf(backend.bySlug("co-video")!.id)[0];
    expect(saved.blocks[0]).toEqual({ type: "video", provider: "YouTube", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    // The create request sent only {type, url}; the server derived the rest.
    expect(backend.callsTo("POST", /\/posts$/)[0].body).toMatchObject({ version: { blocks: [{ type: "video", url: "https://youtu.be/dQw4w9WgXcQ" }] } });
  });

  test("short links and embed markup are rejected by the validate route", async ({ page }) => {
    const backend = await setup(page);
    await openNew(page);
    const block = await addVideo(page);
    for (const url of ["https://fb.watch/abcd1234/", "https://www.youtube.com/embed/abc", "http://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://evil.example/watch?v=dQw4w9WgXcQ"]) {
      await block.getByLabel(/^Liên kết video/).fill(url);
      await block.getByRole("button", { name: "Kiểm tra liên kết" }).click();
      await expect(block.getByRole("alert").first()).toContainText("YouTube, Facebook hoặc TikTok");
    }
    expect(backend.callsTo("POST", /media\/validate$/)).toHaveLength(4);
    await block.getByLabel(/^Liên kết video/).fill("https://www.facebook.com/watch/?v=1234567890");
    await block.getByRole("button", { name: "Kiểm tra liên kết" }).click();
    await expect(block.getByTestId("media-result")).toContainText("Facebook");
  });

  test("a late validate answer for an old link never decorates the new one", async ({ page }) => {
    const backend = await setup(page);
    await openNew(page);
    const block = await addVideo(page);
    backend.failNext("POST", /media\/validate$/, { status: 200, delayMs: 1200, json: { provider: "YouTube", videoId: "AAAAAAAAAAA", canonicalUrl: "https://www.youtube.com/watch?v=AAAAAAAAAAA" } });
    await block.getByLabel(/^Liên kết video/).fill("https://youtu.be/AAAAAAAAAAA");
    await block.getByRole("button", { name: "Kiểm tra liên kết" }).click();
    await block.getByLabel(/^Liên kết video/).fill("https://www.tiktok.com/@fet3d/video/1234567890");
    await block.getByRole("button", { name: "Kiểm tra liên kết" }).click();
    await expect(block.getByTestId("media-result")).toContainText("TikTok");
    await page.waitForTimeout(1600);
    await expect(block.getByTestId("media-result")).toContainText("TikTok");
    await expect(block.getByTestId("media-result")).not.toContainText("YouTube");
  });

  test("a saved video round-trips: provider and videoId are not sent back, extras are kept", async ({ page }) => {
    const backend = await setup(page, (b) => {
      b.seedPost("vong-quay", { kind: "Video", blocks: [{ type: "video", provider: "YouTube", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }] });
    });
    const post = backend.bySlug("vong-quay")!;
    await page.goto(`/admin/learn?post=${post.id}`);
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Đổi tiêu đề");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    expect(backend.callsTo("PUT", /\/versions\//)[0].body).toMatchObject({ blocks: [{ type: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }] });
    expect(Object.keys((backend.callsTo("PUT", /\/versions\//)[0].body as { blocks: Array<Record<string, unknown>> }).blocks[0]).sort()).toEqual(["type", "url"]);
  });

  test("HTML in text is refused before saving and the server's refusal is shown inline", async ({ page }) => {
    const backend = await setup(page);
    await openNew(page);
    await fillBasics(page, "co-html", "Có html", "Tóm tắt.");
    await addParagraph(page, "Xin chào <script>alert(1)</script>");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Chỉ nhận văn bản thuần: không dùng thẻ HTML, iframe hay script.").first()).toBeVisible();
    expect(backend.callsTo("POST", /\/posts$/)).toHaveLength(0);
    await page.getByTestId("content-block").last().getByLabel(/^Nội dung/).fill("1 < 2 vẫn là văn bản");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
  });
});

test.describe("unknown block fields", () => {
  test("extra fields and unknown block types are preserved, sent back and refused by the server with a clear message", async ({ page }) => {
    const backend = await setup(page, (b) => {
      b.seedPost("la", { blocks: [{ type: "paragraph", text: "Đoạn một", futureField: "giữ lại" }, { type: "carousel", slides: [1, 2] }] });
    });
    const post = backend.bySlug("la")!;
    await page.goto(`/admin/learn?post=${post.id}&tab=content`);
    await expect(page.getByTestId("block-extras")).toContainText("futureField");
    await expect(page.getByText("Khối không hỗ trợ 2")).toBeVisible();
    await tab(page, "Thông tin").click();
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Có trường lạ");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    const put = backend.callsTo("PUT", /\/versions\//)[0];
    expect(put.body).toMatchObject({ blocks: [{ type: "paragraph", text: "Đoạn một", futureField: "giữ lại" }, { type: "carousel", slides: [1, 2] }] });
    await expect(page.getByText(/FIELD_UNKNOWN/).first()).toBeVisible();
    await tab(page, "Nội dung").click();
    await expect(page.getByTestId("content-block").first().getByRole("alert")).toContainText("FIELD_UNKNOWN");
    expect(backend.versionsOf(post.id)[0].title).not.toBe("Có trường lạ"); // nothing was silently dropped or half-saved
  });
});

test.describe("sources", () => {
  test("an unapproved source can sit in a draft but blocks publishing; a retired one cannot be added", async ({ page }) => {
    const backend = await setup(page, (b) => {
      b.seedSource("Quy chuẩn đã duyệt");
      b.seedSource("Quy chuẩn chờ duyệt", { approvalStatus: "Draft" });
      b.seedSource("Quy chuẩn hết hạn", { approvalStatus: "Retired" });
      b.seedSource("Quy chuẩn chưa hiệu lực", { effectiveFrom: "2099-01-01T00:00:00Z" });
      b.seedSource("Tài liệu riêng của tổ chức", { visibility: "Organization" });
      b.seedPost("co-nguon");
    });
    const post = backend.bySlug("co-nguon")!;
    await page.goto(`/admin/learn?post=${post.id}&tab=classify`);
    const options = page.getByTestId("source-option");
    await expect(options).toHaveCount(4); // the Organization source never enters the Learn catalog
    await expect(page.getByRole("button", { name: "Thêm nguồn Quy chuẩn hết hạn" })).toBeDisabled();
    await expect(page.getByText("Không thể trích trong bản nháp (nguồn đã ngừng dùng).")).toBeVisible();
    await expect(page.getByText(/chặn xuất bản: Nguồn chưa được duyệt/)).toBeVisible();
    await expect(page.getByText(/chặn xuất bản: Nguồn chưa đến ngày có hiệu lực/)).toBeVisible();
    expect(backend.callsTo("GET", /knowledge-sources$/)[0].search).toContain("visibility=Common");

    await page.getByRole("button", { name: "Thêm nguồn Quy chuẩn chờ duyệt" }).click();
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible(); // a draft may cite it
    expect(backend.versionsOf(post.id)[0].sources).toHaveLength(1);

    await tab(page, "Xuất bản và hiển thị").click();
    await expect(page.getByRole("button", { name: "Xuất bản bản nháp" })).toBeDisabled();
    await expect(page.getByText(/Nguồn “Quy chuẩn chờ duyệt”: Nguồn chưa được duyệt \(Draft\)/)).toBeVisible();
    expect(publishedCalls(backend)).toHaveLength(0);

    // The verdict survives a reload: it is fetched by id for the stored source.
    await page.reload();
    await tab(page, "Xuất bản và hiển thị").click();
    await expect(page.getByRole("button", { name: "Xuất bản bản nháp" })).toBeDisabled();
    expect(backend.callsTo("GET", /knowledge-sources\/[0-9a-f-]{36}$/).length).toBeGreaterThan(0);
  });

  test("create-and-publish is blocked while a chosen source is not publishable", async ({ page }) => {
    await setup(page, (b) => { b.seedSource("Chưa duyệt", { approvalStatus: "Draft" }); });
    await openNew(page, "Phân loại và nguồn");
    await page.getByRole("button", { name: "Thêm nguồn Chưa duyệt" }).click();
    await expect(page.getByRole("button", { name: "Tạo và xuất bản ngay" })).toBeDisabled();
    await expect(page.getByText("Chưa thể xuất bản ngay")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lưu bản nháp" })).toBeEnabled();
  });

  test("when the verdict cannot be read the backend still decides at publish (409 shown)", async ({ page }) => {
    const backend = await setup(page, (b) => {
      const source = b.seedSource("Nguồn lạ", { approvalStatus: "Draft" });
      b.seedPost("kiem-tra-lai", { sources: [{ sourceId: source.id, role: "Reference", locator: {} }] });
    });
    const post = backend.bySlug("kiem-tra-lai")!;
    backend.failNext("GET", /knowledge-sources\/[0-9a-f-]{36}$/, { status: 500, json: { code: "BOOM", title: "boom" } });
    await page.goto(`/admin/learn?post=${post.id}&tab=publish`);
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await expect(page.getByRole("dialog")).toContainText("chưa kiểm tra được");
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Có nguồn chưa được duyệt")).toBeVisible();
    expect(post.status).toBe("Unpublished");
  });
});

test.describe("statuses in the list", () => {
  const seed = (b: LearnBackend) => {
    b.seedPost("a-chua", { title: "Chưa xuất bản" });
    b.seedPost("b-cong-khai", { title: "Công khai", status: "Published" });
    b.seedPost("c-an", { title: "Đang ẩn", status: "Hidden" });
    b.seedPost("d-xoa", { title: "Đã xóa", status: "Deleted" });
  };

  test("quick-edit pane: loads the draft of a never-published post, saves with If-Match + Idempotency-Key, publishes, and the row still opens the editor", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("nhap-nhanh", { title: "Tiêu đề nháp", summary: "Tóm tắt nháp." }); });
    await page.goto("/admin/learn");
    const row = page.getByRole("row").filter({ hasText: "nhap-nhanh" });
    await expect(row.getByText("Chưa có bản xuất bản")).toBeVisible(); // the list carries no title for it (BE#154)
    await page.getByRole("button", { name: "Sửa nhanh bài nhap-nhanh" }).click();
    await expect(page).toHaveURL(/quick=/);
    const pane = page.getByRole("region", { name: "Sửa nhanh bài" });
    await expect(pane.getByLabel("Tiêu đề")).toHaveValue("Tiêu đề nháp");
    await expect(pane.getByRole("button", { name: "Lưu nháp" })).toBeDisabled();

    await pane.getByLabel("Tiêu đề").fill("Tiêu đề đã sửa nhanh");
    await expect(pane.getByRole("button", { name: "Xuất bản" })).toBeDisabled(); // save first
    await pane.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(pane.getByText("Chưa lưu")).toHaveCount(0);
    const puts = backend.callsTo("PUT", /\/api\/admin\/learn\/versions\/[^/]+$/);
    expect(puts).toHaveLength(1);
    expect(puts[0].headers["if-match"]).toMatch(/^"\d+"$/);
    expect(puts[0].headers["idempotency-key"]).toBeTruthy();
    expect((puts[0].body as { title: string; summary: string; blocks: unknown[] }).title).toBe("Tiêu đề đã sửa nhanh");
    expect((puts[0].body as { blocks: unknown[] }).blocks).toHaveLength(1); // the rest of the version is sent unchanged

    await pane.getByRole("button", { name: "Xuất bản", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect.poll(() => publishedCalls(backend).length).toBe(1);
    expect(publishedCalls(backend)[0].headers["if-match"]).toMatch(/^"\d+"$/);
    expect(publishedCalls(backend)[0].headers["idempotency-key"]).toBeTruthy();
    await expect(row.getByText("Tiêu đề đã sửa nhanh")).toBeVisible();
    await expect(pane.getByRole("button", { name: "Ẩn bài" })).toBeVisible();
    await expect(pane.getByLabel("Tiêu đề")).toHaveJSProperty("readOnly", true);

    await page.getByRole("button", { name: /^Mở bài/ }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toBeVisible();
  });

  test("quick-edit pane: lifecycle commands follow the status and hide sends If-Match; Deleted offers only restore", async ({ page }) => {
    const backend = await setup(page, (b) => {
      b.seedPost("dang-cong-khai", { title: "Đang công khai", status: "Published" });
      b.seedPost("da-xoa-roi", { title: "Đã xóa rồi", status: "Deleted" });
    });
    await page.goto("/admin/learn");
    await page.getByRole("button", { name: "Sửa nhanh bài Đang công khai" }).click();
    const pane = page.getByRole("region", { name: "Sửa nhanh bài" });
    await expect(pane.getByText("Bản đã xuất bản là bất biến")).toBeVisible();
    await expect(pane.getByRole("button", { name: "Lưu nháp" })).toHaveCount(0);
    await expect(pane.getByRole("button", { name: "Hiện lại" })).toHaveCount(0);
    await pane.getByRole("button", { name: "Ẩn bài" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Ẩn bài" }).click();
    await expect.poll(() => backend.callsTo("POST", /\/posts\/[^/]+\/hide$/).length).toBe(1);
    const hide = backend.callsTo("POST", /\/posts\/[^/]+\/hide$/)[0];
    expect(hide.headers["if-match"]).toMatch(/^"\d+"$/);
    expect(hide.headers["idempotency-key"]).toBeTruthy();
    await expect(pane.getByRole("button", { name: "Hiện lại" })).toBeVisible();

    await page.getByRole("button", { name: "Sửa nhanh bài Đã xóa rồi" }).click();
    await expect(pane.getByRole("button", { name: "Khôi phục" })).toBeVisible();
    await expect(pane.getByRole("button", { name: /Xuất bản|Ẩn bài|Xóa bài/ })).toHaveCount(0);
    await pane.getByRole("button", { name: "Đóng sửa nhanh" }).click();
    await expect(page).not.toHaveURL(/quick=/);
  });

  test("every state is labelled, the filter lives in the URL, and drafts without a published version say so", async ({ page }) => {
    await setup(page, seed);
    await page.goto("/admin/learn");
    const table = page.getByRole("table", { name: "Danh sách bài Learn" });
    await expect(table.getByRole("row")).toHaveCount(5);
    await expect(table.getByText("Chưa có bản xuất bản")).toBeVisible();
    for (const label of ["Chưa xuất bản", "Đang công khai", "Đã ẩn", "Đã xóa"]) await expect(table.getByText(label, { exact: true }).first()).toBeVisible();
    await page.getByLabel("Trạng thái bài").selectOption("Hidden");
    await expect(page).toHaveURL(/status=Hidden/);
    await expect(table.getByRole("row")).toHaveCount(2);
    await page.reload();
    await expect(page.getByLabel("Trạng thái bài")).toHaveValue("Hidden");
    await expect(table.getByText("Đang ẩn")).toBeVisible();
    await page.getByLabel("Trạng thái bài").selectOption("Deleted");
    await expect(table.getByText("Đã xóa", { exact: true }).first()).toBeVisible();
  });

  test("hidden and deleted posts explain their RAG behaviour; a deleted post only offers restore", async ({ page }) => {
    const backend = await setup(page, seed);
    await page.goto(`/admin/learn?post=${backend.bySlug("c-an")!.id}&tab=publish`);
    await expect(page.getByTestId("status-visibility")).toContainText("Không công khai");
    await expect(page.getByTestId("status-visibility")).toContainText("vẫn có thể là nguồn RAG hợp lệ theo quyền backend");
    await expect(page.getByRole("button", { name: "Hiện lại", exact: true })).toBeVisible();
    await page.goto(`/admin/learn?post=${backend.bySlug("d-xoa")!.id}&tab=publish`);
    await expect(page.getByTestId("status-visibility")).toContainText("bị loại khỏi RAG");
    await expect(page.getByRole("button", { name: "Khôi phục", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ẩn bài", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Xóa bài", exact: true })).toHaveCount(0);
    await page.goto(`/admin/learn?post=${backend.bySlug("a-chua")!.id}&tab=publish`);
    await expect(page.getByTestId("status-visibility")).toContainText("Người đọc nhận 404");
  });

  test("pagination keeps the page in the URL", async ({ page }) => {
    await setup(page, (b) => { for (let i = 1; i <= 25; i += 1) b.seedPost(`bai-${String(i).padStart(2, "0")}`, { title: `Bài ${i}`, status: "Published" }); });
    await page.goto("/admin/learn");
    await expect(page.getByText("1–20 / 25")).toBeVisible();
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("21–25 / 25")).toBeVisible();
    await page.reload();
    await expect(page.getByText("21–25 / 25")).toBeVisible();
  });

  test("loading, error with retry and not found are explicit", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("ok"); });
    backend.failNext("GET", /\/api\/admin\/learn\/posts$/, { status: 500, json: { code: "BOOM", title: "boom" } });
    await page.goto("/admin/learn");
    await expect(page.getByText("Không tải được danh sách bài")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("table", { name: "Danh sách bài Learn" }).getByText("ok", { exact: true })).toBeVisible();
    await page.goto("/admin/learn?post=11111111-2222-4333-8444-555555555555");
    await expect(page.getByText("Không tìm thấy bài")).toBeVisible();
    await page.goto("/admin/learn?post=khong-phai-uuid");
    await expect(page.getByText("Đường dẫn bài không hợp lệ")).toBeVisible();
  });

  test("reload of an open draft restores the saved content from the server", async ({ page }) => {
    const backend = await setup(page);
    await openNew(page);
    await fillBasics(page, "khoi-phuc", "Khôi phục sau reload", "Tóm tắt đã lưu.");
    await addParagraph(page, "Đoạn đã lưu.");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    await page.reload();
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Khôi phục sau reload");
    await tab(page, "Nội dung").click();
    await expect(page.getByTestId("content-block").first().getByLabel(/^Nội dung/)).toHaveValue("Đoạn đã lưu.");
    expect(backend.versionsOf(backend.bySlug("khoi-phuc")!.id)).toHaveLength(1);
  });

  test("leaving a form with unsaved changes asks first", async ({ page }) => {
    await setup(page, (b) => { b.seedPost("roi-di"); });
    await page.goto("/admin/learn");
    await page.getByRole("button", { name: /Mở bài/ }).click();
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Chưa lưu");
    await page.getByRole("button", { name: "Về danh sách" }).click();
    await expect(page.getByRole("dialog")).toContainText("Bỏ thay đổi chưa lưu?");
    await page.getByRole("button", { name: "Tiếp tục sửa" }).click();
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Chưa lưu");
  });
});

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"] as const) {
    test(`CMS screens fit ${width}px in the ${theme} operations theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      const backend = await setup(page, (b) => {
        b.seedSituation("chay-nha", "Cháy trong nhà");
        const source = b.seedSource("QCVN 06:2022 về an toàn cháy cho nhà và công trình");
        b.seedPost("ban-nhap-dai", {
          title: "Một tiêu đề rất dài để kiểm tra việc xuống dòng trong bảng và trong trình soạn ở màn hình hẹp không làm tràn ngang",
          summary: "Tóm tắt.", situationIds: [b.situations[0].id], sources: [{ sourceId: source.id, role: "Primary", locator: {} }],
          blocks: [{ type: "heading", text: "Mục chính", level: 2 }, { type: "paragraph", text: "Đoạn văn." }, { type: "list", ordered: true, items: ["Một", "Hai"] }, { type: "callout", tone: "warning", text: "Lưu ý." }, { type: "image", url: "https://example.com/a-very-long-image-url/that/keeps/going/and/going/image.png", alt: "Ảnh" }, { type: "video", provider: "YouTube", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
        });
        b.seedPost("da-xuat-ban", { status: "Published", title: "Đã xuất bản" });
      });
      const draft = backend.bySlug("ban-nhap-dai")!;
      const paths = ["/admin/learn", "/admin/learn?section=situations", `/admin/learn?post=${draft.id}`, `/admin/learn?post=${draft.id}&tab=content`, `/admin/learn?post=${draft.id}&tab=classify`, `/admin/learn?post=${draft.id}&tab=publish`, `/admin/learn?post=${draft.id}&tab=versions`, "/admin/learn?post=new&tab=content"];
      for (const path of paths) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: "Learn CMS" })).toBeVisible();
        await page.waitForTimeout(500);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
        const resolved = await page.locator(".ops-theme").first().getAttribute("data-resolved-theme");
        expect(resolved).toBe(theme);
      }
      await page.goto(`/admin/learn?post=${draft.id}&tab=content`);
      await page.screenshot({ path: testInfo.outputPath(`cms-editor-${width}-${theme}.png`), fullPage: true });
    });
  }
}
