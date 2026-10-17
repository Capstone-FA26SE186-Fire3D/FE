import { expect, test, type Page, type Route } from "@playwright/test";
import { ApiError } from "../../src/api/types/common";
import { classifyUploadError } from "../../src/features/buildings/ifc-upload";

// IFC-04 equipment candidates, the IFC_EXIT_UNKNOWN "choose an exit door" step (option B) and QA guidance/highlight
// (BE docs/ifc-equipment-candidates.md, docs/ifc-qa-codes.md). Route mocks only: UI evidence, not BE integration.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const building = { id: "building-1", name: "Trường Tiểu học", buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: null, contact: null };
const revision = (status: string) => ({ id: "rev-1", buildingId: "building-1", versionLabel: "IFC rev. 01", status, createdAt: "2026-10-01T00:00:00Z", sourceDocument: null });
const page1 = <T,>(items: T[]) => ({ items, totalCount: items.length, page: 1, pageSize: 20 });

const DOOR_A = "2O2Fr$t4X7Zf8NOew3FLOH";
const DOOR_B = "1hOSvn6df7F8_7GcBWlRGQ";
const EXT = "3cUkl32yn9qRSPvBJVyWYp";
const candidate = (id: string, ifcGlobalId: string, catalogKey: string, ifcClass: string, confidence = 0.95, extra: Record<string, unknown> = {}) =>
  ({ id, ifcGlobalId, catalogKey, source: "ifc", ifcClass, confidence, floorId: "L1", position: [1, 0, 2], rotationY: 0, bbox: [1, 0.2, 2], needsConfirmation: confidence < 0.9, decision: null, suggestedDecision: null, ...extra });

const catalog = [{ runtimeVersion: "2.0.0", protocolVersion: "1", capabilities: ["door.standard", "door.exit", "extinguisher.portable", "exit.final"], capabilityContracts: {
  "door.standard": { version: "1.0.0", objectKinds: ["Equipment"] },
  "door.exit": { version: "1.0.0", objectKinds: ["Equipment"] },
  "extinguisher.portable": { version: "1.0.0", objectKinds: ["Equipment"] },
  "exit.final": { version: "1.0.0", objectKinds: ["Goal"] },
} }];

type State = { version: number; status: string; exitRequired: boolean; items: Array<ReturnType<typeof candidate>>; patches: Array<{ ifMatch?: string; body: { items: Array<{ candidateId: string; decision: string; catalogKey?: string }> } }>; failNext412?: boolean };

function view(state: State) {
  return { revisionId: "rev-1", artifactId: "art-1", metadataAvailable: true, version: state.version, items: state.items, revisionStatus: state.status, exitConfirmationRequired: state.exitRequired };
}

