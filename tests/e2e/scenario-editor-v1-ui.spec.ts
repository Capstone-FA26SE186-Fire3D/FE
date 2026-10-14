import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { BUILDING_ID, REVISION_ID, SCENARIO_ID } from "../fixtures/scenario-editor/fixture-building";
import { EDITOR_URL, NEW_EDITOR_URL, installEditorMocks, newMock, sampleDraftState, watchConsole, type MockState } from "../fixtures/scenario-editor/mock-api";
import { ARTIFACT_ID, GEOMETRY_HASH, NEW_DRAFT_ID, SAMPLE_RUNTIME_CATALOG, gid } from "../fixtures/scenario-editor/v1-fixtures";

/**
 * EVIDENCE LEVEL: mock. Every response is a Playwright route built from the BE contract (BE main @ 1eaf988: contracts/editor/v1,
 * OpenAPI, docs/scenario-authoring.md): ETag "<xmin>", PUT 204 + ETag, 422 EDITOR_SCHEMA_INVALID with issues, validate-state with
 * stateHash, editor-preview/floors statuses Ready | NotReady | ReprocessRequired. WebGL runs on SwiftShader in headless Chromium:
 * it proves code paths and resource lifecycle, not GPU performance. The GLB is a hand-built fixture, not a worker artifact.
 */

const fixtureState = () => JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scenario-editor", "v1", "scenario-state.valid.json"), "utf8")) as Record<string, unknown>;
/** The BE fixture state, pinned to the artifact the mock serves. */
const v1State = (): Record<string, unknown> => ({ ...fixtureState(), geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH } });
const emptyV1 = (): Record<string, unknown> => ({ schemaVersion: "fet3d.editor/1", geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH } });
const v1Mock = (overrides: Partial<MockState> = {}) => newMock({ state: v1State(), previewKind: "v1", catalog: SAMPLE_RUNTIME_CATALOG, ...overrides });

async function openV1(page: Page, mock: MockState, options: { theme?: "light" | "dark"; url?: string; waitModel?: boolean } = {}) {
  const log = watchConsole(page);
  await installEditorMocks(page, mock, { theme: options.theme });
  await page.goto(options.url ?? EDITOR_URL);
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "v1");
  if (options.waitModel !== false) await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  return log;
}

const status = (page: Page) => page.getByTestId("save-status");
const tab = (page: Page, name: string) => page.getByRole("tab", name === "Kiểm tra" ? { name: /^Kiểm tra/ } : { name, exact: true }); // the issues tab carries a count
const coord = (page: Page, axis: string) => page.getByTestId(`coord-${axis}`);
const item = (page: Page, index: number) => page.getByTestId(`object-item-${index}`);
const lastPut = (mock: MockState) => mock.puts[mock.puts.length - 1].body as { objects: Array<Record<string, any>> } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const kinds = (page: Page) => page.getByTestId("kind-availability");
const noOverflow = (page: Page, width: number) => page.evaluate(() => document.documentElement.scrollWidth).then((value) => expect(value).toBeLessThanOrEqual(width));

test("opens a fet3d.editor/1 draft: six kinds, pinned Geometry, floor-local coordinates map to GLB exactly as the BE fixture (L2 (1,0,2) -> (1,3.5,2))", async ({ page }) => {
  const mock = v1Mock();
  const log = await openV1(page, mock);
  await expect(page.getByTestId("schema-badge")).toHaveText("fet3d.editor/1");
  await expect(page.getByRole("heading", { name: /Sơ tán tầng 1/ })).toBeVisible();
  await expect(status(page)).toHaveText("Đã lưu");
  for (const kind of ["Spawn", "Hazard", "Goal", "Npc", "BlockedElement", "Equipment"]) await expect(page.getByTestId(`list-${kind}`).getByRole("button")).toHaveCount(1);
  expect(mock.puts).toHaveLength(0);

  // Goal: the anchor is an IFC GlobalId chosen from the semantic mapping of the object's own floor.
  await item(page, 1).click();
  await expect(page.getByTestId("object-form")).toHaveAttribute("data-kind", "Goal");
  await expect(page.getByTestId("field-anchor")).toHaveValue("1hOSvn6df7F8_7GcBWlRGQ");
  await expect(page.getByTestId("field-anchor").locator("option:checked")).toHaveText("IfcDoor · door_101");

  // NPC on L2 at local (1, 0, 1): GLB position = floor transform * local = (1, 3.5, 1); then local z = 2 gives the BE example (1, 3.5, 2).
  await item(page, 3).click();
  await expect(page.getByTestId("field-floor")).toHaveValue("L2");
  await expect(page.getByTestId("glb-position")).toContainText("1, 3.5, 1 m");
  await coord(page, "z").fill("2");
  await expect(page.getByTestId("glb-position")).toContainText("1, 3.5, 2 m");
  await expect.poll(() => page.evaluate(() => window.__fire3dEditorScene?.markerPosition("object", 3))).toEqual([1, 3.5, 2]);

  // layers come from the semantic mapping (IFC type -> node names) and exist only because matching glTF nodes were found
  const walls = page.getByRole("button", { name: "IfcWall", exact: true });
  await expect(walls).toHaveAttribute("aria-pressed", "true");
  await walls.click();
  await expect(walls).toHaveAttribute("aria-pressed", "false");
  await walls.click();

  // Geometry tab: pin matches the current artifact, floors from the server, IFC -> GLB check (display only).
  await tab(page, "Mô hình").click();
  await expect(page.getByTestId("geometry-panel")).toContainText("Khớp");
  await expect(page.getByTestId("floor-list")).toContainText("Tầng 2");
  await expect(page.getByTestId("floor-list")).toContainText("3.5 m");
  await page.getByTestId("ifc-x").fill("1000");
  await page.getByTestId("ifc-y").fill("2000");
  await page.getByTestId("ifc-z").fill("3000");
  await expect(page.getByTestId("ifc-result")).toContainText("GLB: -9, 3, 3 m");
  expect(log.relevant()).toEqual([]);
});

