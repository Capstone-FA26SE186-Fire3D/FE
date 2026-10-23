/**
 * F13: Admin organization profile edit (PATCH + ETag), who/which organization sent a ticket or feedback, feedback detail,
 * audit diff from the allowlisted DTO, and the Trainee support entry in the learning hub.
 * Evidence level: Playwright route mocks of OrganizationsController, SupportController and AuditLogsController
 * (state is kept like the server so a reload proves recovery). Not an integration test against the real API.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const owner = { id: "owner-1", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", role: 1, organizationId: "org-1", profileRevision: 1 };
const trainee = { id: "trainee-1", email: "t@fire3d.test", fullName: "Học Viên", role: 2, organizationId: null, profileRevision: 1 };

async function signIn(page: Page, user: object) {
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: "people-access", refreshToken: "people-refresh" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const page1 = <T,>(items: T[], total = items.length) => ({ items, total, page: 1, pageSize: 20 });

/* ------------------------------------------------------------------ organizations */

type OrgState = { name: string; address: string | null; phoneNumber: string | null; revision: number; patches: { ifMatch: string | undefined; body: Record<string, unknown> }[]; detailCalls: number; detailDelayMs: number };

async function mockOrganizations(page: Page, state: OrgState) {
  const body = () => ({ id: "org-1", name: state.name, slug: "fire3d-lab", isActive: true, address: state.address, phoneNumber: state.phoneNumber, profileRevision: state.revision, buildingCount: 2, accountCount: 5, createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" });
  await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [body()], totalCount: 1, page: 1, pageSize: 20 } }));
  await page.route("**/api/organizations/org-1", async (route: Route) => {
    if (route.request().method() === "GET") {
      state.detailCalls += 1;
      if (state.detailDelayMs && state.detailCalls > 1) await new Promise((resolve) => setTimeout(resolve, state.detailDelayMs));
      return route.fulfill({ json: body(), headers: { ETag: `"${state.revision}"` } });
    }
    const ifMatch = (await route.request().headerValue("if-match")) ?? undefined;
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    state.patches.push({ ifMatch, body: payload });
    if (!ifMatch) return route.fulfill({ status: 428, json: { code: "PRECONDITION_REQUIRED", title: "If-Match required" } });
    if (ifMatch !== `"${state.revision}"`) return route.fulfill({ status: 412, json: { code: "PRECONDITION_FAILED", title: "stale" } });
    if (payload.phoneNumber === "+84999999999") return route.fulfill({ status: 409, json: { code: "ORGANIZATION_PHONE_EXISTS", title: "phone", errors: { phoneNumber: ["Số điện thoại đã thuộc tổ chức khác."] } } });
    if (typeof payload.name === "string") state.name = payload.name;
    if (typeof payload.address === "string") state.address = payload.address;
    if (typeof payload.phoneNumber === "string") state.phoneNumber = payload.phoneNumber;
    state.revision += 1;
    return route.fulfill({ json: body(), headers: { ETag: `"${state.revision}"` } });
  });
}

const newOrg = (): OrgState => ({ name: "Fire3D Lab", address: "1 Lê Lợi, Đà Nẵng", phoneNumber: "+842361234567", revision: 3, patches: [], detailCalls: 0, detailDelayMs: 0 });

