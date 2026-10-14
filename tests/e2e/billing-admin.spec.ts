import { expect, test } from "@playwright/test";
import { admin, callsTo, etagOf, grant, ids, mockBilling, newMock, owner, packageFixture, queue, quotationFixture, serviceView, signIn } from "./billing-mock";

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

  test("packages: shows learner capacity, quota/policy and the server's isPurchasable verdict; legacy packages are marked not sellable", async ({ page }) => {
    const mock = newMock();
    mock.packages.push(packageFixture({ id: ids.pkgLegacy, code: "OLD-1", name: "Gói cũ 1 tháng", durationMonths: 1, commercialVersion: 1, learnerLimit: null, aiQuotaUnits: null, aiPolicyVersionId: null, isPurchasable: false }));
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce");
    await expect(page.getByRole("row", { name: /BLD-12 .*500\.000/ }).first()).toContainText("60");
    await expect(page.getByRole("row", { name: /BLD-12 .*500\.000/ }).first()).toContainText("1.000");
    await expect(page.getByRole("row", { name: /BLD-12 .*500\.000/ }).first()).toContainText("tokens");
    await expect(page.getByRole("row", { name: /BLD-12 .*500\.000/ }).first()).toContainText("Đủ điều kiện bán");
    const legacy = page.getByRole("row", { name: /OLD-1/ });
    await expect(legacy).toContainText("gói cũ (v1)");
    await expect(legacy).toContainText("Không bán được");
  });

  test("package form: 6/12 only, learner limit and quota policy are required, whole-VND price; saved body carries the v7 fields", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce");
    await page.getByRole("button", { name: "Tạo gói", exact: true }).first().click();
    await page.getByLabel("Mã gói").fill("bld-new");
    await page.getByLabel("Tên gói").fill("Gói mới");
    await page.getByLabel(/Đơn giá/).fill("12.5");
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByText("Đơn giá là số nguyên VND không âm.")).toBeVisible();
    await expect(page.getByText("Gói v7 chỉ có thời hạn 6 hoặc 12 tháng.")).toBeVisible();
    await expect(page.getByText("Số học viên mỗi kỳ là số nguyên lớn hơn 0.")).toBeVisible();
    await page.getByLabel(/Đơn giá/).fill("750000");
    await page.getByLabel(/Thời hạn \(tháng\)/).selectOption("12");
    await page.getByLabel("Học viên mỗi kỳ").fill("80");
    await page.getByLabel("Quota AI kèm gói").fill("2500");
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByText("Gói có quota phải chọn phiên bản chính sách quota.")).toBeVisible();
    await page.getByLabel("Phiên bản chính sách quota").selectOption(ids.policy);
    await page.getByRole("button", { name: "Lưu gói" }).click();
    await expect(page.getByRole("row", { name: /Gói mới/ })).toContainText("750.000");
    expect(callsTo(mock, "POST", "/api/admin/service-packages")[0].body).toMatchObject({ code: "bld-new", unitPrice: 750000, durationMonths: 12, learnerLimit: 80, aiQuotaUnits: 2500, aiPolicyVersionId: ids.policy, isActive: true });
  });

  test("empty catalog explains how to configure (policies first); no price, capacity or quota is seeded", async ({ page }) => {
    const mock = newMock();
    mock.packages = [];
    mock.policies = [];
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce");
    await expect(page.getByText("Chưa có gói dịch vụ", { exact: true })).toBeVisible();
    await expect(page.getByText("Chưa có chính sách quota", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Chính sách quota" }).click();
    await expect(page.getByText("Chưa có chính sách quota", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Không có chính sách hay số lượng mặc định/)).toBeVisible();
  });

  test("quota policies: immutable versions (create only), unit pattern validated, server fixes audience/kind/rollover", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=policies");
    await expect(page.getByTestId("policy-row")).toContainText("tokens");
    await expect(page.getByTestId("policy-row")).toContainText("rollover: None");
    await expect(page.getByRole("button", { name: /Sửa|Xóa/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Tạo phiên bản", exact: true }).first().click();
    await page.getByLabel("Đơn vị quota").fill("Tokens VN");
    await page.getByLabel("Hiệu lực từ").fill("2026-11-01T08:00");
    await page.getByRole("button", { name: "Tạo phiên bản" }).last().click();
    await expect(page.getByText(/Đơn vị gồm chữ thường/)).toBeVisible();
    await page.getByLabel("Đơn vị quota").fill("credits");
    await page.getByLabel("Hiệu lực đến").fill("2026-10-01T08:00");
    await page.getByRole("button", { name: "Tạo phiên bản" }).last().click();
    await expect(page.getByText(/Thời điểm kết thúc phải sau thời điểm bắt đầu/)).toBeVisible();
    await page.getByLabel("Hiệu lực đến").fill("");
    await page.getByRole("button", { name: "Tạo phiên bản" }).last().click();
    await expect(page.getByTestId("policy-row")).toHaveCount(2);
    const body = callsTo(mock, "POST", "/api/admin/billing/quota-policies")[0].body as { quotaUnit: string; effectiveFrom: string; effectiveUntil: string | null };
    expect(body.quotaUnit).toBe("credits");
    expect(body.effectiveFrom).toMatch(/Z$/);
    expect(body.effectiveUntil).toBeNull();
    // Reload recovers from the server list.
    await page.reload();
    await expect(page.getByTestId("policy-row")).toHaveCount(2);
  });

  test("package edit sends If-Match; a 412 keeps the typed input and offers the newer version", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce");
    await page.getByRole("button", { name: "Sửa gói BLD-12", exact: true }).click();
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

  test("issue a Draft quotation: If-Match, explicit tax/terms and the fixed service start per line; BE validation text is shown", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    queue(mock, `POST /api/admin/quotations/${ids.quoteDraft}/issue`, { status: 409, json: { code: "ZERO_AMOUNT_NOT_SUPPORTED", title: "zero" } });
    await page.goto(`/admin/commerce?tab=quotes&quotation=${ids.quoteDraft}`);
    await expect(page.getByRole("form", { name: "Phát hành báo giá" })).toBeVisible();
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByText("Nhập điều khoản (1–10.000 ký tự).")).toBeVisible();
    await expect(page.getByText("Mua mới cần ngày bắt đầu dịch vụ trong tương lai.")).toBeVisible();
    await page.getByLabel("Điều khoản").fill("Điều khoản thử");
    await page.getByLabel("Bắt đầu dịch vụ").fill("2027-01-05T08:00");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByText(/Tổng tiền báo giá bằng 0/)).toBeVisible();
    await page.getByLabel("Thuế (VND)").fill("60000");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByTestId("quotation-total")).toHaveText(/6\.060\.000/);
    await expect(page.getByTestId("quotation-tax")).toHaveText(/60\.000/);
    const issues = callsTo(mock, "POST", `/api/admin/quotations/${ids.quoteDraft}/issue`);
    expect(issues).toHaveLength(2);
    expect(issues[1].headers["if-match"]).toBe(etagOf(ids.quoteDraft, 1));
    expect(issues[1].body).toMatchObject({ taxAmount: 60000, terms: "Điều khoản thử", items: [{ quotationItemId: "bbbbbbbb-0000-0000-0000-000000000002" }] });
    expect(((issues[1].body as { items: Array<{ startsAt: string }> }).items[0]).startsAt).toMatch(/Z$/);
    expect((issues[1].body as { validUntil: string }).validUntil).toMatch(/Z$/);
  });

  test("issue an Upgrade line: effective time, new learner limit and one-time fee are Admin inputs; the total is the BE's", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.quoteDraft] = quotationFixture({
      id: ids.quoteDraft, quotationNumber: "FET-Q-0002", status: "Draft", revision: 1, taxAmount: null, terms: null, discountAmount: 0, totalAmount: 0, subtotalAmount: 0, pricingStatus: "Estimated", issuedAt: null,
      items: [{ ...quotationFixture().items[0], id: "bbbbbbbb-0000-0000-0000-000000000002", purchaseAction: "Upgrade", pricingBasis: "OneTime", learnerLimit: 200, unitPrice: 0, subtotalAmount: 0, discountAmount: 0, totalAmount: 0, upgradeEntitlementId: ids.entitlement, upgradeBaseCapacityRevision: 1, upgradePreviousLearnerLimit: 60, startsAt: null }],
    });
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto(`/admin/commerce?tab=quotes&quotation=${ids.quoteDraft}`);
    const line = page.getByTestId("issue-line");
    await expect(line).toContainText("Nâng cấp");
    await expect(line).toContainText("hiện 60 học viên");
    await page.getByLabel("Điều khoản").fill("Điều khoản nâng cấp");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByText("Chọn thời điểm nâng cấp có hiệu lực.")).toBeVisible();
    await expect(page.getByText("Nhập phí nâng cấp một lần (VND, lớn hơn 0).")).toBeVisible();
    await page.getByLabel("Hiệu lực từ").fill("2027-01-05T08:00");
    await page.getByLabel("Học viên sau nâng cấp").fill("50");
    await page.getByLabel(/Phí nâng cấp một lần/).fill("3000000");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    // The BE rejects a limit that is not higher than the current one: its message is shown, the form is kept.
    await expect(page.getByText(/Learner limit must exceed the current limit/)).toBeVisible();
    await expect(page.getByLabel(/Phí nâng cấp một lần/)).toHaveValue("3000000");
    await page.getByLabel("Học viên sau nâng cấp").fill("200");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByTestId("quotation-total")).toHaveText(/3\.000\.000/);
    const issues = callsTo(mock, "POST", `/api/admin/quotations/${ids.quoteDraft}/issue`);
    expect(issues[1].body).toMatchObject({ items: [{ quotationItemId: "bbbbbbbb-0000-0000-0000-000000000002", learnerLimit: 200, oneTimePrice: 3000000 }] });
  });

  test("issue a top-up: policy, units, amount and interval are Admin inputs; no Building lines are sent", async ({ page }) => {
    const mock = newMock();
    mock.quotations[ids.topUpQuote] = quotationFixture({ id: ids.topUpQuote, quotationNumber: "FET-Q-0003", status: "Draft", revision: 1, taxAmount: null, terms: null, discountAmount: 0, totalAmount: 0, subtotalAmount: 0, pricingStatus: "Estimated", issuedAt: null, purpose: "AIQuotaTopUp", items: [], topUp: { id: "t-1", requestedQuotaUnits: 500, policyVersionId: null, quotaUnit: null, quotaUnits: null, amount: null, startsAt: null, endsAt: null } });
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto(`/admin/commerce?tab=quotes&quotation=${ids.topUpQuote}`);
    await expect(page.getByText(/Tổ chức yêu cầu 500/)).toBeVisible();
    await expect(page.getByLabel("Số lượng quota cấp")).toHaveValue("500");
    await page.getByLabel("Điều khoản").fill("Điều khoản top-up");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByText("Chọn phiên bản chính sách quota.")).toBeVisible();
    await page.getByRole("combobox", { name: "Chính sách quota" }).selectOption(ids.policy);
    await page.getByLabel(/Số tiền \(VND\)/).fill("200000");
    await page.getByLabel(/Hiệu lực từ/).fill("2027-01-05T08:00");
    await page.getByLabel(/Hiệu lực đến/).fill("2027-07-05T08:00");
    await page.getByRole("button", { name: "Phát hành báo giá" }).click();
    await expect(page.getByTestId("quotation-total")).toHaveText(/200\.000/);
    const issue = callsTo(mock, "POST", `/api/admin/quotations/${ids.topUpQuote}/issue`)[0];
    expect(issue.body).toMatchObject({ topUp: { policyVersionId: ids.policy, quotaUnits: 500, amount: 200000 } });
    expect((issue.body as { items?: unknown }).items).toBeUndefined();
    await expect(page.getByTestId("topup-snapshot")).toContainText("500 tokens");
  });

  test("admin can cancel an unpaid quotation with a reason; a paid one is refused", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto(`/admin/commerce?tab=quotes&quotation=${ids.quote}`);
    await page.getByRole("button", { name: "Hủy báo giá" }).first().click();
    await page.getByLabel("Lý do hủy").fill("Khách đổi ý");
    mock.paidQuotations.add(ids.quote);
    await page.getByRole("button", { name: "Hủy báo giá" }).last().click();
    await expect(page.getByText(/đã được thanh toán/i).first()).toBeVisible();
    mock.paidQuotations.delete(ids.quote);
    await page.getByRole("button", { name: "Hủy báo giá" }).last().click();
    await expect(page.getByText("Đã hủy", { exact: true }).first()).toBeVisible();
    const cancels = callsTo(mock, "POST", `/api/admin/quotations/${ids.quote}/cancel`);
    expect(cancels).toHaveLength(2);
    expect(cancels[0].headers["idempotency-key"]).toBeTruthy();
    expect(cancels[0].headers["if-match"]).toBe(etagOf(ids.quote, 4));
  });

  test("a failing list shows an in-place error with retry", async ({ page }) => {
    const mock = newMock();
    await signIn(page, admin);
    await mockBilling(page, mock);
    queue(mock, "GET /api/billing/service-packages", { status: 500, json: { title: "boom" } });
    await page.goto("/admin/commerce");
    await expect(page.getByText("Không tải được gói")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("row", { name: /Gói Building 12 tháng/ }).first()).toBeVisible();
  });

  test("AI quota by organization: read-only balance, grants and usage for the chosen tenant", async ({ page }) => {
    const mock = newMock();
    mock.quota.units = [{ quotaUnit: "tokens", granted: 1000, reserved: 50, consumed: 300, expired: 0, available: 650, scheduled: 0 }];
    mock.quota.grants = [grant()];
    await signIn(page, admin);
    await mockBilling(page, mock);
    await page.goto("/admin/commerce?tab=quota");
    await expect(page.getByText("Chọn một tổ chức")).toBeVisible();
    await page.getByRole("combobox", { name: "Tổ chức" }).selectOption("org-1");
    await expect(page.getByTestId("quota-available")).toHaveText("650");
    await expect(page.getByTestId("quota-grant")).toContainText("Gói công trình");
    expect(callsTo(mock, "GET", "/api/admin/organizations/org-1/ai-quota")).toHaveLength(1);
    expect(callsTo(mock, "GET", "/api/admin/organizations/org-1/ai-quota/grants")).toHaveLength(1);
    expect(callsTo(mock, "GET", "/api/admin/organizations/org-1/ai-usage")).toHaveLength(1);
    await expect(page.getByRole("button", { name: "Mua thêm quota (top-up)" })).toHaveCount(0);
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
      mock.service["b-1"] = { current: serviceView(), upcoming: [] };
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
      await signIn(page, admin);
      await mockBilling(page, mock);
      await page.goto("/admin/commerce");
      await expect(page.getByRole("row", { name: /Gói Building 12 tháng/ }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`admin-packages-${theme}-${width}.png`), fullPage: true });
      await page.goto("/admin/commerce?tab=policies");
      await expect(page.getByTestId("policy-row")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.goto(`/admin/commerce?tab=quotes&quotation=${ids.quoteDraft}`);
      await expect(page.getByRole("form", { name: "Phát hành báo giá" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`admin-issue-${theme}-${width}.png`) });
    });
  }
}
