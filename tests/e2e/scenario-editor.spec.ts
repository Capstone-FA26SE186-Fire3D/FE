import { expect, test, type Page } from "@playwright/test";

import { BUILDING_ID, DRAFT_ID, REVISION_ID, SCENARIO_ID } from "../fixtures/scenario-editor/fixture-building";
import { EDITOR_URL, installEditorMocks, newMock, sampleDraftState, watchConsole, type MockState } from "../fixtures/scenario-editor/mock-api";

/**
 * EVIDENCE LEVEL: mock. Every API response here is a Playwright route built from BE main @ b6a7d74 DTOs/controllers
 * (ETag "<xmin>", PUT 204 + ETag header, 412/428/400 problem bodies, editor-preview NotReady = 200 + downloadUrl null,
 * `issues[{code,path,message}]`). WebGL runs on SwiftShader in headless Chromium: it proves the code path and
 * resource lifecycle, not GPU performance. The GLB is a hand-built fixture, not a worker artifact.
 */

async function open(page: Page, mock: MockState, options: { theme?: "light" | "dark"; waitModel?: boolean } = {}) {
  const log = watchConsole(page);
  await installEditorMocks(page, mock, { theme: options.theme });
  await page.goto(EDITOR_URL);
  await expect(page.getByTestId("scenario-editor")).toBeVisible();
  if (options.waitModel !== false) await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  return log;
}

const stats = (page: Page) => page.evaluate(() => window.__fire3dEditorScene?.stats());
const status = (page: Page) => page.getByTestId("save-status");
const coord = (page: Page, axis: string) => page.getByTestId(`coord-${axis}`);
const hazardItem = (page: Page, name: string) => page.getByTestId("hazard-list").getByRole("button", { name: new RegExp(name) });
const spawnItem = (page: Page, name: string) => page.getByTestId("spawn-list").getByRole("button", { name: new RegExp(name) });

test("loads the draft and model: floors, layers, selection by list and by canvas click; no WebGL/shader errors", async ({ page }) => {
  const mock = newMock();
  const log = await open(page, mock);
  await expect(page.getByRole("heading", { name: "Thoát hiểm tầng một" })).toBeVisible();
  await expect(status(page)).toHaveText("Đã lưu");
  await expect(page.getByTestId("model-info")).toContainText("12 mesh");

  // floors: choosing a floor clips the model above it; "Tất cả" removes the clip
  const radios = page.getByRole("radiogroup", { name: "Chọn tầng" });
  await expect(radios.getByRole("radio")).toHaveCount(3);
  await radios.getByRole("radio", { name: /Tầng 1/ }).click();
  await expect.poll(() => page.evaluate(() => window.__fire3dEditorScene?.clipConstant())).toBeCloseTo(3.18, 2);
  await radios.getByRole("radio", { name: /Tầng 2/ }).click();
  await expect.poll(() => page.evaluate(() => window.__fire3dEditorScene?.clipConstant())).toBeGreaterThan(1e6);
  await radios.getByRole("radio", { name: "Tất cả" }).click();

  // layers inferred from semanticMapping exist only because matching glTF nodes were found
  const wall = page.getByRole("button", { name: "Tường", exact: true });
  await expect(wall).toHaveAttribute("aria-pressed", "true");
  await wall.click();
  await expect(wall).toHaveAttribute("aria-pressed", "false");
  await wall.click();

  // selection from the object tree fills the coordinate form (metres)
  await spawnItem(page, "Điểm #1").click();
  await expect(page.getByTestId("object-form")).toContainText("Điểm xuất phát #1");
  await expect(coord(page, "x")).toHaveValue("-6");
  await hazardItem(page, "hazard-2").click();
  await expect(page.getByTestId("hazard-type")).toHaveValue("Smoke");
  await expect(page.getByTestId("hazard-activation")).toHaveValue("60");

  // selection by clicking the marker in the canvas (real pointer events)
  await spawnItem(page, "Điểm #1").click();
  const point = await page.evaluate(() => window.__fire3dEditorScene?.project("hazard", 0));
  expect(point).toBeTruthy();
  await page.mouse.click(point!.x, point!.y);
  await expect(hazardItem(page, "hazard-1")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("hazard-id")).toHaveValue("hazard-1");

  expect(log.relevant()).toEqual([]);
});