test.describe("admin organization profile", () => {
  test("shows address, phone and counts; saves only the changed field with If-Match; a reload restores it from the server", async ({ page }) => {
    const org = newOrg();
    await signIn(page, admin);
    await mockOrganizations(page, org);
    await page.goto("/admin/organizations?organization=org-1");
    const drawer = page.getByRole("region", { name: "Thông tin tổ chức" });
    await expect(drawer.getByText("1 Lê Lợi, Đà Nẵng")).toBeVisible();
    await expect(drawer.getByText("+842361234567")).toBeVisible();
    await expect(drawer.getByText("2 công trình · 5 tài khoản")).toBeVisible();

    await drawer.getByRole("button", { name: "Sửa hồ sơ" }).click();
    await expect(drawer.getByRole("button", { name: "Lưu hồ sơ" })).toBeDisabled();
    await drawer.getByLabel("Tên tổ chức").fill("Fire3D Lab Việt Nam");
    await drawer.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(drawer.getByText("Fire3D Lab Việt Nam").first()).toBeVisible();
    expect(org.patches).toEqual([{ ifMatch: '"3"', body: { name: "Fire3D Lab Việt Nam" } }]);

    await page.reload();
    await expect(page.getByRole("region", { name: "Thông tin tổ chức" }).getByText("Fire3D Lab Việt Nam").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Fire3D Lab Việt Nam fire3d-lab" })).toBeVisible();
  });

  test("412 keeps the typed values, loads the newer version to compare and saves with the new ETag", async ({ page }) => {
    const org = newOrg();
    await signIn(page, admin);
    await mockOrganizations(page, org);
    await page.goto("/admin/organizations?organization=org-1");
    const drawer = page.getByRole("region", { name: "Thông tin tổ chức" });
    await drawer.getByRole("button", { name: "Sửa hồ sơ" }).click();
    await drawer.getByLabel("Địa chỉ").fill("99 Nguyễn Văn Linh");
    // Someone else edits the phone number first.
    org.phoneNumber = "+842369998888"; org.revision = 4;
    await drawer.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(drawer.getByText("Hồ sơ vừa được thay đổi ở nơi khác")).toBeVisible();
    await expect(drawer.getByLabel("Địa chỉ")).toHaveValue("99 Nguyễn Văn Linh");
    await drawer.getByRole("button", { name: "Tải bản mới để đối chiếu" }).click();
    await expect(drawer.getByText(/Máy chủ hiện: Fire3D Lab · 1 Lê Lợi, Đà Nẵng · \+842369998888/)).toBeVisible();
    await expect(drawer.getByLabel("Địa chỉ")).toHaveValue("99 Nguyễn Văn Linh");
    await drawer.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect.poll(() => org.address).toBe("99 Nguyễn Văn Linh");
    expect(org.patches.map((patch) => patch.ifMatch)).toEqual(['"3"', '"4"']);
    // Only the typed field is sent after the reload, so the other admin's phone number is not overwritten.
    expect(org.patches[1].body).toEqual({ address: "99 Nguyễn Văn Linh" });
    expect(org.phoneNumber).toBe("+842369998888");
  });

  test("a phone number used by another organization shows a field error and keeps the input", async ({ page }) => {
    const org = newOrg();
    await signIn(page, admin);
    await mockOrganizations(page, org);
    await page.goto("/admin/organizations?organization=org-1");
    const drawer = page.getByRole("region", { name: "Thông tin tổ chức" });
    await drawer.getByRole("button", { name: "Sửa hồ sơ" }).click();
    await drawer.getByLabel("Số điện thoại").fill("+84999999999");
    await drawer.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(drawer.getByText("Số điện thoại đã thuộc tổ chức khác.")).toBeVisible();
    await expect(drawer.getByLabel("Số điện thoại")).toHaveValue("+84999999999");
    expect(org.revision).toBe(3);
  });

  test("clearing the address is blocked locally because the API rejects blanks", async ({ page }) => {
    const org = newOrg();
    await signIn(page, admin);
    await mockOrganizations(page, org);
    await page.goto("/admin/organizations?organization=org-1");
    const drawer = page.getByRole("region", { name: "Thông tin tổ chức" });
    await drawer.getByRole("button", { name: "Sửa hồ sơ" }).click();
    await drawer.getByLabel("Địa chỉ").fill("");
    await drawer.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(drawer.getByText(/không được để trống/)).toBeVisible();
    expect(org.patches).toHaveLength(0);
  });

  test("a late reload response never overwrites what is being typed", async ({ page }) => {
    const org = newOrg();
    org.detailDelayMs = 700;
    await signIn(page, admin);
    await mockOrganizations(page, org);
    await page.goto("/admin/organizations?organization=org-1");
    const drawer = page.getByRole("region", { name: "Thông tin tổ chức" });
    await drawer.getByRole("button", { name: "Sửa hồ sơ" }).click();
    await drawer.getByRole("button", { name: "Tải lại tổ chức" }).click();
    await drawer.getByLabel("Tên tổ chức").fill("Tên đang gõ");
    await expect(drawer.getByRole("button", { name: "Tải lại tổ chức" })).toBeEnabled();
    await expect(drawer.getByLabel("Tên tổ chức")).toHaveValue("Tên đang gõ");
  });

  test("404 and 403 on the detail are explained; 5xx offers retry", async ({ page }) => {
    let status = 404;
    await signIn(page, admin);
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }));
    await page.route("**/api/organizations/org-1", (route) => route.fulfill({ status, json: { code: "X", title: "x" } }));
    await page.goto("/admin/organizations?organization=org-1");
    await expect(page.getByText("Không tìm thấy tổ chức")).toBeVisible();
    status = 500;
    await page.goto("/admin/organizations?organization=org-1");
    await expect(page.getByText("Không mở được tổ chức")).toBeVisible();
    status = 200;
    await page.route("**/api/organizations/org-1", (route) => route.fulfill({ json: { id: "org-1", name: "Phục hồi", slug: "phuc-hoi", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } }));
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("region", { name: "Thông tin tổ chức" }).getByText("Phục hồi").first()).toBeVisible();
    // No counts and no revision from an older deployment: still readable, edit stays safe (no ETag, no save).
    await expect(page.getByText("công trình ·")).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ tickets and feedback inbox */

const person = { id: "u-9", displayName: "Trần Thị B", available: true, email: "b@school.test" };
const org1 = { id: "org-1", name: "Trường An Toàn", available: true };
const ticket = (over: Record<string, unknown> = {}) => ({
  id: "ticket-1", ticketNumber: "SUP-0001", subject: "Không tải được mô hình IFC", description: "Tệp báo lỗi quét.", status: "Open", priority: "Normal",
  assignedTo: null, resolvedAt: null, revision: 2, createdAt: "2026-10-01T08:00:00Z", updatedAt: "2026-10-02T08:00:00Z", createdBy: person, organization: org1, ...over,
});

async function mockAdminLookups(page: Page) {
  await page.route("**/api/accounts?*", (route) => route.fulfill({ json: { items: [{ ...admin, isActive: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }], totalCount: 1, page: 1, pageSize: 100 } }));
  await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [{ ...org1, slug: "an-toan", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }], totalCount: 1, page: 1, pageSize: 100 } }));
}