test("new draft from the entry screen: stable Idempotency-Key across a retry, first PUT is the minimal v1 document with the pin and no position", async ({ page }) => {
  const mock = v1Mock({ state: sampleDraftState(), createdDraftId: NEW_DRAFT_ID, createDraftStatus: [503] });
  await installEditorMocks(page, mock);
  await page.goto(`/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}`);
  await expect(page.getByTestId("create-draft")).toBeEnabled();
  await page.getByTestId("create-draft").click();
  await expect(page.getByText("Tạo bản nháp thất bại")).toBeVisible();
  await page.getByTestId("create-draft").click();
  await expect(page).toHaveURL(new RegExp(`draft=${NEW_DRAFT_ID}`));
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "v1");
  expect(mock.createDraftCalls).toHaveLength(2);
  expect(mock.createDraftCalls[1].key).toBe(mock.createDraftCalls[0].key);
  expect(mock.createDraftCalls[0].body).toEqual({ revisionId: REVISION_ID });
  // PUT: only the document that declares schemaVersion + the pinned Geometry; ETag of the fresh draft.
  expect(mock.puts).toHaveLength(1);
  expect(mock.puts[0]).toMatchObject({ draftId: NEW_DRAFT_ID, ifMatch: '"1"' });
  expect(mock.puts[0].body).toEqual({ schemaVersion: "fet3d.editor/1", geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH } });
  await expect(page.getByTestId("list-Spawn").getByRole("button")).toHaveCount(0);
  await expect(status(page)).toHaveText("Đã lưu");
});

test("entry screen: ReprocessRequired or NotReady Geometry locks draft creation and explains what to do (link to the IFC tab)", async ({ page }) => {
  const mock = v1Mock({ floorsStatus: "ReprocessRequired", createdDraftId: NEW_DRAFT_ID });
  await installEditorMocks(page, mock);
  await page.goto(`/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}`);
  await expect(page.getByTestId("reprocess-guide")).toBeVisible();
  await expect(page.getByTestId("reprocess-link")).toHaveAttribute("href", `/workspace/buildings/${BUILDING_ID}?tab=ifc&revision=${REVISION_ID}`);
  await expect(page.getByTestId("create-draft")).toBeDisabled();
  mock.floorsStatus = "NotReady";
  await page.reload();
  await expect(page.getByText("Revision chưa có Geometry được chấp nhận")).toBeVisible();
  await expect(page.getByTestId("create-draft")).toBeDisabled();
  expect(mock.createDraftCalls).toHaveLength(0);
});