test("place with the canvas tool, move/undo/redo through the coordinate form, save with If-Match, reopen", async ({ page }) => {
  const mock = newMock();
  const log = await open(page, mock);

  // click-to-place on the model
  await page.getByTestId("tool-place-hazard").click();
  const box = (await page.locator(".se-canvas-host").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.62);
  await expect(page.getByTestId("hazard-list").getByRole("button")).toHaveCount(3);
  await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true"); // back to select after placing
  await expect(page.getByTestId("object-form")).toContainText("Nguy cơ #3");
  await expect(status(page)).toHaveText("Chưa lưu");

  // edit through the form: one fill = one history step
  await coord(page, "x").fill("12.5");
  await expect.poll(() => page.evaluate(() => window.__fire3dEditorScene?.markerPosition("hazard", 2)?.[0])).toBeCloseTo(12.5, 3);
  await page.getByTestId("hazard-activation").fill("45");
  await expect(page.getByTestId("hazard-list")).toContainText("45 giây");

  // undo/redo by toolbar and by keyboard
  await page.getByTestId("undo").click(); // activation
  await expect(page.getByTestId("hazard-list")).not.toContainText("45 giây");
  await page.getByTestId("undo").click(); // x
  await expect(coord(page, "x")).not.toHaveValue("12.5");
  await page.getByTestId("redo").click();
  await expect(coord(page, "x")).toHaveValue("12.5");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+Shift+Z");
  await expect(page.getByTestId("hazard-list")).toContainText("45 giây");
  await page.keyboard.press("Control+Z");
  await page.keyboard.press("Control+Z");
  await page.keyboard.press("Control+Z"); // places undone → 2 hazards
  await expect(page.getByTestId("hazard-list").getByRole("button")).toHaveCount(2);
  await expect(status(page)).toHaveText("Đã lưu"); // back at the loaded content: not dirty
  await page.getByTestId("redo").click();
  await page.getByTestId("redo").click();
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("hazard-list").getByRole("button")).toHaveCount(3);

  // Ctrl+S: PUT with the draft ETag; unknown fields are sent back untouched
  const original = sampleDraftState();
  await page.keyboard.press("Control+S");
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.puts).toHaveLength(1);
  expect(mock.puts[0].ifMatch).toBe('"51"');
  const body = mock.puts[0].body as Record<string, unknown>;
  expect((body.hazards as unknown[]).length).toBe(3);
  expect(body.goals).toEqual(original.goals);
  expect(body.npcs).toEqual(original.npcs);
  expect(body.modePolicy).toEqual(original.modePolicy);
  expect(body.rubric).toEqual(original.rubric);
  expect(((body.hazards as Array<{ position: { x: number } }>)[2]).position.x).toBe(12.5);

  // a second save uses the ETag returned by the first (never a guess)
  await coord(page, "z").fill("3");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.puts[1].ifMatch).toBe('"52"');

  // reopen: the saved state comes back from GET
  await page.reload();
  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("hazard-list").getByRole("button")).toHaveCount(3);
  await hazardItem(page, "hazard-3").click();
  await expect(coord(page, "x")).toHaveValue("12.5");
  await expect(coord(page, "z")).toHaveValue("3");
  expect(log.relevant()).toEqual([]);
});

test("a PUT whose 204 lacks the ETag header re-reads the draft instead of guessing the revision", async ({ page }) => {
  const mock = newMock({ stripEtagOnPut: true });
  await open(page, mock);
  await page.getByTestId("add-spawn").click();
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  const getsAfterFirstSave = mock.getCount;
  expect(getsAfterFirstSave).toBeGreaterThanOrEqual(2); // initial load + the re-read
  await page.getByTestId("add-spawn").click();
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.puts[1].ifMatch).toBe('"52"');
});