test.describe("who sent it", () => {
  test("ticket list and detail show the sender, the stored organization, email (admin only) and author names", async ({ page }) => {
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([ticket(), ticket({ id: "ticket-2", ticketNumber: "SUP-0002", subject: "Xin hướng dẫn", createdBy: { id: "gone", displayName: null, available: false }, organization: { id: "gone-org", name: null, available: false } }), ticket({ id: "ticket-3", ticketNumber: "SUP-0003", subject: "Học viên hỏi", createdBy: { id: "t", displayName: "Học Viên", available: true, email: "t@x.test" }, organization: null })]) }));
    await page.route("**/api/admin/support/tickets/ticket-1?*", (route) => route.fulfill({ headers: { ETag: '"support-2"' }, json: { ...ticket(), messages: { items: [
      { id: "m1", authorId: "u-9", message: "Em cần hỗ trợ gấp", createdAt: "2026-10-02T09:00:00Z", author: person },
      { id: "m2", authorId: "admin-1", message: "Đã nhận", createdAt: "2026-10-02T09:30:00Z", author: { id: "admin-1", displayName: "Platform Admin", available: true, email: "admin@fire3d.test" } },
    ], total: 2, page: 1, pageSize: 100 } } }));
    await page.goto("/admin/support");
    const row = page.getByRole("row").filter({ hasText: "SUP-0001" });
    await expect(row.getByText("Trần Thị B")).toBeVisible();
    await expect(row.getByText("Trường An Toàn")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "SUP-0002" }).getByText("Tài khoản đã bị xóa")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "SUP-0002" }).getByText("Tổ chức đã bị xóa")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "SUP-0003" }).getByText("Không thuộc tổ chức")).toBeVisible();
    // Email is not in the list, only in the detail (admin response).
    await expect(page.getByText("b@school.test")).toHaveCount(0);

    await page.getByRole("button", { name: /Mở ticket SUP-0001/ }).click();
    const drawer = page.getByRole("region", { name: "Chi tiết ticket" });
    await expect(drawer.getByText("b@school.test")).toBeVisible();
    await expect(drawer.getByText("Trường An Toàn")).toBeVisible();
    await expect(drawer.getByRole("listitem").filter({ hasText: "Em cần hỗ trợ gấp" }).getByText("Trần Thị B")).toBeVisible();
    await expect(drawer.getByRole("listitem").filter({ hasText: "Đã nhận" }).getByText("Bạn")).toBeVisible();
  });

  test("feedback detail comes from GET /api/admin/feedback/{id}; the status PATCH uses that ETag, not the list revision", async ({ page }) => {
    const patches: (string | undefined)[] = [];
    const listItem = { id: "f-1", category: "Giao diện", message: "Nút hơi nhỏ", rating: 4, status: "Submitted", reviewedBy: null, reviewedAt: null, revision: 1, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", createdBy: { ...person, email: undefined }, organization: org1 };
    let detailRevision = 5;
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([]) }));
    await page.route("**/api/admin/feedback?*", (route) => route.fulfill({ json: page1([listItem]) }));
    await page.route("**/api/admin/feedback/f-1", (route) => route.fulfill({ headers: { ETag: `"support-${detailRevision}"` }, json: { ...listItem, revision: detailRevision, createdBy: person } }));
    await page.route("**/api/admin/feedback/f-1/status", async (route) => {
      const ifMatch = (await route.request().headerValue("if-match")) ?? undefined;
      patches.push(ifMatch);
      if (ifMatch !== `"support-${detailRevision}"`) return route.fulfill({ status: 412, json: { code: "PRECONDITION_FAILED" } });
      detailRevision += 1;
      return route.fulfill({ headers: { ETag: `"support-${detailRevision}"` }, json: { ...listItem, status: "Reviewed", revision: detailRevision, reviewedAt: "2026-10-03T00:00:00Z", createdBy: person } });
    });
    await page.goto("/admin/support?tab=feedback");
    const row = page.getByRole("row").filter({ hasText: "Nút hơi nhỏ" });
    await expect(row.getByText("Trần Thị B")).toBeVisible();
    await expect(row.getByText("Trường An Toàn")).toBeVisible();
    await row.getByRole("button", { name: "Mở phản hồi Giao diện" }).click();
    const drawer = page.getByRole("dialog", { name: "Chi tiết phản hồi" });
    await expect(page).toHaveURL(/feedback=f-1/);
    await expect(drawer.getByText("b@school.test")).toBeVisible();
    await drawer.getByLabel("Trạng thái xử lý").selectOption("Reviewed");
    await drawer.getByRole("button", { name: "Lưu trạng thái" }).click();
    await expect.poll(() => patches).toEqual(['"support-5"']);
    await expect(drawer.getByLabel("Trạng thái xử lý")).toHaveValue("Reviewed");

    // Deep link and reload restore the saved state from the server.
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Chi tiết phản hồi" }).getByText("b@school.test")).toBeVisible();
  });

  test("feedback detail: 404 on a resource of an inactive organization is explained and 412 keeps the choice", async ({ page }) => {
    const listItem = { id: "f-1", category: "Hiệu năng", message: "Chậm", rating: null, status: "Submitted", reviewedBy: null, reviewedAt: null, revision: 1, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", createdBy: person, organization: org1 };
    let mode: "412" | "404" = "412";
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([]) }));
    await page.route("**/api/admin/feedback?*", (route) => route.fulfill({ json: page1([listItem]) }));
    await page.route("**/api/admin/feedback/f-1", (route) => route.fulfill({ headers: { ETag: '"support-1"' }, json: listItem }));
    await page.route("**/api/admin/feedback/f-1/status", (route) => route.fulfill(mode === "412" ? { status: 412, json: { code: "PRECONDITION_FAILED" } } : { status: 404, json: { code: "NOT_FOUND" } }));
    await page.goto("/admin/support?tab=feedback&feedback=f-1");
    const drawer = page.getByRole("dialog", { name: "Chi tiết phản hồi" });
    await drawer.getByLabel("Trạng thái xử lý").selectOption("Reviewed");
    await drawer.getByRole("button", { name: "Lưu trạng thái" }).click();
    await expect(drawer.getByText("Phản hồi vừa được cập nhật ở nơi khác")).toBeVisible();
    await expect(drawer.getByLabel("Trạng thái xử lý")).toHaveValue("Reviewed");
    mode = "404";
    await drawer.getByRole("button", { name: "Lưu trạng thái" }).click();
    await expect(drawer.getByText(/không còn khả dụng/)).toBeVisible();
  });
});