test("places all six kinds, fills capability/parameter forms from the catalog, saves, and reopens from the server with nothing lost", async ({ page }) => {
  const mock = v1Mock({ state: emptyV1(), version: 5 });
  const log = await openV1(page, mock);
  await expect(status(page)).toHaveText("Đã lưu");

  // scenario-level fields (no defaults are inserted: the first PUT only has what the author typed)
  await tab(page, "Kịch bản").click();
  await page.getByTestId("field-name").fill("Sơ tán tầng 1");
  await page.getByTestId("field-runtime").selectOption("1.4.0");
  await page.getByTestId("field-time-limit").fill("600");
  await page.getByTestId("mode-Learn").check();
  await page.getByTestId("mode-Assessment").check();
  await page.getByTestId("objectives").getByRole("button", { name: "Thêm mục tiêu" }).click();
  await page.getByRole("textbox", { name: "Mục tiêu học tập 1", exact: true }).fill("Thoát hiểm theo lối an toàn gần nhất");
  await page.getByTestId("learner-instructions").fill("Rời khỏi tòa nhà qua cửa thoát hiểm.");
  await page.getByTestId("add-rubric").click();
  await page.getByTestId("rubric-threshold").fill("0.7");
  await page.getByTestId("add-criterion").click();
  await expect(status(page)).toHaveText("Chưa hợp lệ để lưu"); // the blank criterion row would be refused by the server
  await expect(page.getByTestId("save")).toBeDisabled();
  await page.getByTestId("criterion-0-id").fill("reached-exit");
  await page.getByTestId("criterion-0-metric").selectOption("reached_exit");
  await page.getByTestId("criterion-0-operator").selectOption("eq");
  await page.getByTestId("criterion-0-threshold").fill("1");
  await page.getByTestId("criterion-0-weight").fill("1");
  await page.getByTestId("criterion-0").getByLabel("Tiêu chí bắt buộc").check();
  await expect(status(page)).toHaveText("Chưa lưu");

  // the six kinds
  await page.getByTestId("add-Spawn").click();
  await expect(page.getByTestId("object-form")).toHaveAttribute("data-kind", "Spawn");
  await page.getByTestId("add-Goal").click();
  await page.getByTestId("field-anchor").selectOption({ label: "IfcDoor · door_101" });
  await page.getByTestId("add-Hazard").click();
  await expect(page.getByTestId("capability-field")).toContainText("Bắt buộc");
  await page.getByTestId("field-capability").selectOption("fire.source");
  await page.getByTestId("param-intensity").fill("6.5");
  await page.getByTestId("param-activationSeconds").fill("30");
  await coord(page, "x").fill("6");
  await coord(page, "z").fill("4");
  await page.getByTestId("add-Npc").click();
  await page.getByTestId("field-capability").selectOption("npc.evacuee");
  await page.getByTestId("param-behaviour").selectOption({ label: "panic" });
  await page.getByTestId("param-mobilityImpaired").selectOption("false");
  await page.getByTestId("add-BlockedElement").click();
  await expect(page.getByTestId("anchor-field")).toContainText("Bắt buộc");
  await page.getByTestId("field-anchor").selectOption({ label: "IfcDoor · door_102" });
  await page.getByTestId("add-Equipment").click();
  await page.getByTestId("field-capability").selectOption("equipment.extinguisher");
  await page.getByTestId("param-agent").selectOption({ label: "CO2" });

  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.puts).toHaveLength(1);
  expect(mock.puts[0].ifMatch).toBe('"5"');
  const body = lastPut(mock);
  expect(Object.keys(body)).toEqual(["schemaVersion", "geometry", "name", "runtimeVersion", "timeLimitSeconds", "modePolicy", "learningObjectives", "learnerInstructions", "rubric", "objects"]);
  expect(body.modePolicy).toEqual({ allowedModes: ["Learn", "Assessment"] });
  expect(body.rubric).toEqual({ schema_version: "1", pass_threshold: 0.7, criteria: [{ id: "reached-exit", metric: "reached_exit", mandatory: true, weight: 1, threshold: 1, operator: "eq" }] });
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  expect(body.objects).toEqual([
    { id: "spawn-1", kind: "Spawn", placement: { floorId: "L1", position: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }, rotation: identity } },
    { id: "goal-1", kind: "Goal", anchorId: "1hOSvn6df7F8_7GcBWlRGQ", placement: { floorId: "L1", position: expect.any(Object), rotation: identity } },
    { id: "hazard-1", kind: "Hazard", capability: { id: "fire.source", version: "1.0.0" }, parameters: { intensity: 6.5, activationSeconds: 30 }, placement: { floorId: "L1", position: { x: 6, y: expect.any(Number), z: 4 }, rotation: identity } },
    { id: "npc-1", kind: "Npc", capability: { id: "npc.evacuee", version: "2.1.0" }, parameters: { behaviour: "panic", mobilityImpaired: false }, placement: { floorId: "L1", position: expect.any(Object), rotation: identity } },
    { id: "blocked-1", kind: "BlockedElement", anchorId: "1hOSvn6df7F8_7GcBWlRGR", placement: { floorId: "L1", position: expect.any(Object), rotation: identity } },
    { id: "equipment-1", kind: "Equipment", capability: { id: "equipment.extinguisher", version: "1.0.0" }, parameters: { agent: "CO2" }, placement: { floorId: "L1", position: expect.any(Object), rotation: identity } },
  ]);
  // Floor-local positions are what is stored: nothing is converted through the IFC transform.
  expect(body.objects.every((object) => object.placement.position.y === 0)).toBe(true);

  // Reopen: everything comes back from the server.
  await page.reload();
  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  for (const kind of ["Spawn", "Hazard", "Goal", "Npc", "BlockedElement", "Equipment"]) await expect(page.getByTestId(`list-${kind}`).getByRole("button")).toHaveCount(1);
  await item(page, 2).click();
  await expect(page.getByTestId("param-intensity")).toHaveValue("6.5");
  await expect(coord(page, "x")).toHaveValue("6");
  await tab(page, "Kiểm tra").click();
  await expect(page.getByTestId("client-gaps")).toHaveCount(0); // the document is complete: nothing is missing in the browser's checklist
  expect(log.relevant()).toEqual([]);
});

test("canvas placement stores floor-local coordinates: the marker lands where the pointer hit, through the inverse of the floor transform", async ({ page }) => {
  const mock = v1Mock();
  const log = await openV1(page, mock);
  const radios = page.getByRole("radiogroup", { name: "Chọn tầng" });
  await radios.getByRole("radio", { name: /Tầng 2/ }).click();
  await page.getByTestId("place-Spawn").click();
  const box = (await page.locator(".se-canvas-host").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.62);
  await expect(page.getByTestId("list-Spawn").getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("field-floor")).toHaveValue("L2");
  const local = { x: Number(await coord(page, "x").inputValue()), y: Number(await coord(page, "y").inputValue()), z: Number(await coord(page, "z").inputValue()) };
  const world = await page.evaluate(() => window.__fire3dEditorScene?.markerPosition("object", 6));
  expect(world![0]).toBeCloseTo(local.x, 3);
  expect(world![1]).toBeCloseTo(local.y + 3.5, 3); // L2 transform translates +3.5 m on Y
  expect(world![2]).toBeCloseTo(local.z, 3);
  // With "Tất cả" no floor owns the position, so placing is refused with the reason instead of guessing a floor.
  await radios.getByRole("radio", { name: "Tất cả" }).click();
  await expect(page.getByTestId("place-Goal")).toBeDisabled();
  await expect(page.getByTestId("place-Goal")).toHaveAttribute("title", /Chọn một tầng/);
  expect(log.relevant()).toEqual([]);
});

test("gizmo drag: a world-space drag is stored as floor-local coordinates (inverse of the floor transform), one drag = one undo step; rotate writes a unit quaternion", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await item(page, 3).click(); // NPC on L2 at local (1, 0, 1)
  await page.getByTestId("tool-move").click();
  await expect.poll(() => page.evaluate(() => window.__fire3dEditorScene?.gizmoAttached())).toBe(true);
  expect(await page.evaluate(() => window.__fire3dEditorScene?.simulateDrag("object", 3, { x: 4, y: 3.75, z: 2 }))).toBe(true);
  await expect(coord(page, "x")).toHaveValue("4");
  await expect(coord(page, "y")).toHaveValue("0.25"); // GLB y 3.75 on a floor 3.5 m up
  await expect(coord(page, "z")).toHaveValue("2");
  await expect(page.getByTestId("glb-position")).toContainText("4, 3.75, 2 m");
  await expect(page.getByTestId("field-floor")).toHaveValue("L2");
  await page.getByTestId("undo").click(); // the whole drag is one history entry
  await expect(coord(page, "x")).toHaveValue("1");
  await expect(coord(page, "y")).toHaveValue("0");
  await expect(status(page)).toHaveText("Đã lưu");

  await page.getByTestId("tool-rotate").click();
  expect(await page.evaluate(() => window.__fire3dEditorScene?.simulateDrag("object", 3, { x: 1, y: 3.5, z: 1 }, 30))).toBe(true);
  await expect(page.getByTestId("field-yaw")).toHaveValue("30");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  const q = lastPut(mock).objects[3].placement.rotation as { x: number; y: number; z: number; w: number };
  expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
  expect(q.y).toBeCloseTo(Math.sin(Math.PI / 12), 6);
  expect(lastPut(mock).objects[3].placement.position).toEqual({ x: 1, y: 0, z: 1 }); // rotating does not move the object
});

