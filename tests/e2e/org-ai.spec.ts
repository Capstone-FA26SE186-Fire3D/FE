import { expect, test, type Page } from "@playwright/test";

import { admin, calls, mockAi, newAiMock, outcomeFields, owner, requestId, seedRequest, signInAs, type AiMock } from "./org-ai-mock";

// `/workspace/ai` v2: history (DataTable + drawer), saved proposals and quota. The chat itself is covered by org-ai-bubble.spec.ts.
// Every assertion runs against Playwright route mocks that follow the BE source/OpenAPI: they prove FE behavior, not the real BE.

async function open(page: Page, mock: AiMock, url: string, user: typeof owner | typeof admin = owner, theme?: "light" | "dark") {
  if (theme) await page.addInitScript((value) => localStorage.setItem("fire3d-ops-theme", value), theme);
  await signInAs(page, user);
  await mockAi(page, mock);
  await page.goto(url);
}

/** Rows of the history DataTable: table rows on wide viewports, cards under 640px. */
const rows = (page: Page) => page.getByTestId("ai-history").locator("tr[data-row-id], li.ops-dt-card");
const drawer = (page: Page) => page.getByRole("dialog", { name: "Đọc lại hội thoại" });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe("Organization AI page: history", () => {
  test("defaults to the history tab with KPI tiles, filters and page in the URL; a row opens the drawer from the server and survives reload", async ({ page }) => {
    const mock = newAiMock();
    for (let index = 0; index < 22; index += 1) { const operation = index % 2 === 0 ? "Answer" : "ScenarioDraft"; seedRequest(mock, { operation, input: { text: `Câu hỏi số ${index}`, buildingName: index % 2 ? "Tòa nhà A" : null }, ...(index % 5 === 0 ? outcomeFields(mock, operation, "InsufficientEvidence") : {}) }); }
    seedRequest(mock, { status: "NeedsReconcile", failureCode: "AI_OUTCOME_UNKNOWN", result: undefined, consumedUnits: undefined, completedAt: undefined });
    await open(page, mock, "/workspace/ai");
    await expect(page.getByRole("heading", { name: "Trợ lý AI", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Lịch sử hội thoại" })).toHaveAttribute("data-state", "active");
    await expect(page.getByTestId("ai-kpi-quota")).toHaveText("900 tokens");
    await expect(page.getByTestId("ai-kpi-reconcile")).toHaveText("1");
    await expect(rows(page)).toHaveCount(20);
    await expect(rows(page).first()).toContainText("Chờ đối soát");
    await expect(rows(page).nth(1)).toContainText("Tòa nhà A");
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page)).toHaveCount(3);
    await page.getByLabel("Kết quả").selectOption("InsufficientEvidence");
    await expect(page).toHaveURL(/resultType=InsufficientEvidence/);
    await expect(page).not.toHaveURL(/page=2/);
    await page.getByLabel("Loại yêu cầu").selectOption("Answer");
    await expect(page).toHaveURL(/operation=Answer/);
    await page.getByLabel("Chỉ của tôi").click();
    await expect(page).toHaveURL(/mine=1/);
    await expect.poll(() => calls(mock, "GET", "/api/ai/requests").filter((call) => call.search.includes("pageSize=20")).at(-1)?.search).toContain("mine=true");
    const last = calls(mock, "GET", "/api/ai/requests").filter((call) => call.search.includes("pageSize=20")).at(-1)!;
    expect(last.search).toContain("resultType=InsufficientEvidence");
    expect(last.search).not.toMatch(/(^|[?&])status=/);
    expect(last.search).toContain("operation=Answer");
    await expect(rows(page).first()).toBeVisible();
    await rows(page).first().click();
    await expect(drawer(page)).toBeVisible();
    await expect(page).toHaveURL(/request=/);
    await page.reload();
    await expect(drawer(page)).toBeVisible();
    await expect(page.getByTestId("ai-status")).toHaveText("Chưa đủ căn cứ");
    await expect(page.getByTestId("ai-input")).toContainText("Câu hỏi số");
  });

  test("switching tabs clears the tab-owned parameters; a deep link ?request= opens the drawer on the history tab", async ({ page }) => {
    const mock = newAiMock();
    const seeded = seedRequest(mock, { input: { text: "Câu hỏi đã lưu" } });
    await open(page, mock, `/workspace/ai?request=${seeded.requestId}&status=Succeeded`);
    await expect(drawer(page)).toBeVisible();
    await expect(page.getByTestId("ai-answer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/request=/);
    await page.getByRole("tab", { name: "Hạn mức & giới hạn" }).click();
    await expect(page).toHaveURL(/tab=quota/);
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.getByTestId("ai-rail-quota")).toContainText("900");
    await expect(page.getByTestId("ai-rail-quota")).toContainText("Đã cấp");
    await expect(page.getByTestId("ai-limit-row")).toHaveCount(2);
    await expect(page.getByTestId("ai-limit-row").first()).toContainText("50 tokens");
    await expect(page.getByRole("link", { name: "Hạn mức AI & nạp thêm" })).toHaveAttribute("href", "/workspace/billing?tab=ai"); // one link, in the page header
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

  test("a polling error in the drawer keeps the last data, honors Retry-After and recovers", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0 });
    const seeded = seedRequest(mock, { status: "Processing", result: undefined, consumedUnits: undefined, completedAt: undefined });
    mock.getFaults.push({ status: 429, json: { status: 429, title: "slow down", code: "RATE_LIMITED" }, headers: { "Retry-After": "1" } });
    await open(page, mock, `/workspace/ai?request=${seeded.requestId}`);
    await expect(page.getByText("Không tải được yêu cầu")).toBeVisible();
    await expect(page.getByTestId("ai-answer")).toBeVisible({ timeout: 15_000 });
  });

  test("another organization's or unknown request id is a clear 404, not an empty drawer", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, `/workspace/ai?request=${requestId(99)}`);
    await expect(page.getByText("Không mở được yêu cầu này")).toBeVisible();
  });
});