test("412 keeps the typed content, offers a field-level comparison and never overwrites on its own", async ({ page }) => {
  const mock = newMock();
  await open(page, mock);
  await page.getByRole("tab", { name: "Kịch bản" }).click();
  await page.getByTestId("time-limit").fill("240");
  await page.getByTestId("learner-instructions").fill("Bản của tôi");

  // somebody else saved in the meantime (new revision, different instructions + routes)
  mock.putStatus = [412];
  mock.version = 60;
  mock.state = { ...sampleDraftState(), learnerInstructions: "Bản của họ", routingConfig: { evacuationRoutes: ["Tuyến A", "Tuyến B"] } };

  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Xung đột");
  expect(mock.puts).toHaveLength(0); // the rejected PUT wrote nothing
  const dialog = page.getByRole("dialog", { name: "Bản nháp đã được thay đổi ở nơi khác" });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("time-limit")).toHaveValue("240"); // typed content kept behind the dialog
  await dialog.getByTestId("load-theirs").click();
  const list = dialog.getByTestId("merge-list");
  await expect(list).toContainText("Hướng dẫn người học");
  await expect(list).toContainText("Cả hai cùng sửa");
  await expect(list).toContainText("Chỉ máy chủ sửa");
  await expect(list).toContainText("Chỉ bạn sửa");
  await expect(list).toContainText("$.scoringConfig.timeLimitSeconds");
  expect(mock.puts).toHaveLength(0);

  // keep my instructions, take the server routes (the default for server-only changes), apply (still unsaved)
  await dialog.getByTestId("apply-merge").click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText("Chưa lưu");
  expect(mock.puts).toHaveLength(0);
  await expect(page.getByTestId("learner-instructions")).toHaveValue("Bản của tôi");
  await expect(page.getByTestId("time-limit")).toHaveValue("240");
  await expect(page.getByRole("textbox", { name: "Tuyến thoát hiểm 2" })).toHaveValue("Tuyến B");

  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.puts).toHaveLength(1);
  expect(mock.puts[0].ifMatch).toBe('"60"'); // the server's revision, not the stale one
  const sent = mock.puts[0].body as { learnerInstructions: string; scoringConfig: { timeLimitSeconds: number }; routingConfig: { evacuationRoutes: string[] } };
  expect(sent.learnerInstructions).toBe("Bản của tôi");
  expect(sent.scoringConfig.timeLimitSeconds).toBe(240);
  expect(sent.routingConfig.evacuationRoutes).toEqual(["Tuyến A", "Tuyến B"]);
});

test("412 can be dismissed: the author keeps editing the same content and the status stays Conflict", async ({ page }) => {
  const mock = newMock({ putStatus: [412] });
  await open(page, mock);
  await page.getByRole("tab", { name: "Kịch bản" }).click();
  await page.getByTestId("time-limit").fill("200");
  await page.getByTestId("save").click();
  const dialog = page.getByRole("dialog", { name: "Bản nháp đã được thay đổi ở nơi khác" });
  await dialog.getByRole("button", { name: /Giữ bản của tôi/ }).click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText("Xung đột");
  await expect(page.getByTestId("time-limit")).toHaveValue("200");
  await expect(page.getByTestId("open-conflict")).toBeVisible();
});

test("428 and 400 (INVALID_IF_MATCH) are reported precisely and content is kept", async ({ page }) => {
  const mock = newMock({ putStatus: [428, 400, 204] });
  await open(page, mock);
  await page.getByTestId("add-spawn").click();
  await page.getByTestId("save").click();
  await expect(page.getByRole("alert").filter({ hasText: "Thiếu If-Match" })).toBeVisible();
  await expect(status(page)).toHaveText("Lỗi khi lưu");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "INVALID_IF_MATCH" })).toBeVisible();
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(((mock.puts[0].body as { spawnPoints: unknown[] }).spawnPoints)).toHaveLength(2);
});

test("expired signed URL: refreshed before download when expiresAt passed, and after a 403 from storage", async ({ page }) => {
  const stale = newMock({ expireFirstPreview: true });
  await open(page, stale);
  expect(stale.previewCalls).toBe(2);
  expect(stale.glbCalls).toBe(1); // the stale URL was never downloaded

  const rejected = newMock({ glbStatus: [403] });
  const page2 = await page.context().newPage();
  await open(page2, rejected);
  expect(rejected.previewCalls).toBe(2);
  expect(rejected.glbCalls).toBe(2);
  await expect(page2.locator(".se-overlay-card")).toHaveCount(0);
});

