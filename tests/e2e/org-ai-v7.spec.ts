import { expect, test, type Page } from "@playwright/test";

import { BUILDING_ID, REVISION_ID } from "../fixtures/scenario-editor/fixture-building";
import { admin, calls, ids, iso, mockAi, newAiMock, owner, seedRequest, signInAs, type AiMock } from "./org-ai-mock";

// AI v7 fields the FE#56 follow-up adds: limits, citation links and request input, revision pin for drafts, admin
// operation/audience filters, paginated policies with dailyUnits. Route mocks that follow the BE OpenAPI, not the real API.

async function open(page: Page, mock: AiMock, url: string, user: typeof owner | typeof admin = owner) {
  await signInAs(page, user);
  await mockAi(page, mock);
  await page.goto(url);
}

test.describe("Organization AI v7 details", () => {
  test("the form shows the reserve and balance from /limits; the result shows the question, AI notes and a linked citation", async ({ page }) => {
    const mock = newAiMock();
    await open(page, mock, "/workspace/ai");
    await expect(page.getByTestId("ai-limit-hint")).toContainText("50 tokens");
    await expect(page.getByTestId("ai-limit-hint")).toContainText("900 tokens");
    await page.getByLabel("Câu hỏi").fill("Lối thoát nạn rộng bao nhiêu?");
    await page.getByTestId("ai-send").click();
    await expect(page.getByTestId("ai-answer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("ai-input")).toContainText("Lối thoát nạn rộng bao nhiêu?");
    const link = page.getByTestId("ai-citation-link");
    await expect(link).toHaveAttribute("href", "https://example.gov.vn/qcvn-06");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(page.getByTestId("ai-citation")).toContainText("độ liên quan 82%");
  });

  test("Learn and Library citations open inside the app; a non-https sourceUri is never a link", async ({ page }) => {
    const mock = newAiMock();
    const learn = seedRequest(mock, {
      citations: [
        { kind: "LearnPost", id: ids.learn1, versionId: "v", title: "Cách dùng bình chữa cháy", versionLabel: "v3", locator: null, link: { learnSlug: "binh-chua-chay", learnPostId: ids.learn1, libraryItemId: null, sourceUri: null } },
        { kind: "LibraryVersion", id: ids.lib1, versionId: "v", title: "EXT-01 Bình chữa cháy", versionLabel: "v2", locator: null, link: { learnSlug: null, learnPostId: null, libraryItemId: "lib-item-1", sourceUri: null } },
        { kind: "KnowledgeSource", id: ids.src2, versionId: "v", title: "TCVN nội bộ", versionLabel: "1", locator: null, link: { learnSlug: null, learnPostId: null, libraryItemId: null, sourceUri: "http://insecure.example/doc" } },
      ],
      result: { status: "Answered", answer: "Trả lời.", confidence: "medium", assumptions: ["Tòa nhà dưới 5 tầng"], limitations: ["Không xét nhà xưởng"] },
    });
    await open(page, mock, `/workspace/ai?tab=history&request=${learn.requestId}`);
    const links = page.getByTestId("ai-citation-link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", "/learn/binh-chua-chay");
    await expect(links.nth(1)).toHaveAttribute("href", "/workspace/library?item=lib-item-1");
    await expect(page.getByTestId("ai-citation").nth(2)).toContainText("TCVN nội bộ");
    const notes = page.getByTestId("ai-notes");
    await expect(notes).toContainText("Trung bình");
    await expect(notes).toContainText("Tòa nhà dưới 5 tầng");
    await expect(notes).toContainText("Không xét nhà xưởng");
  });

  test("scenario draft lists draft-ready revisions and sends the chosen revisionId", async ({ page }) => {
    const mock = newAiMock();
    mock.revisions = [
      { id: REVISION_ID, buildingId: BUILDING_ID, versionLabel: "IFC rev. 01", status: "ReadyForScenario", createdAt: iso(-100), sourceDocument: null },
      { id: "55555555-5555-4555-8555-555555555555", buildingId: BUILDING_ID, versionLabel: "IFC rev. 02", status: "NeedsFix", createdAt: iso(-10), sourceDocument: null },
    ];
    await open(page, mock, "/workspace/ai?tab=draft");
    const select = page.getByTestId("ai-revision");
    await expect(select.locator("option")).toHaveCount(2); // server default + the one ready revision; NeedsFix is not offered
    await select.selectOption(REVISION_ID);
    await page.getByLabel("Yêu cầu đề xuất").fill("Sơ tán tầng 2");
    await page.getByTestId("ai-send").click();
    await expect.poll(() => calls(mock, "POST", "/api/ai/organization/scenario-draft").length).toBe(1);
    expect(calls(mock, "POST", "/api/ai/organization/scenario-draft")[0].body).toMatchObject({ buildingId: BUILDING_ID, prompt: "Sơ tán tầng 2", revisionId: REVISION_ID });
  });

  test("a Building without a draft-ready revision explains why and sends nothing; a 409 AI_REVISION_NOT_READY is explained too", async ({ page }) => {
    const mock = newAiMock();
    mock.revisions = [{ id: REVISION_ID, buildingId: BUILDING_ID, versionLabel: "IFC rev. 01", status: "Processing", createdAt: iso(-100), sourceDocument: null }];
    await open(page, mock, "/workspace/ai?tab=draft");
    await expect(page.getByTestId("ai-no-ready-revision")).toContainText("chưa có mô hình sẵn sàng");
    await page.getByLabel("Yêu cầu đề xuất").fill("Sơ tán tầng 2");
    await expect(page.getByTestId("ai-send")).toBeDisabled();

    // The status changed on the server meanwhile: the BE refuses, the FE shows the meaning.
    mock.revisions = [{ id: REVISION_ID, buildingId: BUILDING_ID, versionLabel: "IFC rev. 01", status: "ReadyForScenario", createdAt: iso(-100), sourceDocument: null }];
    mock.submitFaults.push({ status: 409, json: { status: 409, title: "not ready", code: "AI_REVISION_NOT_READY" } });
    await page.reload();
    await page.getByLabel("Yêu cầu đề xuất").fill("Sơ tán tầng 2");
    await page.getByTestId("ai-send").click();
    await expect(page.getByText(/chưa có revision mô hình sẵn sàng cho kịch bản/)).toBeVisible();
  });
});

test.describe("Admin AI v7 details", () => {
  test("requests filter by operation and audience; a Trainee request shows no organization", async ({ page }) => {
    const mock = newAiMock();
    seedRequest(mock, { status: "Succeeded", organizationId: "org-1" });
    seedRequest(mock, { status: "Succeeded", operation: "TraineeAnswer", audience: "trainee", organizationId: null });
    await open(page, mock, "/admin/ai", admin);
    await expect(page.getByTestId("admin-ai-row")).toHaveCount(2);
    await page.getByLabel("Đối tượng").selectOption("trainee");
    await expect(page.getByTestId("admin-ai-row")).toHaveCount(1);
    await expect(page.getByTestId("admin-ai-row")).toContainText("Hỏi đáp của Trainee");
    await expect(page.getByTestId("admin-ai-row")).toContainText("không thuộc quota tổ chức");
    await expect.poll(() => calls(mock, "GET", "/api/admin/ai/requests").at(-1)?.search).toContain("audience=trainee");
    await page.getByLabel("Loại yêu cầu").selectOption("Answer");
    await expect(page.getByTestId("admin-ai-row")).toHaveCount(0);
    await expect.poll(() => calls(mock, "GET", "/api/admin/ai/requests").at(-1)?.search).toContain("operation=Answer");
  });

  test("policies are paginated and filtered by operation; TraineeAnswer needs dailyUnits ≥ reserve", async ({ page }) => {
    const mock = newAiMock();
    for (let n = 0; n < 24; n += 1) mock.policies.push({ id: `cccccccc-0000-4000-8000-${String(100 + n).padStart(12, "0")}`, operation: "ScenarioDraft", quotaUnit: "tokens", reserveUnits: 80, maxInputChars: 4000, maxSources: 10, dailyUnits: null, effectiveFrom: iso(-60 * 24 * (40 + n)), effectiveUntil: iso(-60 * 24 * (39 + n)), createdAt: iso(-60 * 24 * (40 + n)) });
    await open(page, mock, "/admin/ai?tab=policies", admin);
    await expect(page.getByTestId("policy-row")).toHaveCount(20);
    await expect.poll(() => calls(mock, "GET", "/api/admin/ai/policies").at(-1)?.search).toContain("pageSize=20");
    await page.getByRole("button", { name: /Trang sau|Sau/ }).first().click();
    await expect(page.getByTestId("policy-row")).toHaveCount(5);
    await page.getByLabel("Thao tác").selectOption("Answer");
    await expect(page.getByTestId("policy-row")).toHaveCount(1);
    await expect.poll(() => calls(mock, "GET", "/api/admin/ai/policies").at(-1)?.search).toContain("operation=Answer");

    await page.getByTestId("policy-new").click();
    const form = page.getByRole("form", { name: "Tạo chính sách AI" });
    await form.getByLabel("Thao tác").selectOption("TraineeAnswer");
    await form.getByLabel("Đơn vị quota").fill("tokens");
    await form.getByLabel("Giữ chỗ mỗi yêu cầu").fill("50");
    await form.getByLabel("Số ký tự đầu vào tối đa").fill("2000");
    await form.getByLabel("Số nguồn tối đa").fill("5");
    await form.getByTestId("policy-daily-units").fill("20");
    await form.getByTestId("policy-create").click();
    await expect(form.getByText("Phải lớn hơn hoặc bằng mức giữ chỗ mỗi yêu cầu.")).toBeVisible();
    expect(calls(mock, "POST", "/api/admin/ai/policies")).toHaveLength(0);
    await form.getByTestId("policy-daily-units").fill("500");
    await form.getByTestId("policy-create").click();
    await expect(page.getByText("Đã tạo chính sách AI")).toBeVisible();
    expect(calls(mock, "POST", "/api/admin/ai/policies")[0].body).toMatchObject({ operation: "TraineeAnswer", reserveUnits: 50, dailyUnits: 500 });
  });
});
