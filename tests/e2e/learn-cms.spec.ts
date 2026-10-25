import { expect, test, type Locator, type Page } from "@playwright/test";
import { installLearnBackend, LearnBackend, signIn } from "./learn-mock";

/*
 * Learn CMS (Admin v2) against a STATEFUL MOCK of the real contract (learn-mock.ts). Mock evidence only: it shows the UI sends
 * the right routes, headers (If-Match, Idempotency-Key), payloads and handles the documented responses. It proves nothing
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
const postsTable = (page: Page) => page.getByTestId("learn-posts-table");
const quickDrawer = (page: Page) => page.getByTestId("learn-quick-drawer");
/** A confirmation dialog stacked over the drawer or the list, picked by its question. */
const confirmDialog = (page: Page, question: string | RegExp) => page.getByRole("dialog").filter({ hasText: question });
/** Picks one value in a toolbar FilterChip ("Trạng thái: tất cả ›"). */
async function pickChip(page: Page, label: string, option: string) {
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Opens the "Bài mới" modal through the list (a direct goto can be filled before hydration, which then resets the inputs). */
async function openNew(page: Page): Promise<Locator> {
  await page.goto("/admin/learn");
  await page.getByRole("button", { name: "Tạo bài" }).first().click();
  await expect(page).toHaveURL(/post=new/);
  const dialog = page.getByTestId("learn-new-post");
  await expect(dialog.getByRole("heading", { name: "Bài mới" })).toBeVisible();
  return dialog;
}

async function fillBasics(dialog: Locator, slug: string, title: string, summary: string, intro = "Đoạn mở đầu của bài.") {
  await dialog.getByLabel(/^Đường dẫn rút gọn/).fill(slug);
  await dialog.getByLabel("Tiêu đề", { exact: true }).fill(title);
  await dialog.getByLabel(/^Tóm tắt/).fill(summary);
  await dialog.getByLabel(/^Đoạn mở đầu/).fill(intro);
}

/** Creates a Draft through the modal and lands in the editor (`?post=<id>`). */
async function createDraft(page: Page, slug: string, title: string, summary: string, intro?: string) {
  const dialog = await openNew(page);
  await fillBasics(dialog, slug, title, summary, intro);
  await dialog.getByTestId("create-post").click();
  await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
}

/** Adds a block of `type` in the editor's "Khối nội dung" card and returns it. */
async function addBlock(page: Page, type: string) {
  await page.getByLabel("Loại khối").selectOption(type);
  await page.getByRole("button", { name: "Thêm khối" }).click();
  return page.getByTestId("content-block").last();
}

async function addParagraph(page: Page, text: string) {
  const block = await addBlock(page, "paragraph");
  await block.getByLabel(/^Nội dung/).fill(text);
}

/** Chooses one entry in a kind/situation combobox; a multi-select stays open after a pick, so it is closed with Escape (the topmost layer only). */
async function pickOption(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).click();
  if ((await trigger.getAttribute("aria-expanded")) === "true") await page.keyboard.press("Escape");
}