test("persistent download failure stops auto-refreshing and offers a manual retry", async ({ page }) => {
  const mock = newMock({ glbStatus: [403, 403, 403] });
  await open(page, mock, { waitModel: false });
  const card = page.locator(".se-overlay-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("403");
  await expect.poll(() => mock.previewCalls).toBe(3); // initial + 2 automatic refreshes, then it stops
  await page.waitForTimeout(500);
  expect(mock.previewCalls).toBe(3);
  await card.getByRole("button", { name: "Tải lại mô hình" }).click();
  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 15_000 });
  expect(mock.previewCalls).toBe(4);
});

test("NotReady preview: editor stays usable, light polling picks the model up, manual retry works", async ({ page }) => {
  const mock = newMock({ previewQueue: ["not-ready", "ready"] });
  await open(page, mock, { waitModel: false });
  await expect(page.getByText("Mô hình 3D chưa sẵn sàng")).toBeVisible();
  await expect(page.getByText("Trạng thái revision: Processing")).toBeVisible();
  await page.getByTestId("add-spawn").click(); // placing by coordinates needs no model
  await expect(page.getByTestId("spawn-list").getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("floors-empty")).toBeVisible();
  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 15_000 }); // polled (5 s)
  await expect(page.getByText("Mô hình 3D chưa sẵn sàng")).toBeHidden();

  const manual = newMock({ previewQueue: ["not-ready", "error", "ready"] });
  const page2 = await page.context().newPage();
  await open(page2, manual, { waitModel: false });
  await expect(page2.getByText("Mô hình 3D chưa sẵn sàng")).toBeVisible();
  await page2.getByRole("button", { name: "Kiểm tra lại" }).click();
  await expect(page2.getByText("Không lấy được thông tin mô hình")).toBeVisible();
  await page2.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page2.getByTestId("model-info")).toBeVisible({ timeout: 15_000 });
});

test("WebGL resources are released when the editor unmounts (renderer.info.memory back to 0), repeatedly", async ({ page }) => {
  const mock = newMock();
  const log = await open(page, mock);
  const before = await stats(page);
  expect(before!.geometries).toBeGreaterThan(0);
  expect(before!.programs).toBeGreaterThan(0);

  for (let round = 0; round < 2; round++) {
    await page.getByRole("link", { name: "Kịch bản", exact: true }).click(); // client-side navigation away
    await expect(page).toHaveURL(new RegExp(`/workspace/buildings/${BUILDING_ID}/scenarios$`));
    await expect.poll(() => page.evaluate(() => window.__fire3dEditorScene === undefined)).toBe(true);
    await page.goBack();
    await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  }
  const disposals = await page.evaluate(() => (window.__fire3dEditorLog ?? []).filter((entry) => entry.event === "dispose"));
  expect(disposals).toHaveLength(2);
  for (const entry of disposals) {
    expect(entry.geometries).toBe(0);
    expect(entry.textures).toBe(0);
  }
  // a fresh mount does not accumulate on top of the old one
  const after = await stats(page);
  expect(after!.geometries).toBe(before!.geometries);
  expect(log.relevant()).toEqual([]);
});

test("context loss shows a recovery screen, auto-recovers on restore, or can be rebuilt on demand", async ({ page }) => {
  const mock = newMock();
  const log = await open(page, mock);
  await page.evaluate(() => window.__fire3dEditorScene?.loseContext());
  await expect(page.getByTestId("context-lost")).toBeVisible();
  expect((await stats(page))!.lost).toBe(true);
  await page.evaluate(() => window.__fire3dEditorScene?.restoreContext());
  await expect(page.getByTestId("context-lost")).toBeHidden();
  const renders = (await stats(page))!.renders;
  await page.getByTestId("tool-select").click();
  await spawnItem(page, "Điểm #1").click();
  await expect.poll(async () => (await stats(page))!.renders).toBeGreaterThan(renders);

  await page.evaluate(() => window.__fire3dEditorScene?.loseContext());
  await expect(page.getByTestId("context-lost")).toBeVisible();
  const downloads = mock.glbCalls;
  await page.getByRole("button", { name: "Tạo lại khung nhìn" }).click();
  await expect(page.getByTestId("context-lost")).toBeHidden();
  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await stats(page))?.markers).toBe(3); // spawn + 2 hazards rebuilt from the draft
  expect((await stats(page))!.lost).toBe(false);
  expect(mock.glbCalls).toBeGreaterThan(downloads);
  // the draft was never touched by any of this
  await expect(status(page)).toHaveText("Đã lưu");
  expect(log.relevant().filter((text) => !/context lost|CONTEXT_LOST/i.test(text))).toEqual([]);
});

