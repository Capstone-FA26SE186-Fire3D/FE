import { expect, test, type Page } from "@playwright/test";

import { BUILDING_ID, SCENARIO_ID } from "../fixtures/scenario-editor/fixture-building";
import { admin, calls, mockAi, newAiMock, owner, requestId, signInAs, type AiMock } from "./org-ai-mock";

// The floating "Trợ lý AI" on every /workspace page (Figma 43:197 / 43:255 / 43:304 / 57:731). Route mocks that follow the
// BE OpenAPI: evidence for FE behaviour, not for the real API.

const building = { id: BUILDING_ID, name: "Tòa nhà A", buildingType: "Trường học", totalFloors: 2, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: null, contact: null };
const scenario = { id: SCENARIO_ID, buildingId: BUILDING_ID, organizationId: "org-1", name: "Thoát hiểm tầng một", createdAt: "2026-10-06T00:00:00Z", currentDraft: null };

/**
 * Signs in, mocks the AI endpoints and answers every other API call the visited page makes with an empty 404, so a Building
 * page renders without the real server. The building and scenario detail (context strip) are answered here.
 */
async function open(page: Page, mock: AiMock, url: string, user: typeof owner | typeof admin = owner) {
  // Registered first so every later route (session, AI mocks, building, scenario) is tried before it.
  await page.route("**/api/**", (route) => route.fulfill({ status: 404, contentType: "application/problem+json", body: JSON.stringify({ status: 404, title: "Not found", code: "NOT_FOUND" }) }));
  await signInAs(page, user);
  await mockAi(page, mock);
  await page.route(`**/api/buildings/${BUILDING_ID}`, (route) => route.fulfill({ json: building, headers: { ETag: '"1"' } }));
  await page.route(`**/api/scenarios/${SCENARIO_ID}`, (route) => route.fulfill({ json: scenario }));
  await page.goto(url);
}

const launcher = (page: Page) => page.getByTestId("ai-bubble-button");
const panel = (page: Page) => page.getByRole("dialog", { name: "Trợ lý AI" });
const input = (page: Page) => page.getByTestId("ai-chat-input");
const send = (page: Page) => page.getByTestId("ai-send");

