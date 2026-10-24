import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { EDITOR_URL, installEditorMocks, newMock, type MockState } from "../fixtures/scenario-editor/mock-api";
import { ARTIFACT_ID, GEOMETRY_HASH, SAMPLE_RUNTIME_CATALOG } from "../fixtures/scenario-editor/v1-fixtures";
import { installLibraryBackend, LibraryBackend, signIn, type Actor } from "./library-mock";

/*
 * Organization side of the Library: the read-only list and applying a PUBLISHED sample to an open draft in the v1 editor. Routes are
 * mocked from the contract (library-mock.ts + the editor mock). Mock evidence only; WebGL is not part of what is asserted here.
 */

const fixtureState = () => JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scenario-editor", "v1", "scenario-state.valid.json"), "utf8")) as Record<string, unknown>;
const pin = { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH };
/** A draft the author has partly written: a name and one objective of their own, nothing else. */
const partial = (): Record<string, unknown> => ({ schemaVersion: "fet3d.editor/1", geometry: pin, name: "Tên của tôi", learningObjectives: ["Mục tiêu của tôi"] });

const RUBRIC = { schema_version: "1", pass_threshold: 0.7, criteria: [{ id: "reached-exit", metric: "reached_exit", mandatory: true, weight: 1, threshold: 1, operator: "eq" }] };
const SPATIAL = { geometry: { artifactId: "00000000-0000-0000-0000-000000000000", sha256Hash: "a".repeat(64) }, runtimeVersion: "1.4.0", objects: [{ id: "spawn-1", kind: "Spawn", placement: { floorId: "L1", position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }] };
const TEMPLATE_STATE = { schemaVersion: "fet3d.editor/1", name: "Sơ tán văn phòng", timeLimitSeconds: 600, learningObjectives: ["Rời khỏi tòa nhà an toàn"], learnerInstructions: "Đi theo lối thoát gần nhất.", modePolicy: { allowedModes: ["Learn", "Guided"] }, rubric: RUBRIC, ...SPATIAL };

function seedLibrary(b: LibraryBackend) {
  b.seedItem("ScenarioTemplate", "TEMPLATE-SO-TAN");
  b.seedVersion("TEMPLATE-SO-TAN", { name: "Template sơ tán văn phòng", payload: { state: TEMPLATE_STATE, description: "Mẫu cho văn phòng." }, publish: true });
  b.seedItem("RubricSample", "RUBRIC-CO-BAN");
  b.seedVersion("RUBRIC-CO-BAN", { name: "Rubric cơ bản", payload: { rubric: { ...RUBRIC, criteria: [...RUBRIC.criteria, { id: "wrong-exits", metric: "wrong_exits", mandatory: false, weight: 0.5, threshold: 2, operator: "lte" }] } }, publish: true });
  b.seedItem("Equipment", "BINH-CO2");
  b.seedVersion("BINH-CO2", { name: "Bình CO2 5 kg", payload: { description: "Bình chữa cháy CO2.", properties: { "Khối lượng (kg)": 5 } }, requiredCapabilities: ["equipment.extinguisher", "cover.nose"], publish: true });
  b.seedItem("Equipment", "MAT-NA");
  b.seedVersion("MAT-NA", { name: "Mặt nạ lọc khói", payload: { description: "Mặt nạ dùng một lần." }, requiredCapabilities: ["cover.nose"], publish: true });
  // never visible to organizations: a Draft-only item and a deactivated item
  b.seedItem("ScenarioTemplate", "CHI-CO-BAN-NHAP");
  b.seedVersion("CHI-CO-BAN-NHAP", { name: "Chỉ là bản nháp", payload: { state: { schemaVersion: "fet3d.editor/1", name: "Nháp" } } });
  b.seedItem("ScenarioTemplate", "DA-NGUNG", { isActive: false });
  b.seedVersion("DA-NGUNG", { name: "Đã ngừng", payload: { state: { schemaVersion: "fet3d.editor/1", name: "Cũ" } }, publish: true });
}

async function openBrowse(page: Page, who: Actor = "org", seed: (b: LibraryBackend) => void = seedLibrary) {
  const backend = new LibraryBackend();
  seed(backend);
  await signIn(page, backend, who);
  await installLibraryBackend(page, backend);
  return backend;
}

type Opened = { backend: LibraryBackend; mock: MockState };
async function openEditor(page: Page, options: { state?: Record<string, unknown>; seed?: (b: LibraryBackend) => void; actor?: Actor } = {}): Promise<Opened> {
  const backend = new LibraryBackend();
  (options.seed ?? seedLibrary)(backend);
  backend.actor = options.actor ?? "org";
  const mock = newMock({ state: options.state ?? partial(), previewKind: "v1", catalog: SAMPLE_RUNTIME_CATALOG });
  await installEditorMocks(page, mock);
  await installLibraryBackend(page, backend);
  await page.goto(EDITOR_URL);
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "v1");
  return { backend, mock };
}

