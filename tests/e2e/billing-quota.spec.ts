import { expect, test } from "@playwright/test";
import { callsTo, checkoutFixture, grant, ids, iso, mockBilling, newMock, owner, paymentFixture, queue, signIn } from "./billing-mock";

// Route-mock evidence only (not the real BE).

const balance = (overrides: Record<string, unknown> = {}) => ({ quotaUnit: "tokens", granted: 1000, reserved: 50, consumed: 300, expired: 120, available: 650, scheduled: 400, ...overrides });
const notification = (overrides: Record<string, unknown> = {}) => ({ id: "n-1", type: "BuildingServiceExpiring", title: "Dịch vụ sắp hết hạn", body: "Công trình 1 hết hạn sau 5 ngày. Hãy gia hạn để tránh gián đoạn.", buildingId: "b-1", buildingName: "Công trình 1", entitlementId: ids.entitlement, referenceEndsAt: iso(4), createdAt: iso(-0.5), readAt: null, stillRelevant: true, ...overrides });

test.describe("organization AI quota (mock)", () => {
  test("balance per unit, grants by source with their own expiry, and usage allocations all come from the ai-quota endpoints", async ({ page }) => {
    const mock = newMock();
    mock.quota.units = [balance(), balance({ quotaUnit: "requests", granted: 20, reserved: 0, consumed: 5, expired: 0, available: 15, scheduled: 0 })];
    mock.quota.grants = [grant(), grant({ id: "g-2", sourceKind: "TopUp", quotaUnits: 500, reserved: 0, consumed: 0, available: 500, entitlementId: null, buildingId: null, status: "Scheduled", startsAt: iso(10) }), grant({ id: "g-3", sourceKind: "Upgrade", quotaUnits: 100, status: "Expired", endsAt: iso(-3), reserved: 0, consumed: 40, available: 0 })];
    mock.quota.usage = [{ allocationId: "al-1", requestId: "11111111-aaaa-0000-0000-000000000001", grantId: "g-1", quotaUnit: "tokens", reservedUnits: 50, consumedUnits: null, status: "Reserved", createdAt: iso(-0.01), settledAt: null }, { allocationId: "al-2", requestId: "22222222-aaaa-0000-0000-000000000002", grantId: "g-1", quotaUnit: "tokens", reservedUnits: 80, consumedUnits: 62, status: "Settled", createdAt: iso(-1), settledAt: iso(-0.9) }];
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=ai");
    const units = page.getByTestId("quota-unit");
    await expect(units).toHaveCount(2);
    // Units are never combined: 650 tokens and 15 requests, not 665.
    await expect(units.filter({ hasText: "Đơn vị: tokens" }).getByTestId("quota-available")).toHaveText("650");
    await expect(units.filter({ hasText: "Đơn vị: lượt hỏi" }).getByTestId("quota-available")).toHaveText("15");
    await expect(page.getByText("665")).toHaveCount(0);
    await expect(units.first()).toContainText("120");
    await expect(units.first()).toContainText("Không cộng dồn sang kỳ sau");
    const grants = page.getByTestId("quota-grants").locator("tbody tr");
    await expect(grants.nth(0)).toContainText("Gói công trình");
    await expect(grants.nth(1)).toContainText("Nạp thêm trả trước");
    await expect(grants.nth(1)).toContainText("Chưa đến kỳ");
    await expect(grants.nth(2)).toContainText("Nâng cấp");
    await expect(grants.nth(2)).toContainText("Đã hết hạn");
    const usage = page.getByTestId("quota-usage").locator("tbody tr");
    await expect(usage.nth(0)).toContainText("Đang giữ chỗ");
    await expect(usage.nth(1)).toContainText("Đã tính");
    await expect(usage.nth(1)).toContainText("62");
    // No overage vocabulary anywhere on the screen.
    await expect(page.getByText(/overage|trả sau|ghi nợ phí cuối kỳ/i)).toHaveCount(0);
    await expect(page.getByTestId("quota-exhausted")).toHaveCount(0);
    expect(callsTo(mock, "GET", "/api/organizations/me/ai-quota")).toHaveLength(1);
  });

  test("quota exhausted: paid AI is blocked, no overage, and the top-up is offered", async ({ page }) => {
    const mock = newMock();
    mock.quota.units = [balance({ granted: 1000, reserved: 0, consumed: 1000, available: 0, scheduled: 0 })];
    mock.quota.grants = [grant({ quotaUnits: 1000, reserved: 0, consumed: 1000, available: 0 })];
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=ai");
    const blocked = page.getByTestId("quota-exhausted");
    await expect(blocked).toContainText("Hạn mức AI đã hết");
    await expect(blocked).toContainText("tokens");
    await expect(blocked).toContainText("không tính vượt mức và không ghi nợ");
    await expect(page.getByTestId("quota-available")).toHaveText("0");
    await blocked.getByRole("button", { name: "Nạp thêm hạn mức AI" }).click();
    await expect(page.getByRole("radio", { name: "Hạn mức AI", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Số lượng muốn mua")).toBeVisible();
  });

  test("no grants at all: explains where quota comes from instead of showing zero as a number", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=ai");
    await expect(page.getByTestId("quota-exhausted")).toContainText("Chưa có hạn mức AI");
    await expect(page.getByText("Chưa có lần cấp hạn mức nào")).toBeVisible();
    await expect(page.getByText("Chưa có lượt dùng AI")).toBeVisible();
  });

  test("prepaid top-up end to end: draft -> Admin issues -> accept (If-Match) -> pay -> grant appears; nothing is granted before provisioning succeeds", async ({ page }) => {
    const mock = newMock();
    mock.quota.units = [balance({ granted: 1000, reserved: 0, consumed: 1000, available: 0, scheduled: 0 })];
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.route("https://pay.payos.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>PayOS</body></html>" }));
    await page.goto("/workspace/billing?tab=ai");
    await expect(page.getByTestId("quota-exhausted")).toBeVisible();
    await page.getByRole("button", { name: "Nạp thêm hạn mức AI" }).first().click();
    await page.getByLabel("Số lượng muốn mua").fill("500");
    await page.getByRole("button", { name: "Tạo báo giá nạp thêm" }).click();
    await expect(page.getByTestId("topup-snapshot")).toContainText("Chờ quản trị FET3D chốt khi phát hành");
    const draftPost = callsTo(mock, "POST", "/api/billing/quotations")[0];
    expect(draftPost.body).toEqual({ purpose: "AIQuotaTopUp", topUp: { requestedQuotaUnits: 500 } });
    expect(draftPost.headers["idempotency-key"]).toBeTruthy();
    expect(callsTo(mock, "POST", "/api/payments/payos/create")).toHaveLength(0);

    // PlatformAdmin issues it (server side in this mock).
    const id = Object.keys(mock.quotations).find((key) => mock.quotations[key].purpose === "AIQuotaTopUp")!;
    const quote = mock.quotations[id];
    Object.assign(quote, { status: "Issued", taxAmount: 0, terms: "Điều khoản top-up", totalAmount: 200000, subtotalAmount: 200000, pricingStatus: "Final", issuedAt: iso(0), validUntil: iso(3), revision: quote.revision + 1, topUp: { ...(quote.topUp as object), policyVersionId: ids.policy, quotaUnit: "tokens", quotaUnits: 500, amount: 200000, startsAt: iso(1), endsAt: iso(200) } });
    await page.getByRole("button", { name: "Tải lại trạng thái" }).click();
    await expect(page.getByTestId("topup-snapshot")).toContainText("500 tokens");
    await page.getByLabel(/Tôi đã đọc điều khoản/).check();
    await page.getByRole("button", { name: "Chấp nhận báo giá" }).click();
    await expect(page.getByText("Đã chấp nhận · sẵn sàng thanh toán")).toBeVisible();
    expect(callsTo(mock, "POST", `/api/billing/quotations/${id}/accept`)[0].headers["if-match"]).toBe(`"billing-${id.replace(/-/g, "")}-${(quote.revision as number) - 1}"`);
    await page.getByRole("button", { name: "Thanh toán qua PayOS" }).click();
    await page.waitForURL("https://pay.payos.test/**");

    // Paid, but the top-up line is still provisioning: no quota yet.
    mock.checkout = checkoutFixture({ quotationId: id, checkoutStatus: "Completed", amount: 200000 });
    mock.payment = paymentFixture({ quotationId: id, amount: 200000, items: [{ quotationItemId: id, buildingId: null, status: "Pending", entitlementId: null, errorCode: null }] });
    await page.goto("/workspace/billing/return?status=PAID");
    const status = page.getByTestId("payment-status");
    await expect(status).toHaveAttribute("data-provisioning-status", "Pending");
    await expect(page.getByTestId("provisioning-line")).toContainText("Hạn mức AI nạp thêm");
    await expect(status).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    expect(mock.quota.grants).toHaveLength(0);

    // The server finishes: a TopUp grant exists and the pool has room again.
    mock.quota.grants = [grant({ id: "g-top", sourceKind: "TopUp", quotaUnits: 500, reserved: 0, consumed: 0, available: 500, entitlementId: null, buildingId: null, startsAt: iso(1), endsAt: iso(200) })];
    mock.quota.units = [balance({ granted: 1000, reserved: 0, consumed: 1000, available: 0, scheduled: 500 })];
    mock.payment = paymentFixture({ quotationId: id, amount: 200000, provisioningStatus: "Succeeded", items: [{ quotationItemId: id, buildingId: null, status: "Succeeded", entitlementId: null, errorCode: null }] });
    await expect(status).toContainText("Đã thanh toán và kích hoạt dịch vụ", { timeout: 15_000 });
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Hạn mức AI" }).click();
    await expect(page.getByTestId("quota-grant").first()).toContainText("Nạp thêm trả trước");
    await expect(page.getByTestId("topup-quotations").locator("tbody tr").first()).toBeVisible();
  });

  test("quota endpoints: 500 shows retry per block; 403 shows the denial message", async ({ page }) => {
    const mock = newMock();
    mock.quota.units = [balance()];
    queue(mock, "GET /api/organizations/me/ai-quota", { status: 500, json: { title: "boom" } });
    queue(mock, "GET /api/organizations/me/ai-quota/grants", { status: 403, json: { code: "BILLING_ROLE_FORBIDDEN", title: "forbidden" } });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=ai");
    await expect(page.getByText("Không tải được số dư hạn mức AI")).toBeVisible();
    await expect(page.getByText("Không tải được lịch sử cấp hạn mức")).toBeVisible();
    await expect(page.getByText(/không có quyền thực hiện thao tác này/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).first().click();
    await expect(page.getByTestId("quota-available")).toHaveText("650");
  });
});

test.describe("expiry reminders (mock)", () => {
  test("unread relevant reminders raise a banner; reading one is idempotent and clears it", async ({ page }) => {
    const mock = newMock();
    mock.notifications = [notification(), notification({ id: "n-2", title: "Đã gia hạn", stillRelevant: false, buildingName: "Công trình 2" })];
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing");
    await expect(page.getByText("1 nhắc gia hạn chưa đọc")).toBeVisible();
    expect(callsTo(mock, "GET", "/api/organizations/me/notifications")[0].search).toContain("unread=true");
    await page.getByRole("button", { name: "Xem nhắc gia hạn" }).click();
    await expect(page).toHaveURL(/tab=reminders/);
    const items = page.getByTestId("notification");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Công trình 1");
    await expect(items.nth(0)).toContainText("5 ngày");
    await expect(items.nth(1)).toContainText("Đã gia hạn hoặc hết kỳ");
    await items.nth(0).getByRole("button", { name: /Đánh dấu đã đọc/ }).click();
    await expect(items.nth(0)).toHaveAttribute("data-read", "true");
    expect(callsTo(mock, "PATCH", "/api/organizations/me/notifications/n-1/read")).toHaveLength(1);
    // Unread filter and the banner reflect the server's state after a reload.
    await page.getByLabel("Chỉ chưa đọc").click();
    await expect(page).toHaveURL(/unread=1/);
    // Only the unread (and no longer relevant) one is left; the read reminder is gone from this view.
    await expect(page.getByTestId("notification")).toHaveCount(1);
    await expect(page.getByTestId("notification")).toContainText("Công trình 2");
    await page.goto("/workspace/billing");
    await expect(page.getByText(/nhắc gia hạn chưa đọc/)).toHaveCount(0);
  });

  test("renew from a reminder opens the renewal quotation for that Building (selective renewal)", async ({ page }) => {
    const mock = newMock();
    mock.notifications = [notification()];
    mock.entitlements = [{ id: ids.entitlement, buildingId: "b-1", status: "Active", isEffective: true, startsAt: iso(-360), endsAt: iso(4), paymentTransactionId: "tx-1", commercialVersion: 7, learnerLimit: 60 }];
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=reminders");
    await page.getByRole("button", { name: "Gia hạn Công trình 1" }).click();
    await expect(page.getByRole("radio", { name: "Mua mới / gia hạn" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("checkbox", { name: /Công trình 1/ })).toBeChecked();
    await page.locator(`input[name="service-package"][value="${ids.pkg}"]`).check({ force: true });
    await page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ }).click();
    expect(callsTo(mock, "POST", "/api/billing/quotations")[0].body).toEqual({ items: [{ buildingId: "b-1", servicePackageId: ids.pkg, purchaseAction: "Renewal" }] });
  });

  test("empty and failing notification lists", async ({ page }) => {
    const mock = newMock();
    queue(mock, "GET /api/organizations/me/notifications", { status: 200, json: { items: [], total: 0, page: 1, pageSize: 20 } }, { status: 500, json: { title: "x" } });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=reminders");
    await expect(page.getByText("Không tải được thông báo")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).first().click();
    await expect(page.getByText("Chưa có thông báo", { exact: true })).toBeVisible();
  });
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 375]) {
    test(`quota, services and reminders layout ${width}px ${theme}`, async ({ page }, testInfo) => {
      const mock = newMock();
      mock.quota.units = [balance(), balance({ quotaUnit: "requests", granted: 20, reserved: 0, consumed: 20, available: 0, expired: 0, scheduled: 0 })];
      mock.quota.grants = [grant(), grant({ id: "g-2", sourceKind: "TopUp", entitlementId: null, buildingId: null })];
      mock.notifications = [notification()];
      mock.entitlements = [{ id: ids.entitlement, buildingId: "b-1", status: "Active", isEffective: true, startsAt: iso(-360), endsAt: iso(4), paymentTransactionId: "tx-1", commercialVersion: 7, learnerLimit: 60 }];
      mock.service["b-1"] = { current: { entitlementId: ids.entitlement, buildingId: "b-1", organizationId: "org-1", status: "Active", startsAt: iso(-360), endsAt: iso(4), isEffective: true, commercialVersion: 7, baseLearnerLimit: 60, effectiveLearnerLimit: 100, capacityRevision: 2, seatsUsed: 34, seatsRemaining: 66, upgrades: [{ id: "u1", capacityRevision: 2, previousLearnerLimit: 60, learnerLimit: 100, additionalQuotaUnits: 0, effectiveFrom: iso(-10), createdAt: iso(-10) }] }, upcoming: [] };
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
      await signIn(page, owner);
      await mockBilling(page, mock);
      for (const url of ["/workspace/billing?tab=ai", "/workspace/billing?tab=reminders", "/workspace/billing?tab=services&service=b-1", "/workspace/billing?tab=services"]) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        expect(await page.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(width);
        await page.screenshot({ path: testInfo.outputPath(`${url.replace(/\W+/g, "-")}-${theme}-${width}.png`), fullPage: true });
      }
      await page.goto("/workspace/billing?tab=ai");
      await page.getByRole("button", { name: "Nạp thêm hạn mức AI" }).first().click();
      await page.getByLabel("Số lượng muốn mua").fill("500");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`topup-drawer-${theme}-${width}.png`) });
    });
  }
}
