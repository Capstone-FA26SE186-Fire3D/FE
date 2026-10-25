import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { BUILDING_ID, DRAFT_ID, SCENARIO_ID } from "../fixtures/scenario-editor/fixture-building";
import { EDITOR_URL, installEditorMocks, newMock, type MockState } from "../fixtures/scenario-editor/mock-api";
import { ARTIFACT_ID, GEOMETRY_HASH, SAMPLE_RUNTIME_CATALOG } from "../fixtures/scenario-editor/v1-fixtures";
import { calls, mockAi, newAiMock, proposalState, seedRequest, type AiMock } from "./org-ai-mock";

// Route mocks only. The editor part reuses the F2 editor mocks (GLB fixture on SwiftShader): it proves the apply path, not GPU performance.

const fixtureState = () => JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scenario-editor", "v1", "scenario-state.valid.json"), "utf8")) as Record<string, unknown>;
const v1State = (): Record<string, unknown> => ({ ...fixtureState(), geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH } });
const editorMock = (overrides: Partial<MockState> = {}) => newMock({ state: v1State(), previewKind: "v1", catalog: SAMPLE_RUNTIME_CATALOG, ...overrides });

async function openEditor(page: Page, editor: MockState, ai: AiMock, url: string) {
  await installEditorMocks(page, editor);
  await mockAi(page, ai);
  await page.goto(url);
}

const status = (page: Page) => page.getByTestId("save-status");
const lastPut = (mock: MockState) => mock.puts[mock.puts.length - 1].body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

test("a stored proposal opens as a preview over the open draft; defaults leave product decisions off; nothing is applied until confirmed", async ({ page }) => {
  const ai = newAiMock();
  const request = seedRequest(ai, { operation: "ScenarioDraft" });
  const editor = editorMock();
  await openEditor(page, editor, ai, `${EDITOR_URL}&aiRequest=${request.requestId}`);
  const dialog = page.getByTestId("ai-apply-dialog");
  await expect(dialog).toBeVisible();
  // Fetched by id from the server, never carried through the URL/memory.
  expect(calls(ai, "GET", `/api/ai/requests/${request.requestId}`)).toHaveLength(1);

  // Safe-to-preselect text fields are on; thresholds / modes / time / runtime are not.
  for (const key of ["name", "learningObjectives", "learnerInstructions"]) await expect(page.getByTestId(`ai-field-${key}`).getByRole("checkbox")).toBeChecked();
  for (const key of ["timeLimitSeconds", "modePolicy", "rubric", "runtimeVersion"]) await expect(page.getByTestId(`ai-field-${key}`).getByRole("checkbox")).not.toBeChecked();
  // Same pinned Geometry: spatial objects can be offered; the one on an unknown floor is read-only with the reason.
  await expect(page.getByTestId("ai-geometry-match")).toContainText("cùng bản mô hình");
  await expect(page.getByTestId("ai-object")).toHaveCount(3);
  await expect(page.getByTestId("ai-object").filter({ hasText: "ai-spawn-9" })).toContainText("Tầng không có trong mô hình của bản nháp");
  await expect(page.getByTestId("ai-apply-objects")).not.toBeChecked();
  await expect(page.getByTestId("ai-confirm-apply")).toContainText("Áp dụng 3 thay đổi");

  // Behind the dialog the draft is untouched.
  await page.getByRole("button", { name: "Không áp dụng" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText("Đã lưu");
  await expect(page).not.toHaveURL(/aiRequest=/);
  expect(editor.puts).toHaveLength(0);
});

test("confirmed apply is ONE undoable, unsaved step; objects are added only when chosen; nothing is saved or validated for the author", async ({ page }) => {
  const ai = newAiMock();
  const request = seedRequest(ai, { operation: "ScenarioDraft" });
  const editor = editorMock();
  await openEditor(page, editor, ai, `${EDITOR_URL}&aiRequest=${request.requestId}`);
  await page.getByTestId("ai-apply-objects").check();
  await page.getByTestId("ai-field-timeLimitSeconds").getByRole("checkbox").check();
  await expect(page.getByTestId("ai-confirm-apply")).toContainText("Áp dụng 6 thay đổi"); // name, objectives, instructions, time limit + 2 eligible objects
  await page.getByTestId("ai-confirm-apply").click();

  await expect(page.getByRole("heading", { name: /Sơ tán do báo cháy tầng 2/ })).toBeVisible();
  await expect(status(page)).toHaveText("Chưa lưu");
  await expect(page.getByTestId("list-Spawn").getByRole("button")).toHaveCount(2); // fixture spawn + ai-spawn-1 (ai-spawn-9 stays read-only)
  await expect(page.getByTestId("list-Goal").getByRole("button")).toHaveCount(2);
  expect(editor.puts).toHaveLength(0);
  expect(editor.validateStateCalls).toHaveLength(0);
  await expect(page).not.toHaveURL(/aiRequest=/);

  // One Undo reverts the whole application; Redo brings it back.
  await page.getByTestId("undo").click();
  await expect(status(page)).toHaveText("Đã lưu");
  await expect(page.getByRole("heading", { name: /Sơ tán tầng 1/ })).toBeVisible();
  await expect(page.getByTestId("list-Spawn").getByRole("button")).toHaveCount(1);
  await page.getByTestId("redo").click();
  await expect(status(page)).toHaveText("Chưa lưu");
  await expect(page.getByTestId("list-Spawn").getByRole("button")).toHaveCount(2);

  // Only the author's own Save writes, with the draft's ETag, and the pinned Geometry stays the draft's.
  await page.getByTestId("save").click();
  await expect(status(page)).toHaveText("Đã lưu");
  expect(editor.puts).toHaveLength(1);
  const body = lastPut(editor);
  expect(body.name).toBe("Sơ tán do báo cháy tầng 2");
  expect(body.timeLimitSeconds).toBe(480);
  expect(body.geometry).toEqual({ artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH });
  expect(body.objects.map((object: { id: string }) => object.id)).toEqual(expect.arrayContaining(["ai-spawn-1", "ai-goal-1"]));
  expect(body.objects.map((object: { id: string }) => object.id)).not.toContain("ai-spawn-9");
  // Fields that were not chosen keep the draft's values.
  expect(body.rubric).toEqual((v1State() as Record<string, unknown>).rubric);
  expect(body.runtimeVersion).toBe("1.4.0");
});

test("a proposal pinned to another Geometry offers no spatial objects (read-only with the reason)", async ({ page }) => {
  const ai = newAiMock();
  ai.draftState = { ...proposalState(), geometry: { artifactId: "99999999-9999-4999-8999-999999999999", sha256Hash: "c".repeat(64) } };
  const request = seedRequest(ai, { operation: "ScenarioDraft" });
  const editor = editorMock();
  await openEditor(page, editor, ai, `${EDITOR_URL}&aiRequest=${request.requestId}`);
  await expect(page.getByTestId("ai-geometry-match")).toContainText("bản mô hình khác");
  await expect(page.getByTestId("ai-apply-objects")).toHaveCount(0);
  await expect(page.getByTestId("ai-object").first()).toContainText("không dùng cùng bản mô hình");
  await page.getByTestId("ai-confirm-apply").click();
  await expect(page.getByTestId("list-Spawn").getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /Sơ tán do báo cháy tầng 2/ })).toBeVisible();
});

