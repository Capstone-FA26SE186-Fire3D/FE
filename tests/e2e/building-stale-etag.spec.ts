import { expect, test, type Page, type Route } from "@playwright/test";

// When the first read of a Building has no readable ETag, the save reads the Building again. That ETag belongs to the data
// read with it: if the data moved on, the FE must show the newer version instead of sending the old fields under the new
// ETag (which the server would accept and silently overwrite the newer coordinates). Network is mocked with Playwright routes.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const location = (lat: number) => ({ id: "loc-1", address: "1 Lê Lợi", city: "Hồ Chí Minh", district: "Quận 1", latitude: lat, longitude: lat, geojson: null });
const building = { id: "building-1", name: "Trường Tiểu học", buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: location(1), contact: null };
const moved = { ...building, updatedAt: "2026-10-06T08:00:00Z", location: location(10) };
const summary = { id: building.id, name: building.name, buildingType: building.buildingType, totalFloors: building.totalFloors, isActive: true, createdAt: building.createdAt, updatedAt: building.updatedAt };

type Write = { ifMatch?: string; body: { location?: { latitude?: number } | null; name?: string } };

async function session(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" }));
    localStorage.setItem("fire3d-org-tour", "done"); // the spotlight tour must never cover the page under test
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
  await page.route("**/api/buildings?*", (route) => route.fulfill({ json: { items: [summary], totalCount: 1, page: 1, pageSize: 20 } }));
  await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
  await page.route("**/api/buildings/building-1/scenarios?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
}

/** First GET has no ETag (header not exposed); later GETs return `later` with ETag "9". PUTs are recorded and succeed. */
function detail(writes: Write[], later: typeof building) {
  let gets = 0;
  return async (route: Route) => {
    const request = route.request();
    if (request.method() === "GET") {
      gets += 1;
      return gets === 1 ? route.fulfill({ json: building }) : route.fulfill({ json: later, headers: { ETag: '"9"' } });
    }
    writes.push({ ifMatch: request.headers()["if-match"], body: request.postDataJSON() });
    return route.fulfill({ json: { ...later, name: (request.postDataJSON() as { name: string }).name }, headers: { ETag: '"10"' } });
  };
}

for (const where of ["list", "overview"] as const) {
  test.describe(`Building save without a first ETag (${where})`, () => {
    const open = async (page: Page) => {
      if (where === "list") {
        // List v2: "Sửa thông tin" sits in the "···" menu of the row.
        await page.goto("/workspace/buildings");
        await page.locator(`tr[data-row-id="${building.id}"]`).getByRole("button", { name: "Thao tác" }).click();
        await page.getByRole("menuitem", { name: /^Sửa thông tin/ }).click();
      } else {
        // Detail v2: "Sửa thông tin" on the "Thông tin công trình" card of the Hành trình tab.
        await page.goto("/workspace/buildings/building-1");
        await page.getByRole("button", { name: "Sửa thông tin" }).click();
      }
      const dialog = page.getByRole("dialog", { name: "Sửa thông tin công trình" });
      await dialog.getByLabel("Tên công trình", { exact: true }).fill("Tên của tôi");
    };

    test("data changed meanwhile: no PUT, the newer version is shown, the retry keeps its coordinates", async ({ page }) => {
      await session(page);
      const writes: Write[] = [];
      await page.route("**/api/buildings/building-1", detail(writes, moved));
      await open(page);
      await page.getByRole("button", { name: "Lưu thay đổi" }).click();
      await expect(page.getByTestId("building-conflict")).toContainText("Công trình vừa được thay đổi ở nơi khác");
      await expect(page.getByLabel("Tên công trình", { exact: true })).toHaveValue("Tên của tôi");
      expect(writes).toHaveLength(0);

      await page.getByRole("button", { name: "Lưu thay đổi" }).click();
      await expect(page.getByText("Đã lưu công trình")).toBeVisible();
      expect(writes).toHaveLength(1);
      expect(writes[0].ifMatch).toBe('"9"');
      expect(writes[0].body.name).toBe("Tên của tôi");
      expect(writes[0].body.location?.latitude).toBe(10); // not the stale 1
    });

    test("data unchanged: saves at once with the ETag read at save time", async ({ page }) => {
      await session(page);
      const writes: Write[] = [];
      await page.route("**/api/buildings/building-1", detail(writes, building));
      await open(page);
      await page.getByRole("button", { name: "Lưu thay đổi" }).click();
      await expect(page.getByText("Đã lưu công trình")).toBeVisible();
      await expect(page.getByTestId("building-conflict")).toHaveCount(0);
      expect(writes).toHaveLength(1);
      expect(writes[0].ifMatch).toBe('"9"');
      expect(writes[0].body.location?.latitude).toBe(1);
    });
  });
}