test("rotation: an untouched quaternion is saved bit for bit, typing degrees replaces it by a unit quaternion about the vertical axis", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await item(page, 0).click();
  await expect(page.getByTestId("field-yaw")).toHaveValue("90");
  await expect(page.getByTestId("glb-position")).toContainText("(0.0000, 0.7071, 0.0000, 0.7071)");
  await coord(page, "z").fill("9");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(lastPut(mock).objects[0].placement.rotation).toEqual({ x: 0, y: 0.7071068, z: 0, w: 0.7071068 });
  expect(lastPut(mock).objects[0].placement.position).toEqual({ x: 2, y: 0, z: 9 });
  await page.getByTestId("field-yaw").fill("45");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  const q = lastPut(mock).objects[0].placement.rotation as { x: number; y: number; z: number; w: number };
  expect(q.x).toBe(0);
  expect(q.z).toBe(0);
  expect(q.y).toBeCloseTo(Math.sin(Math.PI / 8), 6);
  expect(q.w).toBeCloseTo(Math.cos(Math.PI / 8), 6);
  expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
});

test("round trip: saving after one edit sends the BE fixture back with only that change; every other object and field is identical", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await item(page, 2).click();
  await page.getByTestId("field-label").fill("Đám cháy");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  const expected = v1State() as { objects: Array<Record<string, unknown>> } & Record<string, unknown>;
  expected.objects[2] = { ...expected.objects[2], label: "Đám cháy" };
  expect(mock.puts[0].body).toEqual(expected);
  // an edit that is undone leaves nothing to save
  await item(page, 3).click();
  await page.getByTestId("field-label").fill("khác");
  await expect(status(page)).toHaveText("Chưa lưu");
  await page.getByTestId("undo").click();
  await expect(status(page)).toHaveText("Đã lưu");
  await expect(page.getByTestId("save")).toBeDisabled();
});

test("ReprocessRequired Geometry: guidance with a link to the IFC tab, placement locked, no model, no coordinates invented, no polling", async ({ page }) => {
  const mock = v1Mock({ previewKind: "reprocess", floorsStatus: "ReprocessRequired" });
  await openV1(page, mock, { waitModel: false });
  await expect(page.getByTestId("reprocess-guide").first()).toBeVisible();
  await expect(page.getByTestId("reprocess-link").first()).toHaveAttribute("href", `/workspace/buildings/${BUILDING_ID}?tab=ifc&revision=${REVISION_ID}`);
  await expect(page.getByTestId("place-Spawn")).toBeDisabled();
  await expect(page.getByTestId("add-Goal")).toBeDisabled();
  await expect(page.getByTestId("model-info")).toHaveCount(0);
  await expect(page.getByTestId("floors-empty")).toBeVisible();
  await item(page, 0).click();
  await expect(page.getByTestId("glb-position")).toContainText("Chưa tính được vị trí trong mô hình");
  await tab(page, "Khả dụng").click();
  await expect(kinds(page).locator('[data-kind="Spawn"]')).toContainText("xử lý lại IFC");
  await page.waitForTimeout(1200);
  expect(mock.previewCalls).toBe(1);
  expect(mock.puts).toHaveLength(0);
});

test("Geometry valid but the stored object is not confirmed (preview NotReady with data): objects can still be placed by floor coordinates", async ({ page }) => {
  const mock = v1Mock({ previewKind: "v1-no-url", state: emptyV1() });
  await openV1(page, mock, { waitModel: false });
  await expect(page.getByText("Mô hình 3D chưa sẵn sàng")).toBeVisible();
  await expect(page.getByTestId("add-Spawn")).toBeEnabled();
  await page.getByTestId("add-Spawn").click();
  await expect(coord(page, "y")).toHaveValue("0");
  await expect(page.getByTestId("glb-position")).toContainText("0, 0, 0 m");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(lastPut(mock).objects[0].placement.position).toEqual({ x: 0, y: 0, z: 0 });
});

test("empty catalog: capability kinds are locked with configuration guidance, nothing is seeded; kinds without capability still work", async ({ page }) => {
  const mock = v1Mock({ state: emptyV1(), catalog: [] });
  await openV1(page, mock);
  await expect(page.getByTestId("add-Hazard")).toBeDisabled();
  await expect(page.getByTestId("add-Npc")).toBeDisabled();
  await expect(page.getByTestId("add-Equipment")).toBeDisabled();
  await expect(page.getByTestId("place-Hazard")).toBeDisabled();
  await expect(page.getByTestId("add-Spawn")).toBeEnabled();
  await expect(page.getByTestId("add-Goal")).toBeEnabled();
  await tab(page, "Khả dụng").click();
  await expect(kinds(page).locator('[data-kind="Hazard"]')).toHaveAttribute("data-state", "no-capability");
  await expect(kinds(page).locator('[data-kind="Hazard"]')).toContainText("Danh mục runtime đang trống");
  await expect(kinds(page).locator('[data-kind="Spawn"]')).toHaveAttribute("data-state", "ready");
  await tab(page, "Kịch bản").click();
  await expect(page.getByTestId("runtime-empty")).toContainText("không tự tạo");
  await expect(page.getByTestId("field-runtime")).toHaveCount(0);
});

