/**
 * Hạ tầng PCCC (BE#213): the 3D editor on an infrastructure version, and a scenario draft built on a locked one.
 * Evidence level: mock. Routes follow BE `docs/fire-infrastructure.md` (BE main @ 3786664): GET/PUT `/api/fire-infrastructures/{id}`
 * with ETag = revision, `{geometry, runtimeVersion, items}` bodies, items = editor objects + `category`. Not the real API.
 */
import { expect, test, type Page } from "@playwright/test";

import { BUILDING_ID, REVISION_ID } from "../fixtures/scenario-editor/fixture-building";
import { EDITOR_URL, INFRASTRUCTURE_ID, installEditorMocks, lockedInfrastructure, newMock, type MockState } from "../fixtures/scenario-editor/mock-api";
import { ARTIFACT_ID, GEOMETRY_HASH, SAMPLE_RUNTIME_CATALOG } from "../fixtures/scenario-editor/v1-fixtures";
import { withExitGoals } from "../../src/features/fire-infrastructure/exit-goals";
import { categoryOf } from "../../src/features/scenario-editor/v1/scope";
import { completenessIssues, readObjects, shapeIssues } from "../../src/features/scenario-editor/v1/state";

const DRAFT_INFRASTRUCTURE = "88888888-8888-4888-8888-888888888888";
const placement = { floorId: "L1", position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
const exit = { id: "exit-1", kind: "Goal", label: "Cửa thoát phía Đông", category: "Exit", placement };

type Put = { ifMatch: string | undefined; body: { geometry: unknown; runtimeVersion: unknown; items: Array<Record<string, unknown>> } };

/** A Draft version as the server seeds the first one: no Geometry pin, runtime of the newest active runtime, no exits. */
async function installDraftInfrastructure(page: Page, mock: MockState, puts: Put[]) {
  const stored = lockedInfrastructure({ id: DRAFT_INFRASTRUCTURE, status: "Draft", version: 2, revision: 5, decidedAt: null, runtimeVersion: null });
  mock.infrastructures = [stored, ...mock.infrastructures];
  await installEditorMocks(page, mock);
  await page.route(`**/api/fire-infrastructures/${DRAFT_INFRASTRUCTURE}`, (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Put["body"];
      puts.push({ ifMatch: route.request().headers()["if-match"], body });
      Object.assign(stored, body, { revision: Number(stored.revision) + 1 });
    }
    return route.fulfill({ json: stored, headers: { ETag: `"${String(stored.revision)}"` } });
  });
}

