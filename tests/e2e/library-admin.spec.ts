import { expect, test, type Page } from "@playwright/test";
import { RUBRIC_CATALOG } from "../fixtures/scenario-editor/v1-fixtures";
import { installLibraryBackend, LibraryBackend, signIn, type Actor } from "./library-mock";

/*
 * PlatformAdmin Organization Library against a STATEFUL MOCK of the real contract (library-mock.ts). Mock evidence only: it shows
 * the UI sends the right routes, headers (If-Match, Idempotency-Key) and payloads and handles the documented responses. It proves
 * nothing about the deployed API.
 */

async function setup(page: Page, seed: (backend: LibraryBackend) => void = () => undefined, who: Actor = "admin") {
  const backend = new LibraryBackend();
  seed(backend);
  await signIn(page, backend, who);
  await installLibraryBackend(page, backend);
  return backend;
}

const RUBRIC = { schema_version: "1", pass_threshold: 0.7, criteria: [{ id: "reached-exit", metric: "reached_exit", mandatory: true, weight: 1, threshold: 1, operator: "eq" }] };
const TEMPLATE_STATE = { schemaVersion: "fet3d.editor/1", name: "Sơ tán văn phòng", timeLimitSeconds: 600, learningObjectives: ["Rời khỏi tòa nhà an toàn"], learnerInstructions: "Đi theo lối thoát gần nhất.", modePolicy: { allowedModes: ["Learn"] }, rubric: RUBRIC };

const seedRubricDraft = (backend: LibraryBackend) => {
  backend.seedItem("RubricSample", "RUBRIC-CO-BAN");
  return backend.seedVersion("RUBRIC-CO-BAN", { name: "Rubric cơ bản", payload: { rubric: RUBRIC } });
};

/** Opens the item through the list (a direct goto can be filled before hydration, which then resets the inputs). */
async function openItem(page: Page, code: string) {
  await page.goto("/admin/library");
  await page.getByRole("button", { name: `Mở mục ${code}` }).click();
  await expect(page.getByTestId("item-detail")).toContainText(code);
}

const uuidFrom = (url: string, key: string) => new URL(url).searchParams.get(key) ?? "";
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).then((value) => expect(value).toBeLessThanOrEqual(0));