test("validate saves first, merges server issues with client issues and jumps to the offending object", async ({ page }) => {
  const mock = newMock({ validate: { isValid: false, issues: [
    { code: "HAZARD_TYPE_REQUIRED", path: "$.hazards[1].type", message: "Hazard type is required." },
    { code: "ANCHOR_NOT_FOUND", path: "$.objectAnchors", message: "Anchor does not exist in accepted geometry for this revision." },
  ] } });
  await open(page, mock);
  await page.getByTestId("add-hazard").click();
  await page.getByTestId("validate").click();
  await expect(page.getByTestId("issues-panel")).toBeVisible();
  expect(mock.puts).toHaveLength(1); // the BE validates the STORED draft, so the edit was saved first
  expect(mock.validateCalls).toBe(1);
  const items = page.getByTestId("issue-item");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("HAZARD_TYPE_REQUIRED");
  await expect(items.first()).toContainText("Máy chủ");
  await items.first().click();
  await expect(page.getByTestId("hazard-id")).toHaveValue("hazard-2");
  await expect(hazardItem(page, "hazard-2")).toHaveAttribute("aria-pressed", "true");
  // editing afterwards marks the server result as possibly stale
  await page.getByTestId("add-spawn").click();
  await page.getByTestId("tab-issues").click();
  await expect(page.getByText(/có thể đã cũ/)).toBeVisible();
});

for (const pending of ["save", "validate"] as const) {
  test(`validation stays tied to the stored snapshot when editing during ${pending}`, async ({ page }) => {
    const mock = newMock();
    await open(page, mock);
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<void>();
    if (pending === "save") {
      await page.route(`**/api/scenario-drafts/${DRAFT_ID}`, async (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        started.resolve();
        await response.promise;
        return route.fallback();
      });
      await page.getByTestId("add-spawn").click();
    } else {
      await page.route(`**/api/scenario-drafts/${DRAFT_ID}/validate`, async (route) => {
        started.resolve();
        await response.promise;
        return route.fallback();
      });
    }
    await page.getByTestId("validate").evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
    await started.promise;
    await page.getByTestId("add-spawn").click();
    response.resolve();
    await page.getByTestId("tab-issues").click();
    await expect(page.getByText("Máy chủ xác nhận bản đã lưu trước đó hợp lệ", { exact: true })).toBeVisible();
    await expect(page.getByText("Bạn đã sửa sau lần kiểm tra này; kiểm tra lại để chắc chắn.", { exact: true })).toBeVisible();
    await expect(status(page)).toHaveText("Chưa lưu");
    expect(mock.puts).toHaveLength(pending === "save" ? 1 : 0);
    expect(mock.validateCalls).toBe(1);

    await page.getByTestId("validate-inline").click();
    await expect(page.getByText("Máy chủ xác nhận bản nháp hợp lệ về cấu trúc", { exact: true })).toBeVisible();
    await expect(status(page)).toHaveText("Đã lưu");
    expect(mock.validateCalls).toBe(2);
  });
}

test("validation accepts an unchanged snapshot and rejects a different server version", async ({ page }) => {
  const mock = newMock();
  await open(page, mock);
  await page.getByTestId("validate").click();
  await expect(page.getByText("Máy chủ xác nhận bản nháp hợp lệ về cấu trúc", { exact: true })).toBeVisible();
  expect(mock.puts).toHaveLength(0);
  await page.route(`**/api/scenario-drafts/${DRAFT_ID}/validate`, (route) => route.fulfill({ json: { draftId: DRAFT_ID, version: mock.version + 1, isValid: true, issues: [] } }));
  await page.getByTestId("validate-inline").click();
  await expect(page.getByText(/Kết quả kiểm tra thuộc phiên bản khác/)).toBeVisible();
  await expect(page.getByText("Máy chủ xác nhận bản nháp hợp lệ về cấu trúc", { exact: true })).toHaveCount(0);
  await expect(status(page)).toHaveText("Đã lưu");
});