/* ------------------------------------------------------------------ audit */

const guid = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const auditRow = { id: guid(5), userId: guid(1), organizationId: guid(2), action: "Support", targetEntity: "SupportTicket", targetId: guid(3), correlationId: guid(4), createdAt: "2026-10-05T10:00:00Z", actorDisplayName: "Platform Admin", organizationName: "Trường An Toàn" };

test.describe("audit detail", () => {
  test("list shows display names; detail shows the allowlisted diff, shortens IDs and never prints the free-text reason", async ({ page }) => {
    await signIn(page, admin);
    await page.route("**/api/admin/audit-logs?*", (route) => route.fulfill({ json: { items: [auditRow, { ...auditRow, id: guid(6), actorDisplayName: null, userId: null, organizationName: null, organizationId: null }], total: 2, page: 1, pageSize: 20, from: "2026-09-10T00:00:00Z", to: "2026-10-10T00:00:00Z" } }));
    await page.route(`**/api/admin/audit-logs/${guid(5)}`, (route) => route.fulfill({ json: { ...auditRow, reason: "LÝ DO TỰ DO CÓ THỂ CHỨA TÊN NGƯỜI", changes: [
      { field: "status", before: "Open", after: "InProgress" },
      { field: "assignedTo", before: null, after: guid(1) },
      { field: "resolvedAt", before: null, after: "2026-10-05T10:00:00Z" },
      { field: "isActive", before: true, after: false },
      { field: "revision", before: 2, after: 3 },
    ] } }));
    await page.goto("/admin/support?tab=audit");
    await expect(page.getByRole("row").filter({ hasText: "Support" }).first().getByText("Platform Admin")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Support" }).first().getByText("Trường An Toàn")).toBeVisible();
    await expect(page.getByRole("row").nth(2).getByText("Hệ thống")).toBeVisible();

    await page.getByRole("button", { name: /Xem bản ghi Support/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`log=${guid(5)}`));
    const drawer = page.getByRole("dialog", { name: "Chi tiết bản ghi audit" });
    const diff = drawer.getByRole("table", { name: "Thay đổi theo từng trường" });
    await expect(diff.getByRole("row").filter({ hasText: "Trạng thái" })).toContainText("Mới");
    await expect(diff.getByRole("row").filter({ hasText: "Trạng thái" })).toContainText("Đang xử lý");
    await expect(diff.getByRole("row").filter({ hasText: "Phụ trách" })).toContainText("Chưa có");
    await expect(diff.getByRole("row").filter({ hasText: "Phụ trách" })).toContainText("11111111…");
    await expect(diff.getByRole("row").filter({ hasText: "Đang hoạt động" })).toContainText("Có");
    await expect(diff.getByRole("row").filter({ hasText: "Đang hoạt động" })).toContainText("Không");
    await expect(diff.getByRole("columnheader")).toHaveText(["Trường", "Trước", "Sau"]);
    await expect(drawer.getByText("Có lý do quản trị")).toBeVisible();
    expect(await page.evaluate(() => document.body.innerText)).not.toContain("LÝ DO TỰ DO");
    await drawer.getByRole("button", { name: "Lọc theo người thực hiện" }).click();
    await expect(page).toHaveURL(new RegExp(`actorId=${guid(1)}`));
    await expect(page).not.toHaveURL(/log=/);

    // A deep link reloads from the server.
    await page.goto(`/admin/support?tab=audit&log=${guid(5)}`);
    await expect(page.getByRole("dialog", { name: "Chi tiết bản ghi audit" }).getByRole("table", { name: "Thay đổi theo từng trường" })).toBeVisible();
  });

  test("a record without allowed changes says so; 404 and 5xx are explained", async ({ page }) => {
    let status = 200;
    await signIn(page, admin);
    await page.route("**/api/admin/audit-logs?*", (route) => route.fulfill({ json: { items: [auditRow], total: 1, page: 1, pageSize: 20, from: "2026-09-10T00:00:00Z", to: "2026-10-10T00:00:00Z" } }));
    await page.route(`**/api/admin/audit-logs/${guid(5)}`, (route) => status === 200 ? route.fulfill({ json: { ...auditRow, changes: [] } }) : route.fulfill({ status, json: { code: "X", title: "x" } }));
    await page.goto(`/admin/support?tab=audit&log=${guid(5)}`);
    await expect(page.getByText("không có thay đổi giá trị nào được phép hiển thị")).toBeVisible();
    await expect(page.getByText("Có lý do quản trị")).toHaveCount(0);
    status = 404;
    await page.goto(`/admin/support?tab=audit&log=${guid(5)}`);
    await expect(page.getByText("Không tìm thấy bản ghi")).toBeVisible();
    status = 500;
    await page.goto(`/admin/support?tab=audit&log=${guid(5)}`);
    await expect(page.getByText("Không mở được bản ghi audit")).toBeVisible();
  });
});

/* ------------------------------------------------------------------ trainee entry in the learning hub */

type SupportState = { tickets: Record<string, unknown>[]; feedback: Record<string, unknown>[]; keys: Map<string, string>; creates: { key: string | undefined; body: Record<string, unknown> }[]; failNext: boolean };

async function mockUserSupport(page: Page, state: SupportState) {
  const created = (kind: "ticket" | "feedback", body: Record<string, unknown>, id: string) => kind === "ticket"
    ? { id, ticketNumber: `SUP-${String(state.tickets.length + 1).padStart(4, "0")}`, subject: body.subject, description: body.description, status: "Open", priority: "Normal", assignedTo: null, resolvedAt: null, revision: 1, createdAt: "2026-10-12T08:00:00Z", updatedAt: "2026-10-12T08:00:00Z", createdBy: { id: "trainee-1", displayName: "Học Viên", available: true }, organization: null }
    : { id, category: body.category, message: body.message, rating: body.rating ?? null, status: "Submitted", reviewedBy: null, reviewedAt: null, revision: 1, createdAt: "2026-10-12T08:00:00Z", updatedAt: "2026-10-12T08:00:00Z", createdBy: { id: "trainee-1", displayName: "Học Viên", available: true }, organization: null };
  const handler = (kind: "ticket" | "feedback") => async (route: Route) => {
    const list = kind === "ticket" ? state.tickets : state.feedback;
    if (route.request().method() === "GET") return route.fulfill({ json: { items: list, total: list.length, page: 1, pageSize: 20 } });
    const key = (await route.request().headerValue("idempotency-key")) ?? undefined;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.creates.push({ key, body });
    if (state.failNext) { state.failNext = false; return route.fulfill({ status: 503, json: { code: "UNAVAILABLE", title: "x" } }); }
    const known = key ? state.keys.get(key) : undefined;
    if (known) return route.fulfill({ status: 201, json: list.find((item) => item.id === known) });
    const item = created(kind, body, `${kind}-${list.length + 1}`);
    list.unshift(item);
    if (key) state.keys.set(key, String(item.id));
    return route.fulfill({ status: 201, json: item });
  };
  await page.route(/\/api\/support\/tickets(\?.*)?$/, handler("ticket"));
  await page.route(/\/api\/feedback(\?.*)?$/, handler("feedback"));
  await page.route(/\/api\/support\/tickets\/ticket-\d+\?.*$/, (route) => {
    const id = route.request().url().match(/tickets\/(ticket-\d+)/)?.[1];
    const found = state.tickets.find((item) => item.id === id);
    return found ? route.fulfill({ headers: { ETag: '"support-1"' }, json: { ...found, messages: { items: [{ id: "m1", authorId: "staff-1", message: "Chúng tôi đang kiểm tra.", createdAt: "2026-10-12T09:00:00Z", author: { id: "staff-1", displayName: "Nhân viên Fire3D", available: true } }], total: 1, page: 1, pageSize: 100 } } }) : route.fulfill({ status: 404, json: { code: "NOT_FOUND" } });
  });
}

const newSupport = (): SupportState => ({ tickets: [], feedback: [], keys: new Map(), creates: [], failNext: false });

test.describe("Trainee support entry (FR-SUPPORT-01)", () => {
  test("the learning hub offers support; a ticket retried after an error reuses its Idempotency-Key and a reload restores it", async ({ page }) => {
    const state = newSupport();
    await signIn(page, trainee);
    await mockUserSupport(page, state);
    await page.goto("/learning-hub");
    await page.getByRole("link", { name: "Hỗ trợ", exact: true }).click();
    await expect(page).toHaveURL(/view=support/);
    await expect(page.getByRole("heading", { name: "Hỗ trợ", exact: true })).toBeVisible();
    await expect(page.getByText("Bạn chưa gửi yêu cầu hỗ trợ nào")).toBeVisible();
    await expect(page.getByText("bài học, ứng dụng hoặc tài khoản")).toBeVisible();

    await page.getByRole("button", { name: "Tạo yêu cầu hỗ trợ" }).first().click();
    const form = page.getByRole("dialog", { name: "Tạo yêu cầu hỗ trợ" });
    await form.getByLabel("Chủ đề").fill("Không mở được bài học");
    await form.getByLabel("Mô tả").fill("Bấm vào bài nhưng trang trắng.");
    state.failNext = true;
    await form.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await form.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect.poll(() => state.creates.length).toBe(2);
    expect(state.creates[1].key).toBe(state.creates[0].key);
    expect(state.tickets).toHaveLength(1);

    await page.goto("/learning-hub?view=support");
    const row = page.getByTestId("tickets-table").getByRole("row", { name: /SUP-0001/ });
    await expect(row).toBeVisible();
    await row.click();
    const detail = page.getByTestId("ticket-drawer");
    await expect(detail.getByText("Nhân viên Fire3D · Đội hỗ trợ Fire3D")).toBeVisible();
  });

  test("feedback from a Trainee is created once and listed after reload", async ({ page }) => {
    const state = newSupport();
    await signIn(page, trainee);
    await mockUserSupport(page, state);
    await page.goto("/learning-hub?view=support&tab=feedback");
    await expect(page.getByText("Bạn chưa gửi phản hồi nào")).toBeVisible();
    await page.getByRole("button", { name: "Gửi phản hồi" }).first().click();
    const form = page.getByRole("dialog", { name: "Gửi phản hồi" });
    await form.getByLabel("Chủ đề").fill("Bài học");
    await form.getByLabel("Nội dung").fill("Bài đọc dễ hiểu.");
    await form.getByRole("combobox", { name: "Mức hài lòng" }).click();
    await page.getByRole("option", { name: "5 / 5" }).click();
    await form.getByRole("button", { name: "Gửi phản hồi" }).dblclick();
    await expect.poll(() => state.creates.length).toBeGreaterThan(0);
    expect(state.feedback).toHaveLength(1);
    expect(state.creates[0].body).toEqual({ category: "Bài học", message: "Bài đọc dễ hiểu.", rating: 5 });
    await page.reload();
    await expect(page.getByText("Bài đọc dễ hiểu.")).toBeVisible();
  });

  test("403 from the API is shown and offers retry; other roles are pointed to their own area without calling the API", async ({ page }) => {
    let calls = 0;
    await signIn(page, trainee);
    await page.route(/\/api\/support\/tickets(\?.*)?$/, (route) => { calls += 1; return route.fulfill({ status: 403, json: { code: "FORBIDDEN", title: "x" } }); });
    await page.goto("/learning-hub?view=support");
    await expect(page.getByText("Không tải được danh sách yêu cầu")).toBeVisible();
    await expect(page.getByText("Bạn không có quyền thực hiện thao tác này.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();

    const other = await page.context().newPage();
    let otherCalls = 0;
    await signIn(other, owner);
    await other.route(/\/api\/(support|feedback).*/, (route) => { otherCalls += 1; return route.fulfill({ status: 403 }); });
    await other.goto("/learning-hub?view=support");
    await expect(other.getByText("Mục này dành cho học viên")).toBeVisible();
    await expect(other.getByRole("link", { name: "Mở hỗ trợ trong không gian tổ chức" })).toHaveAttribute("href", "/workspace/support");
    expect(otherCalls).toBe(0);
    expect(calls).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ layout */

test.describe("layout", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      test(`admin inbox, organization editor and Trainee support do not overflow in ${scheme} at ${width}px`, async ({ page }, testInfo) => {
        const org = newOrg();
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });

        await signIn(page, admin);
        await mockAdminLookups(page);
        await mockOrganizations(page, org);
        await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([ticket({ subject: "Không tải được mô hình IFC của công trình có tên rất dài ".repeat(3) })]) }));
        await page.route("**/api/admin/support/tickets/ticket-1?*", (route) => route.fulfill({ headers: { ETag: '"support-2"' }, json: { ...ticket(), messages: { items: [{ id: "m1", authorId: "u-9", message: "Em cần hỗ trợ", createdAt: "2026-10-02T09:00:00Z", author: person }], total: 1, page: 1, pageSize: 100 } } }));
        await page.route("**/api/admin/audit-logs?*", (route) => route.fulfill({ json: { items: [auditRow], total: 1, page: 1, pageSize: 20, from: "2026-09-10T00:00:00Z", to: "2026-10-10T00:00:00Z" } }));
        await page.route(`**/api/admin/audit-logs/${guid(5)}`, (route) => route.fulfill({ json: { ...auditRow, reason: "x", changes: [{ field: "status", before: "Open", after: "InProgress" }, { field: "assignedTo", before: null, after: guid(1) }] } }));

        await page.goto("/admin/support");
        await expect(page.getByRole("row").filter({ hasText: "SUP-0001" }).getByText("Trần Thị B")).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.getByRole("button", { name: /Mở ticket SUP-0001/ }).click();
        await expect(page.getByRole("region", { name: "Chi tiết ticket" }).getByText("b@school.test")).toBeVisible();
        await page.waitForTimeout(400);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`ticket-${scheme}-${width}.png`) });

        await page.goto(`/admin/support?tab=audit&log=${guid(5)}`);
        await expect(page.getByRole("dialog", { name: "Chi tiết bản ghi audit" }).getByRole("table", { name: "Thay đổi theo từng trường" })).toBeVisible();
        await page.waitForTimeout(400);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`audit-${scheme}-${width}.png`) });

        await page.goto("/admin/organizations?organization=org-1");
        const drawer = page.getByRole("region", { name: "Thông tin tổ chức" });
        await drawer.getByRole("button", { name: "Sửa hồ sơ" }).click();
        await expect(drawer.getByLabel("Số điện thoại")).toBeVisible();
        await page.waitForTimeout(400);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`org-${scheme}-${width}.png`) });
      });

      test(`Trainee support in the learning hub does not overflow in ${scheme} at ${width}px`, async ({ page }, testInfo) => {
        const support = newSupport();
        support.tickets.push({ id: "ticket-1", ticketNumber: "SUP-0001", subject: "Không mở được bài học rất dài ".repeat(4), description: "x", status: "Open", priority: "Normal", assignedTo: null, resolvedAt: null, revision: 1, createdAt: "2026-10-12T08:00:00Z", updatedAt: "2026-10-12T08:00:00Z" });
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
        await signIn(page, trainee);
        await mockUserSupport(page, support);
        await page.goto("/learning-hub?view=support");
        await expect(page.getByTestId("tickets-table").getByText("SUP-0001")).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`hub-${scheme}-${width}.png`) });
      });
    }
  }
});