test.describe("AI bubble: visibility and panel", () => {
  test("a PlatformAdmin never sees the bubble", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/admin/ai", admin);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("ai-bubble")).toHaveCount(0);
    await page.goto("/workspace/ai");
    await expect(page.getByText("Không có quyền truy cập")).toBeVisible();
    await expect(page.getByTestId("ai-bubble")).toHaveCount(0);
  });

  test("opens as a 400×600 panel bottom-right, focuses the composer, closes on Escape and returns focus to the launcher", async ({ page }) => {
    const mock = newAiMock();
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, mock, "/workspace/ai");
    await expect(page.getByTestId("ai-bubble-pill")).toHaveText("Hỏi Trợ lý AI");
    await launcher(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(input(page)).toBeFocused();
    const box = await page.getByTestId("ai-bubble-float").boundingBox();
    expect(box?.width).toBe(400);
    expect(box?.height).toBe(600);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1440 - 24); // anchored to the right edge (a scrollbar may take a few px)
    expect(box!.y + box!.height).toBeLessThanOrEqual(900 - 80); // above the launcher
    await expect(page.getByTestId("ai-chat-quota")).toHaveText("Còn 900 tokens");
    await expect(page.getByTestId("ai-chat-history")).toHaveAttribute("href", "/workspace/ai?tab=history");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(launcher(page)).toBeFocused();
    await launcher(page).click();
    await page.getByTestId("ai-chat-close").click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("the AI page's 'Mở trợ lý' opens the same panel; expand moves the conversation into a 640px drawer", async ({ page }) => {
    const mock = newAiMock();
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, mock, "/workspace/ai");
    await page.getByTestId("ai-open-bubble").click();
    await expect(page.getByTestId("ai-bubble-float")).toBeVisible();
    await page.getByTestId("ai-chat-expand").click();
    const drawer = page.getByTestId("ai-bubble-drawer");
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId("ai-bubble-float")).toHaveCount(0);
    expect((await drawer.boundingBox())?.width).toBe(640);
    await drawer.getByTestId("ai-chat-expand").click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId("ai-bubble-float")).toBeVisible();
    await expect(input(page)).toBeFocused();
  });

  test("under 768px the bubble opens a full-screen sheet", async ({ page }) => {
    const mock = newAiMock();
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, mock, "/workspace/ai");
    await expect(page.getByTestId("ai-bubble-pill")).toBeHidden();
    await launcher(page).click();
    const sheet = page.getByTestId("ai-bubble-sheet");
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBe(844);
    await expect(sheet.getByTestId("ai-chat-expand")).toHaveCount(0);
    await sheet.getByTestId("ai-chat-close").click();
    await expect(sheet).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("AI bubble: context", () => {
  test("on a Building page the strip names the building; on the scenario editor it adds the scenario", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, `/workspace/buildings/${BUILDING_ID}`);
    await launcher(page).click();
    await expect(page.getByTestId("ai-chat-context")).toHaveText("Đang xem · Tòa nhà A");
    await page.goto(`/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}`);
    await launcher(page).click();
    await expect(page.getByTestId("ai-chat-context")).toHaveText("Đang xem · Tòa nhà A › Thoát hiểm tầng một");
    await page.goto("/workspace/ai");
    await launcher(page).click();
    await expect(page.getByTestId("ai-chat-context")).toHaveCount(0);
  });

  test("scenario-draft mode on a Building page sends that buildingId (the server pins the newest ready revision)", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0 });
    await open(page, mock, `/workspace/buildings/${BUILDING_ID}`);
    await launcher(page).click();
    await page.getByTestId("ai-mode-draft").click();
    await expect(page.getByTestId("ai-chat-building")).toHaveCount(0); // the context building is the target, no picker
    await input(page).fill("Sơ tán khi báo cháy ở tầng 2");
    await send(page).click();
    await expect(page.getByTestId("ai-chat-draft")).toContainText("Sơ tán do báo cháy tầng 2", { timeout: 15_000 });
    await expect(page.getByTestId("ai-chat-draft")).toContainText("Nhận biết tín hiệu báo cháy");
    const posts = calls(mock, "POST", "/api/ai/organization/scenario-draft");
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ buildingId: BUILDING_ID, prompt: "Sơ tán khi báo cháy ở tầng 2" });
    // "Dùng làm bản nháp" opens the chooser; nothing is written.
    await page.getByTestId("ai-chat-apply").click();
    await expect(page.getByRole("dialog", { name: "Áp dụng đề xuất vào bản nháp" })).toContainText("Chưa có gì được lưu");
    expect(mock.calls.filter((call) => ["PUT", "PATCH", "DELETE"].includes(call.method))).toHaveLength(0);
  });

  test("scenario-draft mode away from a Building page offers a Building picker", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0 });
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    await page.getByTestId("ai-mode-draft").click();
    await expect(page.getByTestId("ai-chat-building")).toContainText("Tòa nhà A");
    await input(page).fill("Sơ tán tầng 2");
    await send(page).click();
    await expect.poll(() => calls(mock, "POST", "/api/ai/organization/scenario-draft").length).toBe(1);
    expect(calls(mock, "POST", "/api/ai/organization/scenario-draft")[0].body).toMatchObject({ buildingId: BUILDING_ID, prompt: "Sơ tán tầng 2" });
  });
});

