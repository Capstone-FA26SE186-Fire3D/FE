import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { REVISION_ID } from "../fixtures/scenario-editor/fixture-building";
import { EDITOR_URL, installEditorMocks, newMock, watchConsole, type MockState } from "../fixtures/scenario-editor/mock-api";
import { ARTIFACT_ID, GEOMETRY_HASH, SAMPLE_RUNTIME_CATALOG, gid } from "../fixtures/scenario-editor/v1-fixtures";

/**
 * EVIDENCE LEVEL: mock. "Thêm thiết bị đã xác nhận" in the fet3d.editor/1 editor: `GET /api/revisions/{id}/equipment-candidates`
 * (BE main 971d85c, EquipmentCandidates.cs / docs/ifc-equipment-candidates.md) becomes Equipment objects with anchorId = ifcGlobalId,
 * capability = decided catalogKey at the draft runtime's version, floor-local placement and yaw from rotationY. Route mocks only.
 */

const DOOR = "1hOSvn6df7F8_7GcBWlRGQ"; // door_101, L1 in the fixture semantic mapping
const STAIR = "2O2Fr$t4X7Zf8NOew3FLOH"; // stair_1, L1
const SPACE_L2 = "3cUkl32yn9qRSPvBJVyWYp"; // space_201, L2

/** The BE sample runtime plus an exit door (no parameters) and a sprinkler whose `state` is required with no default (catalog 2.0.0 style). */
const CATALOG = [{
  ...SAMPLE_RUNTIME_CATALOG[0],
  capabilities: [...SAMPLE_RUNTIME_CATALOG[0].capabilities, "door.exit", "suppression.sprinkler"],
  capabilityContracts: {
    ...SAMPLE_RUNTIME_CATALOG[0].capabilityContracts,
    "door.exit": { version: "1.0.0", objectKinds: ["Equipment"] },
    "suppression.sprinkler": { version: "1.1.0", objectKinds: ["Equipment"], parameters: { type: "object", additionalProperties: false, required: ["state"], properties: { state: { type: "string", enum: ["Active", "Disabled", "Faulty"] } } } },
  },
}];

type Decision = { decision: string; catalogKey: string | null; note: null; decidedBy: string; decidedAt: string } | null;
const decided = (decision: string, catalogKey: string | null = null): Decision => ({ decision, catalogKey, note: null, decidedBy: "owner", decidedAt: "2026-10-17T00:00:00Z" });
const candidate = (id: string, ifcGlobalId: string, catalogKey: string, decision: Decision, extra: Record<string, unknown> = {}) =>
  ({ id, ifcGlobalId, catalogKey, source: "ifc", ifcClass: "IfcDoor", confidence: 0.95, floorId: "L1", position: [12.5, 0, 1], rotationY: 0, bbox: [1, 0.2, 2], needsConfirmation: false, decision, suggestedDecision: null, ...extra });

const CANDIDATES = [
  candidate("ifc:door", DOOR, "door.standard", decided("Retyped", "door.exit"), { rotationY: 90 }),
  candidate("ifc:stair", STAIR, "door.standard", decided("Retyped", "suppression.sprinkler"), { ifcClass: "IfcFlowTerminal", position: [3, 2.8, 4.25] }),
  candidate("ifc:portable", gid("7portable"), "extinguisher.portable", decided("Confirmed")),
  candidate("ifc:ghost", gid("8ghost"), "equipment.extinguisher", decided("Confirmed")),
  candidate("ifc:wrongfloor", SPACE_L2, "equipment.extinguisher", decided("Confirmed")),
  candidate("ifc:suggested", gid("9suggest"), "equipment.extinguisher", null, { suggestedDecision: { decision: "Confirmed", catalogKey: null, fromRevisionId: "rev-0" } }),
  candidate("ifc:rejected", gid("6reject"), "equipment.extinguisher", decided("Rejected")),
];

