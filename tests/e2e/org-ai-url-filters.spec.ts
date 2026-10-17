import { expect, test } from "@playwright/test";

import { admin, calls, mockAi, newAiMock, owner, seedRequest, signInAs } from "./org-ai-mock";

// Old links keep pre-v7 AI statuses (Queued, Running, SafetyRejected...) in the URL. The FE must ignore values that are not
// in the current lists instead of sending them (the API answers 400). Route mocks only.

test.describe("AI filters read from the URL", () => {
  test("organization history ignores a legacy status, result type and operation and lists everything", async ({ page }) => {
    const mock = newAiMock();
    seedRequest(mock, { status: "Succeeded" });
    await signInAs(page, owner);
    await mockAi(page, mock);
    await page.goto("/workspace/ai?tab=history&status=Queued&resultType=SafetyRejected&operation=Translate");
    await expect(page.getByTestId("ai-history-row")).toHaveCount(1);
    const search = calls(mock, "GET", "/api/ai/requests").at(-1)?.search ?? "";
    expect(search).not.toContain("status=");
    expect(search).not.toContain("resultType=");
    expect(search).not.toContain("operation=");
    await expect(page.getByLabel("Trạng thái")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Xóa bộ lọc" })).toHaveCount(0);
  });

  test("a current status from the URL is still sent", async ({ page }) => {
    const mock = newAiMock();
    seedRequest(mock, { status: "Succeeded" });
    await signInAs(page, owner);
    await mockAi(page, mock);
    await page.goto("/workspace/ai?tab=history&status=Succeeded");
    await expect(page.getByLabel("Trạng thái")).toHaveValue("Succeeded");
    await expect.poll(() => calls(mock, "GET", "/api/ai/requests").at(-1)?.search).toContain("status=Succeeded");
  });

  test("admin request list ignores a legacy status", async ({ page }) => {
    const mock = newAiMock();
    seedRequest(mock, { status: "Succeeded", organizationId: "org-1" });
    await signInAs(page, admin);
    await mockAi(page, mock);
    await page.goto("/admin/ai?status=Running");
    await expect(page.getByTestId("admin-ai-row")).toHaveCount(1);
    expect(calls(mock, "GET", "/api/admin/ai/requests").at(-1)?.search ?? "").not.toContain("status=");
  });
});
