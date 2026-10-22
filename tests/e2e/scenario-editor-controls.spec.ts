import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { EDITOR_URL, installEditorMocks, newMock } from "../fixtures/scenario-editor/mock-api";
import { ARTIFACT_ID, GEOMETRY_HASH, SAMPLE_RUNTIME_CATALOG } from "../fixtures/scenario-editor/v1-fixtures";

/**
 * EVIDENCE LEVEL: mock. Floating viewport controls (UIArc Floating Button Group style): top pill, vertical rail, contextual bar.
 * Zoom/fit/lock/eye are browser-only; "Kiểm tra" calls validate-state; copy/delete edit the draft (undoable).
 */

const v1State = (): Record<string, unknown> => ({ ...(JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scenario-editor", "v1", "scenario-state.valid.json"), "utf8")) as Record<string, unknown>), geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH } });

async function open(page: import("@playwright/test").Page) {
  const mock = newMock({ state: v1State(), previewKind: "v1", catalog: SAMPLE_RUNTIME_CATALOG });
  await installEditorMocks(page, mock);
  await page.goto(EDITOR_URL);
  await expect(page.getByTestId("model-info")).toBeVisible({ timeout: 20_000 });
  return mock;
}

test("rail: zoom and fit are enabled with a model, lock freezes them, the eye hides and shows the model", async ({ page }) => {
  await open(page);
  const rail = page.getByRole("group", { name: "Điều khiển khung nhìn" });
  await expect(rail.getByRole("button", { name: "Phóng to" })).toBeEnabled();
  await expect(rail.getByRole("button", { name: "Vừa khung nhìn" })).toBeEnabled();
  await rail.getByRole("button", { name: "Phóng to" }).click();
  await rail.getByRole("button", { name: "Thu nhỏ" }).click();

  const lock = rail.getByRole("button", { name: "Khóa khung nhìn" });
  await lock.click();
  await expect(rail.getByRole("button", { name: "Mở khóa khung nhìn" })).toHaveAttribute("aria-pressed", "true");
  await expect(rail.getByRole("button", { name: "Phóng to" })).toBeDisabled();
  await expect(rail.getByRole("button", { name: "Vừa khung nhìn" })).toBeDisabled();
  await rail.getByRole("button", { name: "Mở khóa khung nhìn" }).click();
  await expect(rail.getByRole("button", { name: "Phóng to" })).toBeEnabled();

  await rail.getByRole("button", { name: "Ẩn mô hình" }).click();
  await expect(rail.getByRole("button", { name: "Hiện mô hình" })).toHaveAttribute("aria-pressed", "true");
  await rail.getByRole("button", { name: "Hiện mô hình" }).click();
  await expect(rail.getByRole("button", { name: "Ẩn mô hình" })).toBeVisible();
});

test("fit is disabled when there is no model to fit", async ({ page }) => {
  const mock = newMock({ state: v1State(), previewKind: "v1", catalog: SAMPLE_RUNTIME_CATALOG });
  await installEditorMocks(page, mock);
  await page.route("**/api/buildings/*/editor-preview?*", (route) => route.fulfill({ json: { status: "NotReady", revisionStatus: "Uploaded", artifactId: null, downloadUrl: null, floors: null, coordinateTransform: null, semanticMapping: null } }));
  await page.goto(EDITOR_URL);
  const rail = page.getByRole("group", { name: "Điều khiển khung nhìn" });
  await expect(rail.getByRole("button", { name: "Vừa khung nhìn" })).toBeDisabled();
  await expect(rail.getByRole("button", { name: "Hiện mô hình" }).or(rail.getByRole("button", { name: "Ẩn mô hình" }))).toBeDisabled();
});

test("pill: undo and redo follow the history; the check calls validate-state without saving", async ({ page }) => {
  const mock = await open(page);
  await expect(page.getByTestId("undo")).toBeDisabled();
  await page.getByTestId("object-item-1").click();
  await page.getByTestId("ctx-copy").click();
  await expect(page.getByTestId("undo")).toBeEnabled();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("redo")).toBeEnabled();
  await page.getByRole("button", { name: "Kiểm tra bản nháp" }).click();
  await expect.poll(() => mock.validateStateCalls.length).toBe(1);
  expect(mock.puts).toHaveLength(0);
});

test("contextual bar: copy duplicates the selected object, focus is enabled, delete removes it; both undo", async ({ page }) => {
  const mock = await open(page);
  const items = page.locator("[data-testid^='object-item-']");
  const before = await items.count();
  await page.getByTestId("object-item-1").click();
  const bar = page.getByRole("toolbar", { name: "Đối tượng đang chọn" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Căn camera vào đối tượng" })).toBeEnabled();

  await bar.getByRole("button", { name: "Nhân bản đối tượng" }).click();
  await expect(items).toHaveCount(before + 1);
  await expect(page.getByTestId("save-status")).toHaveText("Chưa lưu");

  await page.getByRole("toolbar", { name: "Đối tượng đang chọn" }).getByRole("button", { name: "Xóa đối tượng" }).click();
  await expect(items).toHaveCount(before);
  await page.getByTestId("undo").click();
  await expect(items).toHaveCount(before + 1);
  expect(mock.puts).toHaveLength(0);
});