test("runtime without a capability for a kind: the object form names the runtime and offers no seeded option", async ({ page }) => {
  const onlyFire = [{ ...SAMPLE_RUNTIME_CATALOG[0], capabilities: ["fire.source"], capabilityContracts: { "fire.source": SAMPLE_RUNTIME_CATALOG[0].capabilityContracts["fire.source"] } }];
  const mock = v1Mock({ catalog: onlyFire });
  await openV1(page, mock);
  await item(page, 3).click(); // the NPC of the fixture
  await expect(page.getByTestId("no-capability")).toContainText("objectKinds gồm Npc");
  await expect(page.getByTestId("field-capability")).toHaveCount(0);
  await tab(page, "Khả dụng").click();
  await expect(kinds(page).locator('[data-kind="Npc"]')).toHaveAttribute("data-state", "no-capability");
  await expect(kinds(page).locator('[data-kind="Hazard"]')).toHaveAttribute("data-state", "ready");
});

test("wrong parameter: advisory error in the form, validate-state sends the unsaved body and the server issue lands on the right object and field", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await item(page, 2).click();
  await page.getByTestId("param-intensity").fill("99");
  await expect(page.getByTestId("capability-field")).toContainText("Phải từ 0 đến 10.");
  await expect(status(page)).toHaveText("Chưa lưu");
  mock.validateState.issues = (body) => {
    const objects = body.objects as Array<{ id: string; parameters?: { intensity?: number } }>;
    const index = objects.findIndex((object) => (object.parameters?.intensity ?? 0) > 10);
    return index < 0 ? [] : [{ code: "PARAMETER_OUT_OF_RANGE", path: `$.objects[${index}].parameters.intensity`, message: "Parameter is outside the capability contract range." }, { code: "FIELD_REQUIRED", path: "$.rubric.criteria[0]", message: "Criterion is incomplete (server)." }];
  };
  await item(page, 0).click(); // select something else: the issue must bring the author back to the hazard
  await page.getByTestId("validate").click();
  await expect(page.getByTestId("server-report")).toContainText("Máy chủ báo 2 vấn đề");
  // the request body is the UNSAVED document: it contains the typed 99 and nothing was stored
  expect(mock.validateStateCalls).toHaveLength(1);
  expect((mock.validateStateCalls[0].body.objects as Array<{ parameters?: { intensity?: number } }>)[2].parameters?.intensity).toBe(99);
  expect(mock.puts).toHaveLength(0);
  expect(mock.validateCalls).toBe(0);
  await page.locator('[data-testid="issue-item"][data-path="$.objects[2].parameters.intensity"]').click();
  await expect(page.getByTestId("object-form")).toHaveAttribute("data-kind", "Hazard");
  await expect(page.getByTestId("param-intensity")).toHaveValue("99");
  await expect(page.getByTestId("capability-field")).toContainText("Parameter is outside the capability contract range.");
  await expect(item(page, 2).locator(".se-flag")).toBeVisible();
  // a rubric issue goes to the scenario tab, on its criterion
  await page.getByTestId("tab-issues").click();
  await page.locator('[data-testid="issue-item"][data-path="$.rubric.criteria[0]"]').click();
  await expect(page.getByTestId("criterion-0")).toContainText("Criterion is incomplete (server).");
});

test("a validate result belongs to the content that was sent: any later edit marks it stale and unmaps it; a different stateHash is rejected", async ({ page }) => {
  const mock = v1Mock({ validateState: { issues: [], delayMs: 700 } });
  await openV1(page, mock);
  await tab(page, "Kiểm tra").click();
  await page.getByTestId("validate-inline").click();
  // keep editing while the request is in flight: the edit is not lost and the answer arrives already stale
  await tab(page, "Kịch bản").click();
  await page.getByTestId("field-name").fill("Sơ tán tầng 1 (sửa lúc đang kiểm tra)");
  await tab(page, "Kiểm tra").click();
  await expect(page.getByTestId("report-stale")).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId("server-report")).toHaveAttribute("data-stale", "true");
  await expect(status(page)).toHaveText("Chưa lưu");
  await expect(page.getByRole("heading", { name: /sửa lúc đang kiểm tra/ })).toBeVisible();
  // validating again gives a current result for the new content
  mock.validateState.delayMs = 0;
  await page.getByTestId("validate-inline").click();
  await expect(page.getByTestId("server-report")).toHaveAttribute("data-stale", "false");
  await expect(page.getByTestId("server-report")).toContainText("Máy chủ xác nhận nội dung hiện tại hợp lệ");
  expect(mock.validateStateCalls).toHaveLength(2);
  expect(mock.validateStateCalls[0].body.name).toBe("Sơ tán tầng 1");
  expect(mock.validateStateCalls[1].body.name).toBe("Sơ tán tầng 1 (sửa lúc đang kiểm tra)");
  // editing again makes the confirmed result stale
  await tab(page, "Kịch bản").click();
  await page.getByTestId("field-time-limit").fill("601");
  await tab(page, "Kiểm tra").click();
  await expect(page.getByTestId("report-stale")).toBeVisible();
  // a hash that does not match what was sent is not applied
  mock.validateState.hashOverride = "0".repeat(64);
  await page.getByTestId("validate-inline").click();
  await expect(page.getByText("không khớp nội dung đã gửi")).toBeVisible();
});

