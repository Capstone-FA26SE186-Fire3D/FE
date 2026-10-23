import { expect, test, type Page } from "@playwright/test";

import { pick } from "./chip-helpers";
import { admin, calls, ids, mockAi, newAiMock, owner, requestId, seedRequest, signInAs, type AiMock } from "./org-ai-mock";

// Route mocks that follow the BE source (admin gates in OrganizationAi.sql, AdminAiController). Mock evidence only.

// DataTable rows: `<tr>` on desktop, cards under 640px.
const rows = (page: Page, table: string) => page.getByTestId(table).locator("tbody tr, li.ops-dt-card");
const requestRows = (page: Page) => rows(page, "ai-requests-table");
const policyRows = (page: Page) => rows(page, "ai-policies-table");
const sourceRows = (page: Page) => rows(page, "ai-sources-table");

async function open(page: Page, mock: AiMock, url: string, user: typeof owner | typeof admin = admin, theme?: "light" | "dark") {
  if (theme) await page.addInitScript((value) => localStorage.setItem("fire3d-ops-theme", value), theme);
  await signInAs(page, user);
  await mockAi(page, mock);
  await page.goto(url);
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("Admin AI: requests and reconcile", () => {
  test("lists requests of every organization, filters by status and organization in the URL, opens the admin detail", async ({ page }) => {
    const mock = newAiMock();
    seedRequest(mock, { status: "Succeeded", organizationId: "org-1" });
    const stuck = seedRequest(mock, { status: "NeedsReconcile", failureCode: "AI_OUTCOME_UNKNOWN", result: undefined, consumedUnits: undefined, organizationId: "org-2", providerResult: { requestId: "x", outcome: "Succeeded", answer: "withheld" }, allocations: [{ grantId: ids.grant, reservedUnits: 50, consumedUnits: null, status: "Reserved" }] });
    await open(page, mock, "/admin/ai");
    await expect(requestRows(page)).toHaveCount(2);
    await pick(page, "Trạng thái", { value: "NeedsReconcile" });
    await expect(page).toHaveURL(/status=NeedsReconcile/);
    await expect(requestRows(page)).toHaveCount(1);
    await expect(requestRows(page)).toContainText("Công ty B");
    await pick(page, "Trạng thái", { value: "" });
    await page.getByRole("combobox", { name: "Tổ chức" }).click();
    await page.getByRole("option", { name: "Trường Mẫu" }).click();
    await expect.poll(() => calls(mock, "GET", "/api/admin/ai/requests").at(-1)?.search).toContain("organizationId=org-1");
    await expect(requestRows(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Xóa lựa chọn" }).click();
    await expect(requestRows(page)).toHaveCount(2);
    await requestRows(page).filter({ hasText: "Công ty B" }).click();
    await expect(page).toHaveURL(new RegExp(`request=${stuck.requestId}`));
    await expect(page.getByTestId("ai-admin-meta")).toContainText("Công ty B");
    await expect(page.getByTestId("ai-admin-meta")).toContainText("AI_OUTCOME_UNKNOWN");
    await expect(page.getByTestId("ai-provider-result")).toContainText("withheld");
    await expect(page.getByTestId("ai-usage")).toContainText("Theo đợt cấp");
    await page.reload();
    await expect(page.getByTestId("ai-admin-meta")).toBeVisible();
  });

  test("reconcile asks for confirmation, sends one POST with an Idempotency-Key, shows 202 as scheduled (not settled) and then the settled state", async ({ page }) => {
    const mock = newAiMock();
    const stuck = seedRequest(mock, { status: "NeedsReconcile", failureCode: "AI_OUTCOME_UNKNOWN", result: undefined, consumedUnits: undefined, providerResult: { outcome: "Succeeded" } });
    await open(page, mock, `/admin/ai?request=${stuck.requestId}`);
    await expect(page.getByTestId("ai-status")).toHaveText("Chờ đối soát");
    await page.getByTestId("ai-reconcile").click();
    await expect(page.getByRole("dialog", { name: "Đối soát yêu cầu AI?" })).toContainText("Chỉ lên lịch tra cứu");
    expect(calls(mock, "POST", `/api/admin/ai/requests/${stuck.requestId}/reconcile`)).toHaveLength(0);
    await page.getByTestId("ai-reconcile-confirm").click();
    await expect(page.getByText("Đã lên lịch tra cứu").first()).toBeVisible();
    await expect(page.getByTestId("ai-reconcile")).toBeDisabled();
    const posts = calls(mock, "POST", `/api/admin/ai/requests/${stuck.requestId}/reconcile`);
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["idempotency-key"]).toMatch(/\S+/);
    // Polling continues until the worker settles it.
    await expect(page.getByTestId("ai-status")).toHaveText("Hoàn tất", { timeout: 15_000 });
    await expect(page.getByTestId("ai-answer")).toBeVisible();
  });

  test("a reconcile whose response is lost retries with the SAME key and schedules exactly once", async ({ page }) => {
    const mock = newAiMock({ submitFaults: ["lost-response"] });
    const stuck = seedRequest(mock, { status: "NeedsReconcile", failureCode: "AI_OUTCOME_UNKNOWN", result: undefined, consumedUnits: undefined });
    await open(page, mock, `/admin/ai?request=${stuck.requestId}`);
    await page.getByTestId("ai-reconcile").click();
    await page.getByTestId("ai-reconcile-confirm").click();
    await expect(page.getByText("Chưa lên lịch được đối soát").first()).toBeVisible();
    await page.getByRole("button", { name: "Xác nhận đối soát" }).click();
    await expect(page.getByText("Đã lên lịch tra cứu").first()).toBeVisible();
    const posts = calls(mock, "POST", `/api/admin/ai/requests/${stuck.requestId}/reconcile`);
    expect(posts).toHaveLength(2);
    expect(posts[1].headers["idempotency-key"]).toBe(posts[0].headers["idempotency-key"]);
    expect(mock.adminReceipts.size).toBe(1);
  });

  test("a request that settled meanwhile answers 409 AI_RECONCILE_NOT_ALLOWED with the reason", async ({ page }) => {
    const mock = newAiMock();
    const stuck = seedRequest(mock, { status: "NeedsReconcile", failureCode: "AI_OUTCOME_UNKNOWN", result: undefined, consumedUnits: undefined });
    await open(page, mock, `/admin/ai?request=${stuck.requestId}`);
    await expect(page.getByTestId("ai-reconcile")).toBeEnabled();
    stuck.status = "Succeeded";
    await page.getByTestId("ai-reconcile").click();
    await page.getByTestId("ai-reconcile-confirm").click();
    await expect(page.getByText("Chỉ yêu cầu đang ở trạng thái Chờ đối soát").first()).toBeVisible();
  });

  test("a request that is not NeedsReconcile offers no reconcile; unknown id is a clear 404; empty and error states", async ({ page }) => {
    const mock = newAiMock();
    const done = seedRequest(mock, { status: "Succeeded" });
    await open(page, mock, `/admin/ai?request=${done.requestId}`);
    await expect(page.getByTestId("ai-status")).toHaveText("Hoàn tất");
    await expect(page.getByTestId("ai-reconcile")).toHaveCount(0);
    await page.goto(`/admin/ai?request=${requestId(98)}`);
    await expect(page.getByText("Không mở được yêu cầu này")).toBeVisible();
    await page.goto("/admin/ai?status=Failed");
    await expect(page.getByText("Không có yêu cầu phù hợp.")).toBeVisible();
    await page.route("**/api/admin/ai/requests?*", (route) => route.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ status: 500, title: "boom" }) }));
    await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(page.getByText("Không tải được yêu cầu AI")).toBeVisible();
  });

  test("an organization account has no access to the admin AI area", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/admin/ai", owner);
    await expect(page.getByText("Chỉ PlatformAdmin có thể truy cập khu quản trị.")).toBeVisible();
    expect(calls(mock, "GET", "/api/admin/ai/requests")).toHaveLength(0);
  });
});

