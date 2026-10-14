import { expect, test } from "@playwright/test";
import { admin, callsTo, etagOf, ids, mockBilling, newMock, owner, queue, signIn } from "./billing-mock";

// Route-mock evidence only (not the real BE). Both sides share one stateful mock, like one server.

const request = (overrides: Record<string, unknown> = {}) => ({ id: ids.enterprise, organizationId: "org-1", requestedBuildingCount: 150, requestedDurationMonths: 12, contactName: "Trần B", contactEmail: "b@fire3d.test", contactPhone: null, notes: "Chuỗi trường học", status: "New", createdAt: "2026-10-09T00:00:00Z", revision: 1, quotationId: null, assignedTo: null, closedAt: null, closeReason: null, ...overrides });

test.describe("enterprise requests: organization side (mock)", () => {
  test("create sends an Idempotency-Key, a retry after a failure reuses it, and no payment or quotation is created", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "POST /api/billing/enterprise-quote-requests", { status: 503, json: { title: "down" } });
    await page.goto("/workspace/billing?tab=enterprise");
    await page.getByLabel("Số công trình dự kiến").fill("150");
    await page.getByLabel("Người liên hệ").fill("Trần B");
    await page.getByLabel("Email liên hệ").fill("b@fire3d.test");
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByText("Chưa gửi được yêu cầu")).toBeVisible();
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByText("Đã gửi yêu cầu", { exact: true })).toBeVisible();
    const posts = callsTo(mock, "POST", "/api/billing/enterprise-quote-requests");
    expect(posts).toHaveLength(2);
    expect(posts[0].headers["idempotency-key"]).toBeTruthy();
    expect(posts[1].headers["idempotency-key"]).toBe(posts[0].headers["idempotency-key"]);
    expect(posts[1].body).toMatchObject({ requestedBuildingCount: 150, contactName: "Trần B", contactEmail: "b@fire3d.test", requestedDurationMonths: null });
    expect(mock.enterprise).toHaveLength(1);
    await expect(page.getByRole("row", { name: /150 công trình/ })).toContainText("Mới gửi");
    expect(mock.calls.filter((call) => call.path.includes("/payments/") || (call.method === "POST" && call.path.endsWith("/quotations")))).toHaveLength(0);
  });

  test("reads the admin replies, the linked quotation and the closed state; internal assignee and close reason are never shown", async ({ page }) => {
    const mock = newMock();
    mock.enterprise = [request({ status: "Quoted", quotationId: ids.quoteDraft, assignedTo: "admin", revision: 4 })];
    mock.responses[ids.enterprise] = [{ id: "r-1", requestId: ids.enterprise, authorId: "admin", authorName: "Platform Admin", message: "Chúng tôi sẽ gửi báo giá trong 2 ngày.", createdAt: "2026-10-10T08:00:00Z" }];
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=enterprise");
    await page.getByRole("button", { name: /Xem yêu cầu 150 công trình/ }).click();
    const detail = page.getByTestId("enterprise-detail");
    await expect(detail).toContainText("Đã có báo giá");
    await expect(detail.getByTestId("enterprise-response")).toContainText("Chúng tôi sẽ gửi báo giá trong 2 ngày.");
    await expect(detail).not.toContainText("phân công");
    expect(callsTo(mock, "GET", `/api/billing/enterprise-quote-requests/${ids.enterprise}/responses`).length).toBeGreaterThan(0);
    await detail.getByRole("button", { name: "Mở báo giá" }).click();
    await expect(page).toHaveURL(new RegExp(`quotation=${ids.quoteDraft}`));
    await expect(page.getByTestId("quotation-snapshot")).toBeVisible();
  });

  test("403 on another tenant's request shows the denial, not data", async ({ page }) => {
    const mock = newMock();
    mock.enterprise = [request()];
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, `GET /api/billing/enterprise-quote-requests/${ids.enterprise}`, { status: 403, json: { code: "BILLING_ROLE_FORBIDDEN", title: "forbidden" } });
    await page.goto(`/workspace/billing?tab=enterprise&request=${ids.enterprise}`);
    await expect(page.getByText("Không tải được yêu cầu", { exact: true })).toBeVisible();
    await expect(page.getByTestId("enterprise-detail")).toHaveCount(0);
  });
});