async function setup(page: Page, state: State, issues: unknown[] = []) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
  await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building, headers: { ETag: '"3"' } }));
  await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: page1([revision(state.status)]) }));
  await page.route("**/api/buildings/building-1/scenarios?*", (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*/processing-jobs?*", (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*/issues?*", (route) => route.fulfill({ json: page1(issues) }));
  for (const part of ["processing-logs", "artifacts", "bim-facts"]) await page.route(`**/api/revisions/*/${part}?*`, (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*/annotations", (route) => route.fulfill({ json: { revisionId: "rev-1", id: null, version: 0, data: { items: [] }, provenance: null, createdBy: null, createdAt: null } }));
  await page.route("**/api/buildings/building-1/editor-preview?*", (route) => route.fulfill({ json: { buildingId: "building-1", revisionId: "rev-1", revisionStatus: state.status, status: "Ready", artifactId: "art-1", attemptId: "att-1", sha256Hash: "a".repeat(64), downloadUrl: "https://storage.fire3d.test/model.glb?sig=x", expiresAt: "2026-10-18T00:00:00Z", coordinateTransform: null, floors: [], semanticMapping: [{ ifcGlobalId: DOOR_A, nodeId: "door_101", floorId: "L1", semanticType: "IfcDoor" }] } }));
  await page.route("https://storage.fire3d.test/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/api/scenario-interactions/catalog", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/revisions/rev-1/equipment-candidates", (route) => route.fulfill({ json: view(state), headers: { ETag: `"${state.version}"` } }));
  await page.route("**/api/revisions/rev-1/equipment-decisions", async (route: Route) => {
    const request = route.request();
    const body = request.postDataJSON();
    state.patches.push({ ifMatch: request.headers()["if-match"], body });
    if (request.method() !== "PATCH") return route.fulfill({ status: 405 });
    if (state.failNext412 || request.headers()["if-match"] !== `"${state.version}"`) {
      state.failNext412 = false;
      return route.fulfill({ status: 412, contentType: "application/problem+json", body: JSON.stringify({ status: 412, title: "stale", code: "PRECONDITION_FAILED" }) });
    }
    for (const item of body.items as Array<{ candidateId: string; decision: string; catalogKey?: string }>) {
      const target = state.items.find((entry) => entry.id === item.candidateId)!;
      (target as Record<string, unknown>).decision = { decision: item.decision, catalogKey: item.catalogKey ?? (item.decision === "Rejected" ? null : target.catalogKey), note: null, decidedBy: "owner", decidedAt: "2026-10-17T00:00:00Z" };
    }
    state.version += 1;
    const exit = state.items.some((entry) => entry.ifcClass === "IfcDoor" && entry.decision && entry.decision.decision !== "Rejected" && entry.decision.catalogKey === "door.exit");
    if (state.exitRequired && exit) { state.exitRequired = false; state.status = "ReadyForScenario"; }
    return route.fulfill({ json: view(state), headers: { ETag: `"${state.version}"` } });
  });
}

test.describe("IFC equipment candidates", () => {
  test("IFC_EXIT_UNKNOWN: choose an existing door as exit, save with If-Match, the revision becomes ready", async ({ page }) => {
    const state: State = { version: 0, status: "NeedsFix", exitRequired: true, items: [candidate("ifc:A", DOOR_A, "door.standard", "IfcDoor"), candidate("ifc:B", DOOR_B, "door.standard", "IfcDoor"), candidate("ifc:E", EXT, "extinguisher.portable", "IfcFlowTerminal", 0.6)], patches: [] };
    await setup(page, state, [{ id: "i-1", revisionId: "rev-1", validationRunId: "run-1", processingAttemptId: "att-1", artifactId: null, issueCode: "IFC_EXIT_UNKNOWN", severity: "Warning", status: "Open", message: "No external exit door.", evidence: {}, ifcGlobalIds: [], isCurrentAttempt: true, createdAt: "2026-10-02T00:00:00Z" }]);
    await page.goto("/workspace/buildings/building-1?tab=ifc&revision=rev-1");
    const step = page.getByTestId("exit-step");
    await expect(step).toContainText("Chọn cửa thoát ra ngoài");
    await expect(page.getByTestId("equipment-row")).toHaveCount(3);
    await expect(page.getByTestId("equipment-row").nth(2)).toContainText("Cần xác nhận");
    // Only doors can be the exit.
    await expect(page.getByTestId("equipment-exit")).toHaveCount(2);
    await page.getByRole("button", { name: `Chọn ${DOOR_B} làm cửa thoát` }).click();
    await expect(page.getByTestId("equipment-row").nth(1)).toContainText("Chưa lưu: đổi sang door.exit");
    await expect(step).toContainText("Đã chọn ít nhất một cửa thoát");
    await page.getByTestId("equipment-save").click();
    await expect(page.getByText("Đã lưu quyết định thiết bị")).toBeVisible();
    await expect(page.getByTestId("exit-step")).toHaveCount(0);
    expect(state.patches).toHaveLength(1);
    expect(state.patches[0].ifMatch).toBe('"0"');
    expect(state.patches[0].body).toEqual({ items: [{ candidateId: "ifc:B", decision: "Retyped", catalogKey: "door.exit" }] });
    await expect(page.getByTestId("equipment-row").nth(1)).toContainText("Đã đổi loại (door.exit)");
    // QA guidance in Vietnamese points to this step.
    await expect(page.getByTestId("issue-row").filter({ hasText: "IFC_EXIT_UNKNOWN" }).getByTestId("issue-guidance")).toContainText("Chọn một cửa có sẵn làm lối thoát");
  });

  test("confirm, retype and reject together; a 412 reloads the server view and keeps the unsaved choices", async ({ page }) => {
    const state: State = { version: 4, status: "ReadyForScenario", exitRequired: false, items: [candidate("ifc:A", DOOR_A, "door.standard", "IfcDoor"), candidate("ifc:E", EXT, "extinguisher.portable", "IfcFlowTerminal", 0.6, { suggestedDecision: { decision: "Rejected", catalogKey: null, fromRevisionId: "rev-0" } })], patches: [], failNext412: true };
    await setup(page, state);
    await page.goto("/workspace/buildings/building-1?tab=ifc&revision=rev-1");
    await expect(page.getByTestId("equipment-suggestion")).toContainText("Gợi ý từ revision trước: Đã loại bỏ");
    await page.getByLabel(`Đổi loại ${DOOR_A}`).selectOption("door.standard");
    await page.getByRole("button", { name: `Loại bỏ ${EXT}` }).click();
    await page.getByTestId("equipment-save").click();
    await expect(page.getByText("Danh sách vừa được lưu ở nơi khác")).toBeVisible();
    await expect(page.getByTestId("equipment-row").nth(1)).toContainText("Chưa lưu: loại bỏ");
    await page.getByTestId("equipment-save").click();
    await expect(page.getByText("Đã lưu quyết định thiết bị")).toBeVisible();
    expect(state.patches.map((patch) => patch.ifMatch)).toEqual(['"4"', '"4"']);
    expect(state.patches[1].body.items).toEqual([{ candidateId: "ifc:A", decision: "Retyped", catalogKey: "door.standard" }, { candidateId: "ifc:E", decision: "Rejected" }]);
  });

  test("a QA issue with IFC GlobalIds can be highlighted in the preview, with Vietnamese guidance", async ({ page }) => {
    const state: State = { version: 0, status: "ReadyForScenario", exitRequired: false, items: [], patches: [] };
    await setup(page, state, [{ id: "i-2", revisionId: "rev-1", validationRunId: "run-1", processingAttemptId: "att-1", artifactId: null, issueCode: "IFC_EXCESSIVE_VOIDS", severity: "Warning", status: "Open", message: "Opening could not be cut.", evidence: {}, ifcGlobalIds: [DOOR_A, DOOR_B], isCurrentAttempt: true, createdAt: "2026-10-02T00:00:00Z" }]);
    await page.goto("/workspace/buildings/building-1?tab=ifc&revision=rev-1");
    const row = page.getByTestId("issue-row").filter({ hasText: "IFC_EXCESSIVE_VOIDS" });
    await expect(row).toContainText("Không cắt được lỗ cửa");
    await expect(row.getByTestId("issue-guidance")).toContainText("Kiểm tra cửa và tường");
    await expect(row).toContainText(DOOR_A);
    await row.getByTestId("issue-highlight").click();
    await expect(page.getByTestId("preview-highlight-ids")).toContainText(`${DOOR_A}, ${DOOR_B}`);
    await page.getByRole("button", { name: "Bỏ đánh dấu" }).click();
    await expect(page.getByTestId("preview-highlight-ids")).toHaveCount(0);
  });

  test("no accepted geometry yet is explained instead of an error", async ({ page }) => {
    const state: State = { version: 0, status: "Processing", exitRequired: false, items: [], patches: [] };
    await setup(page, state);
    await page.route("**/api/revisions/rev-1/equipment-candidates", (route) => route.fulfill({ status: 409, contentType: "application/problem+json", body: JSON.stringify({ status: 409, title: "x", code: "EQUIPMENT_CANDIDATES_UNAVAILABLE" }) }));
    await page.goto("/workspace/buildings/building-1?tab=ifc&revision=rev-1");
    await expect(page.getByTestId("equipment-panel")).toContainText("Chưa có hình học được chấp nhận");
  });
});

test("IFC_UNSUPPORTED_FORMAT at initiate (400) or upload-complete (422) says the file is not IFC, not a checksum mismatch", () => {
  const atComplete = classifyUploadError("complete", new ApiError("not ifc", 422, undefined, undefined, "IFC_UNSUPPORTED_FORMAT"));
  expect(atComplete.message).toContain("Tệp không phải IFC");
  expect(atComplete.message).not.toContain("SHA-256");
  const atInitiate = classifyUploadError("initiate", new ApiError("not ifc", 400, undefined, undefined, "IFC_UNSUPPORTED_FORMAT"));
  expect(atInitiate.message).toContain("IFC2X3");
});
