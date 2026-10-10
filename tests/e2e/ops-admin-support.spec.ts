/**
 * Admin overview / support / audit, organization support and profile 412 handling.
 * Evidence level: Playwright route mocks of the BE contract (SupportController, AuditLogsController,
 * OperationsAnalyticsController, OrganizationProfileController). Not an integration test against the real API.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { buildRange } from "../../src/utils/date-range";
import { parseOperationsAnalytics } from "../../src/features/admin-overview/api";

const admin = { id: "admin-1", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const owner = { id: "owner-1", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", role: 1, organizationId: "org-1", profileRevision: 1 };
const trainee = { id: "t-1", email: "t@fire3d.test", fullName: "Học viên", role: 2, organizationId: null, profileRevision: 1 };

async function signIn(page: Page, user: object) {
  await page.addInitScript((stored) => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify(stored)), { accessToken: "ops-access", refreshToken: "ops-refresh" });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

const ticket = (over: Record<string, unknown> = {}) => ({
  id: "ticket-1", ticketNumber: "SUP-0001", subject: "Không tải được mô hình IFC", description: "Tệp tải lên báo lỗi quét.",
  status: "Open", priority: "Normal", assignedTo: null, resolvedAt: null, revision: 2,
  createdAt: "2026-10-01T08:00:00Z", updatedAt: "2026-10-02T08:00:00Z", ...over,
});
const message = (id: string, authorId: string, text: string) => ({ id, authorId, message: text, createdAt: "2026-10-02T09:00:00Z" });
const messagesPage = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 100 });
const page1 = <T,>(items: T[], total = items.length) => ({ items, total, page: 1, pageSize: 20 });

async function mockAdminLookups(page: Page) {
  await page.route("**/api/accounts?*", (route) => route.fulfill({ json: { items: [{ ...admin, isActive: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }], totalCount: 1, page: 1, pageSize: 100 } }));
  await page.route("**/api/organizations?*", (route) => route.fulfill({ json: { items: [{ id: "org-1", name: "Fire3D Lab", slug: "fire3d-lab", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }], totalCount: 1, page: 1, pageSize: 100 } }));
}

const analytics = {
  asOf: "2026-10-10T03:00:00Z", from: "2026-09-10T03:00:00Z", to: "2026-10-10T03:00:00Z",
  definitions: { accounts: "current snapshot" },
  accounts: [{ role: "PlatformAdmin", isActive: true, count: 2 }, { role: "OrganizationUser", isActive: true, count: 7 }, { role: "Trainee", isActive: true, count: 40 }, { role: "Trainee", isActive: false, count: 3 }],
  buildings: [{ key: true, count: 11 }, { key: false, count: 2 }],
  ifcJobs: [{ status: "Succeeded", count: 9 }, { status: "Failed", count: 2 }],
  tickets: [{ status: "Open", count: 4 }, { status: "Resolved", count: 6 }],
};