test("PUT refused with 422 EDITOR_SCHEMA_INVALID: content is kept, the server's issues attach to the object they name", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await item(page, 4).click();
  await page.getByTestId("field-label").fill("Cửa bị chặn");
  mock.putProblems = [{ status: 422, body: { code: "EDITOR_SCHEMA_INVALID", title: "Draft state does not satisfy fet3d.editor/1.", issues: [{ code: "STRING_FORMAT_INVALID", path: "$.objects[4].label", message: "Server: nhãn không hợp lệ." }] } }];
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Lỗi khi lưu");
  await expect(page.getByText("422 EDITOR_SCHEMA_INVALID")).toBeVisible();
  await expect(page.getByTestId("field-label")).toHaveValue("Cửa bị chặn");
  await expect(page.getByTestId("object-form")).toContainText("Server: nhãn không hợp lệ.");
  expect(mock.puts).toHaveLength(0);
  // the author edits on; the stale server issue no longer marks the object
  await page.getByTestId("field-label").fill("Cửa bị chặn 2");
  await expect(page.getByTestId("object-form")).not.toContainText("Server: nhãn không hợp lệ.");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(lastPut(mock).objects[4].label).toBe("Cửa bị chặn 2");
});

test("other PUT answers: 400 EDITOR_JSON_MALFORMED, 422 EDITOR_SCHEMA_VERSION_UNSUPPORTED and 428 are reported by code and the content stays", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await item(page, 0).click();
  await page.getByTestId("field-label").fill("Phòng 101A");
  for (const [answer, text] of [
    [{ status: 400, body: { code: "EDITOR_JSON_MALFORMED", title: "Malformed" } }, "EDITOR_JSON_MALFORMED"],
    [{ status: 422, body: { code: "EDITOR_SCHEMA_VERSION_UNSUPPORTED", title: "Unsupported" } }, "EDITOR_SCHEMA_VERSION_UNSUPPORTED"],
    [{ status: 428, body: { code: "PRECONDITION_REQUIRED", title: "If-Match is required." } }, "Thiếu If-Match"],
  ] as const) {
    mock.putProblems = [answer];
    await page.getByTestId("save").click();
    await expect(page.getByText(text).first()).toBeVisible();
    await expect(status(page)).toHaveText("Lỗi khi lưu");
    await expect(page.getByTestId("field-label")).toHaveValue("Phòng 101A");
  }
  expect(mock.puts).toHaveLength(0);
});

test("412 keeps the typed content, compares field by field and merges only what the author chooses; nothing is written without a save", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await tab(page, "Kịch bản").click();
  await page.getByTestId("field-name").fill("Tên của tôi");
  // someone else changed the time limit and the first objective since this tab loaded
  mock.putStatus = [412];
  mock.version = 60;
  mock.state = { ...v1State(), timeLimitSeconds: 900, learningObjectives: ["Mục tiêu của họ"] };
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Xung đột");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByTestId("load-theirs").click();
  await expect(page.getByTestId("merge-list")).toContainText("Thời gian tối đa");
  await expect(page.getByTestId("merge-list")).toContainText("Tên kịch bản");
  await page.getByTestId("apply-merge").click();
  await expect(status(page)).toHaveText("Chưa lưu");
  await expect(page.getByTestId("field-time-limit")).toHaveValue("900"); // taken from the server (only they changed it)
  await expect(page.getByTestId("field-name")).toHaveValue("Tên của tôi"); // kept (only I changed it)
  expect(mock.puts).toHaveLength(0);
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.puts[0].ifMatch).toBe('"60"');
  expect(mock.puts[0].body).toMatchObject({ name: "Tên của tôi", timeLimitSeconds: 900, learningObjectives: ["Mục tiêu của họ"] });
});

test("edits made while a save is in flight are not lost: the save sends what was typed before, the later edit stays dirty and goes out next", async ({ page }) => {
  const mock = v1Mock({ putDelayMs: 800 });
  await openV1(page, mock);
  await item(page, 0).click();
  await page.getByTestId("field-label").fill("Lần một");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đang lưu…");
  await page.getByTestId("field-label").fill("Lần hai");
  await expect(status(page)).toHaveText("Chưa lưu", { timeout: 5000 });
  expect(lastPut(mock).objects[0].label).toBe("Lần một");
  await expect(page.getByTestId("field-label")).toHaveValue("Lần hai");
  mock.putDelayMs = 0;
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.puts).toHaveLength(2);
  expect(mock.puts[1].ifMatch).toBe('"52"');
  expect(lastPut(mock).objects[0].label).toBe("Lần hai");
});

test("a body the server would refuse is not sent: save is locked with the reason until the structure is valid", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await tab(page, "Kịch bản").click();
  await page.getByTestId("field-time-limit").fill("1.5");
  await expect(status(page)).toHaveText("Chưa hợp lệ để lưu");
  await expect(page.getByTestId("save")).toBeDisabled();
  await page.getByTestId("tab-issues").click();
  await expect(page.getByTestId("shape-problems")).toContainText("Chưa thể lưu: 1 lỗi cấu trúc");
  await expect(page.getByTestId("shape-problems")).toContainText("INTEGER_INVALID");
  await page.getByTestId("shape-problems").getByTestId("issue-item").click(); // jumps to the field
  await expect(page.getByTestId("field-time-limit")).toBeVisible();
  await page.getByTestId("field-time-limit").fill("601");
  await expect(status(page)).toHaveText("Chưa lưu");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.rejected).toHaveLength(0);
});