test.describe("AI bubble: asking", () => {
  test("limits are read before the POST; the user bubble shows at once, then the pending state, then the answer with citation chips; the conversation survives navigation", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    await expect(page.getByTestId("ai-chat-pending")).toHaveCount(0);
    await input(page).fill("  Chiều rộng lối thoát nạn tối thiểu là bao nhiêu?  ");
    await page.keyboard.press("Enter"); // Enter sends; Shift+Enter would add a line
    await expect(page.getByTestId("ai-chat-user")).toHaveText("Chiều rộng lối thoát nạn tối thiểu là bao nhiêu?");
    await expect(input(page)).toHaveValue("");
    await expect(page.getByTestId("ai-chat-pending")).toContainText(/Đang/);
    const answer = page.getByTestId("ai-chat-answer");
    await expect(answer).toContainText("chiều rộng thông thủy", { timeout: 15_000 });
    await expect(page.getByTestId("ai-chat-status")).toHaveText("Hoàn tất");
    const chip = page.getByTestId("ai-chat-citation");
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText("[1] QCVN 06:2022/BXD");
    const link = chip.getByRole("link");
    await expect(link).toHaveAttribute("href", "https://example.gov.vn/qcvn-06");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(page.getByTestId("ai-chat-copy")).toBeVisible();
    await expect(page.getByTestId("ai-chat-apply")).toHaveCount(0); // an answer is never applied to a draft
    await expect(page.getByTestId("ai-chat-detail")).toHaveAttribute("href", `/workspace/ai?tab=history&request=${requestId(1)}`);

    const order = mock.calls.map((call) => `${call.method} ${call.path}`);
    const post = order.indexOf("POST /api/ai/organization/answer");
    expect(order.slice(0, post).lastIndexOf("GET /api/ai/organization/limits")).toBeGreaterThan(-1);
    const posts = calls(mock, "POST", "/api/ai/organization/answer");
    expect(posts).toHaveLength(1);
    expect(posts[0].headers["idempotency-key"]).toMatch(/\S+/);
    expect(posts[0].body).toEqual({ question: "Chiều rộng lối thoát nạn tối thiểu là bao nhiêu?" });
    expect(mock.calls.some((call) => /\/(chat|documents)$/.test(call.path))).toBe(false);

    // Navigating inside the workspace keeps the conversation (the state lives in the layout, not in the page).
    await page.getByRole("navigation", { name: /Quản lý tổ chức/ }).getByRole("link", { name: "Công trình" }).click();
    await expect(page).toHaveURL(/\/workspace\/buildings/);
    await expect(page.getByTestId("ai-chat-user")).toHaveText("Chiều rộng lối thoát nạn tối thiểu là bao nhiêu?");
    await expect(page.getByTestId("ai-chat-answer")).toContainText("chiều rộng thông thủy");
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(1);
  });

  test("a double click sends one POST; Shift+Enter adds a line", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0 });
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    await input(page).fill("Dòng 1");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Dòng 2");
    await expect(input(page)).toHaveValue("Dòng 1\nDòng 2");
    await send(page).dblclick();
    await expect(page.getByTestId("ai-chat-answer")).toBeVisible();
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(1);
    expect(calls(mock, "POST", "/api/ai/organization/answer")[0].body).toEqual({ question: "Dòng 1\nDòng 2" });
  });

  test("the question is limited to the policy maxInputChars before anything is sent; the footnote shows the reserve", async ({ page }) => {
    const mock = newAiMock({ limits: [{ operation: "Answer", policyActive: true, quotaUnit: "tokens", estimatedReserve: 50, maxInputChars: 10, maxSources: 20, availableUnits: 900, canSubmit: true }] });
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    await expect(page.getByText("Mỗi câu hỏi dùng khoảng 50 tokens")).toBeVisible();
    await input(page).fill("Câu hỏi dài hơn mười ký tự");
    await expect(page.getByTestId("ai-char-count")).toHaveAttribute("data-over", "true");
    await expect(send(page)).toBeDisabled();
    await expect(page.getByText("Dài hơn giới hạn 10 ký tự")).toBeVisible();
    await page.keyboard.press("Enter");
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(0);
    await input(page).fill("Ngắn gọn");
    await expect(send(page)).toBeEnabled();
  });

  test("InsufficientEvidence and a Failed request are explained inside the thread, without an answer or chips", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0, outcome: { Answer: "InsufficientEvidence", ScenarioDraft: "Succeeded" } });
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    await input(page).fill("Câu hỏi ngoài nguồn");
    await send(page).click();
    await expect(page.getByTestId("ai-chat-insufficient")).toContainText("Chưa đủ căn cứ");
    await expect(page.getByTestId("ai-chat-insufficient")).toContainText("chưa nêu yêu cầu này");
    await expect(page.getByTestId("ai-chat-answer-text")).toHaveCount(0);
    await expect(page.getByTestId("ai-chat-citations")).toHaveCount(0);
    mock.outcome.Answer = "Failed";
    await input(page).fill("Câu hỏi thứ hai");
    await send(page).click();
    await expect(page.getByTestId("ai-chat-answer").nth(1)).toContainText("Dịch vụ AI từ chối yêu cầu");
    await expect(page.getByTestId("ai-chat-user")).toHaveCount(2);
  });

  test("a lost response never creates a second request: the thread offers the recovery, and a same-key retry replays the stored request", async ({ page }) => {
    const mock = newAiMock({ pendingPolls: 0, submitFaults: ["lost-response"] });
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    await input(page).fill("Hỏi rồi mất phản hồi");
    await send(page).click();
    await expect(page.getByTestId("ai-unknown")).toContainText("Không gửi một yêu cầu mới");
    expect(mock.requests).toHaveLength(1);
    await page.getByTestId("ai-retry-same-key").click();
    await expect(page.getByTestId("ai-chat-answer")).toBeVisible();
    const posts = calls(mock, "POST", "/api/ai/organization/answer");
    expect(posts).toHaveLength(2);
    expect(posts[1].headers["idempotency-key"]).toBe(posts[0].headers["idempotency-key"]);
    expect(mock.requests).toHaveLength(1);
    await expect(page.getByTestId("ai-unknown")).toHaveCount(0);
  });

  test("BE refusals are shown with their meaning: 409 quota, 503 provider, 429 Retry-After, 422 field issue", async ({ page }) => {
    const mock = newAiMock({
      submitFaults: [
        { status: 409, json: { status: 409, title: "Not enough AI quota.", code: "AI_QUOTA_EXHAUSTED" } },
        "status-503",
        "status-429",
        { status: 422, json: { status: 422, title: "Content does not satisfy its schema.", code: "CONTENT_INVALID", issues: [{ code: "MARKUP_NOT_ALLOWED", path: "$.question", message: "Plain text only." }] } },
      ],
    });
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    for (const [text, expected] of [["Lần 1", "không tính vượt mức"], ["Lần 2", "chưa được bật hoặc chưa cấu hình"], ["Lần 3", "Thử lại sau 7 giây"]] as const) {
      await input(page).fill(text);
      await send(page).click();
      await expect(page.getByRole("alert").filter({ hasText: expected })).toBeVisible();
      await page.getByRole("button", { name: "Bỏ qua" }).click();
    }
    await input(page).fill("Lần 4");
    await send(page).click();
    await expect(page.locator(".ai-composer-error")).toHaveText("Plain text only.");
    expect(mock.requests).toHaveLength(0);
    await expect(page.getByTestId("ai-unknown")).toHaveCount(0);
  });
});