test.describe("pure helpers", () => {
  test("range builder is inclusive, UTC, rejects invalid and > 90 days", () => {
    const ok = buildRange("2026-09-01", "2026-09-30");
    expect(ok).toEqual({ ok: true, from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" });
    expect(buildRange("2026-01-01", "2026-03-31").ok).toBe(true); // exactly 90 days
    expect(buildRange("2026-01-01", "2026-04-01")).toMatchObject({ ok: false, field: "range" });
    expect(buildRange("2026-02-30", "2026-03-01")).toMatchObject({ ok: false, field: "from" });
    expect(buildRange("2026-03-02", "2026-03-01")).toMatchObject({ ok: false, field: "to" });
    expect(buildRange("", "")).toMatchObject({ ok: false });
  });

  test("analytics parser accepts both {key,count} (BE#59) and {isActive,count} for buildings", () => {
    expect(parseOperationsAnalytics(analytics).buildings).toEqual([{ isActive: true, count: 11 }, { isActive: false, count: 2 }]);
    expect(parseOperationsAnalytics({ ...analytics, buildings: [{ isActive: false, count: 5 }, { key: "x", count: 1 }] }).buildings).toEqual([{ isActive: false, count: 5 }]);
    expect(() => parseOperationsAnalytics("<html>")).toThrow();
  });
});

test.describe("admin overview", () => {
  test("shows only operations analytics with period, as-of time and pending BE cards", async ({ page }) => {
    const queries: string[] = [];
    await signIn(page, admin);
    await page.route("**/api/admin/analytics/operations*", (route) => { queries.push(new URL(route.request().url()).search); return route.fulfill({ json: analytics }); });
    await page.goto("/admin/overview");

    await expect(page.getByRole("heading", { name: "Tổng quan vận hành" })).toBeVisible();
    await expect(page.getByText("Cập nhật lúc")).toBeVisible();
    await expect(page.getByText("mặc định 30 ngày gần nhất")).toBeVisible();
    await expect(page.getByText("Tài khoản (hiện tại)")).toBeVisible();
    await expect(page.locator(".ops-stat", { hasText: "Tài khoản (hiện tại)" }).locator("strong")).toHaveText("52");
    await expect(page.locator(".ops-stat", { hasText: "Công trình (hiện tại)" }).locator("strong")).toHaveText("13");
    await expect(page.getByRole("list", { name: "Tiến trình IFC theo trạng thái" })).toContainText("Thất bại");
    // Only the operations endpoint is called; no plays/completion/revenue numbers are invented.
    await expect(page.getByText("Lượt chơi & hoàn thành")).toBeVisible();
    await expect(page.getByText("Chờ BE").first()).toBeVisible();
    expect(queries).toEqual([""]);
  });

  test("range lives in the URL, presets work and a range over 90 days is blocked before any request", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await signIn(page, admin);
    await page.route("**/api/admin/analytics/operations*", (route) => { queries.push(new URL(route.request().url()).searchParams); return route.fulfill({ json: analytics }); });
    await page.goto("/admin/overview?from=2026-09-01&to=2026-09-30");
    await expect(page.getByLabel("Từ ngày")).toHaveValue("2026-09-01");
    await expect.poll(() => queries.length).toBe(1);
    expect(queries[0].get("from")).toBe("2026-09-01T00:00:00.000Z");
    expect(queries[0].get("to")).toBe("2026-10-01T00:00:00.000Z");

    await page.getByLabel("Từ ngày").fill("2026-01-01");
    await page.getByLabel("Đến ngày").fill("2026-09-30");
    await page.getByRole("button", { name: "Áp dụng" }).click();
    await expect(page.getByText(/Khoảng thời gian tối đa 90 ngày/)).toBeVisible();
    await expect(page).toHaveURL(/from=2026-09-01/);
    expect(queries).toHaveLength(1);

    await page.getByRole("button", { name: "7 ngày" }).click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
    await expect.poll(() => queries.length).toBe(2);
  });

  test("an invalid deep-linked range does not call the API", async ({ page }) => {
    let calls = 0;
    await signIn(page, admin);
    await page.route("**/api/admin/analytics/operations*", (route) => { calls += 1; return route.fulfill({ json: analytics }); });
    await page.goto("/admin/overview?from=2026-01-01&to=2026-09-30");
    await expect(page.getByText("Khoảng thời gian trong đường dẫn không hợp lệ")).toBeVisible();
    expect(calls).toBe(0);
  });

  test("error offers retry; refresh reloads; non-admin is denied", async ({ page }) => {
    let fail = true;
    let calls = 0;
    await signIn(page, admin);
    await page.route("**/api/admin/analytics/operations*", (route) => { calls += 1; return fail ? route.fulfill({ status: 500, json: { title: "x" } }) : route.fulfill({ json: analytics }); });
    await page.goto("/admin/overview");
    await expect(page.getByText("Không tải được tổng quan")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Tài khoản (hiện tại)")).toBeVisible();
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect.poll(() => calls).toBe(3);
  });

  test("organization user cannot open the overview", async ({ page }) => {
    await signIn(page, owner);
    await page.goto("/admin/overview");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  });
});

test.describe("admin support inbox", () => {
  test("ticket list filters and pagination are in the URL; deep link opens the detail drawer", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => { queries.push(new URL(route.request().url()).searchParams); return route.fulfill({ json: { items: [ticket()], total: 45, page: 2, pageSize: 20 } }); });
    await page.route("**/api/admin/support/tickets/ticket-1?*", (route) => route.fulfill({ headers: { ETag: '"support-2"' }, json: { ...ticket(), messages: messagesPage([message("m1", "u-9", "Em cần hỗ trợ gấp")]) } }));

    await page.goto("/admin/support?page=2&status=InProgress&priority=High");
    await expect(page.getByLabel("Trạng thái ticket")).toHaveValue("InProgress");
    await expect.poll(() => queries.at(-1)?.get("status")).toBe("InProgress");
    expect(queries.at(-1)?.get("priority")).toBe("High");
    expect(queries.at(-1)?.get("page")).toBe("2");
    await expect(page.getByText("21–40 / 45")).toBeVisible();

    await page.getByLabel("Mức ưu tiên").selectOption("Urgent");
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(/priority=Urgent/);

    await page.getByRole("button", { name: /Mở ticket SUP-0001/ }).click();
    await expect(page).toHaveURL(/ticket=ticket-1/);
    await expect(page.getByRole("dialog", { name: "Chi tiết ticket" }).getByText("Em cần hỗ trợ gấp")).toBeVisible();

    await page.goto("/admin/support?ticket=ticket-1");
    await expect(page.getByRole("dialog", { name: "Chi tiết ticket" }).getByRole("heading", { name: "Không tải được mô hình IFC" })).toBeVisible();
  });

  test("assign/transition sends PATCH with If-Match; 412 keeps the choices and lets the admin load the newer version", async ({ page }) => {
    const patches: { ifMatch: string | undefined; body: unknown }[] = [];
    let revision = 2;
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([ticket({ revision })]) }));
    await page.route("**/api/admin/support/tickets/ticket-1?*", (route) => route.fulfill({ headers: { ETag: `"support-${revision}"` }, json: { ...ticket({ revision }), messages: messagesPage([]) } }));
    await page.route("**/api/admin/support/tickets/ticket-1", async (route) => {
      patches.push({ ifMatch: await route.request().headerValue("if-match"), body: route.request().postDataJSON() });
      if (patches.length === 1) {
        revision = 3; // someone else changed it
        await route.fulfill({ status: 412, json: { code: "PRECONDITION_FAILED", title: "stale" } });
        return;
      }
      revision = 4;
      await route.fulfill({ headers: { ETag: '"support-4"' }, json: ticket({ revision: 4, status: "InProgress", priority: "High", assignedTo: "admin-1" }) });
    });

    await page.goto("/admin/support?ticket=ticket-1");
    const drawer = page.getByRole("dialog", { name: "Chi tiết ticket" });
    await expect(drawer.getByRole("heading", { name: "Không tải được mô hình IFC" })).toBeVisible();
    await drawer.getByLabel("Trạng thái", { exact: true }).selectOption("InProgress");
    await drawer.getByLabel("Ưu tiên").selectOption("High");
    await drawer.getByLabel("Phân công cho").selectOption("admin-1");
    await drawer.getByRole("button", { name: "Lưu thay đổi" }).click();

    await expect(drawer.getByText("Ticket vừa được thay đổi ở nơi khác")).toBeVisible();
    expect(patches[0]).toEqual({ ifMatch: '"support-2"', body: { status: "InProgress", priority: "High", assignedTo: "admin-1" } });
    // Choices are kept, nothing was overwritten.
    await expect(drawer.getByLabel("Ưu tiên")).toHaveValue("High");
    await expect(drawer.getByLabel("Trạng thái", { exact: true })).toHaveValue("InProgress");

    await drawer.getByRole("button", { name: "Tải bản mới để đối chiếu" }).click();
    await expect(drawer.getByText("Đã tải bản mới nhất")).toBeVisible();
    await expect(drawer.getByLabel("Ưu tiên")).toHaveValue("High");
    await drawer.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect.poll(() => patches.length).toBe(2);
    expect(patches[1].ifMatch).toBe('"support-3"');
    await expect(page.getByText("Đã cập nhật ticket")).toBeVisible();
  });

  test("double clicking send posts once; a failed send retries with the same Idempotency-Key and keeps the text", async ({ page }) => {
    const sends: { key: string | undefined; body: unknown }[] = [];
    let failNext = false;
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([ticket()]) }));
    await page.route("**/api/admin/support/tickets/ticket-1?*", (route) => route.fulfill({ headers: { ETag: '"support-2"' }, json: { ...ticket(), messages: messagesPage([]) } }));
    await page.route("**/api/admin/support/tickets/ticket-1/messages", async (route: Route) => {
      sends.push({ key: await route.request().headerValue("idempotency-key"), body: route.request().postDataJSON() });
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (failNext) { failNext = false; await route.fulfill({ status: 500, json: { title: "boom" } }); return; }
      await route.fulfill({ status: 201, json: message("m-new", "admin-1", "x") });
    });

    await page.goto("/admin/support?ticket=ticket-1");
    const drawer = page.getByRole("dialog", { name: "Chi tiết ticket" });
    await drawer.getByLabel("Tin nhắn mới").fill("  Chúng tôi đang kiểm tra  ");
    await drawer.getByRole("button", { name: "Gửi tin nhắn" }).dblclick();
    await expect.poll(() => sends.length).toBe(1);
    await expect(page.getByText("Đã gửi tin nhắn", { exact: true })).toBeVisible();
    expect(sends[0].body).toEqual({ message: "Chúng tôi đang kiểm tra" });
    expect(sends[0].key).toBeTruthy();

    failNext = true;
    await drawer.getByLabel("Tin nhắn mới").fill("Thử lại sau lỗi");
    await drawer.getByRole("button", { name: "Gửi tin nhắn" }).click();
    await expect(drawer.getByText(/Nội dung của bạn vẫn được giữ lại/)).toBeVisible();
    await expect(drawer.getByLabel("Tin nhắn mới")).toHaveValue("Thử lại sau lỗi");
    await drawer.getByRole("button", { name: "Gửi tin nhắn" }).click();
    await expect.poll(() => sends.length).toBe(3);
    expect(sends[2].key).toBe(sends[1].key);
    expect(sends[2].key).not.toBe(sends[0].key);
  });

  test("closed ticket blocks new messages in the UI", async ({ page }) => {
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([ticket({ status: "Closed" })]) }));
    await page.route("**/api/admin/support/tickets/ticket-1?*", (route) => route.fulfill({ headers: { ETag: '"support-2"' }, json: { ...ticket({ status: "Closed" }), messages: messagesPage([]) } }));
    await page.goto("/admin/support?ticket=ticket-1");
    const drawer = page.getByRole("dialog", { name: "Chi tiết ticket" });
    await expect(drawer.getByText(/Ticket đã đóng/)).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Gửi tin nhắn" })).toBeDisabled();
  });

  test("empty, error and loading states plus the Chờ BE block", async ({ page }) => {
    let fail = true;
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (fail) return route.fulfill({ status: 500, json: { title: "x" } });
      return route.fulfill({ json: page1([]) });
    });
    await page.goto("/admin/support");
    await expect(page.getByText("Đang tải danh sách ticket…")).toBeAttached();
    await expect(page.getByText("Không tải được danh sách ticket")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Chưa có ticket nào")).toBeVisible();
    await expect(page.getByRole("region", { name: "Chưa có từ backend" })).toContainText("Người tạo và tổ chức của ticket");
  });

  test("feedback tab updates status with If-Match and handles 412 without losing the choice", async ({ page }) => {
    const patches: { ifMatch: string | undefined; body: unknown }[] = [];
    const feedback = { id: "f-1", category: "Giao diện", message: "Nút hơi nhỏ", rating: 4, status: "Submitted", reviewedBy: null, reviewedAt: null, revision: 1, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([]) }));
    await page.route("**/api/admin/feedback?*", (route) => route.fulfill({ json: page1([feedback]) }));
    await page.route("**/api/admin/feedback/f-1/status", async (route) => {
      patches.push({ ifMatch: await route.request().headerValue("if-match"), body: route.request().postDataJSON() });
      if (patches.length === 1) return route.fulfill({ status: 412, json: { code: "PRECONDITION_FAILED" } });
      return route.fulfill({ json: { ...feedback, status: "Reviewed", revision: 2 } });
    });

    await page.goto("/admin/support?tab=feedback");
    await expect(page.getByRole("tab", { name: "Phản hồi" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Mở phản hồi Giao diện" }).click();
    const drawer = page.getByRole("dialog", { name: "Chi tiết phản hồi" });
    await drawer.getByLabel("Trạng thái xử lý").selectOption("Reviewed");
    await drawer.getByRole("button", { name: "Lưu trạng thái" }).click();
    await expect(drawer.getByText("Phản hồi vừa được cập nhật ở nơi khác")).toBeVisible();
    await expect(drawer.getByLabel("Trạng thái xử lý")).toHaveValue("Reviewed");
    await drawer.getByRole("button", { name: "Lưu trạng thái" }).click();
    await expect.poll(() => patches.length).toBe(2);
    expect(patches[0]).toEqual({ ifMatch: '"support-1"', body: { status: "Reviewed" } });
  });

  test("switching tabs is deep-linkable and clears the other tab's filters", async ({ page }) => {
    await signIn(page, admin);
    await mockAdminLookups(page);
    await page.route("**/api/admin/support/tickets?*", (route) => route.fulfill({ json: page1([]) }));
    await page.route("**/api/admin/audit-logs?*", (route) => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, from: "2026-09-10T00:00:00Z", to: "2026-10-10T00:00:00Z" } }));
    await page.goto("/admin/support?status=Open");
    await page.getByRole("tab", { name: "Nhật ký audit" }).click();
    await expect(page).toHaveURL(/tab=audit/);
    await expect(page).not.toHaveURL(/status=/);
  });

  test("organization user cannot open admin support", async ({ page }) => {
    let calls = 0;
    await signIn(page, owner);
    await page.route("**/api/admin/**", (route) => { calls += 1; return route.fulfill({ status: 403 }); });
    await page.goto("/admin/support");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    expect(calls).toBe(0);
  });
});