test("the pinned Geometry differs from the revision's current artifact: banner, and re-pinning is an explicit undoable edit", async ({ page }) => {
  const stale = { artifactId: "11111111-2222-4333-8444-555555555555", sha256Hash: "c".repeat(64) };
  const mock = v1Mock({ state: { ...v1State(), geometry: stale } });
  await openV1(page, mock);
  await expect(page.getByText("Geometry của revision đã đổi sau khi bản nháp ghim")).toBeVisible();
  await tab(page, "Mô hình").click();
  await expect(page.getByTestId("geometry-panel")).toContainText("Khác bản hiện tại");
  await page.getByTestId("repin-geometry").click();
  await expect(status(page)).toHaveText("Chưa lưu");
  await expect(page.getByText("Geometry của revision đã đổi sau khi bản nháp ghim")).toHaveCount(0);
  await page.getByTestId("undo").click();
  await expect(page.getByText("Geometry của revision đã đổi sau khi bản nháp ghim")).toBeVisible();
  await page.getByTestId("redo").click();
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(lastPut(mock).geometry).toEqual({ artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH });
});

test("a wall picked on the model can be used as the anchor of an object on the same floor (the pick is matched through the semantic mapping)", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await page.getByRole("radiogroup", { name: "Chọn tầng" }).getByRole("radio", { name: /Tầng 1/ }).click();
  await item(page, 4).click(); // blocked element on L1, anchored to door_102
  const point = await page.evaluate(() => window.__fire3dEditorScene?.projectNode("Floor_0_WallN"));
  expect(point).toBeTruthy();
  await page.mouse.click(point!.x, point!.y); // empty click on the model: reports the node under the pointer
  await expect(page.locator(".se-pick")).toContainText("Floor_0_WallN");
  await item(page, 4).click();
  await expect(page.getByTestId("use-picked-anchor")).toContainText("Floor_0_WallN");
  await page.getByTestId("use-picked-anchor").click();
  await expect(page.getByTestId("field-anchor")).toHaveValue(gid("4wallN"));
  await expect(page.getByTestId("field-anchor").locator("option:checked")).toHaveText("IfcWall · Floor_0_WallN");
  // a node of another floor is recognised but refused as an anchor for this floor
  const other = await page.evaluate(() => window.__fire3dEditorScene?.projectNode("Floor_1_WallN"));
  await page.getByRole("radiogroup", { name: "Chọn tầng" }).getByRole("radio", { name: "Tất cả" }).click();
  await page.mouse.click(other!.x, other!.y);
  await expect(page.locator(".se-pick")).toContainText("Floor_1_WallN");
  await item(page, 4).click();
  await expect(page.getByTestId("anchor-field")).toContainText("thuộc tầng khác");
});

test("object ids are unique: a duplicate id is flagged on the second object and blocks saving", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await item(page, 1).click();
  await page.getByTestId("field-id").fill("spawn-1");
  await expect(page.getByTestId("object-form")).toContainText("Mã đối tượng phải duy nhất");
  await expect(page.getByTestId("save")).toBeDisabled();
  await page.getByTestId("field-id").fill("goal-exit-2");
  await expect(page.getByTestId("save")).toBeEnabled();
});

test("empty draft ({}): the first PUT is a document that declares schemaVersion with the pin, and only on request", async ({ page }) => {
  const mock = v1Mock({ createdDraftId: NEW_DRAFT_ID, newDraft: { version: 1, state: {} } });
  await installEditorMocks(page, mock);
  await page.goto(NEW_EDITOR_URL);
  await expect(page.getByTestId("empty-draft")).toBeVisible();
  expect(mock.puts).toHaveLength(0);
  await page.getByTestId("initialize-draft").click();
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "v1");
  expect(mock.puts).toHaveLength(1);
  expect(mock.puts[0].body).toEqual({ schemaVersion: "fet3d.editor/1", geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH } });
  expect(mock.puts[0].ifMatch).toBe('"1"');
});

test("empty draft with ReprocessRequired Geometry: initialization is locked and explained", async ({ page }) => {
  const mock = v1Mock({ newDraft: { version: 1, state: {} }, floorsStatus: "ReprocessRequired" });
  await installEditorMocks(page, mock);
  await page.goto(NEW_EDITOR_URL);
  await expect(page.getByTestId("reprocess-guide")).toBeVisible();
  await expect(page.getByTestId("initialize-draft")).toBeDisabled();
  expect(mock.puts).toHaveLength(0);
});

test("a schemaVersion the editor does not know is shown read-only: nothing is written", async ({ page }) => {
  const mock = v1Mock({ state: { schemaVersion: "fet3d.editor/2", objects: [] } });
  await installEditorMocks(page, mock);
  await page.goto(EDITOR_URL);
  await expect(page.getByRole("heading", { name: "Bản nháp dùng schemaVersion chưa được hỗ trợ" })).toBeVisible();
  await expect(page.getByText("fet3d.editor/2")).toBeVisible();
  expect(mock.puts).toHaveLength(0);
});

test("legacy draft: banner, edits stay in the old shape and no v1 PUT ever reaches it; a NEW v1 draft is created with the pin and only the chosen non-spatial fields", async ({ page }) => {
  const original = sampleDraftState();
  const mock = v1Mock({ state: original, createdDraftId: NEW_DRAFT_ID, previewKind: "legacy" });
  const log = watchConsole(page);
  await installEditorMocks(page, mock);
  await page.goto(EDITOR_URL);
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "legacy");
  await expect(page.getByTestId("legacy-banner")).toContainText("không được tự chuyển đổi");
  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("create-v1-draft").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Không sao chép vị trí");
  await expect(dialog.getByTestId("carry-rubric")).toHaveCount(0); // the old rubric schema_version is not "1": it must be re-entered
  await dialog.getByTestId("carry-learnerInstructions").check();
  await dialog.getByTestId("carry-timeLimitSeconds").check();
  await dialog.getByTestId("confirm-create-v1").click();
  await expect(dialog.getByTestId("open-new-draft")).toBeVisible();

  expect(mock.createDraftCalls).toHaveLength(1);
  expect(mock.createDraftCalls[0].key).toBeTruthy();
  expect(mock.puts).toHaveLength(1);
  expect(mock.puts[0]).toMatchObject({ draftId: NEW_DRAFT_ID, ifMatch: '"1"' });
  expect(mock.puts[0].body).toEqual({ learnerInstructions: original.learnerInstructions, timeLimitSeconds: 300, schemaVersion: "fet3d.editor/1", geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH } });
  expect(JSON.stringify(mock.puts[0].body)).not.toMatch(/spawnPoints|hazards|"x"|"rotation"/);
  expect(mock.state).toEqual(original); // the legacy draft was neither converted nor overwritten
  await dialog.getByTestId("open-new-draft").click();
  await expect(page).toHaveURL(new RegExp(`draft=${NEW_DRAFT_ID}`));
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "v1");
  await tab(page, "Kịch bản").click();
  await expect(page.getByTestId("learner-instructions")).toHaveValue(String(original.learnerInstructions));
  await expect(page.getByTestId("list-Spawn").getByRole("button")).toHaveCount(0);
  expect(log.relevant()).toEqual([]);
});