test.describe("production Library admin", () => {
  test("is no longer a pending module: empty library says what to configure, seeds nothing and calls only the real routes", async ({ page }) => {
    const backend = await setup(page);
    await page.goto("/admin/library");
    await expect(page.getByRole("heading", { level: 1, name: "Thư viện tổ chức" })).toBeVisible();
    await expect(page.getByTestId("pending-module")).toHaveCount(0);
    await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Thư viện chưa có mục nào" })).toBeVisible();
    await expect(page.getByText("Thư viện không có dữ liệu sẵn")).toBeVisible();
    await expect(page.locator("main tbody tr")).toHaveCount(1); // only the empty-state row
    await expect(page.getByRole("navigation", { name: "Quản trị hệ thống" }).getByRole("link", { name: /Thư viện tổ chức/ })).not.toContainText("Chờ BE");
    expect(backend.callsTo("GET", /^\/api\/admin\/library\/items$/).length).toBeGreaterThan(0);
    expect(backend.calls.every((call) => /^\/api\/(admin\/library|auth)/.test(call.path))).toBe(true);
    expect(backend.items).toHaveLength(0);
  });

  test("organization users and guests cannot use it", async ({ page }) => {
    const backend = await setup(page, () => undefined, "org");
    await page.goto("/admin/library");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm mục" })).toHaveCount(0);
    expect(backend.calls.filter((call) => call.path.startsWith("/api/admin/library"))).toEqual([]);
  });

  test("a guest is sent to sign in", async ({ page }) => {
    await setup(page, () => undefined, "guest");
    await page.goto("/admin/library");
    await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
    await expect(page.getByTestId("item-detail")).toHaveCount(0);
  });

  test("API 403 on the list is shown with its cause and a retry", async ({ page }) => {
    const backend = await setup(page);
    backend.failNext("GET", /^\/api\/admin\/library\/items$/, { status: 403, json: { status: 403, code: "FORBIDDEN", title: "Forbidden" }, headers: { "content-type": "application/problem+json" } });
    await page.goto("/admin/library");
    const alert = page.getByRole("alert").filter({ hasText: "Không tải được danh sách thư viện" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Tài khoản này không được dùng chức năng thư viện này");
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("heading", { name: "Thư viện chưa có mục nào" })).toBeVisible();
  });
});

test.describe("list: filters and paging live in the URL", () => {
  test("kind filter, state filter and pages survive a reload", async ({ page }) => {
    const backend = await setup(page, (b) => {
      for (let n = 1; n <= 23; n += 1) { b.seedItem("Equipment", `EQ-${String(n).padStart(2, "0")}`, { isActive: n % 5 !== 0 }); }
      b.seedItem("RubricSample", "RB-ONE");
      b.seedItem("ScenarioTemplate", "TP-ONE");
      b.seedVersion("RB-ONE", { name: "Rubric một", payload: { rubric: RUBRIC }, publish: true });
    });
    await page.goto("/admin/library");
    await expect(page.getByRole("button", { name: "Mở mục EQ-01" })).toBeVisible();
    await page.getByTestId("chip-Equipment").click();
    await expect(page).toHaveURL(/kind=Equipment/);
    await expect(page.getByRole("button", { name: "Mở mục RB-ONE" })).toHaveCount(0);
    expect(backend.callsTo("GET", /items$/).some((call) => call.search.includes("kind=Equipment"))).toBe(true);
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("button", { name: "Mở mục EQ-21" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mở mục EQ-01" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Mở mục EQ-21" })).toBeVisible();
    await expect(page.getByTestId("chip-Equipment")).toHaveAttribute("aria-pressed", "true");

    // The server has no status filter: this one narrows the loaded page only and says so.
    await page.getByTestId("filter-state").selectOption("inactive");
    await expect(page.getByText("Máy chủ chưa có bộ lọc trạng thái")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Không có mục khớp bộ lọc." })).toBeVisible(); // EQ-21..23 are all active
    await page.getByTestId("filter-state").selectOption("active");
    await expect(page.getByRole("button", { name: "Mở mục EQ-21" })).toBeVisible();
    await expect(page).toHaveURL(/page=2/); // the state filter never changes the server page
  });
});

test.describe("rubric sample lifecycle", () => {
  test("create item (Idempotency-Key) -> Draft version -> reload -> 412 keeps my content -> publish -> immutable -> new version", async ({ page }) => {
    const backend = await setup(page);
    await page.goto("/admin/library");
    await page.getByTestId("add-item").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("new-item-kind").selectOption("RubricSample");
    await dialog.getByTestId("new-item-code").fill("rubric-co-ban");
    await expect(dialog.getByText("Sẽ lưu là: RUBRIC-CO-BAN")).toBeVisible();
    await dialog.getByTestId("create-item").click();
    await expect(page.getByTestId("item-detail")).toContainText("RUBRIC-CO-BAN");
    const created = backend.callsTo("POST", /items$/);
    expect(created).toHaveLength(1);
    expect(created[0].body).toEqual({ kind: "RubricSample", code: "RUBRIC-CO-BAN" });
    expect(created[0].headers["idempotency-key"]).toBeTruthy();
    await expect(page.getByText("Mục chỉ hiện cho tổ chức khi có ít nhất một phiên bản đã xuất bản")).toBeVisible();

    // new Draft: every field starts blank, nothing is pre-filled except the server's own catalog default schema_version
    await page.getByTestId("new-version").click();
    await expect(page.getByTestId("version-editor")).toBeVisible();
    await expect(page.getByTestId("version-name")).toHaveValue("");
    await page.getByTestId("version-name").fill("Rubric cơ bản");
    await page.getByTestId("add-rubric").click();
    await expect(page.getByTestId("rubric-schema")).toHaveValue("1");
    await expect(page.getByTestId("rubric-threshold")).toHaveValue("");
    await page.getByTestId("rubric-threshold").fill("0.7");
    await page.getByTestId("add-criterion").click();
    await page.getByTestId("criterion-0-id").fill("reached-exit");
    await page.getByTestId("criterion-0-metric").selectOption("reached_exit");
    await page.getByTestId("criterion-0-operator").selectOption("eq");
    await page.getByTestId("criterion-0-threshold").fill("1");
    await page.getByTestId("criterion-0-weight").fill("1");
    await page.getByTestId("criterion-0").getByLabel("Tiêu chí bắt buộc").check();
    await page.getByTestId("save-version").click();
    await expect(page).toHaveURL(/version=[0-9a-f-]{36}/);
    await expect(page.getByTestId("version-row-1")).toContainText("Bản nháp");
    const draft = backend.versions[0];
    expect(draft.status).toBe("Draft");
    expect(draft.payload).toEqual({ rubric: RUBRIC });
    const versionCalls = backend.callsTo("POST", /\/versions$/);
    expect(versionCalls).toHaveLength(1);
    expect(versionCalls[0].headers["idempotency-key"]).toBeTruthy();
    expect(versionCalls[0].body).toEqual({ name: "Rubric cơ bản", payload: { rubric: RUBRIC }, requiredCapabilities: [] });

    // reload recovers from the server
    await page.reload();
    await expect(page.getByTestId("version-name")).toHaveValue("Rubric cơ bản");
    await expect(page.getByTestId("rubric-threshold")).toHaveValue("0.7");
    await expect(page.getByTestId("criterion-0-metric")).toHaveValue("reached_exit");

    // someone else edits the Draft: my save is refused with 412 and my text stays
    backend.externalEdit(draft.id, { name: "Tên từ quản trị viên khác" });
    await page.getByTestId("version-name").fill("Tên của tôi");
    await page.getByTestId("save-version").click();
    await expect(page.getByText("Đã có thay đổi ở nơi khác")).toBeVisible();
    await expect(page.getByText("Khác biệt so với máy chủ: tên phiên bản")).toBeVisible();
    await expect(page.getByTestId("version-name")).toHaveValue("Tên của tôi");
    expect(backend.versions[0].name).toBe("Tên từ quản trị viên khác");
    const puts = backend.callsTo("PUT", /\/versions\//);
    expect(puts[0].headers["if-match"]).toBe('"1"');
    await page.getByTestId("keep-mine").click();
    await page.getByTestId("save-version").click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    expect(backend.versions[0].name).toBe("Tên của tôi");
    expect(backend.callsTo("PUT", /\/versions\//)[1].headers["if-match"]).toBe('"2"');

    // publish: If-Match + Idempotency-Key
    await page.getByTestId("publish-version").click();
    await page.getByTestId("confirm-publish").click();
    await expect(page.getByText("Đã xuất bản phiên bản")).toBeVisible();
    const publishCalls = backend.callsTo("POST", /\/publish$/);
    expect(publishCalls).toHaveLength(1);
    expect(publishCalls[0].headers["if-match"]).toBe('"3"');
    expect(publishCalls[0].headers["idempotency-key"]).toBeTruthy();
    expect(backend.versions[0].status).toBe("Published");
    const publishedHash = backend.versions[0].payloadHash;

    // a Published version is immutable: read-only view, no save, only "new version from this one"
    await expect(page.getByTestId("save-version")).toHaveCount(0);
    await expect(page.getByTestId("version-name")).toHaveCount(0);
    await expect(page.getByTestId("rubric-view")).toContainText("reached-exit");
    await expect(page.getByText("Phiên bản đã xuất bản không sửa được")).toBeVisible();
    await expect(page.getByText("Bản tổ chức đang thấy")).toBeVisible();
    await expect(page.getByTestId("item-detail")).toContainText("v1 · Tên của tôi");

    await page.getByTestId("new-from-published").click();
    await expect(page).toHaveURL(/version=new/);
    await expect(page.getByTestId("version-name")).toHaveValue("Tên của tôi");
    await expect(page.getByTestId("rubric-threshold")).toHaveValue("0.7");
    await page.getByTestId("version-name").fill("Rubric cơ bản (bản 2)");
    await page.getByTestId("rubric-threshold").fill("0.8");
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("version-row-2")).toContainText("Bản nháp");
    await page.getByTestId("publish-version").click();
    await page.getByTestId("confirm-publish").click();
    await expect(page.getByTestId("item-detail")).toContainText("v2 · Rubric cơ bản (bản 2)");

    // v1 never changed
    expect(backend.versions).toHaveLength(2);
    expect(backend.versions[0]).toMatchObject({ name: "Tên của tôi", status: "Published", payloadHash: publishedHash });
    expect((backend.versions[0].payload as { rubric: { pass_threshold: number } }).rubric.pass_threshold).toBe(0.7);
    expect(backend.callsTo("PUT", /\/versions\//).every((call) => call.path.endsWith(backend.versions[0].id))).toBe(true);
  });

  test("a version published elsewhere while I edit: 412 explains it and I can fork my content into a NEW version", async ({ page }) => {
    const backend = await setup(page, (b) => { seedRubricDraft(b); });
    await openItem(page, "RUBRIC-CO-BAN");
    await page.getByRole("button", { name: "Mở phiên bản 1" }).click();
    await expect(page.getByTestId("version-name")).toHaveValue("Rubric cơ bản");
    backend.externalPublish(backend.versions[0].id);
    await page.getByTestId("version-name").fill("Bản của tôi");
    await page.getByTestId("save-version").click();
    await expect(page.getByText("Bản nháp này đã được xuất bản ở nơi khác")).toBeVisible();
    await expect(page.getByTestId("version-name")).toHaveValue("Bản của tôi");
    await page.getByTestId("fork-mine").click();
    await expect(page).toHaveURL(/version=new/);
    await expect(page.getByTestId("version-name")).toHaveValue("Bản của tôi");
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("version-row-2")).toContainText("Bản nháp");
    expect(backend.versions[0].name).toBe("Rubric cơ bản"); // the published v1 is untouched
    expect(backend.versions[1].name).toBe("Bản của tôi");
  });

  test("retry keeps the Idempotency-Key: a failed create is not applied twice and a lost publish response replays", async ({ page }) => {
    const backend = await setup(page);
    backend.failNext("POST", /^\/api\/admin\/library\/items$/, { status: 503, json: { status: 503, title: "Busy" }, headers: { "content-type": "application/problem+json", "Retry-After": "1" } });
    await page.goto("/admin/library");
    await page.getByTestId("add-item").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("new-item-kind").selectOption("Equipment");
    await dialog.getByTestId("new-item-code").fill("smoke-hood");
    await dialog.getByTestId("create-item").click();
    await expect(dialog.getByText("Máy chủ đang bận")).toBeVisible();
    await expect(dialog.getByTestId("create-item")).toHaveText("Thử lại");
    await dialog.getByTestId("create-item").click();
    await expect(page.getByTestId("item-detail")).toContainText("SMOKE-HOOD");
    const creates = backend.callsTo("POST", /items$/);
    expect(creates).toHaveLength(2);
    expect(creates[1].headers["idempotency-key"]).toBe(creates[0].headers["idempotency-key"]);
    expect(backend.items).toHaveLength(1);

    // publish whose response is lost AFTER the server applied it: the retry carries the same key and If-Match and replays
    backend.seedVersion("SMOKE-HOOD", { name: "Mặt nạ lọc khói", payload: { description: "Mặt nạ lọc khói." } });
    await page.reload();
    await page.getByRole("button", { name: "Mở phiên bản 1" }).click();
    await expect(page.getByTestId("version-name")).toHaveValue("Mặt nạ lọc khói");
    backend.failNext("POST", /\/publish$/, { status: 503, json: { status: 503, title: "Busy" }, headers: { "content-type": "application/problem+json" }, applyFirst: true });
    await page.getByTestId("publish-version").click();
    await page.getByTestId("confirm-publish").click();
    await expect(page.getByRole("dialog").getByText("Máy chủ đang bận")).toBeVisible();
    await page.getByTestId("confirm-publish").click();
    await expect(page.getByText("Đã xuất bản phiên bản")).toBeVisible();
    const publishes = backend.callsTo("POST", /\/publish$/);
    expect(publishes).toHaveLength(2);
    expect(publishes[1].headers["idempotency-key"]).toBe(publishes[0].headers["idempotency-key"]);
    expect(publishes[1].headers["if-match"]).toBe(publishes[0].headers["if-match"]);
    expect(backend.versions[0].revision).toBe(2); // published once
  });

  test("422 RUBRIC_SCHEMA_VERSION_UNSUPPORTED is shown at $.payload.rubric.schema_version and my content stays", async ({ page }) => {
    const backend = await setup(page, (b) => { seedRubricDraft(b); });
    await openItem(page, "RUBRIC-CO-BAN");
    await page.getByRole("button", { name: "Mở phiên bản 1" }).click();
    await expect(page.getByTestId("rubric-schema")).toHaveValue("1");
    backend.failNext("PUT", /\/versions\//, { status: 422, json: { status: 422, code: "CONTENT_INVALID", title: "Content does not satisfy its schema.", issues: [{ code: "RUBRIC_SCHEMA_VERSION_UNSUPPORTED", path: "$.payload.rubric.schema_version", message: "Unsupported." }] }, headers: { "content-type": "application/problem+json" } });
    await page.getByTestId("version-name").fill("Tên đang sửa");
    await page.getByTestId("save-version").click();
    const field = page.getByTestId("group-rubric");
    await expect(field.getByRole("alert").filter({ hasText: "RUBRIC_SCHEMA_VERSION_UNSUPPORTED" })).toBeVisible();
    await expect(field.getByRole("alert")).toContainText('chuỗi, ví dụ "1"');
    await expect(page.getByTestId("version-name")).toHaveValue("Tên đang sửa");
    await expect(page.getByRole("alert").filter({ hasText: "Nội dung chưa đạt yêu cầu" }).getByText("$.payload.rubric.schema_version")).toBeVisible();
    expect(backend.versions[0].name).toBe("Rubric cơ bản");
  });

  test("a stored rubric with an unsupported schema_version is flagged against the catalog and can be corrected from the supported list", async ({ page }) => {
    await setup(page, (b) => {
      b.seedItem("RubricSample", "RUBRIC-CU");
      b.seedVersion("RUBRIC-CU", { name: "Rubric cũ", payload: { rubric: { ...RUBRIC, schema_version: "v1" } } });
    });
    await openItem(page, "RUBRIC-CU");
    await page.getByRole("button", { name: "Mở phiên bản 1" }).click();
    await expect(page.getByTestId("rubric-schema").locator("option:checked")).toHaveText('v1 (không được hỗ trợ)');
    await expect(page.getByTestId("group-rubric").getByRole("alert")).toContainText('Danh mục rubric chỉ hỗ trợ: "1"');
    await page.getByTestId("rubric-schema").selectOption("1");
    await expect(page.getByTestId("group-rubric").getByRole("alert").filter({ hasText: "Danh mục rubric chỉ hỗ trợ" })).toHaveCount(0);
  });

  test("a client-side problem the server would refuse holds the save back and says why (no round trip)", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedItem("RubricSample", "RUBRIC-TRONG"); });
    await openItem(page, "RUBRIC-TRONG");
    await page.getByTestId("new-version").click();
    await page.getByTestId("save-version").click();
    await expect(page.getByRole("alert").filter({ hasText: /Còn \d+ điểm cần sửa trước khi lưu/ })).toBeVisible();
    await expect(page.getByTestId("version-name")).toHaveAttribute("aria-invalid", "true");
    expect(backend.callsTo("POST", /\/versions$/)).toHaveLength(0);
  });

  test("rubric catalog empty -> configuration guidance (no metric is invented); catalog unavailable -> retry", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedItem("RubricSample", "RUBRIC-TRONG"); b.rubricCatalog = { ...RUBRIC_CATALOG, metrics: [] }; });
    await openItem(page, "RUBRIC-TRONG");
    await page.getByTestId("new-version").click();
    await expect(page.getByTestId("rubric-catalog-empty")).toContainText("Quản trị viên cần cấu hình danh mục rubric ở máy chủ");
    await page.getByTestId("add-rubric").click();
    await page.getByTestId("add-criterion").click();
    await expect(page.getByTestId("criterion-0-metric").locator("option")).toHaveCount(1); // only "Chọn…"

    backend.rubricCatalog = null;
    await page.getByTestId("version-editor").getByRole("button", { name: "Đóng" }).first().click();
    await page.getByTestId("new-version").click();
    await expect(page.getByRole("alert").filter({ hasText: "Không tải được danh mục rubric" })).toBeVisible();
    backend.rubricCatalog = RUBRIC_CATALOG;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByTestId("add-rubric")).toBeVisible();
  });
});

