import { expect, test } from "@playwright/test";
import { ids, iso, mockBilling, newMock, owner, queue, quotationFixture, signIn } from "./billing-mock";

// Needs the Building detail page (feature/ops-building-detail) that mounts <BuildingServicesTab /> at ?tab=services.
// Route-mock evidence only.

const ent = (overrides: Record<string, unknown> = {}) => ({ id: "ent-1", buildingId: "b-1", status: "Active", isEffective: true, startsAt: iso(-100), endsAt: iso(265), paymentTransactionId: "tx-1", ...overrides });

test.describe("building services tab (mock)", () => {
  test("no service yet: empty state, New action, address/name prerequisites visible", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    const tab = page.getByTestId("building-services");
    await expect(tab.getByText("Công trình chưa có dịch vụ")).toBeVisible();
    await expect(tab.getByText(/Công trình có địa chỉ/)).toBeVisible();
    await expect(tab.getByText(/mua mới/i).first()).toBeVisible();
    await expect(tab.getByRole("button", { name: "Tạo báo giá" })).toBeDisabled();
    await tab.getByLabel(/Gói Building 12 tháng/).check({ force: true });
    await expect(tab.getByRole("button", { name: "Tạo báo giá" })).toBeEnabled();
  });

  test("expiring period shows the reminder with days left and Renewal action; isEffective is the server verdict", async ({ page }) => {
    const mock = newMock();
    mock.entitlements = [ent({ endsAt: iso(3) })];
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    const tab = page.getByTestId("building-services");
    await expect(tab.getByText(/Dịch vụ hết hạn sau \d+ ngày/)).toBeVisible();
    await expect(tab.getByText("Gia hạn dịch vụ", { exact: true }).first()).toBeVisible();
    await tab.getByLabel(/Gói Building 12 tháng/).check({ force: true });
    await tab.getByRole("button", { name: "Tạo báo giá" }).click();
    await expect(tab.getByTestId("selected-quotation")).toBeVisible();
    const post = mock.calls.find((call) => call.method === "POST" && call.path === "/api/billing/quotations");
    expect(post?.body).toEqual({ items: [{ buildingId: "b-1", servicePackageId: ids.pkg, purchaseAction: "Renewal" }] });
  });

  test("entitlement with dates in range but isEffective=false is NOT shown as active", async ({ page }) => {
    const mock = newMock();
    mock.entitlements = [ent({ isEffective: false, status: "Suspended" })];
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/buildings/b-1?tab=services");
    const tab = page.getByTestId("building-services");
    await expect(tab.getByText("Dịch vụ đã hết hạn")).toBeVisible();
    await expect(tab.getByText("Không hiệu lực").first()).toBeVisible();
  });

  test("payment Paid but provisioning pending keeps the tab in a waiting state and keeps the tab URL when going to PayOS", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/buildings/b-1?tab=services&quotation=${ids.quote}&payment=${ids.payment}`);
    const status = page.getByTestId("payment-status");
    await expect(status).toContainText("Đã nhận tiền · đang kích hoạt dịch vụ");
    await expect(status).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    await expect(page).toHaveURL(/tab=services/);
  });

  test("production build: the v7 block is pending (#56) and has no sample numbers", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "GET /api/billing/entitlements", { status: 500, json: { title: "x" } });
    await page.goto("/workspace/buildings/b-1?tab=services");
    const v7 = page.getByTestId("v7-pending");
    await expect(v7).toContainText("Chờ BE (#56)");
    await expect(v7.getByRole("link", { name: /BE #56/ })).toHaveAttribute("href", /issues\/56$/);
    await expect(page.getByTestId("v7-prototype")).toHaveCount(0);
    await expect(page.getByText("Dữ liệu mẫu")).toHaveCount(0);
    await expect(page.getByText("Không tải được dịch vụ của công trình")).toBeVisible();
  });
});