const fixtureState = () => JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scenario-editor", "v1", "scenario-state.valid.json"), "utf8")) as Record<string, unknown>;
const v1State = (): Record<string, unknown> => ({ ...fixtureState(), geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH } });

async function open(page: Page, mock: MockState, equipment: { status?: number; body: unknown }) {
  const log = watchConsole(page);
  await installEditorMocks(page, mock);
  const calls: string[] = [];
  await page.route(`**/api/revisions/${REVISION_ID}/equipment-candidates`, (route) => {
    calls.push(route.request().method());
    return equipment.status && equipment.status >= 400
      ? route.fulfill({ status: equipment.status, contentType: "application/problem+json", body: JSON.stringify(equipment.body) })
      : route.fulfill({ json: equipment.body, headers: { ETag: '"3"' } });
  });
  await page.goto(EDITOR_URL);
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "v1");
  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  return { log, calls };
}

const view = (items: unknown[], extra: Record<string, unknown> = {}) => ({ revisionId: REVISION_ID, artifactId: ARTIFACT_ID, metadataAvailable: true, version: 3, items, revisionStatus: "ReadyForScenario", exitConfirmationRequired: false, ...extra });
const equipmentList = (page: Page) => page.getByTestId("list-Equipment").getByRole("button");

test("previews decided equipment, adds it as ONE undoable step with anchor, capability, floor-local placement and yaw; required parameters are left to the author", async ({ page }) => {
  const mock = newMock({ state: v1State(), previewKind: "v1", catalog: CATALOG });
  const { log, calls } = await open(page, mock, { body: view(CANDIDATES) });
  expect(calls).toHaveLength(0); // read only when the author asks for it
  await expect(equipmentList(page)).toHaveCount(1);

  await page.getByTestId("import-equipment").click();
  const dialog = page.getByTestId("equipment-import");
  await expect(dialog.getByTestId("equipment-import-row")).toHaveCount(2);
  await expect(dialog.getByTestId("equipment-import-row").nth(0)).toContainText("Cửa thoát");
  await expect(dialog.getByTestId("equipment-import-row").nth(0)).toContainText("door.exit");
  await expect(dialog.getByTestId("equipment-import-row").nth(0)).toContainText("Đã đổi loại");
  await expect(dialog.getByTestId("equipment-import-row").nth(0)).toContainText("Tầng 1 · 12.5, 0, 1");
  await expect(dialog.getByTestId("equipment-import-row").nth(1)).toContainText("Cần điền: state");
  await expect(dialog).toContainText("Cần điền tham số bắt buộc");
  const skipped = dialog.getByTestId("equipment-import-skip-row");
  await expect(skipped).toHaveCount(3);
  await expect(skipped.filter({ hasText: "extinguisher.portable" })).toContainText("Phiên bản ứng dụng của bản nháp không có khả năng này");
  await expect(skipped.filter({ hasText: gid("8ghost") })).toContainText("Mô hình 3D không có cấu kiện này");
  await expect(skipped.filter({ hasText: SPACE_L2 })).toContainText("Tầng của thiết bị khác tầng");
  // A suggestion from an earlier revision and a Rejected decision are never added.
  await expect(dialog.getByTestId("equipment-import-undecided")).toContainText("2 thiết bị chưa được xác nhận hoặc đã bị loại bỏ");
  expect(mock.puts).toHaveLength(0);

  await page.getByTestId("equipment-import-confirm").click();
  await expect(dialog).toHaveCount(0);
  await expect(equipmentList(page)).toHaveCount(3);
  await expect(page.getByTestId("save-status")).toHaveText("Chưa lưu");
  expect(mock.puts).toHaveLength(0); // nothing is saved by the import itself

  // One undo removes both; redo brings them back.
  await expect(page.getByTestId("undo")).toHaveAccessibleName("Hoàn tác: Thêm 2 thiết bị đã xác nhận");
  await page.getByTestId("undo").click();
  await expect(equipmentList(page)).toHaveCount(1);
  await page.getByTestId("redo").click();
  await expect(equipmentList(page)).toHaveCount(3);

  // The author fills the required parameter, then saves.
  await page.getByTestId("list-Equipment").getByRole("button").nth(2).click();
  await expect(page.getByTestId("field-capability")).toHaveValue("suppression.sprinkler");
  await page.getByTestId("param-state").selectOption({ label: "Active" });
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  const objects = (mock.puts[mock.puts.length - 1].body as { objects: unknown[] }).objects;
  expect(objects.slice(6)).toEqual([
    { id: "equipment-1", kind: "Equipment", placement: { floorId: "L1", position: { x: 12.5, y: 0, z: 1 }, rotation: { x: 0, y: 0.7071068, z: 0, w: 0.7071068 } }, anchorId: DOOR, capability: { id: "door.exit", version: "1.0.0" } },
    { id: "equipment-2", kind: "Equipment", placement: { floorId: "L1", position: { x: 3, y: 2.8, z: 4.25 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, anchorId: STAIR, capability: { id: "suppression.sprinkler", version: "1.1.0" }, parameters: { state: "Active" } },
  ]);

  // A second import finds them by anchorId and adds nothing.
  await page.getByTestId("import-equipment").click();
  await expect(dialog.getByTestId("equipment-import-empty")).toContainText("Không có thiết bị mới để thêm");
  await expect(dialog.getByTestId("equipment-import-skip-row").filter({ hasText: DOOR })).toContainText("Đã có trong bản nháp");
  await expect(page.getByTestId("equipment-import-confirm")).toBeDisabled();
  expect(log.relevant()).toEqual([]);
});

test("explains why nothing can be added: no runtime chosen, no accepted geometry (409), no building_metadata", async ({ page }) => {
  const mock = newMock({ state: { ...v1State(), runtimeVersion: undefined }, previewKind: "v1", catalog: CATALOG });
  const equipment: { status?: number; body: unknown } = { body: view(CANDIDATES) };
  await open(page, mock, equipment);
  const dialog = page.getByTestId("equipment-import");

  await page.getByTestId("import-equipment").click();
  await expect(dialog).toContainText("Chọn phiên bản ứng dụng trước");
  await expect(page.getByTestId("equipment-import-confirm")).toBeDisabled();
  await page.getByRole("button", { name: "Đóng", exact: true }).last().click();

  equipment.status = 409;
  equipment.body = { status: 409, title: "No accepted geometry.", code: "EQUIPMENT_CANDIDATES_UNAVAILABLE" };
  await page.getByTestId("import-equipment").click();
  await expect(dialog).toContainText("Bản IFC chưa có mô hình 3D đạt kiểm tra");
  await page.getByRole("button", { name: "Đóng", exact: true }).last().click();

  equipment.status = undefined;
  equipment.body = view([], { metadataAvailable: false });
  await page.getByTestId("import-equipment").click();
  await expect(dialog).toContainText("Chưa có dữ liệu thiết bị");
  await expect(page.getByTestId("equipment-import-confirm")).toBeDisabled();
  expect(mock.puts).toHaveLength(0);
});

test("the import dialog fits a 375px phone without horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const mock = newMock({ state: v1State(), previewKind: "v1", catalog: CATALOG });
  await installEditorMocks(page, mock);
  await page.route(`**/api/revisions/${REVISION_ID}/equipment-candidates`, (route) => route.fulfill({ json: view(CANDIDATES), headers: { ETag: '"3"' } }));
  await page.goto(EDITOR_URL);
  await page.getByRole("button", { name: "Đối tượng", exact: true }).click();
  await page.getByTestId("import-equipment").click();
  await expect(page.getByTestId("equipment-import-row")).toHaveCount(2);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
  const box = await page.getByRole("dialog").boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true);
});