test("legacy draft with ReprocessRequired Geometry: it stays editable in the old shape, creating a v1 draft is locked", async ({ page }) => {
  const mock = v1Mock({ state: sampleDraftState(), previewKind: "reprocess", floorsStatus: "ReprocessRequired" });
  await installEditorMocks(page, mock);
  await page.goto(EDITOR_URL);
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "legacy");
  await expect(page.getByTestId("reprocess-guide").first()).toBeVisible();
  await expect(page.getByTestId("create-v1-draft")).toBeDisabled();
  await page.getByTestId("add-spawn").click();
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(mock.puts).toHaveLength(1);
  expect((mock.puts[0].body as Record<string, unknown>).schemaVersion).toBeUndefined();
  expect(mock.createDraftCalls).toHaveLength(0);
});

test("WebGL resources of the v1 editor are released on unmount (renderer.info.memory back to 0), repeatedly", async ({ page }) => {
  const mock = v1Mock();
  const log = await openV1(page, mock);
  for (let round = 0; round < 2; round++) {
    await page.getByRole("link", { name: "Kịch bản", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workspace/buildings/${BUILDING_ID}/scenarios$`));
    await expect.poll(() => page.evaluate(() => window.__fire3dEditorScene === undefined)).toBe(true);
    await page.goBack();
    await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  }
  const disposals = await page.evaluate(() => (window.__fire3dEditorLog ?? []).filter((entry) => entry.event === "dispose"));
  expect(disposals).toHaveLength(2);
  for (const entry of disposals) { expect(entry.geometries).toBe(0); expect(entry.textures).toBe(0); }
  expect(log.relevant()).toEqual([]);
});

test("unsaved v1 work is protected: Back/links ask first and saving clears the warning", async ({ page }) => {
  const mock = v1Mock();
  await openV1(page, mock);
  await item(page, 0).click();
  await page.getByTestId("field-label").fill("Chưa lưu");
  await page.getByRole("link", { name: "Hồ sơ tổ chức", exact: true }).click();
  await expect(page.getByTestId("leave-stay")).toBeVisible();
  await page.getByTestId("leave-stay").click();
  await expect(page.getByTestId("field-label")).toHaveValue("Chưa lưu");
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  await page.getByRole("link", { name: "Hồ sơ tổ chức", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/profile$/);
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 375]) {
    test(`v1 layout ${width}px ${theme}: no horizontal overflow on any panel (screenshots)`, async ({ page }, testInfo) => {
      const mock = v1Mock({ validateState: { issues: [{ code: "PARAMETER_OUT_OF_RANGE", path: "$.objects[2].parameters.intensity", message: "Parameter is outside the capability contract range." }] } });
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 375 ? 780 : 900 });
      const log = await openV1(page, mock, { theme });
      const mobile = width === 375;
      const props = () => (mobile ? page.getByRole("navigation", { name: "Phần của trình soạn thảo" }).getByRole("button", { name: /Thuộc tính/ }).click() : Promise.resolve());
      await page.waitForTimeout(400);
      await noOverflow(page, width);
      await page.screenshot({ path: testInfo.outputPath(`v1-${width}-${theme}-model.png`) });
      if (mobile) {
        await page.getByRole("navigation", { name: "Phần của trình soạn thảo" }).getByRole("button", { name: "Đối tượng" }).click();
        await noOverflow(page, width);
        await page.screenshot({ path: testInfo.outputPath(`v1-${width}-${theme}-objects.png`), fullPage: true });
        await item(page, 2).click();
      } else {
        await item(page, 2).click();
      }
      await props();
      await noOverflow(page, width);
      await page.screenshot({ path: testInfo.outputPath(`v1-${width}-${theme}-object.png`), fullPage: mobile });
      for (const name of ["Kịch bản", "Mô hình", "Khả dụng"]) {
        await tab(page, name).click();
        await noOverflow(page, width);
        await page.screenshot({ path: testInfo.outputPath(`v1-${width}-${theme}-${name}.png`), fullPage: mobile });
      }
      await page.getByTestId("validate").click();
      await expect(page.getByTestId("server-report")).toContainText("Máy chủ báo 1 vấn đề");
      await noOverflow(page, width);
      await page.screenshot({ path: testInfo.outputPath(`v1-${width}-${theme}-issues.png`), fullPage: mobile });
      const validate = page.getByTestId("validate-inline");
      const box = await validate.evaluate((node) => { const button = node.getBoundingClientRect(); const panel = node.closest(".se-form")!.getBoundingClientRect(); return { height: button.height >= 44, inside: button.left >= panel.left - 1 && button.right <= panel.right + 1 }; });
      expect(box).toEqual({ height: true, inside: true });
      await expect(page.locator(".ops-theme")).toHaveAttribute("data-resolved-theme", theme);
      expect(log.relevant()).toEqual([]);
    });
  }
}