const status = (page: Page) => page.getByTestId("save-status");
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const lastPut = (mock: MockState) => mock.puts[mock.puts.length - 1].body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).then((value) => expect(value).toBeLessThanOrEqual(0));

async function choose(page: Page, kind: "ScenarioTemplate" | "RubricSample" | "Equipment", code: string) {
  await tab(page, "Thư viện").click();
  await page.getByTestId(`library-kind-${kind}`).click();
  await page.getByTestId(`library-item-${code}`).click();
  await expect(page.getByTestId("library-preview")).toBeVisible();
}

test.describe("/workspace/library (read only)", () => {
  test("shows only active items with a Published version, previews the published version, and never touches the admin routes", async ({ page }) => {
    const backend = await openBrowse(page);
    await page.goto("/workspace/library");
    await expect(page.getByRole("heading", { level: 1, name: "Thư viện mẫu" })).toBeVisible();
    for (const code of ["TEMPLATE-SO-TAN", "RUBRIC-CO-BAN", "BINH-CO2", "MAT-NA"]) await expect(page.getByTestId(`org-item-${code}`)).toBeVisible();
    await expect(page.getByTestId("org-item-CHI-CO-BAN-NHAP")).toHaveCount(0);
    await expect(page.getByTestId("org-item-DA-NGUNG")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Quản lý tổ chức" }).getByRole("link", { name: "Thư viện mẫu" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Thêm mục|Xuất bản|Tạo phiên bản/ })).toHaveCount(0);

    await page.getByTestId("filter-kind-Equipment").click();
    await expect(page).toHaveURL(/kind=Equipment/);
    await expect(page.getByTestId("org-item-TEMPLATE-SO-TAN")).toHaveCount(0);
    await page.getByRole("button", { name: "Xem mẫu BINH-CO2" }).click();
    await expect(page).toHaveURL(/item=/);
    const drawer = page.getByRole("dialog");
    // v2 drawer: the item name is the drawer title, the body holds the version details.
    await expect(drawer.getByRole("heading", { name: "Bình CO2 5 kg" })).toBeVisible();
    await expect(drawer.getByTestId("version-preview")).toContainText("Không thêm năng lực cho runtime");
    await expect(drawer).toContainText("Áp dụng là sao chép");
    expect(backend.calls.filter((call) => call.path.startsWith("/api/admin"))).toEqual([]);
  });

  test("search and required-capability filters live in the page and the URL, narrow only the loaded page and say so", async ({ page }) => {
    const backend = await openBrowse(page);
    await page.goto("/workspace/library");
    await expect(page.getByTestId("org-item-MAT-NA")).toBeVisible();
    expect(backend.callsTo("GET", /^\/api\/library\/items$/).every((call) => !call.search.includes("search="))).toBe(true);

    await page.getByLabel("Tìm mẫu").fill("co2");
    await expect(page).toHaveURL(/q=co2/);
    await expect(page.getByTestId("org-item-BINH-CO2")).toBeVisible();
    await expect(page.getByTestId("org-item-MAT-NA")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Máy chủ chưa lọc theo tên hoặc năng lực" })).toContainText("Có 1 mẫu khớp");

    await page.getByLabel("Tìm mẫu").fill("khói"); // matches the name of MAT-NA, not its code
    await expect(page.getByTestId("org-item-MAT-NA")).toBeVisible();
    await expect(page.getByTestId("org-item-BINH-CO2")).toHaveCount(0);

    await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(page).not.toHaveURL(/q=/);
    const capability = page.getByRole("combobox", { name: "Năng lực runtime yêu cầu" });
    await capability.click();
    await page.getByRole("option", { name: "equipment.extinguisher" }).click();
    await expect(page).toHaveURL(/cap=equipment\.extinguisher/);
    await expect(page.getByTestId("org-item-BINH-CO2")).toBeVisible();
    await expect(page.getByTestId("org-item-MAT-NA")).toHaveCount(0);
    await capability.click();
    await page.getByRole("option", { name: "Không yêu cầu năng lực" }).click();
    await expect(page.getByTestId("org-item-TEMPLATE-SO-TAN")).toBeVisible();
    await expect(page.getByTestId("org-item-BINH-CO2")).toHaveCount(0);

    await page.getByLabel("Tìm mẫu").fill("không-có-gì");
    await expect(page.getByRole("heading", { name: "Không có mẫu khớp bộ lọc" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Tìm mẫu")).toHaveValue("không-có-gì");
    await expect(page.getByRole("combobox", { name: "Năng lực runtime yêu cầu" })).toContainText("Không yêu cầu năng lực");
  });

  test("deep link to an item that is not published (or was deactivated) says it is unavailable; the Draft is not leaked", async ({ page }) => {
    const backend = await openBrowse(page);
    await page.goto(`/workspace/library?item=${backend.item("CHI-CO-BAN-NHAP").id}`);
    await expect(page.getByText("Mẫu không còn khả dụng").first()).toBeVisible();
    await expect(page.getByText("Chỉ là bản nháp")).toHaveCount(0);
    await page.goto(`/workspace/library?item=${backend.item("DA-NGUNG").id}`);
    await expect(page.getByText("Mẫu không còn khả dụng").first()).toBeVisible();
    await expect(page.getByText("Đã ngừng", { exact: true })).toHaveCount(0);
  });

  test("empty library: guidance and no sample is invented", async ({ page }) => {
    await openBrowse(page, "org", () => undefined);
    await page.goto("/workspace/library");
    await expect(page.getByRole("heading", { name: "Thư viện chưa có mẫu nào" })).toBeVisible();
    await expect(page.getByText("Bạn vẫn soạn kịch bản đầy đủ bằng tay")).toBeVisible();
    await expect(page.locator(".org-lib-card")).toHaveCount(0);
  });

  test("a Trainee is turned away; an API 403 and a failed load are explained with a retry", async ({ page }) => {
    const backend = await openBrowse(page, "trainee");
    await page.goto("/workspace/library");
    await expect(page.getByText("Khu quản lý này dành cho tài khoản tổ chức.")).toBeVisible();
    expect(backend.callsTo("GET", /\/api\/library\//)).toHaveLength(0);
  });

  test("API 403 / 503 on the list", async ({ page }) => {
    const backend = await openBrowse(page);
    backend.failNext("GET", /^\/api\/library\/items$/, { status: 403, json: { status: 403, code: "FORBIDDEN", title: "Forbidden" }, headers: { "content-type": "application/problem+json" } });
    await page.goto("/workspace/library");
    const alert = page.getByRole("alert").filter({ hasText: "Không có quyền xem thư viện" });
    await expect(alert).toBeVisible();
    backend.failNext("GET", /^\/api\/library\/items$/, { status: 503, json: { status: 503, title: "Busy" }, headers: { "content-type": "application/problem+json" } });
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "Không tải được thư viện" })).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByTestId("org-item-TEMPLATE-SO-TAN")).toBeVisible();
  });
});

test.describe("apply to the draft in the v1 editor", () => {
  test("template: preview first (nothing is written), per-group choices, one undoable command, only non-spatial fields, saved body has no positions", async ({ page }) => {
    const { backend, mock } = await openEditor(page);
    await choose(page, "ScenarioTemplate", "TEMPLATE-SO-TAN");
    // the preview writes nothing
    await expect(status(page)).toHaveText("Đã lưu");
    expect(mock.puts).toHaveLength(0);
    const group = (id: string) => page.getByTestId(`apply-group-template:${id}`);
    await expect(group("name")).toHaveAttribute("data-status", "different");
    await expect(page.getByTestId("apply-current-template:name")).toHaveText("Tên của tôi");
    await expect(page.getByTestId("apply-incoming-template:name")).toHaveText("Sơ tán văn phòng");
    await expect(page.getByTestId("apply-template:name-keep")).toBeChecked(); // a field with content defaults to "keep"
    await expect(page.getByTestId("apply-template:learningObjectives-keep")).toBeChecked();
    await expect(page.getByTestId("apply-template:learningObjectives-merge")).toBeVisible();
    await expect(group("learnerInstructions")).toHaveAttribute("data-status", "new");
    await expect(page.getByTestId("apply-template:learnerInstructions-fill")).toBeChecked();
    // spatial parts of the template are named as NOT applied
    await expect(page.getByText("Template còn mang ghim Geometry, 1 đối tượng đặt trong không gian, runtimeVersion")).toBeVisible();
    await expect(page.getByTestId("apply-incoming-template:name")).not.toContainText("spawn");

    await page.getByTestId("apply-template:name-replace").check();
    await page.getByTestId("apply-template:learningObjectives-merge").check();
    await page.getByTestId("apply-open").click();
    const summary = page.getByTestId("apply-summary");
    await expect(summary).toContainText("Điền vào trường trống");
    await expect(summary).toContainText("Thay nội dung của bạn: Tên kịch bản");
    await expect(summary).toContainText("Hợp nhất với nội dung của bạn: Mục tiêu học tập");
    await expect(summary).toContainText("Có nội dung của bạn bị thay hoặc hợp nhất");
    await page.getByTestId("apply-confirm").click();
    await expect(status(page)).toHaveText("Chưa lưu");
    await expect(page.getByTestId("applied-samples")).toContainText("TEMPLATE-SO-TAN");
    await expect(page.getByTestId("apply-open")).toBeDisabled(); // now equal: nothing left to apply
    expect(mock.puts).toHaveLength(0);

    await tab(page, "Kịch bản").click();
    await expect(page.getByTestId("field-name")).toHaveValue("Sơ tán văn phòng");
    await expect(page.getByTestId("field-time-limit")).toHaveValue("600");
    await expect(page.getByTestId("objectives").getByRole("textbox")).toHaveCount(2);
    await expect(page.getByTestId("learner-instructions")).toHaveValue("Đi theo lối thoát gần nhất.");
    await expect(page.getByTestId("rubric-threshold")).toHaveValue("0.7");

    // ONE history entry: a single undo restores every field, redo applies again
    await expect(page.getByTestId("undo")).toHaveAttribute("aria-label", "Hoàn tác: Áp dụng TEMPLATE-SO-TAN v1");
    await page.getByTestId("undo").click();
    await expect(status(page)).toHaveText("Đã lưu");
    await expect(page.getByTestId("field-name")).toHaveValue("Tên của tôi");
    await expect(page.getByTestId("objectives").getByRole("textbox")).toHaveCount(1);
    await expect(page.getByTestId("learner-instructions")).toHaveValue("");
    await expect(page.getByTestId("add-rubric")).toBeVisible();
    await page.getByTestId("redo").click();
    await expect(page.getByTestId("field-name")).toHaveValue("Sơ tán văn phòng");

    await page.getByTestId("save").click();
    await expect(status(page)).toHaveText("Đã lưu");
    const body = lastPut(mock);
    expect(body).toEqual({
      schemaVersion: "fet3d.editor/1", geometry: pin, name: "Sơ tán văn phòng", learningObjectives: ["Mục tiêu của tôi", "Rời khỏi tòa nhà an toàn"],
      learnerInstructions: "Đi theo lối thoát gần nhất.", timeLimitSeconds: 600, modePolicy: { allowedModes: ["Learn", "Guided"] }, rubric: RUBRIC,
    });
    expect(body.objects).toBeUndefined(); // no position or object comes from a template
    expect(body.runtimeVersion).toBeUndefined();
    expect(body.geometry).toEqual(pin); // the template's own geometry pin was NOT applied
    expect(backend.callsTo("GET", /\/api\/library\//).length).toBeGreaterThan(0);
    expect(backend.calls.filter((call) => call.path.startsWith("/api/admin"))).toEqual([]);
  });

  test("applying with the defaults never overwrites what the author wrote", async ({ page }) => {
    const { mock } = await openEditor(page);
    await choose(page, "ScenarioTemplate", "TEMPLATE-SO-TAN");
    await page.getByTestId("apply-open").click();
    await expect(page.getByTestId("apply-summary")).toContainText("Giữ nguyên của bạn: Tên kịch bản, Mục tiêu học tập");
    await page.getByTestId("apply-confirm").click();
    await tab(page, "Kịch bản").click();
    await expect(page.getByTestId("field-name")).toHaveValue("Tên của tôi");
    await expect(page.getByTestId("objectives").getByRole("textbox")).toHaveCount(1);
    await expect(page.getByTestId("field-time-limit")).toHaveValue("600");
    await page.getByTestId("save").click();
    await expect(status(page)).toHaveText("Đã lưu");
    expect(lastPut(mock).name).toBe("Tên của tôi");
    expect(lastPut(mock).learningObjectives).toEqual(["Mục tiêu của tôi"]);
  });

  test("the preview follows the live draft: after the author fills a field the group becomes conflicting, not overwritten", async ({ page }) => {
    await openEditor(page);
    await choose(page, "ScenarioTemplate", "TEMPLATE-SO-TAN");
    await expect(page.getByTestId("apply-group-template:timeLimitSeconds")).toHaveAttribute("data-status", "new");
    await tab(page, "Kịch bản").click();
    await page.getByTestId("field-time-limit").fill("300");
    await tab(page, "Thư viện").click();
    await expect(page.getByTestId("apply-group-template:timeLimitSeconds")).toHaveAttribute("data-status", "different");
    await expect(page.getByTestId("apply-template:timeLimitSeconds-keep")).toBeChecked();
    await expect(page.getByTestId("apply-current-template:timeLimitSeconds")).toHaveText("300 giây");
  });

  test("rubric sample: merge keeps my criteria and adds only new ids; replace swaps the whole rubric; undo restores", async ({ page }) => {
    const { mock } = await openEditor(page, { state: { ...fixtureState(), geometry: pin } });
    await choose(page, "RubricSample", "RUBRIC-CO-BAN");
    const group = page.getByTestId("apply-group-rubric");
    await expect(group).toHaveAttribute("data-status", "different");
    await expect(group).toContainText("2 tiêu chí");
    await expect(page.getByTestId("apply-rubric-merge")).toBeVisible();
    await page.getByTestId("apply-rubric-merge").check();
    await page.getByTestId("apply-open").click();
    await page.getByTestId("apply-confirm").click();
    await page.getByTestId("save").click();
    await expect(status(page)).toHaveText("Đã lưu");
    const rubric = lastPut(mock).rubric as { criteria: Array<{ id: string; description?: string }>; pass_threshold: number };
    expect(rubric.criteria.map((criterion) => criterion.id)).toEqual(["reached-exit", "wrong-exits"]);
    expect(rubric.criteria[0].description).toBe("Đến được lối thoát."); // my criterion kept as it was
    expect(lastPut(mock).objects).toHaveLength(6); // positions and objects untouched
    await page.getByTestId("undo").click();
    await expect(status(page)).toHaveText("Chưa lưu"); // back to the previous saved state differs from baseline (merge was saved)
  });

  test("a sample with a metric the catalog does not publish is flagged before it is applied", async ({ page }) => {
    await openEditor(page, { seed: (b) => {
      b.seedItem("RubricSample", "RUBRIC-LA");
      b.seedVersion("RUBRIC-LA", { name: "Rubric lạ", payload: { rubric: { ...RUBRIC, criteria: [{ ...RUBRIC.criteria[0], metric: "ten_metric_la" }] } }, publish: true });
    } });
    await choose(page, "RubricSample", "RUBRIC-LA");
    await expect(page.getByTestId("apply-group-rubric")).toContainText("Chỉ số không có trong danh mục rubric: ten_metric_la");
  });

  test("equipment: label only on the selected Equipment object; the capability stays the runtime's, shown as a hint; metadata is reference only", async ({ page }) => {
    const { mock } = await openEditor(page, { state: { ...fixtureState(), geometry: pin } });
    await tab(page, "Thư viện").click();
    await page.getByTestId("library-kind-Equipment").click();
    await page.getByTestId("library-item-BINH-CO2").click();
    await expect(page.getByTestId("apply-blocker")).toContainText("Chọn một đối tượng Thiết bị");
    await expect(page.getByTestId("apply-open")).toBeDisabled();
    await expect(page.getByTestId("no-capability-notice")).toContainText("Năng lực của đối tượng vẫn lấy từ danh mục runtime");

    await page.getByTestId("object-item-5").click(); // the Equipment object of the fixture (extinguisher, CO2)
    await tab(page, "Thư viện").click(); // the chosen sample and kind are kept across tabs
    await expect(page.getByTestId("apply-blocker")).toHaveCount(0);
    await expect(page.getByTestId("apply-group-equipment:label")).toHaveAttribute("data-status", "new");
    await expect(page.getByTestId("equipment-reference")).toContainText("Bình chữa cháy CO2.");
    await expect(page.getByTestId("equipment-reference")).toContainText("Khối lượng (kg)");
    await expect(page.getByTestId("library-preview")).toContainText("Runtime của bản nháp chưa công bố năng lực: cover.nose");
    await expect(page.getByTestId("apply-group-equipment:capability")).toHaveAttribute("data-status", "same"); // already equals the runtime's own entry
    await page.getByTestId("apply-open").click();
    await page.getByTestId("apply-confirm").click();
    await page.getByTestId("save").click();
    await expect(status(page)).toHaveText("Đã lưu");
    const objects = lastPut(mock).objects as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(objects[5].label).toBe("Bình CO2 5 kg");
    expect(objects[5].capability).toEqual({ id: "equipment.extinguisher", version: "1.0.0" });
    expect(objects[5].parameters).toEqual({ agent: "CO2" });
    // nothing outside the runtime catalog ever becomes a capability
    const catalogIds = new Set(["fire.source", "npc.evacuee", "equipment.extinguisher"]);
    expect(objects.every((object) => !object.capability || catalogIds.has(object.capability.id))).toBe(true);
    expect(JSON.stringify(lastPut(mock))).not.toContain("cover.nose");
  });

  test("equipment whose required capability the runtime does not publish: no capability is added, only a label", async ({ page }) => {
    const { mock } = await openEditor(page, { state: { ...fixtureState(), geometry: pin } });
    await tab(page, "Thư viện").click();
    await page.getByTestId("object-item-5").click();
    await choose(page, "Equipment", "MAT-NA");
    await expect(page.getByTestId("apply-group-equipment:capability")).toHaveCount(0);
    await expect(page.getByTestId("library-preview")).toContainText("chưa công bố năng lực: cover.nose");
    await page.getByTestId("apply-open").click();
    await page.getByTestId("apply-confirm").click();
    await page.getByTestId("save").click();
    await expect(status(page)).toHaveText("Đã lưu");
    expect(lastPut(mock).objects[5].capability).toEqual({ id: "equipment.extinguisher", version: "1.0.0" });
    expect(lastPut(mock).objects[5].label).toBe("Mặt nạ lọc khói");
  });

  test("a sample updated or withdrawn later does not change the draft; the draft keeps the copied content and the new version is a new preview", async ({ page }) => {
    const { backend, mock } = await openEditor(page);
    await choose(page, "ScenarioTemplate", "TEMPLATE-SO-TAN");
    await page.getByTestId("apply-open").click();
    await page.getByTestId("apply-confirm").click();
    await page.getByTestId("save").click();
    await expect(status(page)).toHaveText("Đã lưu");
    const saved = JSON.parse(JSON.stringify(lastPut(mock)));
    const putsBefore = mock.puts.length;

    // the admin publishes v2 with other content, then withdraws the item
    const v2 = backend.seedVersion("TEMPLATE-SO-TAN", { name: "Template v2", payload: { state: { ...TEMPLATE_STATE, name: "Tên mới của mẫu", timeLimitSeconds: 1200 } }, publish: true });
    await page.reload();
    await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "v1");
    expect(mock.puts).toHaveLength(putsBefore); // nothing was written by the sample update
    expect(mock.state).toEqual(saved);
    await tab(page, "Kịch bản").click();
    await expect(page.getByTestId("field-time-limit")).toHaveValue("600"); // v1's value is still what the draft has
    await tab(page, "Thư viện").click();
    await expect(page.getByTestId("applied-samples")).toContainText("Chưa áp dụng mẫu nào"); // session record only; the draft stores no provenance
    await page.getByTestId("library-item-TEMPLATE-SO-TAN").click();
    await expect(page.getByTestId("library-preview")).toContainText("phiên bản v2");
    await expect(page.getByTestId("apply-group-template:timeLimitSeconds")).toHaveAttribute("data-status", "different");
    await expect(page.getByTestId("apply-current-template:timeLimitSeconds")).toHaveText("600 giây");
    await expect(page.getByTestId("apply-incoming-template:timeLimitSeconds")).toHaveText("1200 giây");
    expect(v2.name).toBe("Template v2");

    // withdrawn between listing and choosing: unavailable, the draft is untouched
    await page.getByRole("button", { name: "Chọn mẫu khác" }).click();
    backend.externalDeactivate("TEMPLATE-SO-TAN");
    await page.getByTestId("library-item-TEMPLATE-SO-TAN").click();
    await expect(page.getByText("Mẫu không còn khả dụng")).toBeVisible();
    await expect(status(page)).toHaveText("Đã lưu");
  });

  test("the picker lists only published, active items (a Draft-only or deactivated item is never offered)", async ({ page }) => {
    await openEditor(page);
    await tab(page, "Thư viện").click();
    await expect(page.getByTestId("library-item-TEMPLATE-SO-TAN")).toBeVisible();
    await expect(page.getByTestId("library-item-CHI-CO-BAN-NHAP")).toHaveCount(0);
    await expect(page.getByTestId("library-item-DA-NGUNG")).toHaveCount(0);
  });

  test("403 in the picker is explained and the editor keeps working", async ({ page }) => {
    const { mock } = await openEditor(page, { actor: "trainee" });
    await tab(page, "Thư viện").click();
    await expect(page.getByRole("alert").filter({ hasText: "Không có quyền xem thư viện" })).toBeVisible();
    await tab(page, "Kịch bản").click();
    await page.getByTestId("field-name").fill("Vẫn soạn được");
    await expect(status(page)).toHaveText("Chưa lưu");
    expect(mock.puts).toHaveLength(0);
  });

  test("an empty library says so and invents no sample", async ({ page }) => {
    await openEditor(page, { seed: () => undefined });
    await tab(page, "Thư viện").click();
    await expect(page.getByRole("heading", { name: "Chưa có mẫu nào được xuất bản" })).toBeVisible();
    await expect(page.getByText("Thư viện không có dữ liệu sẵn")).toBeVisible();
    await expect(page.getByTestId("library-items").getByRole("button")).toHaveCount(0);
  });

  test("a lost-then-late list response does not replace the kind the author switched to", async ({ page }) => {
    const { backend } = await openEditor(page);
    backend.failNext("GET", /^\/api\/library\/items$/, { status: 200, json: { items: [], total: 0, page: 1, pageSize: 10 }, delayMs: 600 });
    await tab(page, "Thư viện").click(); // first request (ScenarioTemplate) answers empty and late
    await page.getByTestId("library-kind-Equipment").click();
    await expect(page.getByTestId("library-item-BINH-CO2")).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.getByTestId("library-item-BINH-CO2")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chưa có mẫu nào được xuất bản" })).toHaveCount(0);
  });
});

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"] as const) {
    test(`library list and the editor Library tab fit ${width}px in the ${theme} theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      await openEditor(page, { state: { ...fixtureState(), geometry: pin } });
      if (width === 375) await page.getByRole("button", { name: /^Thuộc tính/ }).click();
      await choose(page, "ScenarioTemplate", "TEMPLATE-SO-TAN");
      await expect(page.getByTestId("apply-group-template:name")).toBeVisible();
      await page.getByTestId("apply-template:name-replace").check();
      await noOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`library-editor-${width}-${theme}.png`), fullPage: true });
      await page.getByTestId("apply-open").click();
      await expect(page.getByTestId("apply-summary")).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`library-editor-confirm-${width}-${theme}.png`) });
      await page.goto("/workspace/library");
      await expect(page.getByTestId("org-item-TEMPLATE-SO-TAN")).toBeVisible();
      await noOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`library-browse-${width}-${theme}.png`), fullPage: true });
    });
  }
}
