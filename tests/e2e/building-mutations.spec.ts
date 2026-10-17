import { expect, test, type Page, type Route } from "@playwright/test";

// Building create/update/archive headers (BE#94, FE#48): POST needs Idempotency-Key, PUT/DELETE need If-Match with the
// ETag of the latest read. All network is mocked with Playwright routes: evidence for UI behaviour, not for BE integration.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const building = { id: "building-1", name: "Trường Tiểu học", buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: null, contact: null };
const summary = { id: building.id, name: building.name, buildingType: building.buildingType, totalFloors: building.totalFloors, isActive: true, createdAt: building.createdAt, updatedAt: building.updatedAt };
const newer = { ...building, name: "Trường Tiểu học (đã đổi tên)", totalFloors: 4, updatedAt: "2026-10-06T08:00:00Z" };

type Write = { method: string; ifMatch?: string; key?: string; body: unknown };

async function session(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
  await page.route("**/api/buildings?*", (route) => route.fulfill({ json: { items: [summary], totalCount: 1, page: 1, pageSize: 20 } }));
  await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
}

const record = (writes: Write[], route: Route) => {
  const request = route.request();
  writes.push({ method: request.method(), ifMatch: request.headers()["if-match"], key: request.headers()["idempotency-key"], body: request.postDataJSON() });
};