test.describe("equipment and template payloads", () => {
  test("equipment: description and properties only, says it adds no runtime capability, and never reads the runtime catalog", async ({ page }) => {
    const backend = await setup(page, (b) => { b.seedItem("Equipment", "MAT-NA-LOC-KHOI"); });
    await openItem(page, "MAT-NA-LOC-KHOI");
    await page.getByTestId("new-version").click();
    await expect(page.getByTestId("no-capability-notice")).toContainText("không thêm khả năng cho runtime");
    await page.getByTestId("version-name").fill("Mặt nạ lọc khói");
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("group-version").getByText("Nhập mô tả để tổ chức biết thiết bị này là gì.")).toBeVisible();
    expect(backend.callsTo("POST", /\/versions$/)).toHaveLength(0);
    await page.getByTestId("version-description").fill("Mặt nạ lọc khói dùng một lần.");
    await page.getByTestId("add-property").click();
    await page.getByTestId("property-0-key").fill("Khối lượng (g)");
    await page.getByTestId("property-0").getByLabel("Kiểu giá trị").selectOption("number");
    await page.getByTestId("property-0-value").fill("120");
    await page.getByTestId("capabilities").getByRole("button", { name: "Thêm năng lực" }).click();
    await page.getByRole("textbox", { name: "Năng lực runtime yêu cầu 1", exact: true }).fill("cover.nose");
    await page.getByTestId("save-version").click();
    await expect(page.getByTestId("version-row-1")).toContainText("Bản nháp");
    expect(backend.callsTo("POST", /\/versions$/)[0].body).toEqual({ name: "Mặt nạ lọc khói", payload: { description: "Mặt nạ lọc khói dùng một lần.", properties: { "Khối lượng (g)": 120 } }, requiredCapabilities: ["cover.nose"] });
    expect(backend.calls.some((call) => /scenario-interactions|runtime/.test(call.path))).toBe(false);
    await page.getByTestId("publish-version").click();
    await page.getByTestId("confirm-publish").click();
    await expect(page.getByTestId("version-preview")).toContainText("Không thêm năng lực cho runtime");
    await expect(page.getByTestId("version-preview")).toContainText("cover.nose");
  });

  test("template: only non-spatial fields are offered and sent; positions, objects, geometry and runtime that the API stored are kept untouched", async ({ page }) => {
    const spatial = { geometry: { artifactId: "00000000-0000-0000-0000-000000000000", sha256Hash: "a".repeat(64) }, runtimeVersion: "1.4.0", objects: [{ id: "spawn-1", kind: "Spawn", placement: { floorId: "L1", position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }] };
    const backend = await setup(page, (b) => {
      b.seedItem("ScenarioTemplate", "TEMPLATE-SO-TAN");
      b.seedVersion("TEMPLATE-SO-TAN", { name: "Template sơ tán", payload: { state: { ...TEMPLATE_STATE, ...spatial } } });
    });
    await openItem(page, "TEMPLATE-SO-TAN");
    await page.getByRole("button", { name: "Mở phiên bản 1" }).click();
    await expect(page.getByTestId("tpl-name")).toHaveValue("Sơ tán văn phòng");
    await expect(page.getByText("Phiên bản này còn mang phần không chỉnh sửa được ở đây")).toBeVisible();
    await expect(page.getByText("Template chỉ mang nội dung phi không gian")).toBeVisible();
    // no position / floor / object / geometry / runtime controls in this form
    await expect(page.getByTestId("scenario-form-v1")).toHaveCount(0);
    for (const label of ["Phiên bản runtime", "Hạt giống ngẫu nhiên", "Tầng", "Tọa độ"]) await expect(page.getByLabel(label)).toHaveCount(0);

    await page.getByTestId("tpl-name").fill("Sơ tán văn phòng (sửa)");
    await page.getByTestId("tpl-time-limit").fill("900");
    await page.getByTestId("tpl-mode-Assessment").check();
    await page.getByTestId("save-version").click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
    const sent = backend.callsTo("PUT", /\/versions\//)[0].body as { payload: { state: Record<string, unknown> } };
    expect(sent.payload.state).toMatchObject({ schemaVersion: "fet3d.editor/1", name: "Sơ tán văn phòng (sửa)", timeLimitSeconds: 900, modePolicy: { allowedModes: ["Learn", "Assessment"] }, ...spatial });
    expect(Object.keys(sent.payload)).toEqual(["state"]);
  });
});

test.describe("item activation", () => {
  test("deactivate asks for confirmation, sends PATCH with If-Match, and 412 keeps the dialog with a reload", async ({ page }) => {
    const backend = await setup(page, (b) => {
      b.seedItem("Equipment", "BINH-CHUA-CHAY");
      b.seedVersion("BINH-CHUA-CHAY", { name: "Bình CO2", payload: { description: "Bình CO2 5 kg." }, publish: true });
    });
    await openItem(page, "BINH-CHUA-CHAY");
    await expect(page.getByTestId("item-detail")).toContainText("v1 · Bình CO2");
    backend.items[0].revision += 1; // another admin touched the item: its revision moved, my If-Match is stale
    await page.getByTestId("toggle-active").click();
    await page.getByTestId("confirm-toggle").click();
    await expect(page.getByRole("dialog").getByText("Mục đã đổi ở nơi khác")).toBeVisible();
    expect(backend.callsTo("PATCH", /items\//)[0].headers["if-match"]).toBe('"2"'); // the item had revision 2 after its version was published
    await page.getByTestId("confirm-toggle").click();
    await expect(page.getByText("Đã ngừng dùng mục")).toBeVisible();
    const patches = backend.callsTo("PATCH", /items\//);
    expect(patches).toHaveLength(2);
    expect(patches[1].body).toEqual({ isActive: false });
    expect(patches[1].headers["idempotency-key"]).toBeTruthy();
    await expect(page.getByTestId("item-detail")).toContainText("Mục đang ngừng dùng");
    expect(backend.items[0].isActive).toBe(false);
    expect(backend.versions[0].status).toBe("Published"); // versions survive deactivation
    await page.getByRole("button", { name: "Về danh sách" }).click();
    await expect(page.getByTestId("item-row-BINH-CHUA-CHAY")).toContainText("Ngừng dùng");
  });
});

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"] as const) {
    test(`library admin screens fit ${width}px in the ${theme} theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      const backend = await setup(page, (b) => {
        b.seedItem("RubricSample", "RUBRIC-CO-BAN-RAT-DAI-DE-KIEM-TRA-XUONG-DONG-VA-TRAN-NGANG");
        b.seedVersion("RUBRIC-CO-BAN-RAT-DAI-DE-KIEM-TRA-XUONG-DONG-VA-TRAN-NGANG", { name: "Rubric cơ bản với một cái tên rất dài để thử việc xuống dòng", payload: { rubric: RUBRIC } });
        b.seedItem("Equipment", "BINH-CO2", { isActive: false });
        b.seedItem("ScenarioTemplate", "TEMPLATE-VAN-PHONG");
        b.seedVersion("TEMPLATE-VAN-PHONG", { name: "Template văn phòng", payload: { state: TEMPLATE_STATE }, publish: true });
      });
      const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`library-${name}-${width}-${theme}.png`), fullPage: true });
      await page.goto("/admin/library");
      await expect(page.getByRole("button", { name: /Mở mục TEMPLATE-VAN-PHONG/ })).toBeVisible();
      await noOverflow(page);
      await shot("list");
      await page.getByRole("button", { name: /Mở mục RUBRIC-CO-BAN/ }).click();
      await expect(page.getByTestId("item-detail")).toBeVisible();
      await noOverflow(page);
      await shot("item");
      await page.getByRole("button", { name: "Mở phiên bản 1" }).click();
      await expect(page.getByTestId("rubric-schema")).toHaveValue("1");
      await noOverflow(page);
      await shot("version-rubric");
      await page.goto(`/admin/library?item=${backend.item("TEMPLATE-VAN-PHONG").id}&version=${backend.versionsOf(backend.item("TEMPLATE-VAN-PHONG").id)[0].id}`);
      await expect(page.getByTestId("rubric-view")).toBeVisible();
      await noOverflow(page);
      await shot("version-published");
      await page.goto(`/admin/library?item=${backend.item("BINH-CO2").id}&version=new`);
      await expect(page.getByTestId("no-capability-notice")).toBeVisible();
      await noOverflow(page);
      await shot("version-equipment");
    });
  }
}

test("URL keeps item and version so a deep link and the back button work", async ({ page }) => {
  const backend = await setup(page, (b) => { seedRubricDraft(b); });
  await openItem(page, "RUBRIC-CO-BAN");
  await page.getByRole("button", { name: "Mở phiên bản 1" }).click();
  await expect(page.getByTestId("version-name")).toHaveValue("Rubric cơ bản");
  const id = uuidFrom(page.url(), "version");
  expect(id).toBe(backend.versions[0].id);
  await page.goBack();
  await expect(page.getByTestId("version-editor")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByTestId("version-name")).toHaveValue("Rubric cơ bản");
  await page.goto(`/admin/library?item=${backend.items[0].id}&version=00000000-0000-4000-8000-00000000dead`);
  await expect(page.getByRole("alert").filter({ hasText: "Không tìm thấy phiên bản" })).toBeVisible();
});