test.describe("AI bubble: quota out", () => {
  test("exhausted quota locks the composer with the 'Nạp quota' card before any POST", async ({ page }) => {
    const mock = newAiMock({ quota: { units: [{ quotaUnit: "tokens", granted: 1000, reserved: 100, consumed: 900, expired: 0, available: 0, scheduled: 0 }] } });
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    await expect(page.getByTestId("ai-chat-quota")).toHaveText("Quota đã hết");
    const blocked = page.getByTestId("ai-quota-blocked");
    await expect(blocked).toContainText("Quota AI đã hết");
    await expect(blocked).toContainText("50 tokens");
    await expect(blocked.getByRole("link", { name: "Nạp quota" })).toHaveAttribute("href", "/workspace/billing?tab=ai");
    await expect(input(page)).toHaveCount(0);
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(0);
  });

  test("a balance under the reserve and a missing policy lock the composer too", async ({ page }) => {
    const mock = newAiMock({ quota: { units: [{ quotaUnit: "tokens", granted: 1000, reserved: 0, consumed: 970, expired: 0, available: 30, scheduled: 0 }] } });
    await open(page, mock, "/workspace/ai");
    await launcher(page).click();
    await expect(page.getByTestId("ai-quota-blocked")).toContainText("còn 30 tokens");
    await expect(page.getByTestId("ai-chat-quota")).toHaveText("Quota không đủ cho một yêu cầu");
    mock.limits = [{ operation: "Answer", policyActive: false, quotaUnit: null, estimatedReserve: null, maxInputChars: null, maxSources: null, availableUnits: 900, canSubmit: false }];
    await page.reload();
    await launcher(page).click();
    await expect(page.getByTestId("ai-policy-blocked")).toContainText("Chưa có chính sách AI cho thao tác này");
    await expect(page.getByTestId("ai-topup-link")).toHaveCount(0);
    expect(calls(mock, "POST", "/api/ai/organization/answer")).toHaveLength(0);
  });
});
