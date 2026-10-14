import { expect, test, type Page } from "@playwright/test";

import { admin, calls, ids, mockAi, newAiMock, owner, requestId, seedRequest, signInAs, type AiMock } from "./org-ai-mock";

// Every assertion runs against Playwright route mocks that follow the BE source/OpenAPI: they prove FE behavior, not the real BE.

async function open(page: Page, mock: AiMock, url: string, user: typeof owner | typeof admin = owner, theme?: "light" | "dark") {
  if (theme) await page.addInitScript((value) => localStorage.setItem("fire3d-ops-theme", value), theme);
  await signInAs(page, user);
  await mockAi(page, mock);
  await page.goto(url);
}

const send = (page: Page) => page.getByTestId("ai-send");
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("Organization AI: ask", () => {
  test("quota is read before the POST, the request is polled from Queued to the answer with citation and usage, and a reload restores it from the server", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/workspace/ai");
    await expect(page.getByRole("heading", { name: "Trợ lý AI", level: 1 })).toBeVisible();
    await expect(page.getByTestId("source-picker")).toContainText("Tất cả nguồn đủ điều kiện (4)");
    await page.getByLabel("Câu hỏi").fill("  Chiều rộng lối thoát nạn tối thiểu là bao nhiêu?  ");
    await send(page).click();

    // Pending first (polling), then the final state.
    await expect(page.getByTestId("ai-status")).toHaveText("Đang chờ xử lý");
    await expect(page.getByTestId("ai-answer")).toContainText("chiều rộng thông thủy", { timeout: 15_000 });
    await expect(page.getByTestId("ai-status")).toHaveText("Hoàn tất");
    const citation = page.getByTestId("ai-citation");
    await expect(citation).toHaveCount(1);
    await expect(citation).toContainText("QCVN 06:2022/BXD");
    await expect(citation).toContainText("phiên bản 2022");
    await expect(citation).toContainText("Điều 3");
    const usage = page.getByTestId("ai-usage");
    await expect(usage).toContainText("tokens");
    await expect(usage).toContainText("Đã giữ chỗ");
    await expect(usage).toContainText("50 tokens");
    await expect(usage).toContainText("42 tokens");

    // The quota gate ran first, then exactly one POST with the stable key and the trimmed question.
    const order = mock.calls.map((call) => `${call.method} ${call.path}`);
    expect(order.indexOf("GET /api/organizations/me/ai-quota")).toBeGreaterThan(-1);
    expect(order.indexOf("GET /api/organizations/me/ai-quota")).toBeLessThan(order.indexOf("POST /api/ai/organization/answer"));
    const posts = calls(mock, "POST", "/api/ai/organization/answer");
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["idempotency-key"]).toMatch(/\S+/);
    expect(posts[0].body).toEqual({ question: "Chiều rộng lối thoát nạn tối thiểu là bao nhiêu?" });
    expect(mock.calls.some((call) => /\/(chat|documents)$/.test(call.path))).toBe(false);

    // Reload: the request id is in the URL and the server is the source of truth; nothing is sent again.
    await expect(page).toHaveURL(new RegExp(`request=${requestId(1)}`));
    await page.reload();
    await expect(page.getByTestId("ai-answer")).toContainText("chiều rộng thông thủy");
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(1);
  });

  test("source scope: all eligible sends no list; a chosen subset sends exactly those refs", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0 });
    await open(page, mock, "/workspace/ai");
    await page.getByLabel("Câu hỏi").fill("Câu hỏi 1");
    await send(page).click();
    await expect(page.getByTestId("ai-answer")).toBeVisible();
    expect(calls(mock, "POST", "/api/ai/organization/answer")[0].body).toEqual({ question: "Câu hỏi 1" });

    await page.getByRole("button", { name: "Hỏi câu khác" }).click();
    await page.getByLabel("Câu hỏi").fill("Câu hỏi 2");
    await page.getByLabel("Chọn nguồn cụ thể").check();
    await expect(send(page)).toBeDisabled(); // a chosen scope needs at least one source
    await page.getByLabel(/QCVN 06:2022\/BXD/).check();
    await page.getByLabel(/EXT-01 Bình chữa cháy/).check();
    await send(page).click();
    await expect(page.getByTestId("ai-answer")).toBeVisible();
    const posts = calls(mock, "POST", "/api/ai/organization/answer");
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toEqual({ question: "Câu hỏi 2", sources: [{ kind: "KnowledgeSource", id: ids.src1 }, { kind: "LibraryVersion", id: ids.lib1 }] });
    expect(posts[1].headers["idempotency-key"]).not.toBe(posts[0].headers["idempotency-key"]);
  });

  test("a lost response never creates a second request: look up my recent requests and follow the one that was stored", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0, submitFaults: ["lost-response"] });
    await open(page, mock, "/workspace/ai");
    await page.getByLabel("Câu hỏi").fill("Hỏi và mất phản hồi");
    await send(page).click();
    await expect(page.getByTestId("ai-unknown")).toBeVisible();
    await expect(page.getByTestId("ai-unknown")).toContainText("Không gửi một yêu cầu mới");
    expect(mock.requests).toHaveLength(1); // the server did store it
    await page.getByRole("button", { name: "Tra yêu cầu gần nhất của tôi" }).click();
    const candidate = page.getByTestId("ai-candidate");
    await expect(candidate).toHaveCount(1);
    await expect(candidate).toContainText(requestId(1));
    await candidate.getByRole("button", { name: "Theo dõi yêu cầu này" }).click();
    await expect(page.getByTestId("ai-answer")).toBeVisible();
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(1);
    expect(mock.requests).toHaveLength(1);
  });

  test("retry replays the same Idempotency-Key and the server returns the original request (no second request, no second reservation)", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0, submitFaults: ["lost-response"] });
    await open(page, mock, "/workspace/ai");
    await page.getByLabel("Câu hỏi").fill("Hỏi rồi thử lại");
    await send(page).click();
    await expect(page.getByTestId("ai-unknown")).toBeVisible();
    await page.getByTestId("ai-retry-same-key").click();
    await expect(page.getByTestId("ai-answer")).toBeVisible();
    const posts = calls(mock, "POST", "/api/ai/organization/answer");
    expect(posts).toHaveLength(2);
    expect(posts[1].headers["idempotency-key"]).toBe(posts[0].headers["idempotency-key"]);
    expect(mock.requests).toHaveLength(1);
    // The retry skipped the quota gate: it is a replay, not a new reservation.
    expect(calls(mock, "GET", "/api/organizations/me/ai-quota")).toHaveLength(1);
  });

  test("when the call never arrived, nothing is found and the same-key retry creates it exactly once", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0, submitFaults: ["never-arrives"] });
    await open(page, mock, "/workspace/ai");
    await page.getByLabel("Câu hỏi").fill("Mất mạng trước khi gửi");
    await send(page).click();
    await expect(page.getByTestId("ai-unknown")).toBeVisible();
    await page.getByRole("button", { name: "Tra yêu cầu gần nhất của tôi" }).click();
    await expect(page.getByTestId("ai-no-candidates")).toBeVisible();
    expect(mock.requests).toHaveLength(0);
    await page.getByTestId("ai-retry-same-key").click();
    await expect(page.getByTestId("ai-answer")).toBeVisible();
    const posts = calls(mock, "POST", "/api/ai/organization/answer");
    expect(posts[1].headers["idempotency-key"]).toBe(posts[0].headers["idempotency-key"]);
    expect(mock.requests).toHaveLength(1);
  });

  test("a double click sends one POST", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0 });
    await open(page, mock, "/workspace/ai");
    await page.getByLabel("Câu hỏi").fill("Nhấp đúp");
    await send(page).dblclick();
    await expect(page.getByTestId("ai-answer")).toBeVisible();
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(1);
  });

  test("exhausted quota blocks BEFORE any POST and links to the top-up in billing", async ({ page }) => {
    const mock = newAiMock({ quota: { units: [{ quotaUnit: "tokens", granted: 1000, reserved: 100, consumed: 900, expired: 0, available: 0, scheduled: 0 }] } });
    await open(page, mock, "/workspace/ai");
    await page.getByLabel("Câu hỏi").fill("Còn quota không?");
    await send(page).click();
    const blocked = page.getByTestId("ai-quota-blocked");
    await expect(blocked).toContainText("Quota AI đã hết");
    await expect(blocked).toContainText("tokens");
    await expect(page.getByTestId("ai-topup-link")).toHaveAttribute("href", "/workspace/billing?tab=ai");
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(0);
    expect(mock.requests).toHaveLength(0);
  });

  test("no quota unit at all also blocks before the call", async ({ page }) => {
    const mock = newAiMock({ quota: { units: [] } });
    await open(page, mock, "/workspace/ai");
    await page.getByLabel("Câu hỏi").fill("Chưa có quota");
    await send(page).click();
    await expect(page.getByTestId("ai-quota-blocked")).toContainText("Chưa có quota AI");
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(0);
  });

  test("a quota that cannot be read blocks too, with a retry", async ({ page }) => {
    const mock = newAiMock();
    await signInAs(page, owner);
    await mockAi(page, mock);
    await page.route("**/api/organizations/me/ai-quota", (route) => route.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ status: 500, title: "boom" }) }));
    await page.goto("/workspace/ai");
    await page.getByLabel("Câu hỏi").fill("Không đọc được quota");
    await send(page).click();
    await expect(page.getByText("Chưa kiểm tra được quota nên chưa gửi")).toBeVisible();
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(0);
  });

  test("BE refusals are shown with their meaning: 409 quota, 503 provider, 429 Retry-After, 422 field issues, 403, 401", async ({ page }) => {
    const mock = newAiMock({
      submitFaults: [
        { status: 409, json: { status: 409, title: "Not enough AI quota.", code: "AI_QUOTA_EXHAUSTED" } },
        "status-503",
        "status-429",
        { status: 422, json: { status: 422, title: "Content does not satisfy its schema.", code: "CONTENT_INVALID", issues: [{ code: "MARKUP_NOT_ALLOWED", path: "$.question", message: "Plain text only." }] } },
        { status: 403, json: { status: 403, title: "Forbidden", code: "FORBIDDEN" } },
        { status: 401, json: { status: 401, title: "Unauthorized", code: "UNAUTHORIZED" } },
      ],
    });
    await open(page, mock, "/workspace/ai");
    const question = page.getByLabel("Câu hỏi");
    await question.fill("Lần 1");
    await send(page).click();
    await expect(page.getByText("Máy chủ từ chối yêu cầu, chưa có yêu cầu nào được tạo")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "không tính vượt mức" })).toBeVisible();
    await question.fill("Lần 2");
    await send(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "chưa được bật hoặc chưa cấu hình" })).toBeVisible();
    await question.fill("Lần 3");
    await send(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Thử lại sau 7 giây" })).toBeVisible();
    await question.fill("Lần 4");
    await send(page).click();
    await expect(page.locator(".ops-field-error")).toHaveText("Plain text only.");
    await question.fill("Lần 5");
    await send(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "không có quyền" })).toBeVisible();
    await question.fill("Lần 6");
    await send(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Phiên đăng nhập đã hết hạn" })).toBeVisible();
    // Definitive refusals created nothing and none was treated as an unknown outcome.
    expect(mock.requests).toHaveLength(0);
    await expect(page.getByTestId("ai-unknown")).toHaveCount(0);
  });

  test("a polling error keeps the last data, honors Retry-After and recovers", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0 });
    const seeded = seedRequest(mock, { status: "Running", result: undefined, consumedUnits: undefined, completedAt: undefined });
    mock.getFaults.push({ status: 429, json: { status: 429, title: "slow down", code: "RATE_LIMITED" }, headers: { "Retry-After": "1" } });
    await open(page, mock, `/workspace/ai?request=${seeded.requestId}`);
    await expect(page.getByText("Không tải được yêu cầu")).toBeVisible();
    await expect(page.getByTestId("ai-answer")).toBeVisible({ timeout: 15_000 });
  });

  test("another organization's or unknown request id is a clear 404, not an empty page", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, `/workspace/ai?request=${requestId(99)}`);
    await expect(page.getByText("Không mở được yêu cầu này")).toBeVisible();
  });
});