test("an infrastructure version is edited in the 3D editor: only exits and equipment, pin and runtime filled in, category derived on save", async ({ page }) => {
  const mock = newMock({ previewKind: "v1", catalog: SAMPLE_RUNTIME_CATALOG });
  const puts: Put[] = [];
  await installDraftInfrastructure(page, mock, puts);
  await page.goto(`/workspace/buildings/${BUILDING_ID}/infrastructure/${DRAFT_INFRASTRUCTURE}`);
  await expect(page.getByTestId("scenario-editor")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Hạ tầng PCCC" })).toBeVisible();
  await expect(page.getByText("Phiên bản 2", { exact: true })).toBeVisible();

  // Only the kinds an infrastructure owns; no scenario tabs, no playtest or versions links.
  await expect(page.getByTestId("list-Goal")).toHaveCount(1);
  await expect(page.getByTestId("list-Equipment")).toHaveCount(1);
  for (const kind of ["Spawn", "Hazard", "Npc", "BlockedElement"]) await expect(page.getByTestId(`list-${kind}`)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Kịch bản", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("tab-library")).toHaveCount(0);
  await expect(page.getByTestId("versions-link")).toHaveCount(0);
  await expect(page.getByTestId("editor-exit")).toHaveAttribute("href", new RegExp(`/workspace/buildings/${BUILDING_ID}\\?tab=ifc&sub=infrastructure&revision=${REVISION_ID}`));

  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("add-Goal").click();
  await expect(page.getByTestId("save-status")).toHaveText("Chưa lưu");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");

  expect(puts).toHaveLength(1);
  expect(puts[0].ifMatch).toBe('"5"');
  // The author never chose these: the pin is the revision's accepted Geometry and the runtime is the catalog's newest.
  expect(puts[0].body.geometry).toEqual({ artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH });
  expect(typeof puts[0].body.runtimeVersion).toBe("string");
  expect(puts[0].body.items).toHaveLength(1);
  expect(puts[0].body.items[0]).toMatchObject({ kind: "Goal", category: "Exit" });
  expect("objects" in puts[0].body).toBe(false);
});

test("a decided version is not opened for editing", async ({ page }) => {
  const mock = newMock({ previewKind: "v1", catalog: SAMPLE_RUNTIME_CATALOG });
  await installEditorMocks(page, mock);
  await page.goto(`/workspace/buildings/${BUILDING_ID}/infrastructure/${INFRASTRUCTURE_ID}`);
  await expect(page.getByText("Phiên bản này đã khoá")).toBeVisible();
  await expect(page.getByTestId("scenario-editor")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Về danh sách phiên bản" })).toBeVisible();
});

test("a scenario draft on a locked infrastructure shows its items read-only and offers no exits or fixed equipment", async ({ page }) => {
  const mock = newMock({
    previewKind: "v1", catalog: SAMPLE_RUNTIME_CATALOG,
    state: { schemaVersion: "fet3d.editor/1", geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH }, objects: [{ id: "spawn-1", kind: "Spawn", placement }] },
    infrastructures: [lockedInfrastructure({ items: [exit] })], draftInfrastructureId: INFRASTRUCTURE_ID,
  });
  await installEditorMocks(page, mock);
  await page.goto(EDITOR_URL);
  await expect(page.getByTestId("scenario-editor")).toHaveAttribute("data-draft-mode", "v1");
  await expect(page.getByTestId("list-Goal")).toHaveCount(0);
  await expect(page.getByTestId("list-Spawn").getByRole("button")).toHaveCount(1);
  const locked = page.getByTestId("locked-infrastructure");
  await expect(locked).toContainText("Hạ tầng PCCC đã khoá");
  await expect(locked).toContainText("Cửa thoát phía Đông");
  await expect(locked.getByRole("button")).toHaveCount(0); // listed, never selectable
  await expect(page.getByTestId("import-equipment")).toHaveCount(0);
  // The exit comes from the infrastructure, so the draft is not told to add one.
  await page.getByTestId("tab-issues").click();
  await expect(page.getByText("Cần ít nhất một điểm đến.")).toHaveCount(0);

  // BE#215: a situation on an infrastructure names its audience, working hours and assumption; missing ones are listed until filled.
  await expect(page.getByText("Chọn đối tượng luyện tập của tình huống.")).toBeVisible();
  await page.getByRole("tab", { name: "Kịch bản", exact: true }).click();
  const situation = page.getByTestId("group-situation");
  await expect(situation).toBeVisible();
  await situation.getByTestId("field-audience").selectOption("EvacuationGuide");
  await situation.getByTestId("field-working-hours").selectOption("OffHours");
  await situation.getByTestId("assumption-time").fill("22 giờ thứ Bảy");
  await situation.getByTestId("assumption-people").fill("12");
  await situation.getByTestId("assumption-location").fill("Bếp căng tin tầng 1");
  await situation.getByTestId("assumption-cause").fill("Chập điện ở ổ cắm");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Đã lưu");
  expect(mock.state).toMatchObject({ audience: "EvacuationGuide", workingHours: "OffHours", assumption: { time: "22 giờ thứ Bảy", location: "Bếp căng tin tầng 1", cause: "Chập điện ở ổ cắm", peoplePresent: 12 } });
  await page.getByTestId("tab-issues").click();
  await expect(page.getByText("Chọn đối tượng luyện tập của tình huống.")).toHaveCount(0);
});

test("seeded exit doors become exits once: a Goal on the same door, exit.final of the catalog, nothing added twice", () => {
  const anchorId = "2O2Fr$t4X7Zf8NOew3FLOH";
  const rotation = { x: 0, y: 0.707106781, z: 0, w: 0.707106781 };
  // What the server seeds from the confirmed IFC equipment (FireInfrastructures.SeedAsync): the IFC class as label, no parameters.
  const door = { id: "infra-eq-1", kind: "Equipment", label: "IfcDoor", capability: { id: "door.exit", version: "1.2.0" }, anchorId, placement: { floorId: "L1", position: { x: 2, y: 0, z: 5 }, rotation } };
  const unanchored = { id: "infra-eq-2", kind: "Equipment", label: "IfcDoor", capability: { id: "door.exit", version: "1.2.0" }, placement: { floorId: "L2", position: { x: 1, y: 0, z: 1 }, rotation } };
  const extinguisher = { id: "infra-eq-3", kind: "Equipment", label: "IfcBuildingElementProxy", capability: { id: "extinguisher.portable", version: "1.0.0" }, placement };
  const exitCapability = { id: "exit.final", version: "1.1.0" };
  const before = [door, unanchored, extinguisher];
  const exitRule = (objects: unknown[]) => completenessIssues({ schemaVersion: "fet3d.editor/1", objects: objects as never }, { geometry: null, runtimes: null, metrics: null, scope: "infrastructure" }).filter((issue) => issue.code === "EXIT_REQUIRED");
  expect(exitRule(before)).toHaveLength(1); // the bug: the doors were there, yet "Cần ít nhất một lối thoát nạn"

  const after = withExitGoals(before, exitCapability)!;
  expect(after).toHaveLength(5);
  expect(after.slice(0, 3)).toEqual(before); // the seeded items are untouched
  // The same object the author makes in the editor: a Goal attached to the door ("Gắn vào bộ phận tòa nhà"), at the door's place.
  expect(after[3]).toEqual({ id: "goal-1", kind: "Goal", placement: door.placement, anchorId, capability: exitCapability, label: "Lối ra ngoài" });
  expect(after[3].placement).not.toBe(door.placement);
  expect(after[4]).toEqual({ id: "goal-2", kind: "Goal", placement: unanchored.placement, capability: exitCapability, label: "Lối ra ngoài" });
  expect(readObjects({ objects: after }).map((object) => categoryOf(object.kind, object.capability?.id))).toEqual(["Equipment", "Equipment", "Equipment", "Exit", "Exit"]);
  expect(exitRule(after)).toEqual([]);
  expect(shapeIssues({ schemaVersion: "fet3d.editor/1", objects: after })).toEqual([]);

  // Run again (a replayed create, a later version): nothing is missing, so nothing is saved.
  expect(withExitGoals(after, exitCapability)).toBeNull();
  // A Goal the author already put on the door counts; ids in use are skipped.
  const authored = { id: "goal-1", kind: "Goal", label: "Cửa thoát phía Đông", anchorId, capability: { id: "exit.stair", version: "1.0.0" }, placement };
  const mixed = withExitGoals([door, authored], exitCapability);
  expect(mixed).toBeNull();
  const other = withExitGoals([unanchored, authored], exitCapability)!;
  expect(other[2]).toMatchObject({ id: "goal-2", kind: "Goal" });
  expect(withExitGoals([extinguisher], exitCapability)).toBeNull();
});