test.describe("Building mutations: Idempotency-Key and If-Match", () => {
  test("create sends an Idempotency-Key and reuses it when the same payload is retried after a lost response", async ({ page }) => {
    await session(page);
    const writes: Write[] = [];
    await page.route("**/api/buildings", async (route) => {
      record(writes, route);
      if (writes.length === 1) return route.abort("timedout"); // stored by the server, response lost
      return route.fulfill({ status: 201, json: building, headers: { ETag: '"1"' } });
    });
    await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building, headers: { ETag: '"1"' } }));
    await page.goto("/workspace/buildings");
    await page.getByRole("button", { name: "Tạo công trình", exact: true }).click();
    await page.getByLabel("Tên công trình", { exact: true }).fill("Công trình mới");
    await page.getByRole("button", { name: "Tạo và thêm IFC" }).click();
    await expect(page.getByText(/Nội dung bạn nhập vẫn được giữ lại/)).toBeVisible();
    await page.getByRole("button", { name: "Tạo và thêm IFC" }).click();
    await expect(page).toHaveURL(/\/workspace\/buildings\/building-1$/);
    expect(writes).toHaveLength(2);
    expect(writes[0].key).toBeTruthy();
    expect(writes[1].key).toBe(writes[0].key);
  });

  test("a changed payload or a 409 IDEMPOTENCY_KEY_CONFLICT gets a new key", async ({ page }) => {
    await session(page);
    const writes: Write[] = [];
    await page.route("**/api/buildings", async (route) => {
      record(writes, route);
      if (writes.length === 1) return route.fulfill({ status: 500, json: { title: "x" } });
      if (writes.length === 2) return route.fulfill({ status: 409, contentType: "application/problem+json", body: JSON.stringify({ status: 409, title: "conflict", code: "IDEMPOTENCY_KEY_CONFLICT" }) });
      return route.fulfill({ status: 201, json: building, headers: { ETag: '"1"' } });
    });
    await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building, headers: { ETag: '"1"' } }));
    await page.goto("/workspace/buildings");
    await page.getByRole("button", { name: "Tạo công trình", exact: true }).click();
    await page.getByLabel("Tên công trình", { exact: true }).fill("Công trình A");
    await page.getByRole("button", { name: "Tạo và thêm IFC" }).click();
    await expect(page.getByText(/Nội dung bạn nhập vẫn được giữ lại/)).toBeVisible();
    await page.getByLabel("Tên công trình", { exact: true }).fill("Công trình B");
    await page.getByRole("button", { name: "Tạo và thêm IFC" }).click();
    await expect(page.getByText(/Khóa chống tạo trùng đã được dùng cho nội dung khác/)).toBeVisible();
    await page.getByRole("button", { name: "Tạo và thêm IFC" }).click();
    await expect(page).toHaveURL(/\/workspace\/buildings\/building-1$/);
    expect(new Set(writes.map((write) => write.key)).size).toBe(3);
  });

  test("edit sends If-Match; a 412 shows the newer version, keeps the input and the retry uses the new ETag", async ({ page }) => {
    await session(page);
    const writes: Write[] = [];
    await page.route("**/api/buildings/building-1", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: building, headers: { ETag: '"5"' } });
      record(writes, route);
      if (writes.length === 1) return route.fulfill({ status: 412, contentType: "application/problem+json", headers: { ETag: '"6"' }, body: JSON.stringify({ status: 412, title: "stale", code: "PRECONDITION_FAILED", current: newer }) });
      return route.fulfill({ json: { ...newer, name: "Tên của tôi" }, headers: { ETag: '"7"' } });
    });
    await page.goto("/workspace/buildings");
    await page.getByRole("button", { name: `Chỉnh sửa ${building.name}` }).click();
    await page.getByLabel("Tên công trình", { exact: true }).fill("Tên của tôi");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    const conflict = page.getByTestId("building-conflict");
    await expect(conflict).toContainText("Công trình vừa được thay đổi ở nơi khác");
    await expect(conflict).toContainText(newer.name);
    await expect(conflict).toContainText("4 tầng");
    await expect(page.getByLabel("Tên công trình", { exact: true })).toHaveValue("Tên của tôi");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText("Đã lưu công trình")).toBeVisible();
    expect(writes.map((write) => write.ifMatch)).toEqual(['"5"', '"6"']);
  });

  test("“Dùng bản mới nhất” loads the server version into the form and saves on top of its ETag", async ({ page }) => {
    await session(page);
    const writes: Write[] = [];
    await page.route("**/api/buildings/building-1", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: building, headers: { ETag: '"5"' } });
      record(writes, route);
      if (writes.length === 1) return route.fulfill({ status: 412, contentType: "application/problem+json", headers: { ETag: '"6"' }, body: JSON.stringify({ status: 412, title: "stale", code: "PRECONDITION_FAILED", current: newer }) });
      return route.fulfill({ json: newer, headers: { ETag: '"7"' } });
    });
    await page.goto("/workspace/buildings/building-1");
    await page.getByRole("button", { name: "Sửa nhanh" }).click();
    await page.getByLabel("Tên công trình", { exact: true }).fill("Tên của tôi");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await page.getByRole("button", { name: "Dùng bản mới nhất" }).click();
    await expect(page.getByLabel("Tên công trình", { exact: true })).toHaveValue(newer.name);
    await expect(page.getByLabel("Số tầng")).toHaveValue("4");
    await expect(page.getByTestId("building-conflict")).toHaveCount(0);
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText("Đã lưu công trình")).toBeVisible();
    expect(writes.map((write) => write.ifMatch)).toEqual(['"5"', '"6"']);
    expect(writes[1].body).toMatchObject({ name: newer.name, totalFloors: 4 });
  });

  test("428 PRECONDITION_REQUIRED is explained and the input is kept", async ({ page }) => {
    await session(page);
    await page.route("**/api/buildings/building-1", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: building, headers: { ETag: '"5"' } });
      return route.fulfill({ status: 428, contentType: "application/problem+json", body: JSON.stringify({ status: 428, title: "required", code: "PRECONDITION_REQUIRED" }) });
    });
    await page.goto("/workspace/buildings");
    await page.getByRole("button", { name: `Chỉnh sửa ${building.name}` }).click();
    await page.getByLabel("Tên công trình", { exact: true }).fill("Tên của tôi");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText(/Thiếu phiên bản công trình \(If-Match\)/)).toBeVisible();
    await expect(page.getByLabel("Tên công trình", { exact: true })).toHaveValue("Tên của tôi");
  });

  test("archive reads the ETag first and sends it as If-Match", async ({ page }) => {
    await session(page);
    const writes: Write[] = [];
    await page.route("**/api/buildings/building-1", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: building, headers: { ETag: '"5"' } });
      record(writes, route);
      return route.fulfill({ json: { ...summary, isActive: false }, headers: { ETag: '"6"' } });
    });
    await page.goto("/workspace/buildings");
    await page.getByRole("button", { name: `Lưu trữ ${building.name}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Lưu trữ" }).click();
    await expect(page.getByText("Đã lưu trữ công trình")).toBeVisible();
    expect(writes).toEqual([{ method: "DELETE", ifMatch: '"5"', key: undefined, body: null }]);
  });

  test("archive stops when the Building changed since the list, then a 412 race asks again with the newest ETag", async ({ page }) => {
    await session(page);
    const writes: Write[] = [];
    const newest = { ...newer, name: "Tên mới nhất", updatedAt: "2026-10-06T09:00:00Z" };
    await page.route("**/api/buildings/building-1", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: newer, headers: { ETag: '"6"' } });
      record(writes, route);
      if (writes.length === 1) return route.fulfill({ status: 412, contentType: "application/problem+json", headers: { ETag: '"7"' }, body: JSON.stringify({ status: 412, title: "stale", code: "PRECONDITION_FAILED", current: newest }) });
      return route.fulfill({ json: { ...summary, isActive: false }, headers: { ETag: '"8"' } });
    });
    await page.goto("/workspace/buildings");
    await page.getByRole("button", { name: `Lưu trữ ${building.name}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Lưu trữ" }).click();
    await expect(dialog).toContainText("Công trình vừa được thay đổi ở nơi khác");
    await expect(dialog).toContainText(newer.name);
    expect(writes).toHaveLength(0); // nothing archived without a second confirmation
    await dialog.getByRole("button", { name: "Lưu trữ" }).click();
    await expect(dialog).toContainText(newest.name);
    await dialog.getByRole("button", { name: "Lưu trữ" }).click();
    await expect(page.getByText("Đã lưu trữ công trình")).toBeVisible();
    expect(writes.map((write) => write.ifMatch)).toEqual(['"6"', '"7"']);
  });
});
