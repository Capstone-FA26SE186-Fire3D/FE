/**
 * Hạ tầng PCCC (BE#213): the 3D editor on an infrastructure version, and a scenario draft built on a locked one.
 * Evidence level: mock. Routes follow BE `docs/fire-infrastructure.md` (BE main @ 3786664): GET/PUT `/api/fire-infrastructures/{id}`
 * with ETag = revision, `{geometry, runtimeVersion, items}` bodies, items = editor objects + `category`. Not the real API.
 */
import { expect, test, type Page } from "@playwright/test";

import { BUILDING_ID, REVISION_ID } from "../fixtures/scenario-editor/fixture-building";
import { EDITOR_URL, INFRASTRUCTURE_ID, installEditorMocks, lockedInfrastructure, newMock, type MockState } from "../fixtures/scenario-editor/mock-api";
import { ARTIFACT_ID, GEOMETRY_HASH, SAMPLE_RUNTIME_CATALOG } from "../fixtures/scenario-editor/v1-fixtures";

const DRAFT_INFRASTRUCTURE = "88888888-8888-4888-8888-888888888888";
const placement = { floorId: "L1", position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
const exit = { id: "exit-1", kind: "Goal", label: "Cửa thoát phía Đông", category: "Exit", placement };

type Put = { ifMatch: string | undefined; body: { geometry: unknown; runtimeVersion: unknown; items: Array<Record<string, unknown>> } };

/** A Draft version with no Geometry pin and no runtime yet, and no items, so the test adds the first exit itself (the server seeds an exit Goal per exit door; this fixture has no doors). */
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
  // Floors are named like the game's minimap here too: no exit yet, so the storey nearest 0 m is the ground; then Tầng 1 above it.
  await expect(page.getByRole("radiogroup", { name: "Chọn tầng" }).getByRole("radio")).toHaveText(["Tất cả", "Tầng trệt0 m", "Tầng 13.5 m"]);
  await expect(page.getByTestId("active-floor")).toHaveText("Tầng đang soạn: Tầng trệt · 0 m");

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
  // The locked exit stands on L1, so L1 is the ground storey: the list and the tree name it "Tầng trệt", never by its IFC name.
  await expect(locked).toContainText("Tầng trệt");
  await expect(locked.locator("small")).toHaveAttribute("title", "BT-A_1000_EG_RDOK_0,000");
  await expect(page.getByTestId("active-floor")).toHaveText("Tầng đang soạn: Tầng trệt · 0 m");
  await expect(page.getByTestId("v1-tree")).not.toContainText("BT-A_");
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