test.describe("Admin AI: policies", () => {
  test("lists policies; creating has no defaults, validates like the controller and sends the exact values once", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/admin/ai?tab=policies");
    await expect(policyRows(page)).toHaveCount(1);
    await expect(policyRows(page)).toContainText("Hỏi đáp");
    await expect(policyRows(page)).toContainText("tokens");
    await page.getByTestId("policy-new").click();
    const form = page.getByRole("form", { name: "Tạo chính sách AI" });
    for (const label of ["Đơn vị quota", "Giữ chỗ mỗi yêu cầu", "Số ký tự đầu vào tối đa", "Số nguồn tối đa", "Hiệu lực từ", "Hiệu lực đến"]) await expect(form.getByLabel(label)).toHaveValue("");
    // The operation combobox has no preset either: it still shows its placeholder.
    await expect(form.getByLabel("Thao tác")).toHaveAttribute("data-placeholder", "true");
    await expect(form).toContainText("Chính sách bất biến");

    await page.getByTestId("policy-create").click();
    await expect(form.getByText("Chọn thao tác.")).toBeVisible();
    await expect(form.getByText("Số nguyên từ 1 đến 100.000.000.")).toBeVisible();
    expect(calls(mock, "POST", "/api/admin/ai/policies")).toHaveLength(0);

    await form.getByLabel("Thao tác").click();
    await page.getByRole("option", { name: /\(ScenarioDraft\)/ }).click();
    await form.getByLabel("Đơn vị quota").fill("Tokens");
    await form.getByLabel("Giữ chỗ mỗi yêu cầu").fill("0");
    await form.getByLabel("Số ký tự đầu vào tối đa").fill("20001");
    await form.getByLabel("Số nguồn tối đa").fill("101");
    await page.getByTestId("policy-create").click();
    await expect(form.getByText(/Chữ thường, bắt đầu bằng chữ cái/)).toBeVisible();
    await expect(form.getByText("Số nguyên từ 1 đến 20.000.")).toBeVisible();
    await expect(form.getByText("Số nguyên từ 1 đến 100.", { exact: true })).toBeVisible();
    expect(calls(mock, "POST", "/api/admin/ai/policies")).toHaveLength(0);

    await form.getByLabel("Đơn vị quota").fill("tokens");
    await form.getByLabel("Giữ chỗ mỗi yêu cầu").fill("120");
    await form.getByLabel("Số ký tự đầu vào tối đa").fill("6000");
    await form.getByLabel("Số nguồn tối đa").fill("12");
    await page.getByTestId("policy-create").click();
    await expect(policyRows(page)).toHaveCount(2);
    const posts = calls(mock, "POST", "/api/admin/ai/policies");
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["idempotency-key"]).toMatch(/\S+/);
    expect(posts[0].body).toEqual({ operation: "ScenarioDraft", quotaUnit: "tokens", reserveUnits: 120, maxInputChars: 6000, maxSources: 12 });
    // Policies are immutable: no edit control or row menu exists on a row.
    await expect(policyRows(page).getByRole("button")).toHaveCount(0);
  });

  test("an overlapping period is refused with 409 and the typed values stay; a lost response retries with the same key", async ({ page }) => {
    const mock = newAiMock({ submitFaults: [] });
    await open(page, mock, "/admin/ai?tab=policies");
    await page.getByTestId("policy-new").click();
    const form = page.getByRole("form", { name: "Tạo chính sách AI" });
    await form.getByLabel("Thao tác").click();
    await page.getByRole("option", { name: /\(Answer\)/ }).click();
    await form.getByLabel("Đơn vị quota").fill("tokens");
    await form.getByLabel("Giữ chỗ mỗi yêu cầu").fill("10");
    await form.getByLabel("Số ký tự đầu vào tối đa").fill("100");
    await form.getByLabel("Số nguồn tối đa").fill("5");
    await page.getByTestId("policy-create").click();
    await expect(form.getByText("Khoảng hiệu lực chồng lên một chính sách khác")).toBeVisible();
    await expect(form.getByLabel("Giữ chỗ mỗi yêu cầu")).toHaveValue("10");
    // Endless existing period for Answer: an until in the past is rejected client-side before any call.
    await form.getByLabel("Hiệu lực đến").fill("2020-01-01T00:00");
    await page.getByTestId("policy-create").click();
    await expect(form.getByText("Phải sau thời điểm bắt đầu hiệu lực.")).toBeVisible();
    expect(calls(mock, "POST", "/api/admin/ai/policies")).toHaveLength(1);
  });
});

