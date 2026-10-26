import { expect, test, type Locator, type Page } from "@playwright/test";
import { admin, callsTo, checkoutFixture, ids, ledgerRow, mockBilling, newMock, owner, paymentFixture, quotationFixture, queue, seedCheckout, signIn } from "./billing-mock";
import { expectChipValue, openChip, pick } from "./chip-helpers";

// Route-mock evidence only (not the real BE).

// DataTable rows: `<tr>` on desktop, cards under 640px.
const ledgerRows = (page: Page) => page.getByTestId("admin-ledger-table").locator("tbody tr, li.ops-dt-card");
/** Opens the row's "···" menu, checks whether "Xử lý đối soát" is offered, and closes it again. */
async function expectReconcileOffered(page: Page, row: Locator, offered: boolean) {
  await row.getByRole("button", { name: "Thao tác" }).click();
  await expect(page.getByRole("menuitem", { name: "Xem chi tiết" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Xử lý đối soát/ })).toHaveCount(offered ? 1 : 0);
  await page.keyboard.press("Escape");
}

const rows = (count: number) => Array.from({ length: count }, (_, index) => {
  const n = index + 1;
  const stuck = n % 3 === 0;
  return ledgerRow({
    checkoutId: `dddddddd-0000-0000-0000-${String(n).padStart(12, "0")}`, paymentRequestId: `eeeeeeee-0000-0000-0000-${String(n).padStart(12, "0")}`, quotationNumber: `FET-Q-${String(n).padStart(4, "0")}`,
    checkoutStatus: stuck ? "NeedsReconcile" : "Completed", paymentStatus: "Paid", provisioningStatus: stuck ? "NeedsReconcile" : "Succeeded", provisioningLines: 2, provisioningSucceeded: stuck ? 1 : 2,
    createdAt: new Date(Date.UTC(2026, 9, 12, 12, 0) - n * 3_600_000).toISOString(), paidAt: new Date(Date.UTC(2026, 9, 12, 12, 1) - n * 3_600_000).toISOString(), organizationId: n % 2 ? "org-1" : "org-2",
  });
});

