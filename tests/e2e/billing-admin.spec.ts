import { expect, test } from "@playwright/test";
import { admin, callsTo, checkoutFixture, etagOf, ids, mockBilling, newMock, owner, paymentFixture, quotationFixture, queue, signIn } from "./billing-mock";

// Route-mock evidence only (not the real BE).

test.describe("admin commerce (mock)", () => {
  test("only PlatformAdmin opens it and tabs live in the URL", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" }).first()).toBeVisible();
    expect(mock.calls.filter((call) => call.path.includes("/billing/") || call.path.includes("/admin/"))).toHaveLength(0);
  });

  test("lists packages, creates one with whole-VND price and switches tabs through the URL", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce");
    await expect(page.getByRole("row", { name: /Gói Building 12 tháng/ })).toContainText("500.000");
    await page.getByRole("button", { name: "Tạo gói", exact: true }).first().click();
    await page.getByLabel("Mã gói").fill("bld-new");
    await page.getByLabel("Tên gói").fill("Gói mới");
    await page.getByLabel(/Đơn giá/).fill("12.5");
    await page.getByLabel(/Thời hạn \(tháng\)/).fill("12");
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByText("Đơn giá là số nguyên VND không âm.")).toBeVisible();
    await page.getByLabel(/Đơn giá/).fill("750000");
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByRole("row", { name: /Gói mới/ })).toContainText("750.000");
    expect(callsTo(mock, "POST", "/api/admin/service-packages")[0].body).toMatchObject({ code: "bld-new", unitPrice: 750000, durationMonths: 12, isActive: true });

    await page.getByRole("tab", { name: "Giảm giá" }).click();
    await expect(page).toHaveURL(/tab=discounts/);
    await expect(page.getByRole("row", { name: /BULK5/ })).toContainText("10%");
    await page.reload();
    await expect(page.getByRole("tab", { name: "Giảm giá" })).toHaveAttribute("aria-selected", "true");
  });

  test("package edit sends If-Match; a 412 keeps the typed input and offers the newer version", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce");
    await page.getByRole("button", { name: "Sửa gói BLD-12" }).click();
    await page.getByLabel("Tên gói").fill("Tên đã sửa");
    // Somebody else saves first: the revision moves on.
    mock.packages[0].revision = 4;
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByText(/vừa được thay đổi ở nơi khác/)).toBeVisible();
    await expect(page.getByLabel("Tên gói")).toHaveValue("Tên đã sửa");
    const first = callsTo(mock, "PATCH", `/api/admin/service-packages/${ids.pkg}`)[0];
    expect(first.headers["if-match"]).toBe(etagOf(ids.pkg, 3));
    await page.getByRole("button", { name: "Tải bản mới để đối chiếu" }).click();
    await expect(page.getByLabel("Tên gói")).toHaveValue("Tên đã sửa");
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByRole("row", { name: /Tên đã sửa/ })).toBeVisible();
    const second = callsTo(mock, "PATCH", `/api/admin/service-packages/${ids.pkg}`)[1];
    expect(second.headers["if-match"]).toBe(etagOf(ids.pkg, 4));
  });

  test("discount rule sends an ISO timestamp with a timezone and validates percent range", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=discounts");
    await page.getByRole("button", { name: "Tạo quy tắc" }).first().click();
    await page.getByLabel("Mã quy tắc").fill("tet");
    await page.getByLabel(/Giá trị/).fill("150");
    await page.getByLabel("Bắt đầu").fill("2026-11-01T08:00");
    await page.getByRole("button", { name: "Lưu quy tắc" }).click();
    await expect(page.getByText(/Phần trăm từ 0 đến 100/)).toBeVisible();
    await page.getByLabel(/Giá trị/).fill("12.5");
    await page.getByRole("button", { name: "Lưu quy tắc" }).click();
    await expect(page.getByRole("row", { name: /tet/ })).toBeVisible();
    const body = callsTo(mock, "POST", "/api/admin/discount-rules")[0].body as { validFrom: string; discountValue: number; minimumBuildings: number };
    expect(body.validFrom).toMatch(/Z$/);
    expect(body).toMatchObject({ discountValue: 12.5, minimumBuildings: 1 });
  });

  test("issue a Draft quotation with If-Match, explicit tax and terms; zero amount shows its own message", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    queue(mock, `POST /api/admin/quotations/${ids.quoteDraft}/issue`, { status: 409, json: { code: "ZERO_AMOUNT_NOT_SUPPORTED", title: "zero" } });
    await page.goto(`/admin/commerce?tab=quotes&quotation=${ids.quoteDraft}`);
    await expect(page.getByRole("form", { name: "Phát hành báo giá" })).toBeVisible();
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByText("Nhập điều khoản (1–10.000 ký tự).")).toBeVisible();
    await page.getByLabel("Điều khoản").fill("Điều khoản thử");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByText(/Tổng tiền báo giá bằng 0/)).toBeVisible();
    await page.getByLabel("Thuế (VND)").fill("60000");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByTestId("quotation-total")).toHaveText(/6\.060\.000/);
    const issues = callsTo(mock, "POST", `/api/admin/quotations/${ids.quoteDraft}/issue`);
    expect(issues).toHaveLength(2);
    expect(issues[1].headers["if-match"]).toBe(etagOf(ids.quoteDraft, 1));
    expect(issues[1].body).toMatchObject({ taxAmount: 60000, terms: "Điều khoản thử" });
    expect((issues[1].body as { validUntil: string }).validUntil).toMatch(/Z$/);
  });

  test("payment lookup shows Paid + provisioning per Building and enqueues reconcile", async ({ page }) => {
    const mock = newMock();
    mock.checkout = checkoutFixture({ checkoutStatus: "NeedsReconcile", errorCode: "PAYOS_PROVIDER_TIMEOUT" });
    mock.payment = paymentFixture({ provisioningStatus: "NeedsReconcile", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "NeedsReconcile", entitlementId: null, errorCode: null }] });
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=payments");
    await page.getByLabel("Mã checkout").fill("not-a-guid");
    await page.getByRole("button", { name: "Tra cứu" }).click();
    await expect(page.getByText("Nhập mã checkout dạng GUID")).toBeVisible();
    await page.getByLabel("Mã checkout").fill(ids.checkout);
    await page.getByRole("button", { name: "Tra cứu" }).click();
    await expect(page.getByTestId("payment-status")).toHaveAttribute("data-provisioning-status", "NeedsReconcile");
    await expect(page.getByTestId("payment-status")).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    await page.getByRole("button", { name: "Yêu cầu đối soát" }).click();
    await expect.poll(() => callsTo(mock, "POST", `/api/admin/payments/payos/checkouts/${ids.checkout}/reconcile`).length).toBe(1);
  });

  test("enterprise requests: list is shown and processing is marked as waiting for BE (#56)", async ({ page }) => {
    const mock = newMock();
    mock.enterprise.push({ id: "e1", organizationId: "org-1", requestedBuildingCount: 150, requestedDurationMonths: 12, contactName: "Trần B", contactEmail: "b@fire3d.test", contactPhone: null, notes: "Chuỗi trường học", status: "New", createdAt: "2026-10-09T00:00:00Z" });
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=enterprise");
    await expect(page.getByText("Chờ BE: xử lý yêu cầu liên hệ")).toBeVisible();
    await expect(page.getByRole("link", { name: "BE #56" })).toHaveAttribute("href", /issues\/56$/);
    await expect(page.getByRole("row", { name: /FET3D Lab/ })).toContainText("150 công trình");
  });

  test("a failing list shows an in-place error with retry", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    queue(mock, "GET /api/billing/service-packages", { status: 500, json: { title: "boom" } });
    await page.goto("/admin/commerce");
    await expect(page.getByText("Không tải được gói")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("row", { name: /Gói Building 12 tháng/ })).toBeVisible();
  });
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 375]) {
    test(`layout ${width}px ${theme}: no horizontal overflow on org billing and admin commerce`, async ({ page }, testInfo) => {
      const mock = newMock();
      mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: new Date().toISOString(), revision: 5 });
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
      await signIn(page, owner);
      await mockBilling(page, mock);
      await page.goto(`/workspace/billing?quotation=${ids.quote}&payment=${ids.payment}`);
      await expect(page.getByTestId("payment-status")).toBeVisible();
      await expect(page.getByTestId("provisioning-line")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`org-quote-${theme}-${width}.png`), fullPage: false });
      await page.keyboard.press("Escape");
      await page.screenshot({ path: testInfo.outputPath(`org-list-${theme}-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test(`admin commerce ${width}px ${theme}`, async ({ page }, testInfo) => {
      const mock = newMock();
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
      await signIn(page, admin);
      await mockBilling(page, mock);
      await page.goto("/admin/commerce");
      await expect(page.getByRole("row", { name: /Gói Building 12 tháng/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`admin-packages-${theme}-${width}.png`), fullPage: true });
      await page.goto(`/admin/commerce?tab=quotes&quotation=${ids.quoteDraft}`);
      await expect(page.getByRole("form", { name: "Phát hành báo giá" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`admin-issue-${theme}-${width}.png`) });
    });
  }
}
