import { expect, test } from "@playwright/test";
import { callsTo, ids, iso, mockBilling, newMock, owner, queue, quotationFixture, seedCheckout, serviceView, signIn } from "./billing-mock";

// Needs the Building detail page that mounts <BuildingServicesTab /> at ?tab=services. Route-mock evidence only.

const ent = (overrides: Record<string, unknown> = {}) => ({ id: ids.entitlement, buildingId: "b-1", status: "Active", isEffective: true, startsAt: iso(-100), endsAt: iso(265), paymentTransactionId: "tx-1", commercialVersion: 7, learnerLimit: 60, ...overrides });
const pick = (page: import("@playwright/test").Page, packageId: string) => page.locator(`input[name="service-package"][value="${packageId}"]`);

test.describe("building services tab (mock)", () => {
  test("no service yet: empty state, New action, address/name prerequisites visible", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    const tab = page.getByTestId("building-services");
    await expect(tab.getByText("Công trình chưa có dịch vụ", { exact: true })).toBeVisible();
    await expect(tab.getByText(/Công trình có địa chỉ/)).toBeVisible();
    await expect(tab.getByRole("button", { name: "Mua dịch vụ" })).toBeEnabled();
    await expect(tab.getByRole("button", { name: "Nâng cấp học viên" })).toBeDisabled();
    await tab.getByRole("button", { name: "Mua dịch vụ" }).click();
    // Catalog snapshot: 6/12 month groups with price, learner capacity and quota straight from the package list.
    await expect(page.getByRole("group", { name: "Gói 6 tháng" })).toContainText("30 học viên mỗi kỳ");
    await expect(page.getByRole("group", { name: "Gói 12 tháng" })).toContainText("60 học viên mỗi kỳ");
    await expect(page.getByRole("group", { name: "Gói 12 tháng" })).toContainText("Quota AI trả trước: 1.000 đơn vị");
    const submit = page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ });
    await expect(submit).toBeDisabled();
    await pick(page, ids.pkg).check({ force: true });
    await expect(submit).toBeEnabled();
  });

  test("catalog without any purchasable package: tells the org to ask PlatformAdmin; legacy or inactive packages are never offered", async ({ page }) => {
    const mock = newMock();
    mock.packages = mock.packages.map((item) => ({ ...item, isPurchasable: false }));
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    await page.getByTestId("building-services").getByRole("button", { name: "Mua dịch vụ" }).click();
    await expect(page.getByText("Chưa có gói đang bán")).toBeVisible();
    await expect(page.getByText(/Tổ chức không tự cấu hình giá hay quota/)).toBeVisible();
    await expect(page.getByTestId("package-option")).toHaveCount(0);
  });

  test("expiring period shows the reminder with days left and Renewal action; isEffective is the server verdict", async ({ page }) => {
    const mock = newMock();
    mock.entitlements = [ent({ endsAt: iso(3) })];
    mock.service["b-1"] = { current: serviceView({ endsAt: iso(3) }), upcoming: [] };
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    const tab = page.getByTestId("building-services");
    await expect(tab.getByText(/Dịch vụ hết hạn sau \d+ ngày/)).toBeVisible();
    await expect(tab.getByRole("button", { name: "Gia hạn kỳ mới" })).toBeVisible();
    await tab.getByRole("button", { name: "Gia hạn kỳ mới" }).click();
    await pick(page, ids.pkg).check({ force: true });
    await page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ }).click();
    await expect(page.getByTestId("quotation-drawer").getByTestId("selected-quotation")).toBeVisible();
    const post = mock.calls.find((call) => call.method === "POST" && call.path === "/api/billing/quotations");
    expect(post?.body).toEqual({ items: [{ buildingId: "b-1", servicePackageId: ids.pkg, purchaseAction: "Renewal" }] });
  });

  test("seats and the effective learner limit come from service-entitlement (current + upcoming + upgrade history)", async ({ page }) => {
    const mock = newMock();
    mock.entitlements = [ent()];
    mock.service["b-1"] = {
      current: serviceView({ baseLearnerLimit: 60, effectiveLearnerLimit: 100, capacityRevision: 2, seatsUsed: 34, seatsRemaining: 66, upgrades: [{ id: "u1", capacityRevision: 2, previousLearnerLimit: 60, learnerLimit: 100, additionalQuotaUnits: 0, effectiveFrom: iso(-10), createdAt: iso(-10) }] }),
      upcoming: [serviceView({ entitlementId: "88888888-0000-0000-0000-000000000002", startsAt: iso(265), endsAt: iso(630), isEffective: false, seatsUsed: 0, seatsRemaining: 60, effectiveLearnerLimit: 60 })],
    };
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    const capacity = page.getByTestId("service-capacity");
    await expect(capacity.getByTestId("period-current")).toContainText("100");
    await expect(capacity.getByTestId("period-current")).toContainText("Gói gốc 60, đã nâng cấp");
    await expect(capacity.getByTestId("seat-count")).toHaveText(/Đã dùng 34 \/ 100 · còn 66/);
    await expect(capacity.getByTestId("period-current").getByRole("row", { name: /60 100/ })).toBeVisible();
    await expect(capacity.getByTestId("period-upcoming")).toContainText("Chưa đến kỳ");
    await expect(capacity.getByTestId("period-upcoming")).toContainText("Kỳ sắp tới");
  });

  test("no seats left: warns that new learners cannot start and points at the upgrade", async ({ page }) => {
    const mock = newMock();
    mock.entitlements = [ent()];
    mock.service["b-1"] = { current: serviceView({ seatsUsed: 60, seatsRemaining: 0 }), upcoming: [] };
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    await expect(page.getByText("Đã hết suất học viên")).toBeVisible();
    await expect(page.getByText(/học viên đã được tính vẫn tiếp tục/)).toBeVisible();
  });

  test("Upgrade: only higher-capacity packages are selectable; the draft keeps the period and shows the BE's one-time fee semantics", async ({ page }) => {
    const mock = newMock();
    mock.entitlements = [ent()];
    mock.service["b-1"] = { current: serviceView(), upcoming: [] };
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    const tab = page.getByTestId("building-services");
    await tab.getByRole("button", { name: "Nâng cấp học viên" }).click();
    await expect(page.getByText(/Mức hiện tại: 60 học viên/)).toBeVisible();
    // 60 and 30 learners are not higher than the current 60: shown but disabled with the reason.
    await expect(pick(page, ids.pkg)).toBeDisabled();
    await expect(pick(page, ids.pkg2)).toBeDisabled();
    await expect(page.getByText("Không cao hơn mức hiện tại (60 học viên).").first()).toBeVisible();
    await pick(page, ids.pkgBig).check({ force: true });
    await page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ }).click();
    const post = callsTo(mock, "POST", "/api/billing/quotations")[0];
    expect(post.body).toEqual({ items: [{ buildingId: "b-1", servicePackageId: ids.pkgBig, purchaseAction: "Upgrade", upgradeEntitlementId: ids.entitlement }] });
    const line = page.getByTestId("quotation-drawer").getByTestId("quotation-line");
    await expect(line).toHaveAttribute("data-action", "Upgrade");
    await expect(line).toContainText("60 → 200 học viên/kỳ");
    await expect(line).toContainText("Giữ kỳ hiện tại và các suất đã dùng");
    await expect(line).toContainText("Một lần");
    await expect(page.getByText(/Phí nâng cấp là một lần và do PlatformAdmin ấn định/)).toBeVisible();
    // The UI computed nothing: the draft total is the BE's estimate (0) until Admin fixes the fee.
    await expect(page.getByTestId("quotation-total")).toHaveText(/0\s*₫/);
  });

  test("Upgrade refused by the BE (UPGRADE_LIMIT_NOT_HIGHER) shows the reason and keeps the selection", async ({ page }) => {
    const mock = newMock();
    mock.entitlements = [ent()];
    mock.service["b-1"] = { current: serviceView(), upcoming: [] };
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "POST /api/billing/quotations", { status: 409, json: { code: "UPGRADE_LIMIT_NOT_HIGHER", title: "x" } });
    await page.goto("/workspace/buildings/b-1?tab=services");
    await page.getByTestId("building-services").getByRole("button", { name: "Nâng cấp học viên" }).click();
    await pick(page, ids.pkgBig).check({ force: true });
    await page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ }).click();
    await expect(page.getByText("Gói đích phải có số học viên lớn hơn mức hiện tại của công trình.")).toBeVisible();
    await expect(pick(page, ids.pkgBig)).toBeChecked();
  });

  test("entitlement with dates in range but isEffective=false is NOT shown as active", async ({ page }) => {
    const mock = newMock();
    mock.entitlements = [ent({ isEffective: false, status: "Suspended" })];
    mock.service["b-1"] = { current: serviceView({ isEffective: false, status: "Suspended" }), upcoming: [] };
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    const tab = page.getByTestId("building-services");
    await expect(tab.getByText("Dịch vụ đã hết hạn")).toBeVisible();
    await expect(tab.getByText("Không hiệu lực").first()).toBeVisible();
  });

  test("payment Paid but provisioning pending keeps the tab in a waiting state and keeps the tab URL", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    seedCheckout(mock, { checkoutStatus: "Completed" });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/buildings/b-1?tab=services&quotation=${ids.quote}&payment=${ids.payment}`);
    const status = page.getByTestId("payment-status");
    await expect(status).toContainText("Đã nhận tiền · đang kích hoạt dịch vụ");
    await expect(status).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    await expect(page).toHaveURL(/tab=services/);
  });

  test("top-up from the Building tab sends a purpose=AIQuotaTopUp draft with no Building lines", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    await page.getByTestId("building-services").getByRole("button", { name: "Mua thêm quota AI" }).click();
    await page.getByLabel("Số lượng muốn mua").fill("abc");
    await expect(page.getByText("Nhập số nguyên dương hoặc để trống.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tạo báo giá top-up" })).toBeDisabled();
    await page.getByLabel("Số lượng muốn mua").fill("500");
    await page.getByRole("button", { name: "Tạo báo giá top-up" }).click();
    const post = callsTo(mock, "POST", "/api/billing/quotations")[0];
    expect(post.body).toEqual({ purpose: "AIQuotaTopUp", topUp: { requestedQuotaUnits: 500 } });
    expect(post.headers["idempotency-key"]).toBeTruthy();
    const snapshot = page.getByTestId("topup-snapshot");
    await expect(snapshot).toContainText("500");
    await expect(snapshot).toContainText("Chờ PlatformAdmin chốt khi phát hành");
    await expect(page.getByText(/PlatformAdmin sẽ chốt số lượng quota, giá, khoảng hiệu lực/)).toBeVisible();
  });

  test("no 'Chờ BE (#56)' block and no sample data in the services tab", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    // v2: the building header and the sidebar mini-stepper read entitlements too, so every call fails here.
    queue(mock, "GET /api/billing/entitlements", ...Array.from({ length: 8 }, () => ({ status: 500, json: { title: "x" } })));
    await page.goto("/workspace/buildings/b-1?tab=services");
    await expect(page.getByText("Chờ BE (#56)")).toHaveCount(0);
    await expect(page.getByTestId("v7-pending")).toHaveCount(0);
    await expect(page.getByTestId("v7-prototype")).toHaveCount(0);
    await expect(page.getByText("Dữ liệu mẫu")).toHaveCount(0);
    await expect(page.getByText("Không tải được dịch vụ của công trình")).toBeVisible();
  });
});