test.describe("audit log", () => {
  const log = { id: "a-1", userId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222", action: "Update", targetEntity: "Organization", targetId: "33333333-3333-4333-8333-333333333333", correlationId: "44444444-4444-4444-8444-444444444444", createdAt: "2026-10-05T10:00:00Z" };

  test("defaults to 30 days (no from/to sent), shows the effective range and metadata only", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await signIn(page, admin);
    await page.route("**/api/admin/audit-logs?*", (route) => { queries.push(new URL(route.request().url()).searchParams); return route.fulfill({ json: { items: [log], total: 1, page: 1, pageSize: 20, from: "2026-09-10T00:00:00Z", to: "2026-10-10T00:00:00Z" } }); });
    await page.goto("/admin/support?tab=audit");
    await expect(page.getByText("mặc định 30 ngày gần nhất")).toBeVisible();
    await expect(page.getByText("Chỉ metadata").first()).toBeVisible();
    expect(queries[0].has("from")).toBe(false);
    expect(queries[0].has("to")).toBe(false);
    await page.getByRole("button", { name: /Xem bản ghi Update/ }).click();
    const drawer = page.getByRole("dialog", { name: "Chi tiết bản ghi audit" });
    await expect(drawer.getByText("Nhật ký chỉ lưu metadata")).toBeVisible();
    await drawer.getByRole("button", { name: "Lọc theo mã người thực hiện" }).click();
    await expect(page).toHaveURL(/actorId=11111111-1111-4111-8111-111111111111/);
  });

  test("seven filters reach the API; a range over 90 days or a bad GUID is blocked in the UI", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    await signIn(page, admin);
    await page.route("**/api/admin/audit-logs?*", (route) => { queries.push(new URL(route.request().url()).searchParams); return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" } }); });
    const g = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
    await page.goto("/admin/support?tab=audit");
    await expect.poll(() => queries.length).toBe(1);

    await page.getByLabel("Từ ngày").fill("2026-09-01");
    await page.getByLabel("Đến ngày").fill("2026-09-30");
    await page.getByLabel("Hành động").selectOption("Payment");
    await page.getByLabel("Mã người thực hiện").fill(g(1));
    await page.getByLabel("Mã tổ chức").fill(g(2));
    await page.getByLabel("Mã đối tượng").fill(g(3));
    await page.getByLabel("Mã correlation").fill(g(4));
    await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
    await expect.poll(() => queries.length).toBe(2);
    const q = queries[1];
    expect([q.get("from"), q.get("to"), q.get("action"), q.get("actorId"), q.get("organizationId"), q.get("targetId"), q.get("correlationId")]).toEqual(["2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z", "Payment", g(1), g(2), g(3), g(4)]);
    await expect(page).toHaveURL(/action=Payment/);

    const before = queries.length;
    await page.getByLabel("Từ ngày").fill("2026-01-01");
    await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
    await expect(page.getByText(/Khoảng thời gian tối đa 90 ngày/)).toBeVisible();
    await page.getByLabel("Từ ngày").fill("2026-09-01");
    await page.getByLabel("Mã tổ chức").fill("not-a-guid");
    await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
    await expect(page.getByText(/Nhập mã dạng GUID/)).toBeVisible();
    expect(queries).toHaveLength(before);
  });

  test("a deep link with a range over 90 days never calls the API; error state offers retry", async ({ page }) => {
    let calls = 0;
    let fail = true;
    await signIn(page, admin);
    await page.route("**/api/admin/audit-logs?*", (route) => { calls += 1; return fail ? route.fulfill({ status: 400, json: { code: "VALIDATION_ERROR", title: "Invalid audit filters." } }) : route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z" } }); });
    await page.goto("/admin/support?tab=audit&from=2026-01-01&to=2026-09-30");
    await expect(page.getByText("Bộ lọc chưa hợp lệ nên chưa gửi yêu cầu")).toBeVisible();
    expect(calls).toBe(0);

    await page.goto("/admin/support?tab=audit");
    await expect(page.getByText("Không tải được nhật ký audit")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Chưa có bản ghi audit trong khoảng thời gian này")).toBeVisible();
  });
});

test.describe("organization support", () => {
  test("creates a ticket with one Idempotency-Key across a failed attempt and a retry, then shows the thread", async ({ page }) => {
    const creates: { key: string | undefined; body: unknown }[] = [];
    await signIn(page, owner);
    await page.route("**/api/support/tickets?*", (route) => route.fulfill({ json: page1([]) }));
    await page.route("**/api/support/tickets", async (route) => {
      creates.push({ key: await route.request().headerValue("idempotency-key"), body: route.request().postDataJSON() });
      if (creates.length === 1) return route.fulfill({ status: 500, json: { title: "boom" } });
      return route.fulfill({ status: 201, headers: { ETag: '"support-1"' }, json: ticket({ revision: 1 }) });
    });
    await page.route("**/api/support/tickets/ticket-1?*", (route) => route.fulfill({ headers: { ETag: '"support-2"' }, json: { ...ticket(), messages: messagesPage([message("m1", "support-admin", "Chúng tôi đã nhận yêu cầu"), message("m2", "owner-1", "Cảm ơn")]) } }));

    await page.goto("/workspace/support");
    await expect(page.getByText("Bạn chưa gửi yêu cầu hỗ trợ nào")).toBeVisible();
    await page.getByRole("button", { name: "Tạo yêu cầu hỗ trợ" }).first().click();
    const form = page.getByRole("dialog", { name: "Tạo yêu cầu hỗ trợ" });
    await form.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(form.getByText("Tiêu đề dài từ 1 đến 255 ký tự.")).toBeVisible();
    expect(creates).toHaveLength(0);

    await form.getByLabel("Tiêu đề").fill("Không tải được mô hình IFC");
    await form.getByLabel("Mô tả").fill("Tệp tải lên báo lỗi quét.");
    await form.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(form.getByText(/yêu cầu sẽ không bị tạo trùng/)).toBeVisible();
    await expect(form.getByLabel("Tiêu đề")).toHaveValue("Không tải được mô hình IFC");
    await form.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect.poll(() => creates.length).toBe(2);
    expect(creates[1].key).toBe(creates[0].key);
    expect(creates[0].body).toEqual({ subject: "Không tải được mô hình IFC", description: "Tệp tải lên báo lỗi quét." });

    await expect(page).toHaveURL(/ticket=ticket-1/);
    const drawer = page.getByRole("dialog", { name: "Chi tiết yêu cầu" });
    await expect(drawer.getByText("Chúng tôi đã nhận yêu cầu")).toBeVisible();
    await expect(drawer.getByText("Đội hỗ trợ Fire3D")).toBeVisible();
    await expect(drawer.getByText("Bạn", { exact: true })).toBeVisible();
  });

  test("lists own tickets with a URL status filter, sends a message and submits feedback", async ({ page }) => {
    const queries: URLSearchParams[] = [];
    const sends: { key: string | undefined; body: unknown }[] = [];
    const feedbackPosts: { key: string | undefined; body: unknown }[] = [];
    await signIn(page, owner);
    await page.route("**/api/support/tickets?*", (route) => { queries.push(new URL(route.request().url()).searchParams); return route.fulfill({ json: page1([ticket()]) }); });
    await page.route("**/api/support/tickets/ticket-1?*", (route) => route.fulfill({ headers: { ETag: '"support-2"' }, json: { ...ticket(), messages: messagesPage([]) } }));
    await page.route("**/api/support/tickets/ticket-1/messages", async (route) => { sends.push({ key: await route.request().headerValue("idempotency-key"), body: route.request().postDataJSON() }); await route.fulfill({ status: 201, json: message("m", "owner-1", "x") }); });
    await page.route("**/api/feedback?*", (route) => route.fulfill({ json: page1([]) }));
    await page.route("**/api/feedback", async (route) => { feedbackPosts.push({ key: await route.request().headerValue("idempotency-key"), body: route.request().postDataJSON() }); await route.fulfill({ status: 201, json: { id: "f", category: "UI", message: "ok", rating: 5, status: "Submitted", reviewedBy: null, reviewedAt: null, revision: 1, createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z" } }); });

    await page.goto("/workspace/support?status=Open");
    await expect(page.getByLabel("Trạng thái yêu cầu")).toHaveValue("Open");
    expect(queries[0].get("status")).toBe("Open");
    await page.getByRole("button", { name: /Mở yêu cầu SUP-0001/ }).click();
    const drawer = page.getByRole("dialog", { name: "Chi tiết yêu cầu" });
    await expect(drawer.getByText(/Chưa có phản hồi/)).toBeVisible();
    await drawer.getByLabel("Tin nhắn mới").fill("Bổ sung: lỗi xảy ra với tệp 80MB");
    await drawer.getByRole("button", { name: "Gửi tin nhắn" }).click();
    await expect.poll(() => sends.length).toBe(1);
    expect(sends[0].key).toBeTruthy();
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "Phản hồi" }).click();
    await expect(page.getByText("Bạn chưa gửi phản hồi nào")).toBeVisible();
    await page.getByRole("button", { name: "Gửi phản hồi" }).first().click();
    const form = page.getByRole("dialog", { name: "Gửi phản hồi" });
    await form.getByLabel("Chủ đề").fill("UI");
    await form.getByLabel("Nội dung").fill("Rất dễ dùng");
    await form.getByLabel("Mức hài lòng").selectOption("5");
    await form.getByRole("button", { name: "Gửi phản hồi" }).click();
    await expect.poll(() => feedbackPosts.length).toBe(1);
    expect(feedbackPosts[0].body).toEqual({ category: "UI", message: "Rất dễ dùng", rating: 5 });
    expect(feedbackPosts[0].key).toBeTruthy();
    await expect(page.getByText("Đã gửi phản hồi")).toBeVisible();
  });

  test("error with retry; admin and trainee are told this area is for organizations", async ({ page }) => {
    let fail = true;
    await signIn(page, owner);
    await page.route("**/api/support/tickets?*", (route) => fail ? route.fulfill({ status: 500, json: { title: "x" } }) : route.fulfill({ json: page1([]) }));
    await page.goto("/workspace/support");
    await expect(page.getByText("Không tải được danh sách yêu cầu")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Bạn chưa gửi yêu cầu hỗ trợ nào")).toBeVisible();
  });

  test("a PlatformAdmin opening the organization support route sees the role message and no support call is made", async ({ page }) => {
    let calls = 0;
    await signIn(page, admin);
    await page.route("**/api/support/**", (route) => { calls += 1; return route.fulfill({ status: 403 }); });
    await page.goto("/workspace/support");
    await expect(page.getByText("Chỉ dành cho tài khoản tổ chức")).toBeVisible();
    await expect(page.getByRole("link", { name: "Mở hộp thư hỗ trợ của quản trị" })).toHaveAttribute("href", "/admin/support");
    expect(calls).toBe(0);
  });

  test("a trainee is denied by the shell", async ({ page }) => {
    await signIn(page, trainee);
    await page.goto("/workspace/support");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  });
});

test.describe("organization profile (new style)", () => {
  const organization = { id: "org-1", name: "Fire3D Studio", slug: "fire3d-studio", address: "Da Nang", phoneNumber: "+842361234567", isActive: true, profileRevision: 4, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

  test("412 keeps the typed values, offers the newest version and saves with the new ETag; 409 shows the field error", async ({ page }) => {
    const updates: { ifMatch: string | undefined; body: unknown }[] = [];
    let etag = '"4"';
    await signIn(page, owner);
    await page.route("**/api/organizations/me", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ headers: { ETag: etag }, json: organization });
      updates.push({ ifMatch: await route.request().headerValue("if-match"), body: route.request().postDataJSON() });
      if (updates.length === 1) { etag = '"5"'; return route.fulfill({ status: 412, json: { code: "PRECONDITION_FAILED" } }); }
      if (updates.length === 2) return route.fulfill({ status: 409, json: { code: "ORGANIZATION_PHONE_EXISTS", title: "Phone exists", errors: { phoneNumber: ["Số điện thoại đã được tổ chức khác sử dụng."] } } });
      return route.fulfill({ headers: { ETag: '"6"' }, json: { ...organization, name: "Fire3D Safety", profileRevision: 6 } });
    });

    await page.goto("/workspace/profile");
    await page.getByLabel("Tên tổ chức", { exact: true }).fill("Fire3D Safety");
    await page.getByRole("button", { name: "Lưu hồ sơ tổ chức" }).click();
    await expect(page.getByText("Hồ sơ vừa được thay đổi ở nơi khác")).toBeVisible();
    await expect(page.getByLabel("Tên tổ chức", { exact: true })).toHaveValue("Fire3D Safety");
    await page.getByRole("button", { name: "Tải bản mới nhất" }).click();
    await expect(page.getByText("Hồ sơ vừa được thay đổi ở nơi khác")).toHaveCount(0);
    await expect(page.getByLabel("Tên tổ chức", { exact: true })).toHaveValue("Fire3D Safety");

    await page.getByRole("button", { name: "Lưu hồ sơ tổ chức" }).click();
    await expect(page.getByText("Số điện thoại đã được tổ chức khác sử dụng.")).toBeVisible();
    expect(updates[1].ifMatch).toBe('"5"');

    await page.getByRole("button", { name: "Lưu hồ sơ tổ chức" }).click();
    await expect(page.getByText("Đã lưu hồ sơ tổ chức")).toBeVisible();
    expect(updates[2].ifMatch).toBe('"5"');
  });
});