test.describe("Organization AI page: outcomes in the drawer", () => {
  test("InsufficientEvidence and RejectedBySafetyGate (Succeeded requests) are shown as such, without citations or answer", async ({ page }) => {
    const mock = newAiMock();
    const insufficient = seedRequest(mock, { ...outcomeFields(mock, "Answer", "InsufficientEvidence"), consumedUnits: 0 });
    const rejected = seedRequest(mock, { ...outcomeFields(mock, "Answer", "RejectedBySafetyGate"), consumedUnits: 0 });
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

test.describe("Organization AI page: saved proposals", () => {
  test("lists only finished scenario drafts; the drawer shows the read-only preview with notes, BIM anchors and citations; apply only opens a chooser", async ({ page }) => {
    const mock = newAiMock();
    const draft = seedRequest(mock, { operation: "ScenarioDraft", input: { text: "Sơ tán khi báo cháy ở tầng 2", buildingName: "Tòa nhà A" } });
    seedRequest(mock, { operation: "Answer" });
    seedRequest(mock, { operation: "ScenarioDraft", status: "Failed", failureCode: "AI_PROVIDER_REJECTED", result: undefined });
    await open(page, mock, "/workspace/ai?tab=saved");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Sơ tán khi báo cháy ở tầng 2");
    const search = calls(mock, "GET", "/api/ai/requests").filter((call) => call.search.includes("pageSize=20")).at(-1)!.search;
    expect(search).toContain("resultType=ScenarioDraft");
    expect(search).toContain("status=Succeeded");
    await rows(page).first().click();
    await expect(page).toHaveURL(new RegExp(`request=${draft.requestId}`));
    const preview = page.getByTestId("ai-draft");
    await expect(preview).toContainText("Sơ tán do báo cháy tầng 2");
    await expect(preview).toContainText("Nhận biết tín hiệu báo cháy");
    await expect(page.getByTestId("ai-draft-notes")).toContainText("Cần kiểm tra lại vị trí");
    await expect(page.getByTestId("ai-draft-objects")).toContainText("Tầng 1 · gắn vào cấu kiện IFC");
    await expect(page.getByTestId("ai-status")).toHaveText("Hoàn tất");
    await expect(page.getByText("Cần bạn chỉnh sửa trước khi dùng")).toBeVisible();
    await expect(page.getByTestId("ai-citation")).toContainText("QCVN 06:2022/BXD");
    await page.getByTestId("ai-apply").click();
    await expect(page.getByRole("dialog", { name: "Áp dụng đề xuất vào bản nháp" })).toContainText("Chưa có gì được lưu");
    expect(mock.calls.filter((call) => ["PUT", "PATCH", "DELETE"].includes(call.method))).toHaveLength(0);
  });

  test("a scenario draft whose content is not fet3d.editor/1 cannot be applied", async ({ page }) => {
    const mock = newAiMock();
    const bad = seedRequest(mock, { operation: "ScenarioDraft", citations: [], result: { status: "NeedsUserEdit", draft: { state: { schemaVersion: "other/9" } } } });
    await open(page, mock, `/workspace/ai?tab=saved&request=${bad.requestId}`);
    await expect(page.getByText("Không đọc được đề xuất")).toBeVisible();
    await expect(page.getByTestId("ai-apply")).toHaveCount(0);
  });

  test("the saved tab's empty state points to the bubble", async ({ page }) => {
    const mock = newAiMock();
    seedRequest(mock, { operation: "Answer" });
    await open(page, mock, "/workspace/ai?tab=saved");
    await expect(page.getByText("Chưa có đề xuất kịch bản nào")).toBeVisible();
  });
});

test.describe("Organization AI page: access and links", () => {
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
    expect(mock.calls.some((call) => /\/(chat|documents)$/.test(call.path))).toBe(false);
  });
});

test.describe("Organization AI page: layout", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      test(`no horizontal overflow at ${width}px in ${theme}`, async ({ page }) => {
        const mock = newAiMock({ pendingPolls: 0 });
        const draft = seedRequest(mock, { operation: "ScenarioDraft", input: { text: "Sơ tán khi báo cháy ở tầng 2" } });
        seedRequest(mock, { operation: "Answer", input: { text: "Chiều rộng lối thoát nạn tối thiểu là bao nhiêu khi tòa nhà có hơn một nghìn người sử dụng cùng lúc?" } });
        await page.setViewportSize({ width, height: 900 });
        await open(page, mock, `/workspace/ai?tab=saved&request=${draft.requestId}`, owner, theme);
        await expect(page.getByTestId("ai-draft")).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.goto("/workspace/ai?tab=history");
        await expect(rows(page).first()).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.goto("/workspace/ai?tab=quota");
        await expect(page.getByTestId("ai-quota-card")).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await page.getByTestId("ai-bubble-button").click();
        await expect(page.getByTestId("ai-chat-panel")).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await expect(page.locator(".ops-theme")).toHaveAttribute("data-theme", theme);
      });
    }
  }
});
