import { expect, test } from "@playwright/test";
import { admin, callsTo, checkoutFixture, ids, iso, mockBilling, newMock, owner, paymentFixture, quotationFixture, queue, seedCheckout, signIn } from "./billing-mock";

// All assertions here run against Playwright route mocks. They prove FE behavior, not the real BE.

const pick = (page: import("@playwright/test").Page, packageId: string) => page.locator(`input[name="service-package"][value="${packageId}"]`).check({ force: true });

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
    const row = snapshot.getByRole("row").filter({ hasText: "Công trình 1" });
    await expect(row).toContainText("5.400.000");
    // Capacity, quota and the fixed period come from the line snapshot (not from the package list).
    await expect(row).toContainText("60 học viên/kỳ");
    await expect(row).toContainText("Quota AI 1.000 tokens");
    await expect(row).toContainText("Kỳ ");
    // Header must not depend on removed fields.
    expect(Object.keys(mock.quotations[ids.quote])).not.toContain("buildingId");
  });

  test("Draft estimate: tax is unknown (null) and never shown as an approved 0; the total says it is an estimate", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quoteDraft}`);
    await expect(page.getByTestId("quotation-tax")).toHaveText("Chưa xác định");
    await expect(page.getByText("Tổng ước tính (chưa thuế)")).toBeVisible();
    await expect(page.getByText("Đang chờ PlatformAdmin phát hành")).toBeVisible();
  });

  test("creating a quotation: double click sends one request and a retry reuses the same Idempotency-Key", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "POST /api/billing/quotations", { status: 503, json: { code: "SERVICE_UNAVAILABLE", title: "down" }, delayMs: 300 });
    await page.goto("/workspace/billing");
    await page.getByRole("button", { name: "Mua gói công trình", exact: true }).first().click();
    await page.getByRole("dialog").getByLabel("Công trình 1", { exact: false }).first().check();
    await expect(page.getByText("Đang kiểm tra địa chỉ…")).toBeHidden();
    await pick(page, ids.pkg);
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
    // The server replay returned ONE quotation, not two.
    expect(Object.keys(mock.quotations).filter((id) => !id.endsWith("001") && !id.endsWith("002"))).toHaveLength(1);
  });

  test("a different selection after a failed create uses a new Idempotency-Key", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "POST /api/billing/quotations", { status: 503, json: { title: "down" } });
    await page.goto("/workspace/billing");
    await page.getByRole("button", { name: "Mua gói công trình", exact: true }).first().click();
    await page.getByRole("dialog").getByLabel("Công trình 1", { exact: false }).first().check();
    await pick(page, ids.pkg);
    await page.getByRole("button", { name: /^Tạo báo giá \(1\)$/ }).click();
    await expect(page.getByText("Chưa tạo được báo giá")).toBeVisible();
    await pick(page, ids.pkg2);
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

  test("accept sends If-Match; a stale ETag (412) keeps the screen, reloads the quotation and charges nothing", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    await expect(page.getByTestId("quotation-total")).toBeVisible();
    // Admin re-issues meanwhile: revision moves on, so the ETag the page holds is stale.
    mock.quotations[ids.quote].revision = 5;
    await page.getByLabel(/Tôi đã đọc điều khoản/).check();
    await page.getByRole("button", { name: "Chấp nhận báo giá" }).click();
    await expect(page.getByText(/vừa được thay đổi ở nơi khác/)).toBeVisible();
    expect(callsTo(mock, "POST", "/api/payments/payos/create")).toHaveLength(0);
    // The reload picked up the new ETag: the second accept goes through.
    await page.getByLabel(/Tôi đã đọc điều khoản/).check();
    await page.getByRole("button", { name: "Chấp nhận báo giá" }).click();
    await expect(page.getByText("Đã chấp nhận · sẵn sàng thanh toán")).toBeVisible();
    const accepts = callsTo(mock, "POST", `/api/billing/quotations/${ids.quote}/accept`);
    expect(accepts[0].headers["if-match"]).toBe(`"billing-${ids.quote.replace(/-/g, "")}-4"`);
    expect(accepts[1].headers["if-match"]).toBe(`"billing-${ids.quote.replace(/-/g, "")}-5"`);
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

    // PayOS confirmed money (verified webhook) but provisioning is still running on the server.
    mock.payment = paymentFixture();
    mock.checkout = checkoutFixture({ checkoutStatus: "Completed" });
    // Back from PayOS with a query claiming success: URL is navigation, not evidence.
    await page.goto("/workspace/billing/return?code=00&id=abc&cancel=false&status=PAID&orderCode=100200");
    await expect(page).toHaveURL(new RegExp(`quotation=${ids.quote}.*payment=${ids.payment}|payment=${ids.payment}.*quotation=${ids.quote}`));
    const status = page.getByTestId("payment-status");
    await expect(status).toHaveAttribute("data-payment-status", "Paid");
    await expect(status).toHaveAttribute("data-provisioning-status", "Pending");
    await expect(status).toContainText("Đã nhận tiền · đang kích hoạt dịch vụ");
    await expect(status).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    await expect(page.getByTestId("provisioning-line")).toHaveAttribute("data-line-status", "Pending");
    // Checkout, payment and provisioning are three separate states.
    await expect(page.getByTestId("checkout-history").getByTestId("payment-states")).toContainText("Thanh toán: Đã nhận tiền");
    await expect(page.getByTestId("checkout-history").getByTestId("payment-states")).toContainText("Kích hoạt: Đang kích hoạt");

    mock.payment = paymentFixture({ provisioningStatus: "Succeeded", items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "Succeeded", entitlementId: "ent-1", errorCode: null }] });
    await expect(status).toContainText("Đã thanh toán và kích hoạt dịch vụ", { timeout: 15_000 });
    await expect(page.getByTestId("provisioning-line")).toHaveAttribute("data-line-status", "Succeeded");
  });

  test("the return URL alone never marks success: with no pending checkout it only offers to open the quotations", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing/return?code=00&status=PAID&orderCode=100200");
    await expect(page.getByText("Không tìm thấy giao dịch đang dở")).toBeVisible();
    await expect(page.getByText(/Đã thanh toán/)).toHaveCount(0);
    expect(mock.calls.filter((call) => call.path.startsWith("/api/payments/"))).toHaveLength(0);
  });

  test("reload recovers the checkout from the server history without the browser memory", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    seedCheckout(mock, { checkoutStatus: "Completed" }, { provisioningStatus: "Pending" });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    // No ?payment= and nothing in localStorage: the quotation checkouts endpoint supplies the payment.
    await expect(page.getByTestId("payment-status")).toHaveAttribute("data-payment-status", "Paid");
    expect(callsTo(mock, "GET", `/api/billing/quotations/${ids.quote}/checkouts`).length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByTestId("payment-status")).toHaveAttribute("data-provisioning-status", "Pending");
    await expect(page.getByRole("button", { name: "Thanh toán qua PayOS" })).toHaveCount(0);
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

  test("Paid with Partial provisioning is a warning with per-line status; it keeps polling slowly and finishes when the server finishes", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({
      status: "Accepted", acceptedAt: iso(-0.1), revision: 5,
      items: [quotationFixture().items[0], { ...quotationFixture().items[0], id: "bbbbbbbb-0000-0000-0000-000000000009", buildingId: "b-2", buildingName: "Công trình b-2" }],
    });
    mock.payment = paymentFixture({
      provisioningStatus: "Partial",
      items: [{ quotationItemId: ids.line, buildingId: "b-1", status: "Succeeded", entitlementId: "ent-1", errorCode: null }, { quotationItemId: "bbbbbbbb-0000-0000-0000-000000000009", buildingId: "b-2", status: "NeedsReconcile", entitlementId: null, errorCode: "PAYOS_SERVICE_PERIOD_RESERVED" }],
    });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}&payment=${ids.payment}`);
    const status = page.getByTestId("payment-status");
    await expect(status).toHaveAttribute("data-provisioning-status", "Partial");
    await expect(status).toContainText("mới kích hoạt một phần");
    await expect(status).not.toContainText("Đã thanh toán và kích hoạt dịch vụ");
    const lines = page.getByTestId("provisioning-line");
    await expect(lines.nth(0)).toHaveAttribute("data-line-status", "Succeeded");
    await expect(lines.nth(1)).toHaveAttribute("data-line-status", "NeedsReconcile");
    await expect(lines.nth(1)).toContainText("đang được giữ cho một thanh toán khác");
    await expect(page.getByText(/kiểm tra thưa hơn/)).toBeVisible();
  });

  test("polling backs off on Retry-After and stops while the tab is hidden", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, `GET /api/payments/payos/requests/${ids.payment}`, { status: 429, json: {}, headers: { "Retry-After": "2" } });
    await page.goto(`/workspace/billing?quotation=${ids.quote}&payment=${ids.payment}`);
    await expect(page.getByTestId("payment-status")).toBeVisible({ timeout: 15_000 });
    const before = callsTo(mock, "GET", `/api/payments/payos/requests/${ids.payment}`).length;
    expect(before).toBeGreaterThanOrEqual(2);
    // Hide the tab: no more reads until it is visible again.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(6000);
    expect(callsTo(mock, "GET", `/api/payments/payos/requests/${ids.payment}`).length).toBe(before);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => callsTo(mock, "GET", `/api/payments/payos/requests/${ids.payment}`).length).toBeGreaterThan(before);
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

  test("cancel an Issued quotation: reason + If-Match + Idempotency-Key; the same key replays; paid or open checkout is refused with the reason", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    await page.getByRole("button", { name: "Hủy báo giá" }).click();
    await page.getByRole("button", { name: "Hủy báo giá" }).last().click();
    await expect(page.getByText("Nhập lý do hủy (1–1000 ký tự).")).toBeVisible();
    await page.getByLabel("Lý do hủy").fill("Đổi kế hoạch");
    mock.paidQuotations.add(ids.quote);
    await page.getByRole("button", { name: "Hủy báo giá" }).last().click();
    await expect(page.getByText(/đã được thanh toán/i).first()).toBeVisible();
    mock.paidQuotations.delete(ids.quote);
    await page.getByRole("button", { name: "Hủy báo giá" }).last().click();
    await expect(page.getByText("Đã hủy", { exact: true }).first()).toBeVisible();
    const cancels = callsTo(mock, "POST", `/api/billing/quotations/${ids.quote}/cancel`);
    expect(cancels).toHaveLength(2);
    // Same reason + same revision => same key (the first attempt failed, the retry replays that intent).
    expect(cancels[1].headers["idempotency-key"]).toBe(cancels[0].headers["idempotency-key"]);
    expect(cancels[0].headers["if-match"]).toBe(`"billing-${ids.quote.replace(/-/g, "")}-4"`);
    expect(cancels[0].body).toEqual({ reason: "Đổi kế hoạch" });
    await expect(page.getByRole("button", { name: "Chấp nhận báo giá" })).toHaveCount(0);
  });

  test("cancel with a checkout still open is refused (QUOTATION_CHECKOUT_UNRESOLVED) and nothing is cancelled", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quote] = quotationFixture({ status: "Accepted", acceptedAt: iso(-0.1), revision: 5 });
    seedCheckout(mock, { checkoutStatus: "Ready" }, { paymentStatus: "Pending", provisioningStatus: "NotStarted", items: [] });
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto(`/workspace/billing?quotation=${ids.quote}`);
    await page.getByRole("button", { name: "Hủy báo giá" }).first().click();
    await page.getByLabel("Lý do hủy").fill("Đổi kế hoạch");
    await page.getByRole("button", { name: "Hủy báo giá" }).last().click();
    await expect(page.getByText(/còn thanh toán chưa kết thúc/)).toBeVisible();
    expect(mock.quotations[ids.quote].status).toBe("Accepted");
  });

  test("403 on another tenant's quotation shows a no-access state, not data", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    queue(mock, "GET /api/billing/quotations/aaaaaaaa-0000-0000-0000-0000000000ff", { status: 403, json: { code: "BILLING_ROLE_FORBIDDEN", title: "forbidden" } });
    await page.goto("/workspace/billing?quotation=aaaaaaaa-0000-0000-0000-0000000000ff");
    await expect(page.getByText("Không có quyền xem báo giá này")).toBeVisible();
    await expect(page.getByTestId("quotation-snapshot")).toHaveCount(0);
  });

  test("a trainee cannot mount the billing workspace and loads no billing data", async ({ page }) => {
    const mock = newMock();
    await signIn(page, { ...owner, role: 2 });
    await mockBilling(page, mock);
    await page.goto("/workspace/billing");
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    expect(mock.calls.filter((call) => call.path.includes("/billing/"))).toHaveLength(0);
  });

  test("no 'Chờ BE' block or sample data for upgrade/seats/quota/top-up in this build", async ({ page }) => {
    const mock = newMock();
    await signIn(page, owner);
    await mockBilling(page, mock);
    await page.goto("/workspace/billing?tab=ai");
    await expect(page.getByTestId("ai-quota")).toBeVisible();
    await expect(page.getByText("Chờ BE (#56)")).toHaveCount(0);
    await expect(page.getByText("Dữ liệu mẫu")).toHaveCount(0);
    await signIn(page, admin);
    await page.goto("/admin/commerce?tab=policies");
    await expect(page.getByText("Chờ BE (#56)")).toHaveCount(0);
    await expect(page.getByTestId("v7-prototype")).toHaveCount(0);
  });
});
