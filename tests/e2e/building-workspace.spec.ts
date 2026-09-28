import { expect, test } from "@playwright/test";

test("OrganizationUser can inspect a revision and request IFC processing through the VPS API", async ({ page }) => {
  const token = "organization-access-token";
  const building = { id: "building-1", name: "Trường Tiểu học", buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z", location: null, contact: null };
  const revision = { id: "revision-1", buildingId: building.id, versionLabel: "Bản IFC 01", status: "NeedsFix", createdAt: "2026-09-28T00:00:00Z", sourceDocument: { id: "source-1", originalFilename: "school.ifc", fileSizeBytes: 128, quarantineStatus: "Clean", createdAt: "2026-09-28T00:00:00Z" } };
  let processRequested = false;

  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: token, refreshToken: "refresh-token" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { id: "org-user", email: "owner@fire3d.test", fullName: "Owner", role: 1, organizationId: "org-1" } }));
  await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building }));
  await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: { items: [revision], totalCount: 1, page: 1, pageSize: 20 } }));
  await page.route("**/api/revisions/revision-1/processing-jobs?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
  await page.route("**/api/revisions/revision-1/issues?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 50 } }));
  await page.route("**/api/revisions/revision-1/bim-facts?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 50 } }));
  await page.route("**/api/revisions/revision-1/annotations", (route) => route.fulfill({ json: { revisionId: revision.id, id: null, version: 0, data: { items: [] }, provenance: null, createdBy: null, createdAt: null, eTag: "0" } }));
  await page.route("**/api/buildings/building-1/editor-preview?*", (route) => route.fulfill({ status: 404, json: { title: "Preview not ready" } }));
  await page.route("**/api/revisions/revision-1/process", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    processRequested = true;
    await route.fulfill({ status: 202 });
  });

  await page.goto("/workspace/buildings/building-1");

  await expect(page.getByRole("heading", { name: "Trường Tiểu học" })).toBeVisible();
  await expect(page.getByText("Bản IFC 01", { exact: true })).toBeVisible();
  await expect(page.getByText("NeedsFix", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Annotation overlay" })).toBeVisible();
  await page.getByRole("button", { name: "Chạy xử lý IFC" }).click();
  await expect.poll(() => processRequested).toBe(true);
  await expect(page.getByText("Đã gửi yêu cầu xử lý IFC.")).toBeVisible();
});