test.describe("enterprise requests: administrator side (mock)", () => {
  test("list shows requests with the organization; no 'Chờ BE' block remains", async ({ page }) => {
    const mock = newMock();
    mock.enterprise = [request(), request({ id: "77777777-0000-0000-0000-000000000002", organizationId: "org-2", status: "Contacted", assignedTo: "admin" })];
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=enterprise");
    await expect(page.getByTestId("enterprise-row")).toHaveCount(2);
    await expect(page.getByTestId("enterprise-row").first()).toContainText("FET3D Lab");
    await expect(page.getByTestId("enterprise-row").first()).toContainText("150 công trình");
    await expect(page.getByTestId("enterprise-row").nth(1)).toContainText("Đã phân công");
    await expect(page.getByText("Chờ BE: xử lý yêu cầu liên hệ")).toHaveCount(0);
  });

  test("handling: contacted (If-Match), assign / unassign, 412 keeps the draft reply, reply with a stable key", async ({ page }) => {
    const mock = newMock();
    mock.enterprise = [request()];
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto(`/admin/commerce?tab=enterprise&request=${ids.enterprise}`);
    const detail = page.getByTestId("enterprise-admin-detail");
    await expect(detail).toContainText("Chưa phân công");
    await detail.getByRole("button", { name: "Đã liên hệ" }).click();
    await expect(detail.getByText("Đã liên hệ", { exact: true }).first()).toBeVisible();
    const patches = callsTo(mock, "PATCH", `/api/admin/enterprise-quote-requests/${ids.enterprise}`);
    expect(patches[0].headers["if-match"]).toBe(etagOf(ids.enterprise, 1));
    expect(patches[0].body).toEqual({ status: "Contacted" });
    // The next change uses the ETag the previous response returned.
    await detail.getByRole("button", { name: "Nhận xử lý" }).click();
    await expect(detail.getByTestId("enterprise-assignee")).toContainText("Đang do bạn phụ trách");
    expect(callsTo(mock, "PATCH", `/api/admin/enterprise-quote-requests/${ids.enterprise}`)[1].headers["if-match"]).toBe(etagOf(ids.enterprise, 2));
    expect(callsTo(mock, "PATCH", `/api/admin/enterprise-quote-requests/${ids.enterprise}`)[1].body).toEqual({ assignedTo: "admin" });
    await detail.getByRole("button", { name: "Bỏ phân công" }).click();
    await expect(detail.getByTestId("enterprise-assignee")).toContainText("Chưa phân công");
    expect(callsTo(mock, "PATCH", `/api/admin/enterprise-quote-requests/${ids.enterprise}`)[2].body).toEqual({ clearAssignment: true });

    // Somebody else changes the request: 412 -> warning, the typed reply stays, nothing is overwritten.
    mock.enterprise[0].revision = 9;
    await detail.getByLabel("Nội dung phản hồi").fill("Chúng tôi sẽ liên hệ trong ngày.");
    await detail.getByRole("button", { name: "Từ chối" }).click();
    await page.getByRole("button", { name: "Từ chối", exact: true }).last().click();
    await expect(page.getByText("Yêu cầu đã thay đổi ở nơi khác").first()).toBeVisible();
    expect(mock.enterprise[0].status).toBe("Contacted");
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Nội dung phản hồi")).toHaveValue("Chúng tôi sẽ liên hệ trong ngày.");
    await page.getByRole("button", { name: "Tải bản mới" }).click();

    // Reply: a failed send then a retry reuse the same key (one reply exists).
    queue(mock, `POST /api/admin/enterprise-quote-requests/${ids.enterprise}/responses`, { status: 503, json: { title: "down" } });
    await page.getByRole("button", { name: "Gửi phản hồi" }).click();
    await expect(page.getByText("Chưa thực hiện được").first()).toBeVisible();
    await page.getByRole("button", { name: "Gửi phản hồi" }).click();
    await expect(page.getByTestId("enterprise-response")).toHaveCount(1);
    const replies = callsTo(mock, "POST", `/api/admin/enterprise-quote-requests/${ids.enterprise}/responses`);
    expect(replies).toHaveLength(2);
    expect(replies[1].headers["idempotency-key"]).toBe(replies[0].headers["idempotency-key"]);
    expect(replies[0].body).toEqual({ message: "Chúng tôi sẽ liên hệ trong ngày." });
    await expect(page.getByLabel("Nội dung phản hồi")).toHaveValue("");
  });

  test("full lifecycle across both sides: contact -> reply -> quotation -> organization sees it -> close (reason, If-Match, key)", async ({ page, browser }) => {
    const mock = newMock();
    mock.enterprise = [request()];
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto(`/admin/commerce?tab=enterprise&request=${ids.enterprise}`);
    const detail = page.getByTestId("enterprise-admin-detail");
    await detail.getByLabel("Nội dung phản hồi").fill("Đã nhận yêu cầu, báo giá sẽ được gửi.");
    await detail.getByRole("button", { name: "Gửi phản hồi" }).click();
    await expect(detail.getByTestId("enterprise-response")).toHaveCount(1);

    // Draft quotation for the requesting organization: Buildings + package, Idempotency-Key, no payment.
    await detail.getByRole("button", { name: "Tạo báo giá từ yêu cầu" }).click();
    await page.getByLabel("Công trình 1").check();
    await page.locator(`input[name="enterprise-package"][value="${ids.pkg}"]`).check({ force: true });
    await page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ }).click();
    await expect(page).toHaveURL(/tab=quotes/);
    const quoteCalls = callsTo(mock, "POST", `/api/admin/enterprise-quote-requests/${ids.enterprise}/quotations`);
    expect(quoteCalls).toHaveLength(1);
    expect(quoteCalls[0].headers["idempotency-key"]).toBeTruthy();
    expect(quoteCalls[0].body).toEqual({ items: [{ buildingId: "b-1", servicePackageId: ids.pkg, purchaseAction: "New" }] });
    expect(mock.enterprise[0].status).toBe("Quoted");
    expect(mock.calls.filter((call) => call.path.startsWith("/api/payments/"))).toHaveLength(0);

    // The organization (another browser context, same server state) reads reply + quotation link.
    const context = await browser.newContext();
    const orgPage = await context.newPage();
    await signIn(orgPage, owner);
    await mockBilling(orgPage, mock);
    await orgPage.goto(`/workspace/billing?tab=enterprise&request=${ids.enterprise}`);
    const orgDetail = orgPage.getByTestId("enterprise-detail");
    await expect(orgDetail).toContainText("Đã có báo giá");
    await expect(orgDetail.getByTestId("enterprise-response")).toContainText("Đã nhận yêu cầu, báo giá sẽ được gửi.");

    // Admin closes it: reason is required; If-Match + Idempotency-Key are sent; actions disappear afterwards.
    await page.goto(`/admin/commerce?tab=enterprise&request=${ids.enterprise}`);
    await page.getByTestId("enterprise-admin-detail").getByRole("button", { name: "Đóng yêu cầu" }).click();
    await page.getByRole("button", { name: "Đóng yêu cầu", exact: true }).last().click();
    await expect(page.getByText("Nhập lý do đóng (1–1000 ký tự).")).toBeVisible();
    await page.getByLabel("Lý do đóng").fill("Khách đã chọn gói chuẩn");
    await page.getByRole("button", { name: "Đóng yêu cầu", exact: true }).last().click();
    await expect(page.getByText("Yêu cầu đã đóng", { exact: true }).first()).toBeVisible();
    const close = callsTo(mock, "POST", `/api/admin/enterprise-quote-requests/${ids.enterprise}/close`)[0];
    expect(close.headers["if-match"]).toBeTruthy();
    expect(close.headers["idempotency-key"]).toBeTruthy();
    expect(close.body).toEqual({ reason: "Khách đã chọn gói chuẩn" });
    await expect(page.getByRole("button", { name: "Gửi phản hồi" })).toHaveCount(0);
    expect(mock.enterprise[0].status).toBe("Closed");

    // The organization sees Closed but not the internal reason.
    await orgPage.reload();
    await expect(orgPage.getByTestId("enterprise-detail")).toContainText("Yêu cầu đã đóng");
    await expect(orgPage.getByTestId("enterprise-detail")).not.toContainText("Khách đã chọn gói chuẩn");
    await context.close();
  });

  test("a Closed request rejects replies (409 ENTERPRISE_REQUEST_CLOSED) and says why", async ({ page }) => {
    const mock = newMock();
    mock.enterprise = [request({ status: "Contacted" })];
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto(`/admin/commerce?tab=enterprise&request=${ids.enterprise}`);
    await page.getByLabel("Nội dung phản hồi").fill("Phản hồi muộn");
    mock.enterprise[0].status = "Closed";
    await page.getByRole("button", { name: "Gửi phản hồi" }).click();
    await expect(page.getByText("Yêu cầu đã đóng nên không thể thay đổi hay phản hồi thêm.").first()).toBeVisible();
  });
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 375]) {
    test(`enterprise layout ${width}px ${theme}`, async ({ page }, testInfo) => {
      const mock = newMock();
      mock.enterprise = [request({ status: "Contacted", assignedTo: "admin", revision: 3 })];
      mock.responses[ids.enterprise] = [{ id: "r-1", requestId: ids.enterprise, authorId: "admin", authorName: "Platform Admin", message: "Chúng tôi sẽ gửi báo giá trong 2 ngày làm việc.", createdAt: "2026-10-10T08:00:00Z" }];
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
      await signIn(page, admin);
      await mockBilling(page, mock);
      await page.goto("/admin/commerce?tab=enterprise");
      await expect(page.getByTestId("enterprise-row")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.goto(`/admin/commerce?tab=enterprise&request=${ids.enterprise}`);
      await expect(page.getByTestId("enterprise-admin-detail")).toBeVisible();
      await expect(page.getByTestId("enterprise-response")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`enterprise-admin-${theme}-${width}.png`) });
    });
  }
}
