import { expect, test } from "@playwright/test";
import { admin, callsTo, checkoutFixture, ids, iso, mockBilling, newMock, owner, paymentFixture, quotationFixture, queue, signIn } from "./billing-mock";

// All assertions here run against Playwright route mocks. They prove FE behavior, not the real BE.

test.describe("organization billing workspace (mock)", () => {
  test("shows the quotation snapshot exactly as the BE returned it, without recomputing", async ({ page }) => {
    const mock = newMock();
    // The grand total differs from subtotal - discount + tax on purpose: a UI that recomputed would show 5.940.000.
    mock.quotations[ids.quote] = quotationFixture({ totalAmount: 5123000 });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    const snapshot = page.getByTestId("quotation-snapshot");
    await expect(snapshot).toBeVisible();
    await expect(page.getByTestId("quotation-total")).toHaveText(/5\.123\.000/);
    await expect(snapshot).not.toContainText("5.940.000");
    await expect(snapshot).toContainText("Công trình 1");
    await expect(snapshot).toContainText("1 Test Street, Hà Nội");
    await expect(snapshot).toContainText("12 tháng");
    await expect(snapshot).toContainText("Điều khoản mẫu");
    await expect(snapshot.getByRole("row").filter({ hasText: "Công trình 1" })).toContainText("5.400.000");
    // Header must not depend on removed fields.
    expect(Object.keys(mock.quotations[ids.quote])).not.toContain("buildingId");
  });

  test("creating a quotation: double click sends one request and a retry reuses the same Idempotency-Key", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "POST /api/billing/quotations", { status: 503, json: { code: "SERVICE_UNAVAILABLE", title: "down" }, delayMs: 300 });
    await page.goto("/workspace/billing");
    await page.getByRole("button", { name: "Tạo báo giá", exact: true }).first().click();
    await page.getByLabel("Công trình 1", { exact: false }).first().check();
    await expect(page.getByText("Đang kiểm tra địa chỉ…")).toBeHidden();
    await page.getByLabel("Gói dịch vụ").selectOption(ids.pkg);
    const submit = page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ });
    await submit.dblclick();
    await expect(page.getByText("Chưa tạo được báo giá")).toBeVisible();
    expect(callsTo(mock, "POST", "/api/billing/quotations")).toHaveLength(1);
    // Retry with the same payload: the same key replays the original intent.
    await submit.click();
    await expect(page.getByRole("heading", { name: "Chi tiết báo giá" })).toBeVisible();
    const posts = callsTo(mock, "POST", "/api/billing/quotations");
    expect(posts).toHaveLength(2);
    expect(posts[1].headers["idempotency-key"]).toBeTruthy();
    expect(posts[1].headers["idempotency-key"]).toBe(posts[0].headers["idempotency-key"]);
    expect(posts[0].body).toEqual({ items: [{ buildingId: "b-1", servicePackageId: ids.pkg, purchaseAction: "New" }] });
    // Draft: tell the user it waits for PlatformAdmin and offers no payment.
    await expect(page.getByText("Đang chờ PlatformAdmin phát hành")).toBeVisible();
    await expect(page.getByRole("button", { name: /Thanh toán qua PayOS|Chấp nhận báo giá/ })).toHaveCount(0);
  });

  test("a different selection after a failed create uses a new Idempotency-Key", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "POST /api/billing/quotations", { status: 503, json: { title: "down" } });
    await page.goto("/workspace/billing");
    await page.getByRole("button", { name: "Tạo báo giá", exact: true }).first().click();
    await page.getByLabel("Công trình 1", { exact: false }).first().check();
    await page.getByLabel("Gói dịch vụ").selectOption(ids.pkg);
    await page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ }).click();
    await expect(page.getByText("Chưa tạo được báo giá")).toBeVisible();
    await page.getByLabel("Gói dịch vụ").selectOption(ids.pkg2);
    await page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ }).click();
    await expect(page.getByRole("heading", { name: "Chi tiết báo giá" })).toBeVisible();
    const posts = callsTo(mock, "POST", "/api/billing/quotations");
    expect(posts[1].headers["idempotency-key"]).not.toBe(posts[0].headers["idempotency-key"]);
  });

  test("accepting after the expiry returns 409 and says why (no charge, no retry loop)", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, `POST /api/billing/quotations/${ids.quote}/accept`, { status: 409, json: { code: "BILLING_STATE_CONFLICT", title: "Only an unexpired Issued quotation can be accepted." } });
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    await page.getByLabel(/Tôi đã đọc điều khoản/).check();
    await page.getByRole("button", { name: "Chấp nhận báo giá" }).click();
    await expect(page.getByText(/đã hết hạn hoặc không còn ở trạng thái chờ chấp nhận/)).toBeVisible();
    const accepts = callsTo(mock, "POST", `/api/billing/quotations/${ids.quote}/accept`);
    expect(accepts).toHaveLength(1);
    expect(accepts[0].headers["if-match"]).toBe(`"billing-${ids.quote.replace(/-/g, "")}-4"`);
    expect(callsTo(mock, "POST", "/api/payments/payos/create")).toHaveLength(0);
  });

  test("a quotation already past validUntil cannot be accepted", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ validUntil: iso(-1) });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    await expect(page.getByText("Báo giá đã hết hạn", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chấp nhận báo giá" })).toBeDisabled();
  });

  test("accept -> PayOS redirect -> return URL: Paid without finished provisioning is NOT success; success only when provisioning Succeeded", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.route("https://pay.payos.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>PayOS</body></html>" }));
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    await page.getByLabel(/Tôi đã đọc điều khoản/).check();
    await page.getByRole("button", { name: "Chấp nhận báo giá" }).click();
    await expect(page.getByText("Đã chấp nhận · sẵn sàng thanh toán")).toBeVisible();
    // Accept needed the ETag of the read; the create carries a key.
    await page.getByRole("button", { name: "Thanh toán qua PayOS" }).click();
    await page.waitForURL("https://pay.payos.test/**");
    const creates = callsTo(mock, "POST", "/api/payments/payos/create");
    expect(creates).toHaveLength(1);
    expect(creates[0].headers["idempotency-key"]).toBeTruthy();
    expect(creates[0].body).toEqual({ quotationId: ids.quote });

    // Back from PayOS with a query claiming success: URL is navigation, not evidence.
    await page.goto("/workspace/billing/return?code=00&id=abc&cancel=false&status=PAID&orderCode=100200");
    await expect(page).toHaveURL(new RegExp(`quotation=${ids.quote}.*payment=${ids.payment}|payment=${ids.payment}.*quotation=${ids.quote}`));
    const status = page.getByTestId("payment-status");
    await expect(status).toHaveAttribute("data-payment-status", "Paid");
    await expect(status).toHaveAttribute("data-provisioning-status", "Pending");
    await expect(status).toContainText("Đã nhận tiền · đang kích hoạt dịch vụ");
    await expect(status).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    await expect(page.getByTestId("provisioning-line")).toHaveAttribute("data-line-status", "Pending");

    mock.payment = paymentFixture({ provisioningStatus: "Succeeded", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "Succeeded", entitlementId: "ent-1", errorCode: null }] });
    await expect(status).toContainText("Đã thanh toán và kích hoạt dịch vụ", { timeout: 15_000 });
    await expect(page.getByTestId("provisioning-line")).toHaveAttribute("data-line-status", "Succeeded");
  });

  test("Paid with provisioning NeedsReconcile is shown as a reconcile state, not success", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    mock.payment = paymentFixture({ provisioningStatus: "NeedsReconcile", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "NeedsReconcile", entitlementId: null, errorCode: "PAYOS_PROVISIONING_UNAVAILABLE" }] });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}&payment=${ids.payment}`);
    const status = page.getByTestId("payment-status");
    await expect(status).toHaveAttribute("data-provisioning-status", "NeedsReconcile");
    await expect(status).toContainText("kích hoạt đang cần đối soát");
    await expect(status).toContainText("Bạn không cần thanh toán lại");
    await expect(status).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    await expect(page.getByTestId("provisioning-line")).toContainText("Cần đối soát");
    await expect(page.getByTestId("provisioning-line")).toContainText("kích hoạt dịch vụ tạm thời chưa sẵn sàng");
  });

  test("payment still Pending after coming back shows waiting, and a missing Idempotency-Key (400) is explained", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "POST /api/payments/payos/create", { status: 400, json: { code: "IDEMPOTENCY_KEY_REQUIRED", title: "Idempotency-Key is required.", errors: { idempotencyKey: ["Idempotency-Key is required."] } } });
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    await page.getByRole("button", { name: "Thanh toán qua PayOS" }).click();
    await expect(page.getByText(/thiếu khóa chống gửi trùng/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Thử lại thanh toán" })).toBeEnabled();
  });

  test("IDEMPOTENCY_KEY_CONFLICT, ZERO_AMOUNT and 429 map to specific text", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "POST /api/payments/payos/create", { status: 409, json: { code: "IDEMPOTENCY_KEY_CONFLICT", title: "used" } }, { status: 409, json: { code: "ZERO_AMOUNT_NOT_SUPPORTED", title: "zero" } }, { status: 429, json: {}, headers: { "Retry-After": "12" } });
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    const pay = page.getByRole("button", { name: /Thanh toán qua PayOS|Thử lại thanh toán/ });
    await pay.click();
    await expect(page.getByText(/đã được dùng cho nội dung khác/)).toBeVisible();
    await pay.click();
    await expect(page.getByText(/Tổng tiền báo giá bằng 0/)).toBeVisible();
    await pay.click();
    await expect(page.getByText(/Thử lại sau 12 giây/)).toBeVisible();
  });

  test("202 while the link is still being created: wait without a second create", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    mock.checkout = checkoutFixture({ checkoutStatus: "Creating", paymentRequestId: null, checkoutUrl: null });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.route("https://pay.payos.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>PayOS</body></html>" }));
    queue(mock, "POST /api/payments/payos/create", { status: 202, json: mock.checkout });
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    await page.getByRole("button", { name: "Thanh toán qua PayOS" }).click();
    await expect(page.getByText("Đang tạo liên kết thanh toán")).toBeVisible();
    mock.checkout = checkoutFixture();
    await expect(page.getByRole("button", { name: "Mở trang thanh toán PayOS" })).toBeVisible({ timeout: 12_000 });
    expect(callsTo(mock, "POST", "/api/payments/payos/create")).toHaveLength(1);
  });

  test("enterprise request sends an Idempotency-Key and creates no payment or quotation", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=enterprise");
    await page.getByLabel("Số công trình dự kiến").fill("150");
    await page.getByLabel("Người liên hệ").fill("Trần B");
    await page.getByLabel("Email liên hệ").fill("b@fire3d.test");
    await page.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByText("Đã gửi yêu cầu", { exact: true })).toBeVisible();
    const posts = callsTo(mock, "POST", "/api/billing/enterprise-quote-requests");
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["idempotency-key"]).toBeTruthy();
    expect(posts[0].body).toMatchObject({ requestedBuildingCount: 150, contactName: "Trần B", contactEmail: "b@fire3d.test", requestedDurationMonths: null });
    expect(mock.calls.filter((call) => call.path.includes("/payments/") || (call.method === "POST" && call.path.endsWith("/quotations")))).toHaveLength(0);
  });

  test("a trainee cannot mount the billing workspace and loads no billing data", async ({ page }) => {
    const mock = newMock();
    await signIn(page, { ...owner, role: 2 });
    await mockBilling(page, mock);
    await page.goto("/workspace/billing");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    expect(mock.calls.filter((call) => call.path.includes("/billing/"))).toHaveLength(0);
  });

  test("production build exposes the v7 block as pending and ships no sample data", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=v7");
    await expect(page.getByTestId("v7-pending")).toContainText("Chờ BE (#56)");
    await expect(page.getByTestId("v7-pending").getByRole("link", { name: /BE #56/ })).toHaveAttribute("href", "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/56");
    await expect(page.getByTestId("v7-prototype")).toHaveCount(0);
    await expect(page.getByText("Dữ liệu mẫu")).toHaveCount(0);
  });
});