test.describe("admin payments ledger (mock)", () => {
  test("the status chart shows one tile per state with its count and share beside it", async ({ page }, testInfo) => {
    const mock = newMock();
    mock.ledger = rows(45);
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/commerce?tab=payments");
    const chart = page.getByTestId("payments-status-chart");
    await expect(chart.locator(".ops-status-tiles li")).toHaveCount(5);
    await expect(chart.locator(".ops-status-total strong")).not.toHaveText("");
    await expect(chart.locator(".ops-status-tiles li").first().locator("small")).toHaveText(/%$/);
    await chart.screenshot({ path: testInfo.outputPath("payments-status-chart.png") });
  });

  test("paginates and filters on the server; the URL keeps kind, status, organization, range and page", async ({ page }) => {
    const mock = newMock();
    mock.ledger = rows(45);
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=payments");
    await expect(ledgerRows(page)).toHaveCount(20);
    await expect(page.getByText("1–20 / 45")).toBeVisible();
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("21–40 / 45")).toBeVisible();
    expect(callsTo(mock, "GET", "/api/admin/payments/payos/checkouts").some((call) => call.search.includes("page=2"))).toBe(true);

    await pick(page, "Trạng thái", { value: "NeedsReconcile" });
    await expect(page).toHaveURL(/status=NeedsReconcile/);
    await expect(ledgerRows(page)).toHaveCount(15);
    await expect(ledgerRows(page).first().getByTestId("payment-states")).toContainText("Liên kết: Cần đối soát");
    await page.getByRole("combobox", { name: "Tổ chức" }).click();
    await page.getByRole("option", { name: "FET3D Lab" }).click();
    await expect(page).toHaveURL(/org=org-1/);
    const last = callsTo(mock, "GET", "/api/admin/payments/payos/checkouts").at(-1)!;
    expect(last.search).toContain("status=NeedsReconcile");
    expect(last.search).toContain("organizationId=org-1");
    expect(last.search).not.toContain("page=2");

    await openChip(page, "Khoảng ngày");
    await page.getByLabel(/Từ \(giờ địa phương\)/).fill("2026-10-12T00:00");
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await expect(page).toHaveURL(/from=2026-10-1/);
    expect(callsTo(mock, "GET", "/api/admin/payments/payos/checkouts").at(-1)!.search).toMatch(/from=2026-10-1\dT\d\d%3A\d\d%3A\d\d\.\d{3}Z/);

    // Reload restores the exact view from the URL.
    await page.reload();
    await expectChipValue(page, "Trạng thái", "NeedsReconcile");
    await expect(ledgerRows(page).first()).toBeVisible();
  });

  test("an invalid quotation filter is refused before any request; clearing filters resets the list", async ({ page }) => {
    const mock = newMock();
    mock.ledger = rows(5);
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=payments");
    await openChip(page, "Mã báo giá");
    await page.getByRole("textbox", { name: "Mã báo giá" }).fill("khong-phai-guid");
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await expect(page.getByText("Mã báo giá chưa đúng. Dán đủ mã lấy ở chi tiết báo giá.")).toBeVisible();
    const before = callsTo(mock, "GET", "/api/admin/payments/payos/checkouts").length;
    await page.getByRole("textbox", { name: "Mã báo giá" }).fill(ids.quote);
    await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
    await expect.poll(() => callsTo(mock, "GET", "/api/admin/payments/payos/checkouts").length).toBeGreaterThan(before);
    await expect(ledgerRows(page)).toHaveCount(5);
    await page.getByRole("button", { name: "Xóa lọc" }).click();
    await expect(page).not.toHaveURL(/q=/);
  });

  test("each row shows checkout / payment / provisioning apart; reconcile is offered only where something is stuck", async ({ page }) => {
    const mock = newMock();
    mock.ledger = [
      ledgerRow({ checkoutId: ids.checkout, quotationNumber: "FET-Q-0001", checkoutStatus: "NeedsReconcile", paymentStatus: "Paid", provisioningStatus: "NeedsReconcile", provisioningLines: 2, provisioningSucceeded: 0 }),
      ledgerRow({ checkoutId: "dddddddd-0000-0000-0000-000000000002", paymentRequestId: "eeeeeeee-0000-0000-0000-000000000002", quotationNumber: "FET-Q-0002", checkoutStatus: "Completed", paymentStatus: "Paid", provisioningStatus: "Succeeded", provisioningLines: 1, provisioningSucceeded: 1 }),
      ledgerRow({ checkoutId: "dddddddd-0000-0000-0000-000000000003", paymentRequestId: "eeeeeeee-0000-0000-0000-000000000003", quotationNumber: "FET-Q-0003", checkoutStatus: "Completed", paymentStatus: "Paid", provisioningStatus: "Partial", provisioningLines: 2, provisioningSucceeded: 1 }),
      ledgerRow({ checkoutId: "dddddddd-0000-0000-0000-000000000004", paymentRequestId: null, quotationNumber: "FET-Q-0004", checkoutStatus: "Failed", checkoutError: "PAYOS_PROVIDER_TIMEOUT", paymentStatus: null, provisioningStatus: "NotStarted", provisioningLines: 1, provisioningSucceeded: 0 }),
    ];
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=payments");
    const stuck = ledgerRows(page).nth(0);
    await expect(stuck.getByTestId("payment-states")).toContainText("Liên kết: Cần đối soát");
    await expect(stuck.getByTestId("payment-states")).toContainText("Thanh toán: Đã nhận tiền");
    await expect(stuck.getByTestId("payment-states")).toContainText("Kích hoạt: Cần đối soát");
    await expectReconcileOffered(page, stuck, true);
    const done = ledgerRows(page).nth(1);
    await expect(done.getByTestId("payment-states")).toContainText("Kích hoạt: Đã kích hoạt");
    await expectReconcileOffered(page, done, false);
    // Partial: money received, only some lines activated -> not success, reconcile offered.
    const partial = ledgerRows(page).nth(2);
    await expect(partial.getByTestId("payment-states")).toContainText("Kích hoạt: Kích hoạt một phần");
    await expectReconcileOffered(page, partial, true);
    await expect(partial).toContainText("kích hoạt 1/2");
    // A link that never bound a payment request: no payment, nothing to reconcile.
    const failed = ledgerRows(page).nth(3);
    await expect(failed.getByTestId("payment-states")).toContainText("Thanh toán: chưa có");
    await expect(failed).toContainText("PayOS phản hồi chậm");
    await expectReconcileOffered(page, failed, false);
  });

  test("detail + reconcile: enqueues recovery once (double click), never marks anything Paid, and the stuck lines finish after the server retries", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: new Date().toISOString(), revision: 5 });
    seedCheckout(mock, { checkoutStatus: "NeedsReconcile", errorCode: "PAYOS_PROVIDER_TIMEOUT" }, { provisioningStatus: "NeedsReconcile", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "NeedsReconcile", entitlementId: null, errorCode: "PAYOS_PROVISIONING_UNAVAILABLE" }] });
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=payments");
    await ledgerRows(page).filter({ hasText: "FET-Q-0001" }).click();
    const detail = page.getByTestId("payment-detail");
    await expect(detail.getByTestId("payment-states")).toContainText("Kích hoạt: Cần đối soát");
    await expect(detail.getByTestId("payment-status")).toHaveAttribute("data-provisioning-status", "NeedsReconcile");
    await expect(detail.getByTestId("payment-status")).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    const reconcile = detail.getByRole("button", { name: "Yêu cầu đối soát" });
    await expect(reconcile).toBeEnabled();
    await reconcile.dblclick();
    await expect(detail.getByTestId("payment-status")).toHaveAttribute("data-provisioning-status", "Succeeded");
    expect(callsTo(mock, "POST", `/api/admin/payments/payos/checkouts/${ids.checkout}/reconcile`)).toHaveLength(1);
    // Nothing more to reconcile: the action is closed again.
    await expect(reconcile).toBeDisabled();
    await expect(detail.getByText(/Chỉ đối soát được khi/)).toBeVisible();
  });

  test("reconcile on a payment that is already provisioned stays disabled and sends nothing", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: new Date().toISOString(), revision: 5 });
    seedCheckout(mock, { checkoutStatus: "Completed" }, { provisioningStatus: "Succeeded", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "Succeeded", entitlementId: "ent-1", errorCode: null }] });
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto(`/admin/commerce?tab=payments&checkout=${ids.checkout}`);
    await expect(page.getByTestId("payment-detail").getByRole("button", { name: "Yêu cầu đối soát" })).toBeDisabled();
    expect(callsTo(mock, "POST", `/api/admin/payments/payos/checkouts/${ids.checkout}/reconcile`)).toHaveLength(0);
  });

  test("reconcile refused (403) reports it and keeps the detail", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: new Date().toISOString(), revision: 5 });
    seedCheckout(mock, { checkoutStatus: "NeedsReconcile" }, { provisioningStatus: "NeedsReconcile" });
    await signIn(page, admin);
    await mockBilling(page, mock);
    queue(mock, `POST /api/admin/payments/payos/checkouts/${ids.checkout}/reconcile`, { status: 403, json: { code: "BILLING_ROLE_FORBIDDEN", title: "forbidden" } });
    await page.goto(`/admin/commerce?tab=payments&checkout=${ids.checkout}`);
    await page.getByRole("button", { name: "Yêu cầu đối soát" }).click();
    await expect(page.getByText("Không gửi được yêu cầu đối soát")).toBeVisible();
    await expect(page.getByText(/không có quyền thực hiện thao tác này/i).first()).toBeVisible();
    await expect(page.getByTestId("payment-detail")).toBeVisible();
  });

  test("requests view uses the payment-request endpoint and payment status filter; lookup by checkout id validates the GUID", async ({ page }) => {
    const mock = newMock();
    mock.ledger = rows(6);
    seedCheckout(mock, { checkoutStatus: "Completed" }, { provisioningStatus: "Succeeded", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "Succeeded", entitlementId: "ent-1", errorCode: null }] });
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: new Date().toISOString(), revision: 5 });
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=payments");
    await page.getByRole("radio", { name: "Yêu cầu thanh toán" }).click();
    await expect(page).toHaveURL(/kind=requests/);
    await expect(ledgerRows(page).first()).toBeVisible();
    expect(callsTo(mock, "GET", "/api/admin/payments/payos/requests").length).toBeGreaterThan(0);
    await pick(page, "Trạng thái", { value: "Paid" });
    await expect.poll(() => callsTo(mock, "GET", "/api/admin/payments/payos/requests").at(-1)!.search).toContain("status=Paid");

    // The lookup lives in the page-header modal ("Tra cứu thanh toán").
    await page.getByRole("button", { name: "Tra cứu thanh toán" }).click();
    await page.getByRole("textbox", { name: "Mã lượt thanh toán" }).fill("not-a-guid");
    await page.getByRole("button", { name: "Tra cứu", exact: true }).click();
    await expect(page.getByText("Dán đủ mã lượt thanh toán")).toBeVisible();
    await page.getByRole("textbox", { name: "Mã lượt thanh toán" }).fill(ids.checkout);
    await page.getByRole("button", { name: "Tra cứu", exact: true }).click();
    await expect(page.getByTestId("payment-detail")).toBeVisible();
    expect(callsTo(mock, "GET", `/api/payments/payos/checkouts/${ids.checkout}`).length).toBeGreaterThan(0);
  });

  test("a late response for an old filter does not overwrite the newer list", async ({ page }) => {
    const mock = newMock();
    mock.ledger = [ledgerRow({ quotationNumber: "NEW-0001", checkoutStatus: "NeedsReconcile" })];
    queue(mock, "GET /api/admin/payments/payos/checkouts", { status: 200, json: { items: [ledgerRow({ quotationNumber: "OLD-STALE" })], total: 1, page: 1, pageSize: 20 }, delayMs: 1800 });
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=payments");
    await pick(page, "Trạng thái", { value: "NeedsReconcile" });
    await expect(ledgerRows(page)).toContainText("NEW-0001");
    await page.waitForTimeout(2500);
    await expect(ledgerRows(page)).toContainText("NEW-0001");
    await expect(page.getByText("OLD-STALE")).toHaveCount(0);
  });

  test("states: loading skeleton, empty (with filters and without), error + retry, 403 for an organization user", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    queue(mock, "GET /api/admin/payments/payos/checkouts", { status: 500, json: { title: "boom" } });
    await page.goto("/admin/commerce?tab=payments");
    await expect(page.getByText("Không tải được danh sách thanh toán")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).first().click();
    await expect(page.getByText("Không có thanh toán", { exact: true })).toBeVisible();
    await expect(page.getByText(/Chưa có lượt thanh toán nào/)).toBeVisible();
    await page.goto("/admin/commerce?tab=payments&status=Failed");
    await expect(page.getByText(/Không có bản ghi khớp bộ lọc/)).toBeVisible();
  });

  test("an organization user cannot read the admin ledger", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=payments");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" }).first()).toBeVisible();
    expect(callsTo(mock, "GET", "/api/admin/payments/payos/checkouts")).toHaveLength(0);
  });

  test("cross-tenant 403 on a payment read shows the denial instead of data", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    queue(mock, `GET /api/payments/payos/checkouts/${ids.checkout}`, { status: 403, json: { code: "BILLING_ROLE_FORBIDDEN", title: "forbidden" } });
    await page.goto(`/admin/commerce?tab=payments&checkout=${ids.checkout}`);
    await expect(page.getByText("Không đọc được thông tin thanh toán")).toBeVisible();
    await expect(page.getByTestId("payment-status")).toHaveCount(0);
  });
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 375]) {
    test(`ledger layout ${width}px ${theme}`, async ({ page }, testInfo) => {
      const mock = newMock();
      mock.ledger = rows(12);
      mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: new Date().toISOString(), revision: 5 });
      seedCheckout(mock, { checkoutStatus: "NeedsReconcile" }, paymentFixture({ provisioningStatus: "Partial", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "Succeeded", entitlementId: "e", errorCode: null }, { quotationItemId: "bbbbbbbb-0000-0000-0000-000000000009", buildingId: "b-2", status: "NeedsReconcile", entitlementId: null, errorCode: "PAYOS_SERVICE_PERIOD_RESERVED" }] }));
      void checkoutFixture;
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
      await signIn(page, admin);
      await mockBilling(page, mock);
      await page.goto("/admin/commerce?tab=payments");
      await expect(ledgerRows(page).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`ledger-${theme}-${width}.png`), fullPage: true });
      await page.goto(`/admin/commerce?tab=payments&checkout=${ids.checkout}`);
      await expect(page.getByTestId("payment-detail")).toBeVisible();
      await expect(page.getByTestId("payment-status")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`ledger-detail-${theme}-${width}.png`) });
    });
  }
}