test.describe("production Learn CMS", () => {
  test("is no longer a pending module and calls only the real admin routes", async ({ page }) => {
    const backend = await setup(page);
    await page.goto("/admin/learn");
    await expect(page.getByRole("heading", { level: 1, name: "Quản lý bài học" })).toBeVisible();
    await expect(page.getByTestId("pending-module")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Chưa có bài nào" })).toBeVisible();
    await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
    await expect(tab(page, "Bài viết")).toHaveAttribute("data-state", "active");
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
  test("empty guidance, create (modal) with an Idempotency-Key, reload keeps it, duplicate slug is refused", async ({ page }) => {
    const backend = await setup(page);
    await page.goto("/admin/learn?section=situations");
    await expect(tab(page, "Tình huống")).toHaveAttribute("data-state", "active");
    await expect(page.getByText("Chưa có tình huống nào")).toBeVisible();
    await page.getByRole("button", { name: "Tạo tình huống" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tên tình huống").fill("Cháy trong nhà");
    await dialog.getByLabel("Đường dẫn rút gọn", { exact: true }).fill("chay-trong-nha");
    await dialog.getByRole("button", { name: "Tạo tình huống" }).click();
    await expect(page.getByText("Đã tạo tình huống")).toBeVisible();
    const table = page.getByRole("table", { name: "Danh mục tình huống bài học" });
    await expect(table.getByText("Cháy trong nhà")).toBeVisible();
    const create = backend.callsTo("POST", /\/api\/admin\/learn\/situations$/);
    expect(create).toHaveLength(1);
    expect(create[0].headers["idempotency-key"]).toBeTruthy();
    expect(create[0].body).toMatchObject({ slug: "chay-trong-nha", name: "Cháy trong nhà" });

    await page.reload();
    await expect(table.getByText("Cháy trong nhà")).toBeVisible();

    await page.getByRole("button", { name: "Tạo tình huống" }).first().click();
    await page.getByRole("dialog").getByLabel("Tên tình huống").fill("Trùng");
    await page.getByRole("dialog").getByLabel("Đường dẫn rút gọn", { exact: true }).fill("chay-trong-nha");
    await page.getByRole("dialog").getByRole("button", { name: "Tạo tình huống" }).click();
    await expect(page.getByRole("dialog").getByText("Đã có tình huống dùng đường dẫn rút gọn này")).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel("Tên tình huống")).toHaveValue("Trùng");
    expect(backend.situations).toHaveLength(1);
  });

  test("filters by status (chip) and search live in the URL", async ({ page }) => {
    await setup(page, (backend) => { backend.seedSituation("a", "Thoát nạn"); backend.seedSituation("b", "Cũ", { isActive: false }); });
    await page.goto("/admin/learn?section=situations&active=false");
    const table = page.getByRole("table", { name: "Danh mục tình huống bài học" });
    await expect(table.getByText("Cũ", { exact: true })).toBeVisible();
    await expect(table.getByText("Thoát nạn")).toHaveCount(0);
    await pickChip(page, "Trạng thái", "mọi trạng thái");
    await expect(page).not.toHaveURL(/active=/);
    await expect(table.getByText("Thoát nạn")).toBeVisible();
    await page.getByLabel("Tìm tình huống").fill("thoat");
    await expect(page).toHaveURL(/q=thoat/);
  });
});

test.describe("post lifecycle", () => {
  test("modal draft -> editor source -> publish -> hide -> show -> delete -> restore with durable keys and If-Match", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedSituation("chay-nha", "Cháy trong nhà"); b.seedSource("QCVN 06:2022"); });
    const dialog = await openNew(page);
    await fillBasics(dialog, "thoat-nan-an-toan", "Thoát nạn an toàn", "Ba bước thoát nạn.", "Giữ bình tĩnh và đi theo lối thoát gần nhất.");
    await pickOption(page, dialog.getByLabel("Tình huống"), /Cháy trong nhà/);
    await dialog.getByTestId("create-post").click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);

    const created = backend.callsTo("POST", /\/api\/admin\/learn\/posts$/);
    expect(created).toHaveLength(1);
    expect(created[0].headers["idempotency-key"]).toBeTruthy();
    expect(created[0].body).toMatchObject({ slug: "thoat-nan-an-toan", publish: false, version: { kind: "Article", title: "Thoát nạn an toàn", situationIds: [backend.situations[0].id], blocks: [{ type: "paragraph", text: "Giữ bình tĩnh và đi theo lối thoát gần nhất." }] } });
    const post = backend.bySlug("thoat-nan-an-toan")!;
    expect(post.status).toBe("Unpublished");

    // The editor opens the Draft: cite a source in the "Nguồn Common" card and save with If-Match.
    await page.getByRole("button", { name: "Thêm nguồn QCVN 06:2022" }).click();
    await expect(page.getByTestId("selected-source")).toContainText("Dùng được khi xuất bản");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    const put = backend.callsTo("PUT", /\/versions\/[^/]+$/)[0];
    expect(put.headers["if-match"]).toBe('"1"');
    expect(put.headers["idempotency-key"]).toBeTruthy();

    // Publish from the "Phiên bản & Xuất bản" screen.
    await expect(page.getByText("Chưa xuất bản").first()).toBeVisible();
    await tab(page, "Phiên bản & Xuất bản").click();
    await expect(page).toHaveURL(/tab=publish/);
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
    await expect(page.getByTestId("status-visibility")).toContainText("AI vẫn có thể dùng khi người hỏi có quyền");
    await lifecycle("Hiện lại", "Hiện bài", "Published", "show");
    await lifecycle("Xóa bài", "Xóa bài", "Deleted", "delete");
    await expect(page.getByTestId("status-visibility")).toContainText("AI không còn dùng");
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

  test("the modal's 'Xuất bản ngay' toggle sends publish:true", async ({ page }) => {
    const backend = await setup(page);
    const dialog = await openNew(page);
    await fillBasics(dialog, "mot-buoc", "Một bước", "Tóm tắt.", "Nội dung.");
    await dialog.getByLabel("Xuất bản ngay").check();
    await dialog.getByRole("button", { name: "Tạo và xuất bản ngay" }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    expect(backend.callsTo("POST", /\/posts$/)[0].body).toMatchObject({ publish: true });
    expect(backend.bySlug("mot-buoc")!.status).toBe("Published");
  });

  test("a duplicate slug is explained at the slug field and the modal keeps its content", async ({ page }) => {
    await setup(page, (b) => { b.seedPost("da-co"); });
    const dialog = await openNew(page);
    await fillBasics(dialog, "da-co", "Tiêu đề của tôi", "Tóm tắt của tôi.", "Nội dung của tôi.");
    await dialog.getByTestId("create-post").click();
    await expect(dialog.getByText("Đã có bài khác dùng đường dẫn rút gọn này").first()).toBeVisible();
    await expect(page).toHaveURL(/post=new/);
    await expect(dialog.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Tiêu đề của tôi");
  });

  test("closing a started modal asks first", async ({ page }) => {
    await setup(page);
    const dialog = await openNew(page);
    await dialog.getByLabel("Tiêu đề", { exact: true }).fill("Dở dang");
    await dialog.getByRole("button", { name: "Hủy" }).click();
    await expect(confirmDialog(page, "Bỏ bài đang soạn?")).toBeVisible();
    await confirmDialog(page, "Bỏ bài đang soạn?").getByRole("button", { name: "Tiếp tục soạn" }).click();
    await expect(dialog.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Dở dang");
    await dialog.getByRole("button", { name: "Hủy" }).click();
    await confirmDialog(page, "Bỏ bài đang soạn?").getByRole("button", { name: "Bỏ bài" }).click();
    await expect(page).not.toHaveURL(/post=/);
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
    await expect(page.getByText(/v2 \(bản nháp\)/)).toBeVisible();
    const createCall = backend.callsTo("POST", /\/posts\/[^/]+\/versions$/);
    expect(createCall).toHaveLength(1);
    expect(createCall[0].headers["idempotency-key"]).toBeTruthy();

    await page.getByLabel("Tiêu đề", { exact: true }).fill("Bản hai");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    const put = backend.callsTo("PUT", /\/versions\/[^/]+$/)[0];
    expect(put.headers["if-match"]).toBe('"1"');
    expect(put.headers["idempotency-key"]).toBeTruthy();

    await tab(page, "Phiên bản & Xuất bản").click();
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
    await tab(page, "Phiên bản & Xuất bản").click();
    const versions = page.getByRole("table", { name: "Các phiên bản của bài" });
    await expect(versions.getByText("Đang công khai")).toHaveCount(1);
    await expect(versions.getByText("Đang mở")).toHaveCount(1);
    // A row click opens that version.
    await versions.getByText("v2", { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`version=${v2.id}`));
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
  test("only YouTube, Facebook and TikTok links pass; the result shows provider and canonical URL; never an iframe", async ({ page }) => {
    const backend = await setup(page);
    await createDraft(page, "co-video", "Có video", "Tóm tắt video.");
    const post = backend.bySlug("co-video")!;
    await pickOption(page, page.getByRole("combobox", { name: "Loại bài" }), /^Video$/);
    const block = await addBlock(page, "video");
    await block.getByLabel(/^Liên kết video/).fill("https://vimeo.com/123456");
    await block.getByLabel(/^Liên kết video/).blur();
    await expect(block.getByText("Dùng liên kết đầy đủ từ YouTube, Facebook hoặc TikTok")).toBeVisible();
    // A refused link blocks saving.
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Có liên kết video không hợp lệ")).toBeVisible();
    expect(backend.callsTo("PUT", /\/versions\//)).toHaveLength(0);

    await block.getByLabel(/^Liên kết video/).fill("https://youtu.be/dQw4w9WgXcQ");
    await block.getByLabel(/^Liên kết video/).blur();
    await expect(block.getByTestId("media-result")).toContainText("YouTube");
    await expect(block.getByTestId("media-result")).toContainText("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    const saved = backend.versionsOf(post.id)[0];
    expect(saved.kind).toBe("Video");
    expect(saved.blocks[1]).toEqual({ type: "video", provider: "YouTube", videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    // The save sent only {type, url}; the server derived the rest.
    expect(backend.callsTo("PUT", /\/versions\//)[0].body).toMatchObject({ kind: "Video", blocks: [{ type: "paragraph" }, { type: "video", url: "https://youtu.be/dQw4w9WgXcQ" }] });
  });

  test("the Bài mới modal creates a Video post with its link; the server rejects an unsupported one at the field", async ({ page }) => {
    const backend = await setup(page);
    const dialog = await openNew(page);
    await fillBasics(dialog, "video-ngay", "Video ngay", "Tóm tắt.", "Mở đầu.");
    await pickOption(page, dialog.getByRole("combobox", { name: "Loại bài" }), /^Video$/);
    await dialog.getByLabel(/^Liên kết video/).fill("https://vimeo.com/123456");
    await dialog.getByTestId("create-post").click();
    await expect(dialog.getByText(/Dùng liên kết đầy đủ từ YouTube/).first()).toBeVisible();
    expect(backend.bySlug("video-ngay")).toBeUndefined();
    await dialog.getByLabel(/^Liên kết video/).fill("https://youtu.be/dQw4w9WgXcQ");
    await dialog.getByTestId("create-post").click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    expect(backend.versionsOf(backend.bySlug("video-ngay")!.id)[0].blocks[1]).toMatchObject({ type: "video", provider: "YouTube" });
  });

  test("short links and embed markup are rejected by the validate route", async ({ page }) => {
    const backend = await setup(page);
    await createDraft(page, "kiem-tra-link", "Kiểm tra liên kết", "Tóm tắt.");
    const block = await addBlock(page, "video");
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
    await createDraft(page, "tre-link", "Trễ liên kết", "Tóm tắt.");
    const block = await addBlock(page, "video");
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

  test("HTML in text is refused before creating and the server's refusal is shown inline", async ({ page }) => {
    const backend = await setup(page);
    const dialog = await openNew(page);
    await fillBasics(dialog, "co-html", "Có html", "Tóm tắt.", "Xin chào <script>alert(1)</script>");
    await dialog.getByTestId("create-post").click();
    await expect(dialog.getByText("Chỉ nhận văn bản thuần: không dùng thẻ HTML, iframe hay script.").first()).toBeVisible();
    expect(backend.callsTo("POST", /\/posts$/)).toHaveLength(0);
    await dialog.getByLabel(/^Đoạn mở đầu/).fill("1 < 2 vẫn là văn bản");
    await dialog.getByTestId("create-post").click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    // In the editor the same rule holds for every block.
    await addParagraph(page, "<b>đậm</b>");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Chỉ nhận văn bản thuần: không dùng thẻ HTML, iframe hay script.").first()).toBeVisible();
    expect(backend.callsTo("PUT", /\/versions\//)).toHaveLength(0);
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
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Có trường lạ");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    const put = backend.callsTo("PUT", /\/versions\//)[0];
    expect(put.body).toMatchObject({ blocks: [{ type: "paragraph", text: "Đoạn một", futureField: "giữ lại" }, { type: "carousel", slides: [1, 2] }] });
    await expect(page.getByText(/thông tin không thuộc loại khối/).first()).toBeVisible();
    await expect(page.getByTestId("content-block").first().getByRole("alert")).toContainText("thông tin không thuộc loại khối");
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
    await page.goto(`/admin/learn?post=${post.id}&tab=classify`); // the old tab value still opens the content screen
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
    await expect(page.getByRole("button", { name: /^Xuất bản v1/ })).toBeDisabled(); // the header publish button says why

    await tab(page, "Phiên bản & Xuất bản").click();
    await expect(page.getByRole("button", { name: "Xuất bản bản nháp" })).toBeDisabled();
    await expect(page.getByText(/Nguồn “Quy chuẩn chờ duyệt”: Nguồn chưa được duyệt/).first()).toBeVisible();
    expect(publishedCalls(backend)).toHaveLength(0);

    // The verdict survives a reload: it is fetched by id for the stored source.
    await page.reload();
    await expect(page.getByRole("button", { name: "Xuất bản bản nháp" })).toBeDisabled();
    expect(backend.callsTo("GET", /knowledge-sources\/[0-9a-f-]{36}$/).length).toBeGreaterThan(0);
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

  test("quick-edit drawer: a row click loads the draft of a never-published post, saves with If-Match + Idempotency-Key, publishes, and opens the editor", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedPost("nhap-nhanh", { title: "Tiêu đề nháp", summary: "Tóm tắt nháp." }); });
    await page.goto("/admin/learn");
    const row = postsTable(page).getByRole("row").filter({ hasText: "nhap-nhanh" });
    await expect(row.getByText("Chưa có bản xuất bản")).toBeVisible(); // the list carries no title for it (BE#154)
    await row.click();
    await expect(page).toHaveURL(/quick=/);
    const pane = quickDrawer(page);
    await expect(pane.getByLabel("Tiêu đề")).toHaveValue("Tiêu đề nháp");
    await expect(pane.getByRole("button", { name: "Lưu nháp" })).toBeDisabled();

    await pane.getByLabel("Tiêu đề").fill("Tiêu đề đã sửa nhanh");
    await expect(pane.getByText("Chưa lưu")).toBeVisible();
    await expect(pane.getByRole("button", { name: "Xuất bản", exact: true })).toBeDisabled(); // save first
    await pane.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(pane.getByText("Chưa lưu")).toHaveCount(0);
    const puts = backend.callsTo("PUT", /\/api\/admin\/learn\/versions\/[^/]+$/);
    expect(puts).toHaveLength(1);
    expect(puts[0].headers["if-match"]).toMatch(/^"\d+"$/);
    expect(puts[0].headers["idempotency-key"]).toBeTruthy();
    expect((puts[0].body as { title: string; summary: string; blocks: unknown[] }).title).toBe("Tiêu đề đã sửa nhanh");
    expect((puts[0].body as { blocks: unknown[] }).blocks).toHaveLength(1); // the rest of the version is sent unchanged

    await pane.getByRole("button", { name: "Xuất bản", exact: true }).click();
    await confirmDialog(page, "Xuất bản bản nháp này?").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect.poll(() => publishedCalls(backend).length).toBe(1);
    expect(publishedCalls(backend)[0].headers["if-match"]).toMatch(/^"\d+"$/);
    expect(publishedCalls(backend)[0].headers["idempotency-key"]).toBeTruthy();
    await expect(pane.getByRole("button", { name: "Ẩn bài" })).toBeVisible();
    await expect(pane.getByLabel("Tiêu đề")).toHaveJSProperty("readOnly", true);

    await pane.getByRole("button", { name: "Mở trình soạn đầy đủ" }).click();
    await expect(page).toHaveURL(/post=[0-9a-f-]{36}/);
    await expect(page).not.toHaveURL(/quick=/);
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toBeVisible();
    // The list behind was refreshed with the published title.
    await page.getByRole("button", { name: "Về danh sách" }).click();
    await expect(postsTable(page).getByText("Tiêu đề đã sửa nhanh")).toBeVisible();
  });

  test("quick-edit drawer: lifecycle commands follow the status and hide sends If-Match; Deleted offers only restore", async ({ page }) => {
    const backend = await setup(page, (b) => {
      b.seedPost("dang-cong-khai", { title: "Đang công khai", status: "Published" });
      b.seedPost("da-xoa-roi", { title: "Đã xóa rồi", status: "Deleted" });
    });
    await page.goto("/admin/learn");
    await postsTable(page).getByRole("row").filter({ hasText: "dang-cong-khai" }).click();
    const pane = quickDrawer(page);
    await expect(pane.getByText("Bản đã xuất bản là bất biến")).toBeVisible();
    await expect(pane.getByRole("button", { name: "Lưu nháp" })).toHaveCount(0);
    await expect(pane.getByRole("button", { name: "Hiện lại" })).toHaveCount(0);
    await pane.getByRole("button", { name: "Ẩn bài" }).click();
    await confirmDialog(page, "Ẩn bài khỏi công khai?").getByRole("button", { name: "Ẩn bài" }).click();
    await expect.poll(() => backend.callsTo("POST", /\/posts\/[^/]+\/hide$/).length).toBe(1);
    const hide = backend.callsTo("POST", /\/posts\/[^/]+\/hide$/)[0];
    expect(hide.headers["if-match"]).toMatch(/^"\d+"$/);
    expect(hide.headers["idempotency-key"]).toBeTruthy();
    await expect(pane.getByRole("button", { name: "Hiện lại" })).toBeVisible();
    await pane.getByRole("button", { name: "Đóng" }).click();
    await expect(page).not.toHaveURL(/quick=/);

    await postsTable(page).getByRole("row").filter({ hasText: "da-xoa-roi" }).click();
    await expect(pane.getByRole("button", { name: "Khôi phục" })).toBeVisible();
    await expect(pane.getByRole("button", { name: /Xuất bản|Ẩn bài|Xóa bài/ })).toHaveCount(0);
    await pane.getByRole("button", { name: "Đóng" }).click();
    await expect(page).not.toHaveURL(/quick=/);
  });

  test("row menu: hide from the list sends If-Match from the row's revision; publish loads the draft first", async ({ page }) => {
    const backend = await setup(page, (b) => {
      b.seedPost("menu-cong-khai", { title: "Menu công khai", status: "Published" });
      b.seedPost("menu-nhap", { title: "Menu nháp" });
    });
    await page.goto("/admin/learn");
    const table = postsTable(page);
    await table.getByRole("row").filter({ hasText: "menu-cong-khai" }).getByRole("button", { name: "Thao tác" }).click();
    await page.getByRole("menuitem", { name: "Ẩn bài" }).click();
    await confirmDialog(page, "Ẩn bài khỏi công khai?").getByRole("button", { name: "Ẩn bài" }).click();
    await expect.poll(() => backend.bySlug("menu-cong-khai")!.status).toBe("Hidden");
    const hide = backend.callsTo("POST", /\/posts\/[^/]+\/hide$/)[0];
    expect(hide.headers["if-match"]).toBe('"2"');
    expect(hide.headers["idempotency-key"]).toBeTruthy();
    await expect(table.getByRole("row").filter({ hasText: "menu-cong-khai" }).getByText("Đã ẩn")).toBeVisible();

    await table.getByRole("row").filter({ hasText: "menu-nhap" }).getByRole("button", { name: "Thao tác" }).click();
    await page.getByRole("menuitem", { name: "Xuất bản bản nháp" }).click();
    const dialog = confirmDialog(page, "Xuất bản bản nháp này?");
    await expect(dialog).toContainText("v1");
    await dialog.getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect.poll(() => backend.bySlug("menu-nhap")!.status).toBe("Published");
    expect(publishedCalls(backend)[0].headers["if-match"]).toBe('"1"');
    await expect(table.getByRole("row").filter({ hasText: "menu-nhap" }).getByText("Menu nháp")).toBeVisible();
  });

  test("every state is labelled, the status filter lives in the URL, and drafts without a published version say so", async ({ page }) => {
    await setup(page, seed);
    await page.goto("/admin/learn");
    const table = page.getByRole("table", { name: "Danh sách bài học" });
    await expect(table.getByRole("row")).toHaveCount(5);
    await expect(table.getByText("Chưa có bản xuất bản")).toBeVisible();
    for (const label of ["Chưa xuất bản", "Đang công khai", "Đã ẩn", "Đã xóa"]) await expect(table.getByText(label, { exact: true }).first()).toBeVisible();
    await pickChip(page, "Trạng thái", "Đã ẩn");
    await expect(page).toHaveURL(/status=Hidden/);
    await expect(table.getByRole("row")).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Trạng thái:/ })).toContainText("Đã ẩn");
    await expect(table.getByText("Đang ẩn")).toBeVisible();
    await pickChip(page, "Trạng thái", "Đã xóa");
    await expect(table.getByText("Đã xóa", { exact: true }).first()).toBeVisible();
    // Search and kind only narrow the loaded page (the admin API has neither) and say so.
    await pickChip(page, "Trạng thái", "tất cả");
    await page.getByLabel("Tìm bài").fill("cong-khai");
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(page.getByText(/áp dụng cho \d+ bài của trang đang mở/)).toBeVisible();
  });

  test("hidden and deleted posts explain their RAG behaviour; a deleted post only offers restore", async ({ page }) => {
    const backend = await setup(page, seed);
    await page.goto(`/admin/learn?post=${backend.bySlug("c-an")!.id}&tab=publish`);
    await expect(page.getByTestId("status-visibility")).toContainText("Không công khai");
    await expect(page.getByTestId("status-visibility")).toContainText("AI vẫn có thể dùng khi người hỏi có quyền");
    await expect(page.getByRole("button", { name: "Hiện lại", exact: true })).toBeVisible();
    await page.goto(`/admin/learn?post=${backend.bySlug("d-xoa")!.id}&tab=publish`);
    await expect(page.getByTestId("status-visibility")).toContainText("AI không còn dùng");
    await expect(page.getByRole("button", { name: "Khôi phục", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ẩn bài", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Xóa bài", exact: true })).toHaveCount(0);
    await page.goto(`/admin/learn?post=${backend.bySlug("a-chua")!.id}&tab=publish`);
    await expect(page.getByTestId("status-visibility")).toContainText("Người đọc không mở được bài");
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
    await expect(page.getByRole("table", { name: "Danh sách bài học" }).getByText("ok", { exact: true })).toBeVisible();
    await page.goto("/admin/learn?post=11111111-2222-4333-8444-555555555555");
    await expect(page.getByText("Không tìm thấy bài")).toBeVisible();
    await page.goto("/admin/learn?post=khong-phai-uuid");
    await expect(page.getByText("Đường dẫn bài không hợp lệ")).toBeVisible();
  });

  test("reload of an open draft restores the saved content from the server", async ({ page }) => {
    const backend = await setup(page);
    await createDraft(page, "khoi-phuc", "Khôi phục sau reload", "Tóm tắt đã lưu.", "Đoạn đã lưu.");
    await page.reload();
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Khôi phục sau reload");
    await expect(page.getByTestId("content-block").first().getByLabel(/^Nội dung/)).toHaveValue("Đoạn đã lưu.");
    expect(backend.versionsOf(backend.bySlug("khoi-phuc")!.id)).toHaveLength(1);
  });

  test("leaving the editor with unsaved changes asks first", async ({ page }) => {
    await setup(page, (b) => { b.seedPost("roi-di"); });
    await page.goto("/admin/learn");
    await postsTable(page).getByRole("row").filter({ hasText: "roi-di" }).click();
    await quickDrawer(page).getByRole("button", { name: "Mở trình soạn đầy đủ" }).click();
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
      const published = backend.bySlug("da-xuat-ban")!;
      const paths = ["/admin/learn", `/admin/learn?quick=${published.id}`, "/admin/learn?section=situations", `/admin/learn?post=${draft.id}`, `/admin/learn?post=${draft.id}&tab=publish`, "/admin/learn?post=new"];
      for (const path of paths) {
        await page.goto(path);
        // v2: quick edit and the new-post form are modal, which hides the page heading from the accessibility tree.
        await expect(page.getByRole("dialog").or(page.getByRole("heading", { level: 1, name: "Quản lý bài học" })).first()).toBeVisible();
        await page.waitForTimeout(500);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
        const resolved = await page.locator(".ops-theme").first().getAttribute("data-resolved-theme");
        expect(resolved).toBe(theme);
      }
      await page.goto(`/admin/learn?post=${draft.id}`);
      await page.screenshot({ path: testInfo.outputPath(`cms-editor-${width}-${theme}.png`), fullPage: true });
    });
  }
}
