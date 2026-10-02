import { expect, test } from "@playwright/test";

test("OrganizationUser can create, validate, save and snapshot a scenario draft with its ETag", async ({ page }) => {
  const token = "organization-access-token";
  const initialState = {
    spawnPoints: [{ x: 0, y: 0, z: 0, rotation: 0 }],
    hazards: [],
    scoringConfig: { baseScore: 100, timeLimitSeconds: 300, penaltyPerMistake: 5 },
    routingConfig: { evacuationRoutes: [] },
  };
  let createdScenario: unknown;
  let createdDraft: unknown;
  let savedState: unknown;
  let ifMatch: string | undefined;

  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "org-user", email: "owner@fire3d.test", fullName: "Owner", role: 1, organizationId: "org-1" } }));
  await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: { items: [{ id: "revision-1", buildingId: "building-1", versionLabel: "IFC rev. 01", status: "Processed", createdAt: "2026-10-01T00:00:00Z", sourceDocument: null }], totalCount: 1, page: 1, pageSize: 20 } }));
  await page.route("**/api/buildings/building-1/scenarios?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
  await page.route("**/api/scenarios", async (route) => {
    createdScenario = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "scenario-1" } });
  });
  await page.route("**/api/scenarios/scenario-1/draft", async (route) => {
    createdDraft = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "draft-1" } });
  });
  await page.route("**/api/scenario-drafts/draft-1", async (route) => {
    if (route.request().method() === "PUT") {
      savedState = route.request().postDataJSON();
      ifMatch = route.request().headers()["if-match"];
      await route.fulfill({ status: 204, headers: { ETag: "\"52\"" } });
      return;
    }
    await route.fulfill({ json: { id: "draft-1", scenarioId: "scenario-1", revisionId: "revision-1", buildingId: "building-1", organizationId: "org-1", draftNumber: 1, state: initialState, source: "Manual", lastAiRequestId: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", version: 51 }, headers: { ETag: "\"51\"" } });
  });
  await page.route("**/api/scenario-drafts/draft-1/validate", (route) => route.fulfill({ json: { draftId: "draft-1", version: 51, isValid: true, issues: [] } }));
  await page.route("**/api/scenario-drafts/draft-1/snapshot", (route) => route.fulfill({ status: 201, json: { id: "scenario-version-1" } }));

  await page.goto("/workspace/buildings/building-1/scenarios");

  await expect(page.getByRole("heading", { name: "Kịch bản diễn tập" })).toBeVisible();
  await page.getByLabel("Tên kịch bản").fill("Thoát hiểm tầng một");
  await page.getByRole("button", { name: "Tạo scenario và draft" }).click();
  await expect.poll(() => createdScenario).toEqual({ buildingId: "building-1", name: "Thoát hiểm tầng một" });
  await expect.poll(() => createdDraft).toEqual({ revisionId: "revision-1" });

  const editedState = { ...initialState, scoringConfig: { ...initialState.scoringConfig, timeLimitSeconds: 240 } };
  await page.getByLabel("Trạng thái draft JSON").fill(JSON.stringify(editedState, null, 2));
  await page.getByRole("button", { name: "Lưu draft" }).click();
  await expect.poll(() => savedState).toEqual(editedState);
  await expect.poll(() => ifMatch).toBe("\"51\"");

  await page.getByRole("button", { name: "Kiểm tra draft" }).click();
  await expect(page.getByText("Draft hợp lệ về cấu trúc.")).toBeVisible();
  await page.getByRole("button", { name: "Tạo snapshot phiên bản" }).click();
  await expect(page.getByText("Đã tạo snapshot scenario-version-1.")).toBeVisible();
});