test.describe("Organization AI: outcomes", () => {
  test("InsufficientEvidence and SafetyRejected are shown as such, without citations or answer", async ({ page }) => {
    const mock = newAiMock();
    const insufficient = seedRequest(mock, { status: "InsufficientEvidence", consumedUnits: 0, result: { outcome: "InsufficientEvidence", citations: [], message: "Các nguồn đã chọn chưa nêu yêu cầu này." } });
    const rejected = seedRequest(mock, { status: "SafetyRejected", consumedUnits: 0, result: { outcome: "SafetyRejected", citations: [], message: "Nội dung bị chặn bởi cổng an toàn." } });
    await open(page, mock, `/workspace/ai?request=${insufficient.requestId}`);
    await expect(page.getByTestId("ai-insufficient")).toContainText("Chưa đủ căn cứ để trả lời");
    await expect(page.getByTestId("ai-insufficient")).toContainText("chưa nêu yêu cầu này");
    await expect(page.getByTestId("ai-answer")).toHaveCount(0);
    await expect(page.getByTestId("ai-citations")).toHaveCount(0);
    await page.goto(`/workspace/ai?request=${rejected.requestId}`);
    await expect(page.getByTestId("ai-rejected")).toContainText("Bị cổng an toàn từ chối");
    await expect(page.getByTestId("ai-status")).toHaveText("Bị cổng an toàn từ chối");
  });

  test("Failed and NeedsReconcile explain the state and never invite a re-send", async ({ page }) => {
    const mock = newAiMock();
    const failed = seedRequest(mock, { status: "Failed", failureCode: "AI_PROVIDER_REJECTED", result: undefined, consumedUnits: undefined });
    const reconcile = seedRequest(mock, { status: "NeedsReconcile", failureCode: "AI_OUTCOME_UNKNOWN", result: undefined, consumedUnits: undefined, completedAt: undefined });
    await open(page, mock, `/workspace/ai?request=${failed.requestId}`);
    await expect(page.getByText("Dịch vụ AI từ chối yêu cầu")).toBeVisible();
    await page.goto(`/workspace/ai?request=${reconcile.requestId}`);
    await expect(page.getByText("Chưa rõ kết quả, đang chờ đối soát")).toBeVisible();
    await expect(page.getByText("Không gửi lại câu hỏi này")).toBeVisible();
    // NeedsReconcile is not polled (it waits for an admin): only the initial read happened.
    await page.waitForTimeout(500);
    expect(calls(mock, "GET", `/api/ai/requests/${reconcile.requestId}`)).toHaveLength(1);
  });
});