test("changing drafts aborts a pending validation and does not apply its result to the new draft", async ({ page }) => {
  const mock = newMock();
  await open(page, mock);
  const started = Promise.withResolvers<void>();
  const response = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  await page.route(`**/api/scenario-drafts/${DRAFT_ID}/validate`, async (route) => {
    started.resolve();
    await response.promise;
    await route.fulfill({ json: { draftId: DRAFT_ID, version: mock.version, isValid: false, issues: [{ code: "OLD_DRAFT", path: "$.objectAnchors", message: "Old draft response" }] } });
    finished.resolve();
  });
  const nextId = "11111111-1111-4111-8111-111111111112";
  await page.route(`**/api/scenario-drafts/${nextId}`, (route) => route.fulfill({ json: { id: nextId, scenarioId: SCENARIO_ID, buildingId: BUILDING_ID, revisionId: REVISION_ID, draftNumber: 4, state: sampleDraftState(), source: "Manual", version: 86 }, headers: { ETag: '"86"' } }));
  await page.getByTestId("validate").click();
  await started.promise;
  const aborted = page.waitForEvent("requestfailed", { predicate: (request) => request.url().endsWith(`/${DRAFT_ID}/validate`) });
  await page.evaluate((url) => window.history.pushState(null, "", url), EDITOR_URL.replace(DRAFT_ID, nextId));
  await aborted;
  await expect(page.getByText("Bản nháp #4", { exact: true })).toBeVisible();
  response.resolve();
  await finished.promise;
  await page.getByTestId("tab-issues").click();
  await expect(page.getByTestId("issue-item")).toHaveCount(0);
  await expect(page.getByText("Old draft response", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("validate-inline")).toBeEnabled();
});

test("client validation flags an empty rubric/objectives without presetting any policy", async ({ page }) => {
  const mock = newMock();
  mock.state = { spawnPoints: [], hazards: [] }; // a freshly created draft body
  await open(page, mock);
  await page.getByTestId("tab-issues").click();
  const text = await page.getByTestId("issues-panel").innerText();
  for (const code of ["SPAWN_REQUIRED", "TIME_LIMIT_INVALID", "ROUTE_REQUIRED", "LEARNING_OBJECTIVES_REQUIRED", "LEARNER_INSTRUCTIONS_REQUIRED", "RUBRIC_REQUIRED"]) expect(text).toContain(code);
  await page.getByRole("tab", { name: "Kịch bản" }).click();
  await expect(page.getByTestId("rubric-threshold")).toHaveValue("");
  await expect(page.getByTestId("time-limit")).toHaveValue("");
  await expect(page.getByTestId("base-score")).toHaveValue("");
  // building a rubric from nothing, then undo removes the whole branch
  await page.getByTestId("add-criterion").click();
  await expect(page.getByTestId("criterion-0")).toBeVisible();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("criterion-0")).toHaveCount(0);
});

test("goals / NPC / blocked elements / devices and Playtest are locked with the BE issue named; their data is preserved", async ({ page }) => {
  const mock = newMock();
  await open(page, mock);
  await page.getByRole("tab", { name: "Chờ BE" }).click();
  const locked = page.getByTestId("locked-sections");
  for (const key of ["goals", "npcs", "blockedElements", "devices"]) {
    const section = locked.locator(`[data-capability="${key}"]`);
    await expect(section).toHaveAttribute("data-locked", "true");
    await expect(section.getByRole("button")).toBeDisabled();
    await expect(section).toContainText("Chờ BE #54");
  }
  await expect(locked.locator('[data-capability="goals"]')).toContainText("đang có 1 mục");
  await expect(page.getByTestId("playtest")).toBeDisabled();
  await expect(page.getByTestId("playtest")).toContainText("Chờ BE #55");
  await expect(page.getByTestId("versions-link")).toHaveAttribute("href", `/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}/versions`);
});