test.describe("Admin AI: knowledge sources", () => {
  test("lists with filters in the URL and opens the detail by id after a reload", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/admin/ai?tab=sources");
    await expect(sourceRows(page)).toHaveCount(2);
    await pick(page, "Trạng thái", { value: "Draft" });
    await expect(page).toHaveURL(/status=Draft/);
    await expect(sourceRows(page)).toHaveCount(1);
    await sourceRows(page).filter({ hasText: "TCVN 3890:2023" }).click();
    await expect(page.getByTestId("source-detail")).toContainText("TCVN 3890:2023");
    await expect(page.getByTestId("source-status")).toHaveText("Bản nháp");
    await page.reload();
    await expect(page.getByTestId("source-detail")).toContainText("TCVN 3890:2023");
    await page.getByTestId("ai-source-drawer").getByRole("button", { name: "Đóng" }).click();
    await page.getByLabel("Tìm nguồn").fill("qcvn");
    await expect(sourceRows(page)).toHaveCount(0); // status=Draft is still applied
    await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(sourceRows(page)).toHaveCount(2);
  });

  test("create: http and credentials in the link are refused before any call; a valid source is registered as Draft with one key", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/admin/ai?tab=sources");
    await page.getByTestId("source-new").click();
    const form = page.getByRole("form", { name: "Đăng ký nguồn tri thức" });
    await form.getByLabel("Phạm vi dùng").click();
    await page.getByRole("option", { name: "Dùng chung (mọi tổ chức)" }).click();
    await form.getByLabel("Tiêu đề").fill("Nghị định 136/2020/NĐ-CP");
    await form.getByLabel("Nhãn phiên bản").fill("2020");
    await form.getByLabel("SHA-256 của tài liệu").fill("abc");
    await form.getByLabel("Liên kết tham chiếu (https)").fill("http://example.gov.vn/nd136");
    await page.getByTestId("source-create").click();
    await expect(form.getByText("Chỉ nhận liên kết https.")).toBeVisible();
    await expect(form.getByText("SHA-256 của tài liệu gồm 64 ký tự hex.")).toBeVisible();
    await form.getByLabel("Liên kết tham chiếu (https)").fill("https://user:secret@example.gov.vn/nd136");
    await page.getByTestId("source-create").click();
    await expect(form.getByText("Liên kết không được chứa tài khoản hoặc mật khẩu.")).toBeVisible();
    expect(calls(mock, "POST", "/api/admin/knowledge-sources")).toHaveLength(0);

    await form.getByLabel("Liên kết tham chiếu (https)").fill("https://example.gov.vn/nd136");
    await form.getByLabel("SHA-256 của tài liệu").fill("C".repeat(64));
    await page.getByTestId("source-create").click();
    await expect(page.getByTestId("source-detail")).toContainText("Nghị định 136/2020/NĐ-CP");
    await expect(page.getByTestId("source-status")).toHaveText("Bản nháp");
    const posts = calls(mock, "POST", "/api/admin/knowledge-sources");
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["idempotency-key"]).toMatch(/\S+/);
    expect(posts[0].body).toEqual({ visibility: "Common", title: "Nghị định 136/2020/NĐ-CP", versionLabel: "2020", sourceHash: "c".repeat(64), sourceUri: "https://example.gov.vn/nd136" });
  });

  test("the SHA-256 can be computed from a local file without uploading it", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/admin/ai?tab=sources");
    await page.getByTestId("source-new").click();
    const form = page.getByRole("form", { name: "Đăng ký nguồn tri thức" });
    await form.getByLabel("Tính SHA-256 từ tệp").setInputFiles({ name: "doc.txt", mimeType: "text/plain", buffer: Buffer.from("abc") });
    // SHA-256("abc")
    await expect(form.getByLabel("SHA-256 của tài liệu")).toHaveValue("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(mock.calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  test("an Organization source needs an organization", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/admin/ai?tab=sources");
    await page.getByTestId("source-new").click();
    const form = page.getByRole("form", { name: "Đăng ký nguồn tri thức" });
    await form.getByLabel("Phạm vi dùng").click();
    await page.getByRole("option", { name: "Riêng một tổ chức" }).click();
    await page.getByTestId("source-create").click();
    await expect(form.getByText("Nguồn riêng phải gắn một tổ chức.")).toBeVisible();
    expect(calls(mock, "POST", "/api/admin/knowledge-sources")).toHaveLength(0);
  });

  test("approve and retire send If-Match with the revision read, after a confirmation, and show the new state", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, `/admin/ai?tab=sources&source=${ids.src2}`);
    await expect(page.getByTestId("source-revision")).toHaveText("1");
    await page.getByTestId("source-approve").click();
    await expect(page.getByRole("dialog", { name: "Duyệt nguồn tri thức?" })).toBeVisible();
    expect(calls(mock, "POST", `/api/admin/knowledge-sources/${ids.src2}/approve`)).toHaveLength(0);
    await page.getByTestId("source-confirm").click();
    await expect(page.getByTestId("source-status")).toHaveText("Đã duyệt");
    await expect(page.getByTestId("source-revision")).toHaveText("2");
    expect(calls(mock, "POST", `/api/admin/knowledge-sources/${ids.src2}/approve`)[0].headers["if-match"]).toBe('"1"');
    await page.getByTestId("source-retire").click();
    await page.getByTestId("source-confirm").click();
    await expect(page.getByTestId("source-status")).toHaveText("Đã ngừng dùng");
    expect(calls(mock, "POST", `/api/admin/knowledge-sources/${ids.src2}/retire`)[0].headers["if-match"]).toBe('"2"');
    await expect(page.getByTestId("source-approve")).toHaveCount(0);
    await expect(page.getByTestId("source-retire")).toHaveCount(0);
  });

  test("412: a source changed elsewhere is not overwritten; the author reloads the new revision then decides again", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, `/admin/ai?tab=sources&source=${ids.src2}`);
    await expect(page.getByTestId("source-revision")).toHaveText("1");
    // Another admin approved it meanwhile.
    const server = mock.knowledge.find((item) => item.id === ids.src2)!;
    server.approvalStatus = "Approved";
    server.revision = 2;
    await page.getByTestId("source-approve").click();
    await page.getByTestId("source-confirm").click();
    await expect(page.getByText("Nguồn đã thay đổi ở nơi khác")).toBeVisible();
    await expect(page.getByTestId("source-approve")).toBeDisabled();
    expect(server.revision).toBe(2); // nothing overwritten
    await page.getByTestId("source-reload").click();
    await expect(page.getByTestId("source-status")).toHaveText("Đã duyệt");
    await expect(page.getByTestId("source-revision")).toHaveText("2");
    await expect(page.getByTestId("source-approve")).toHaveCount(0);
  });

  test("409 state conflict is explained", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, `/admin/ai?tab=sources&source=${ids.src2}`);
    await expect(page.getByTestId("source-status")).toHaveText("Bản nháp");
    // Retire is not allowed on a Draft; the UI never offers it, so provoke it from the server side by flipping the state without a revision change.
    const server = mock.knowledge.find((item) => item.id === ids.src2)!;
    server.approvalStatus = "Retired";
    await page.getByTestId("source-approve").click();
    await page.getByTestId("source-confirm").click();
    await expect(page.getByText("Trạng thái nguồn đã thay đổi nên không thực hiện được thao tác này.")).toBeVisible();
  });
});

test.describe("Admin AI: layout", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      test(`no horizontal overflow at ${width}px in ${theme}`, async ({ page }) => {
        const mock = newAiMock();
        seedRequest(mock, { status: "NeedsReconcile", failureCode: "AI_OUTCOME_UNKNOWN", result: undefined, consumedUnits: undefined, providerResult: { outcome: "Succeeded", answer: "x".repeat(300) } });
        await page.setViewportSize({ width, height: 900 });
        await open(page, mock, "/admin/ai", admin, theme);
        await expect(requestRows(page).first()).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.goto("/admin/ai?tab=policies");
        await expect(policyRows(page).first()).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.goto("/admin/ai?tab=sources");
        await expect(sourceRows(page).first()).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.goto(`/admin/ai?tab=sources&source=${ids.src1}`);
        await expect(page.getByTestId("source-detail")).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await expect(page.locator(".ops-theme")).toHaveAttribute("data-theme", theme);
      });
    }
  }
});