test.describe("Organization AI: scenario draft and history", () => {
  test("scenario draft: Building + prompt + sources, then a read-only preview with notes, BIM anchors, citations; nothing is saved", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0 });
    await open(page, mock, "/workspace/ai?tab=draft");
    await page.getByRole("combobox", { name: "Công trình" }).selectOption({ label: "Tòa nhà A" });
    await page.getByLabel("Yêu cầu đề xuất").fill("Sơ tán khi báo cháy ở tầng 2");
    await send(page).click();
    const draft = page.getByTestId("ai-draft");
    await expect(draft).toContainText("Sơ tán do báo cháy tầng 2");
    await expect(draft).toContainText("Nhận biết tín hiệu báo cháy");
    await expect(page.getByTestId("ai-draft-notes")).toContainText("Cần kiểm tra lại vị trí");
    await expect(page.getByTestId("ai-draft-objects")).toContainText("Neo BIM (IFC GlobalId) 1hOSvn6df7F8_7GcBWlRGQ");
    await expect(page.getByTestId("ai-status")).toHaveText("Hoàn tất");
    await expect(page.getByText("Cần bạn chỉnh sửa trước khi dùng")).toBeVisible();
    await expect(page.getByTestId("ai-citation")).toContainText("QCVN 06:2022/BXD");
    const posts = calls(mock, "POST", "/api/ai/organization/scenario-draft");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ prompt: "Sơ tán khi báo cháy ở tầng 2" });
    expect((posts[0].body as { buildingId: string }).buildingId).toMatch(/\S+/);
    // Apply only opens a chooser; no draft/scenario write exists in this flow.
    await page.getByTestId("ai-apply").click();
    await expect(page.getByRole("dialog", { name: "Áp dụng đề xuất vào bản nháp" })).toContainText("Chưa có gì được lưu");
    expect(mock.calls.filter((call) => ["PUT", "PATCH", "DELETE"].includes(call.method))).toHaveLength(0);
  });

  test("a scenario draft whose content is not fet3d.editor/1 cannot be applied", async ({ page }) => {
    const mock = newAiMock();
    const bad = seedRequest(mock, { operation: "ScenarioDraft", result: { outcome: "Succeeded", citations: [], draft: { state: { schemaVersion: "other/9" } } } });
    await open(page, mock, `/workspace/ai?tab=draft&request=${bad.requestId}`);
    await expect(page.getByText("Không đọc được đề xuất")).toBeVisible();
    await expect(page.getByTestId("ai-apply")).toHaveCount(0);
  });

  test("history: filters and page live in the URL, detail opens from the server and survives reload", async ({ page }) => {
    const mock = newAiMock();
    for (let index = 0; index < 22; index += 1) seedRequest(mock, { status: index % 5 === 0 ? "InsufficientEvidence" : "Succeeded", operation: index % 2 === 0 ? "Answer" : "ScenarioDraft" });
    await open(page, mock, "/workspace/ai?tab=history");
    await expect(page.getByTestId("ai-history-row")).toHaveCount(20);
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("ai-history-row")).toHaveCount(2);
    await page.getByLabel("Trạng thái").selectOption("InsufficientEvidence");
    await expect(page).toHaveURL(/status=InsufficientEvidence/);
    await expect(page).not.toHaveURL(/page=2/);
    await page.getByLabel("Loại yêu cầu").selectOption("Answer");
    await expect(page).toHaveURL(/operation=Answer/);
    await page.getByLabel("Chỉ của tôi").click();
    await expect(page).toHaveURL(/mine=1/);
    await expect.poll(() => calls(mock, "GET", "/api/ai/requests").at(-1)?.search).toContain("mine=true");
    const last = calls(mock, "GET", "/api/ai/requests").at(-1)!;
    expect(last.search).toContain("status=InsufficientEvidence");
    expect(last.search).toContain("operation=Answer");
    const rows = page.getByTestId("ai-history-row");
    await expect(rows.first()).toBeVisible();
    await rows.first().getByRole("button").click();
    await expect(page.getByRole("dialog", { name: "Chi tiết yêu cầu AI" })).toBeVisible();
    await expect(page).toHaveURL(/request=/);
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Chi tiết yêu cầu AI" })).toBeVisible();
    await expect(page.getByTestId("ai-status")).toHaveText("Chưa đủ căn cứ");
  });

  test("history empty, filtered-empty and error states", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/workspace/ai?tab=history");
    await expect(page.getByText("Chưa có yêu cầu AI nào")).toBeVisible();
    await page.getByLabel("Trạng thái").selectOption("Failed");
    await expect(page.getByText("Không có yêu cầu phù hợp.")).toBeVisible();
    await page.route("**/api/ai/requests?*", (route) => route.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ status: 500, title: "boom" }) }));
    await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(page.getByText("Không tải được lịch sử yêu cầu AI")).toBeVisible();
  });

  test("a PlatformAdmin session has no access to the organization AI page", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/workspace/ai", admin);
    await expect(page.getByText("Không có quyền truy cập")).toBeVisible();
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(0);
  });

  test("the production AI page never links to the prototype and does not use the FastAPI env", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/workspace/ai");
    await expect(page.locator('a[href*="/demo/rag"]')).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: /Quản lý tổ chức/ });
    await expect(nav.getByRole("link", { name: "Trợ lý AI" })).toHaveAttribute("href", "/workspace/ai");
  });
});

test.describe("Organization AI: layout", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      test(`no horizontal overflow at ${width}px in ${theme}`, async ({ page }) => {
        const mock = newAiMock({ pendingPolls: 0 });
        const draft = seedRequest(mock, { operation: "ScenarioDraft" });
        seedRequest(mock, { operation: "Answer" });
        await page.setViewportSize({ width, height: 900 });
        await open(page, mock, `/workspace/ai?tab=draft&request=${draft.requestId}`, owner, theme);
        await expect(page.getByTestId("ai-draft")).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.goto("/workspace/ai?tab=history");
        await expect(page.getByTestId("ai-history-row").first()).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.goto("/workspace/ai");
        await expect(page.getByTestId("source-picker")).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await expect(page.locator(".ops-theme")).toHaveAttribute("data-theme", theme);
      });
    }
  }
});