test("unsaved work: beforeunload warns, in-app links and Back ask first, saving clears the warning", async ({ page }) => {
  const mock = newMock();
  await open(page, mock);
  await page.getByTestId("add-spawn").click();
  await expect(status(page)).toHaveText("Chưa lưu");

  // in-app link
  await page.getByRole("link", { name: "Hồ sơ tổ chức", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Rời khỏi trình soạn thảo?" });
  await expect(modal).toBeVisible();
  await page.getByTestId("leave-stay").click();
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/scenarios\/.*draft=/);
  await expect(page.getByTestId("spawn-list").getByRole("button")).toHaveCount(2); // nothing lost

  // browser Back
  await page.goBack();
  await expect(modal).toBeVisible();
  await page.getByTestId("leave-stay").click();
  await expect(page).toHaveURL(/scenarios\/.*draft=/);

  // reload → native beforeunload dialog
  const dialogs: string[] = [];
  page.once("dialog", async (dialog) => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  await page.evaluate(() => { location.reload(); });
  await expect.poll(() => dialogs).toEqual(["beforeunload"]);

  // saved → leaving is free
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  await page.getByRole("link", { name: "Hồ sơ tổ chức", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/profile$/);
});

test("confirming the leave dialog discards the edit and navigates", async ({ page }) => {
  const mock = newMock();
  await open(page, mock);
  await page.getByTestId("add-hazard").click();
  await page.getByRole("link", { name: "Hồ sơ tổ chức", exact: true }).click();
  await page.getByTestId("leave-confirm").click();
  await expect(page).toHaveURL(/\/workspace\/profile$/);
  expect(mock.puts).toHaveLength(0);
});

test("no ?draft=: a draft is created with a stable Idempotency-Key across a retry, then the editor opens", async ({ page }) => {
  const mock = newMock({ createDraftStatus: [503] });
  await installEditorMocks(page, mock);
  await page.goto(`/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}`);
  await expect(page.getByRole("heading", { name: "Soạn kịch bản" })).toBeVisible();
  await page.getByTestId("create-draft").click();
  await expect(page.getByText("Tạo bản nháp thất bại")).toBeVisible();
  await page.getByTestId("create-draft").click();
  await expect(page).toHaveURL(new RegExp(`draft=${DRAFT_ID}`));
  expect(mock.createDraftCalls).toHaveLength(2);
  expect(mock.createDraftCalls[0].key).toBeTruthy();
  expect(mock.createDraftCalls[1].key).toBe(mock.createDraftCalls[0].key);
  expect(mock.createDraftCalls[0].body).toEqual({ revisionId: "44444444-4444-4444-8444-444444444444" });
  await expect(page.getByTestId("scenario-editor")).toBeVisible();
});

test("draft errors: 404 and 403 show their own screens; a server error can be retried", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "t", refreshToken: "r" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "o", email: "o@x.test", fullName: "O", role: 1, organizationId: "org-1" } }));
  let status = 404;
  await page.route(`**/api/scenario-drafts/${DRAFT_ID}`, (route) => route.fulfill({ status, contentType: "application/problem+json", body: JSON.stringify({ status, title: "x" }) }));
  await page.goto(EDITOR_URL);
  await expect(page.getByRole("heading", { name: "Không tìm thấy bản nháp" })).toBeVisible();
  status = 403;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Không có quyền mở bản nháp này" })).toBeVisible();
  status = 500;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Không tải được bản nháp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();
});

test("trainee cannot open the editor and the draft API is never called", async ({ page }) => {
  let calls = 0;
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "t", refreshToken: "r" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "t", email: "t@x.test", fullName: "T", role: 2, organizationId: null } }));
  await page.route("**/api/scenario-drafts/**", (route) => { calls++; return route.fulfill({ status: 403 }); });
  await page.goto(EDITOR_URL);
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  expect(calls).toBe(0);
});