test("a request that is not a finished scenario draft cannot be applied", async ({ page }) => {
  const ai = newAiMock();
  const request = seedRequest(ai, { operation: "Answer" });
  const editor = editorMock();
  await openEditor(page, editor, ai, `${EDITOR_URL}&aiRequest=${request.requestId}`);
  await expect(page.getByText("Yêu cầu này không có đề xuất áp dụng được")).toBeVisible();
  await expect(page.getByTestId("ai-confirm-apply")).toBeDisabled();
});

test("the apply result must still pass the shape check: an invalid proposed value blocks the confirm", async ({ page }) => {
  const ai = newAiMock();
  ai.draftState = { ...proposalState(), timeLimitSeconds: 999_999 };
  const request = seedRequest(ai, { operation: "ScenarioDraft" });
  const editor = editorMock();
  await openEditor(page, editor, ai, `${EDITOR_URL}&aiRequest=${request.requestId}`);
  await page.getByTestId("ai-field-timeLimitSeconds").getByRole("checkbox").check();
  await expect(page.getByText("Kết quả sẽ không hợp lệ nếu áp dụng")).toBeVisible();
  await expect(page.getByTestId("ai-confirm-apply")).toBeDisabled();
  await page.getByTestId("ai-field-timeLimitSeconds").getByRole("checkbox").uncheck();
  await expect(page.getByTestId("ai-confirm-apply")).toBeEnabled();
});

test("from the AI page (saved proposals): result -> choose scenario -> draft entry screen -> the preview appears on the chosen draft", async ({ page }) => {
  const ai = newAiMock({ pendingPolls: 0 });
  const request = seedRequest(ai, { operation: "ScenarioDraft" });
  const editor = editorMock({ drafts: [{ id: DRAFT_ID, draftNumber: 3, version: 51, updatedAt: "2026-10-02T00:00:00Z", lastEditedByName: null, schemaVersion: "fet3d.editor/1" }], currentDraftId: DRAFT_ID });
  await installEditorMocks(page, editor);
  await mockAi(page, ai);
  await page.goto(`/workspace/ai?tab=saved&request=${request.requestId}`);
  await page.getByTestId("ai-apply").click();
  const chooser = page.getByRole("dialog", { name: "Áp dụng đề xuất vào bản nháp" });
  await expect(chooser.getByRole("combobox", { name: "Công trình" })).toContainText("Tòa nhà A");
  await expect(chooser.getByRole("combobox", { name: "Kịch bản" })).toContainText("Thoát hiểm tầng một");
  await page.getByTestId("ai-open-editor").click();
  await expect(page).toHaveURL(new RegExp(`/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}\\?aiRequest=${request.requestId}`));
  await page.getByTestId(`open-draft-${DRAFT_ID}`).click();
  await expect(page.getByTestId("ai-apply-dialog")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`draft=${DRAFT_ID}.*aiRequest=${request.requestId}`));
  expect(editor.puts).toHaveLength(0);
});

test("a legacy (non-v1) draft explains why the proposal cannot be applied", async ({ page }) => {
  const ai = newAiMock();
  const request = seedRequest(ai, { operation: "ScenarioDraft" });
  const editor = newMock(); // legacy sample state
  await openEditor(page, editor, ai, `${EDITOR_URL}&aiRequest=${request.requestId}`);
  await expect(page.getByText("Đề xuất AI chỉ áp dụng được vào bản nháp soạn trên mô hình 3D")).toBeVisible();
  await expect(page.getByTestId("ai-apply-dialog")).toHaveCount(0);
});