test("phone layout: three tabs, no gizmo tools, objects edited through the form", async ({ page }) => {
  const mock = newMock();
  await page.setViewportSize({ width: 375, height: 760 });
  await open(page, mock);
  await expect(page.getByTestId("tool-move")).toHaveCount(0);
  await expect(page.getByTestId("tool-rotate")).toHaveCount(0);
  await expect(page.getByTestId("save")).toBeInViewport(); // the primary actions stay reachable on a phone
  await expect(page.getByTestId("validate")).toBeInViewport();
  const tabs = page.getByRole("navigation", { name: "Phần của trình soạn thảo" });
  await tabs.getByRole("button", { name: "Đối tượng" }).click();
  await hazardItem(page, "hazard-1").click();
  await expect(tabs.getByRole("button", { name: /Thuộc tính/ })).toHaveAttribute("aria-pressed", "true");
  await coord(page, "x").fill("9");
  await tabs.getByRole("button", { name: "Mô hình" }).click();
  await expect(page.locator(".se-canvas-host")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect((await page.evaluate(() => window.__fire3dEditorScene?.markerPosition("hazard", 0)))![0]).toBeCloseTo(9, 3);
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 1024, 768, 375]) {
    test(`layout ${width}px ${theme}: no horizontal overflow, panels reachable (screenshot)`, async ({ page }, testInfo) => {
      const mock = newMock();
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 375 ? 780 : width === 768 ? 1024 : 900 });
      const log = await open(page, mock, { theme });
      if (width >= 1100) await hazardItem(page, "hazard-1").click();
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`editor-${width}-${theme}.png`) });
      if (width >= 768 && width < 1100) {
        await page.getByRole("button", { name: "Mở cây tầng và đối tượng" }).click();
        await expect(page.getByRole("dialog", { name: "Tầng và đối tượng" })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`editor-${width}-${theme}-tree.png`) });
        await page.keyboard.press("Escape");
      }
      if (width === 375) {
        await page.getByRole("navigation", { name: "Phần của trình soạn thảo" }).getByRole("button", { name: "Đối tượng" }).click();
        await page.screenshot({ path: testInfo.outputPath(`editor-${width}-${theme}-objects.png`) });
        await page.getByRole("navigation", { name: "Phần của trình soạn thảo" }).getByRole("button", { name: /Thuộc tính/ }).click();
        await page.screenshot({ path: testInfo.outputPath(`editor-${width}-${theme}-props.png`), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      }
      await page.getByRole("tab", { name: "Kịch bản", exact: true }).click();
      await page.getByTestId("learner-instructions").fill("Nội dung chưa lưu để kiểm tra bố cục nút.");
      await page.getByTestId("tab-issues").click();
      const validate = page.getByTestId("validate-inline");
      await expect(validate).toHaveText("Lưu và kiểm tra");
      const layout = await validate.evaluate((node) => {
        const button = node.getBoundingClientRect();
        const panel = node.closest(".se-form")!.getBoundingClientRect();
        const text = Array.from(node.childNodes).find((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim());
        const range = document.createRange();
        range.selectNodeContents(text!);
        return { height: button.height, inside: button.left >= panel.left && button.right <= panel.right, lines: range.getClientRects().length };
      });
      expect(layout).toEqual({ height: 44, inside: true, lines: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`editor-${width}-${theme}-validation.png`) });
      // the viewport clear colour follows the resolved theme (read back from the canvas centre is unreliable under SwiftShader, so assert the token)
      await expect(page.locator(".ops-theme")).toHaveAttribute("data-resolved-theme", theme);
      expect(log.relevant()).toEqual([]);
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`screens ${theme}: scenario form, issues, locked sections and the 412 comparison (screenshots, 1440px)`, async ({ page }, testInfo) => {
    const mock = newMock({ validate: { isValid: false, issues: [{ code: "ANCHOR_NOT_FOUND", path: "$.objectAnchors", message: "Anchor does not exist in accepted geometry for this revision." }] } });
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, mock, { theme });
    await page.getByRole("tab", { name: "Kịch bản" }).click();
    await page.screenshot({ path: testInfo.outputPath(`scenario-form-${theme}.png`) });
    await page.getByTestId("validate").click();
    await expect(page.getByTestId("issue-item")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`issues-${theme}.png`) });
    await page.getByRole("tab", { name: "Chờ BE" }).click();
    await page.screenshot({ path: testInfo.outputPath(`locked-${theme}.png`) });
    await page.getByRole("tab", { name: "Kịch bản" }).click();
    await page.getByTestId("time-limit").fill("240");
    await page.getByTestId("learner-instructions").fill("Bản của tôi");
    mock.putStatus = [412];
    mock.version = 60;
    mock.state = { ...sampleDraftState(), learnerInstructions: "Bản của họ", routingConfig: { evacuationRoutes: ["Tuyến A", "Tuyến B"] } };
    await page.getByTestId("save").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("load-theirs").click();
    await expect(dialog.getByTestId("merge-list")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`conflict-${theme}.png`) });
  });
}
