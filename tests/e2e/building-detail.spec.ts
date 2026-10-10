import { expect, test, type Page, type Route } from "@playwright/test";
import { sha256OfFile } from "../../src/features/buildings/sha256";
import { classifyUploadError, IfcPutError, uploadIfcRevision } from "../../src/features/buildings/ifc-upload";
import { deriveQaVerdict } from "../../src/features/buildings/pipeline";
import { ApiError } from "../../src/api/types/common";
import { postLoginRoute, safeNext } from "../../src/features/auth/redirect";

// All network here is mocked with Playwright routes: evidence for UI behaviour, not for BE integration.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const building = { id: "building-1", name: "Trường Tiểu học", buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: { id: "loc-1", address: "1 Test Street", city: "Hà Nội", district: "Cầu Giấy", latitude: null, longitude: null, geojson: null }, contact: null };
const rev1 = { id: "rev-1", buildingId: "building-1", versionLabel: "IFC rev. 01", status: "ReadyForScenario", createdAt: "2026-10-01T00:00:00Z", sourceDocument: { id: "src-1", originalFilename: "school.ifc", fileSizeBytes: 128, quarantineStatus: "Accepted", createdAt: "2026-10-01T00:00:00Z" } };
const rev2 = { id: "rev-2", buildingId: "building-1", versionLabel: "IFC rev. 02", status: "Uploaded", createdAt: "2026-10-02T00:00:00Z", sourceDocument: { id: "src-2", originalFilename: "school2.ifc", fileSizeBytes: 256, quarantineStatus: "Accepted", createdAt: "2026-10-02T00:00:00Z" } };
const page1 = <T,>(items: T[]) => ({ items, totalCount: items.length, page: 1, pageSize: 20 });

async function signIn(page: Page, user: typeof owner | typeof admin = owner) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

type Mock = { revisions?: unknown[]; jobs?: () => unknown[]; qa?: unknown; issues?: unknown[]; scenarios?: unknown[]; preview?: unknown };

/** Default happy-path mocks; each test overrides the routes it cares about (later routes win). */
async function mockBuilding(page: Page, mock: Mock = {}) {
  await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building }));
  await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: page1(mock.revisions ?? [rev2, rev1]) }));
  await page.route("**/api/buildings/building-1/scenarios?*", (route) => route.fulfill({ json: page1(mock.scenarios ?? []) }));
  await page.route("**/api/scenarios/*/versions?*", (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*/processing-jobs?*", (route) => route.fulfill({ json: page1(mock.jobs?.() ?? []) }));
  await page.route("**/api/revisions/*/issues?*", (route) => route.fulfill({ json: page1(mock.issues ?? []) }));
  await page.route("**/api/revisions/*/processing-logs?*", (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*/artifacts?*", (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*/bim-facts?*", (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*/annotations", (route) => route.fulfill({ json: { revisionId: "rev-2", id: null, version: 0, data: { items: [] }, provenance: null, createdBy: null, createdAt: null } }));
  await page.route("**/api/buildings/building-1/editor-preview?*", (route) => route.fulfill({ json: mock.preview ?? { buildingId: "building-1", revisionId: "rev-2", revisionStatus: "Uploaded", status: "NotReady", artifactId: null, attemptId: null, sha256Hash: null, downloadUrl: null, expiresAt: null, coordinateTransform: null, floors: null, semanticMapping: null } }));
  await page.route("**/api/buildings/building-1/access", (route) => route.fulfill({ json: { buildingId: "building-1", visibility: "Private", accessRevision: 3, hasParticipationCode: true }, headers: { ETag: '"access-3"' } }));
}

const job = (status: string, id = "job-1") => ({ id, revisionId: "rev-2", sourceDocumentId: "src-2", scenarioVersionId: null, kind: "Geometry", status, createdAt: "2026-10-02T01:00:00Z" });
const jobDetail = (status: string, id = "job-1") => ({ job: job(status, id), inputHash: "a".repeat(64), currentAttemptId: status === "Queued" ? null : "att-1", currentAttempt: status === "Queued" ? null : { id: "att-1", attemptNumber: 1, status: status === "Running" ? "Running" : status, toolchainVersion: "ifc-2.1", startedAt: "2026-10-02T01:01:00Z", finishedAt: status === "Running" ? null : "2026-10-02T01:05:00Z", outputHash: null } });
const run = (outcome: string) => ({ id: "run-1", revisionId: "rev-2", processingJobId: "job-1", processingAttemptId: "att-1", artifactId: null, scenarioVersionId: null, scope: "Geometry", validatorVersion: "v1", status: outcome, summary: { outcome }, startedAt: null, finishedAt: "2026-10-02T01:05:00Z", createdAt: "2026-10-02T01:05:00Z" });
const issue = (severity: string, current = true, id = `${severity}-${current}`) => ({ id, revisionId: "rev-2", validationRunId: "run-1", processingAttemptId: "att-1", artifactId: null, issueCode: `CODE_${severity.toUpperCase()}`, severity, status: "Open", message: `Vấn đề mức ${severity}`, evidence: {}, isCurrentAttempt: current, createdAt: "2026-10-02T01:05:00Z" });

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Quản lý tổ chức" });

test.describe("tabs and URL", () => {
  test("deep link opens the tab and revision from the URL and keeps the revision when switching tabs", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page);
    await page.goto("/workspace/buildings/building-1?tab=access&revision=rev-1");
    await expect(page.getByRole("heading", { name: building.name, level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Quyền tham gia" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Revision IFC đang xem")).toHaveValue("rev-1");
    await expect(page.getByText("Phiên bản quyền")).toBeVisible();
    await page.getByRole("tab", { name: "IFC & xử lý" }).click();
    await expect(page).toHaveURL(/tab=ifc/);
    await expect(page).toHaveURL(/revision=rev-1/);
    await expect(page.getByRole("heading", { name: "Tải lên IFC mới" })).toBeVisible();
    await page.getByLabel("Revision IFC đang xem").selectOption("rev-2");
    await expect(page).toHaveURL(/revision=rev-2/);
    await page.goBack();
    await expect(page).toHaveURL(/revision=rev-1/);
    await expect(sidebar(page).getByRole("link", { name: "Công trình", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Đường dẫn" })).toContainText("Công trình");
  });

  test("the old scenarios route opens the scenarios tab, and the services tab opens", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page, { scenarios: [{ id: "sc-1", buildingId: "building-1", name: "Thoát hiểm tầng 1", createdAt: "2026-10-03T00:00:00Z" }] });
    await page.goto("/workspace/buildings/building-1/scenarios");
    await expect(page.getByRole("tab", { name: "Kịch bản" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("link", { name: "Thoát hiểm tầng 1", exact: true })).toHaveAttribute("href", "/workspace/buildings/building-1/scenarios/sc-1");
    await page.getByRole("tab", { name: "Dịch vụ" }).click();
    await expect(page.getByRole("tabpanel", { name: "Dịch vụ" })).toBeVisible(); // real billing tab (see billing-building-tab.spec)
  });

  test("shows a not-found state with no retry loop", async ({ page }) => {
    await signIn(page);
    await page.route("**/api/buildings/missing", (route) => route.fulfill({ status: 404, json: { title: "Not found", code: "NOT_FOUND" } }));
    await page.route("**/api/buildings/missing/**", (route) => route.fulfill({ status: 404, json: { title: "Not found" } }));
    await page.goto("/workspace/buildings/missing");
    await expect(page.getByText("Công trình không tồn tại")).toBeVisible();
  });
});

test.describe("IFC upload stepper", () => {
  const storagePath = "/mock-storage/upload-1";

  async function setup(page: Page, baseURL: string, options: { putStatuses?: number[]; initiateFailures?: Array<{ status: number; code: string; retryAfter?: string }> } = {}) {
    await signIn(page);
    await mockBuilding(page);
    const log = { initiates: [] as Array<{ key: string | undefined; body: Record<string, unknown> }>, puts: [] as Array<{ auth: string | undefined; type: string | undefined; size: number }>, complete: [] as unknown[], process: [] as Array<string | undefined> };
    let putIndex = 0;
    let failureIndex = 0;
    await page.route("**/api/buildings/building-1/revisions/upload-url", async (route) => {
      const request = route.request();
      log.initiates.push({ key: request.headers()["idempotency-key"], body: request.postDataJSON() });
      const failure = options.initiateFailures?.[failureIndex++];
      if (failure) return route.fulfill({ status: failure.status, headers: failure.retryAfter ? { "Retry-After": failure.retryAfter } : {}, json: { title: "x", code: failure.code } });
      return route.fulfill({ status: 201, json: { revisionId: "rev-new", uploadUrl: `${baseURL}${storagePath}?sig=${log.initiates.length}`, objectKey: "staging/key" } });
    });
    await page.route(`**${storagePath}*`, async (route: Route) => {
      const request = route.request();
      log.puts.push({ auth: request.headers().authorization, type: request.headers()["content-type"], size: request.postDataBuffer()?.length ?? 0 });
      const status = options.putStatuses?.[putIndex++] ?? 200;
      return route.fulfill({ status, body: "" });
    });
    await page.route("**/api/revisions/rev-new/upload-complete", async (route) => { log.complete.push(route.request().postDataJSON()); await route.fulfill({ status: 204 }); });
    await page.route("**/api/revisions/rev-new/process", async (route) => { log.process.push(route.request().headers()["idempotency-key"]); await route.fulfill({ status: 202, json: { jobId: "job-new" } }); });
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    return log;
  }

  const ifc = (name = "school.ifc", body = "ISO-10303-21;") => ({ name, mimeType: "application/octet-stream", buffer: Buffer.from(body) });

  test("sends Idempotency-Key + SHA-256, PUTs to the signed URL without JWT, then completes and processes", async ({ page, baseURL }) => {
    const log = await setup(page, baseURL!);
    await page.getByLabel("Nhãn revision").fill("IFC rev. 03");
    await page.getByLabel("Tệp IFC").setInputFiles(ifc());
    await expect(page.getByRole("list", { name: "Các bước tải IFC" })).toBeVisible();
    await page.getByRole("button", { name: "Tải lên và xử lý" }).click();
    await expect(page.getByText("Đã gửi xử lý IFC")).toBeVisible();
    expect(log.initiates).toHaveLength(1);
    expect(log.initiates[0].key).toBeTruthy();
    expect(log.initiates[0].body).toMatchObject({ fileSizeBytes: 13, originalFilename: "school.ifc", versionLabel: "IFC rev. 03" });
    expect(String(log.initiates[0].body.sha256Hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(log.puts).toEqual([{ auth: undefined, type: "application/octet-stream", size: 13 }]);
    expect(log.complete).toEqual([{ objectKey: "staging/key", fileSizeBytes: 13, mimeType: "application/octet-stream", sha256Hash: log.initiates[0].body.sha256Hash, originalFilename: "school.ifc" }]);
    expect(log.process).toHaveLength(1);
    expect(log.process[0]).toBeTruthy();
    await expect(page.getByRole("listitem").filter({ hasText: "Xử lý" }).first()).toHaveAttribute("data-state", "done");
  });

  test("IFC_UPLOAD_DISABLED with Retry-After waits, then the retry reuses the same Idempotency-Key; another file gets a new key", async ({ page, baseURL }) => {
    const log = await setup(page, baseURL!, { initiateFailures: [{ status: 503, code: "IFC_UPLOAD_DISABLED", retryAfter: "2" }] });
    await page.getByLabel("Nhãn revision").fill("IFC rev. 03");
    await page.getByLabel("Tệp IFC").setInputFiles(ifc());
    await page.getByRole("button", { name: "Tải lên và xử lý" }).click();
    await expect(page.getByText(/tạm tắt/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Thử lại \(\d+s\)/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Thử lại", exact: true })).toBeEnabled({ timeout: 6000 });
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(page.getByText("Đã gửi xử lý IFC")).toBeVisible();
    expect(log.initiates).toHaveLength(2);
    expect(log.initiates[1].key).toBe(log.initiates[0].key);

    await page.getByRole("button", { name: "Tải IFC khác" }).click();
    await page.getByLabel("Nhãn revision").fill("IFC rev. 04");
    await page.getByLabel("Tệp IFC").setInputFiles(ifc("other.ifc", "different content"));
    await page.getByRole("button", { name: "Tải lên và xử lý" }).click();
    await expect.poll(() => log.initiates.length).toBe(3);
    expect(log.initiates[2].key).not.toBe(log.initiates[0].key);
  });

  test("an expired signed URL (403 on PUT) asks again with the same key for a fresh URL and keeps the file", async ({ page, baseURL }) => {
    const log = await setup(page, baseURL!, { putStatuses: [403, 200] });
    await page.getByLabel("Nhãn revision").fill("IFC rev. 03");
    await page.getByLabel("Tệp IFC").setInputFiles(ifc());
    await page.getByRole("button", { name: "Tải lên và xử lý" }).click();
    await expect(page.getByText(/Liên kết tải lên đã hết hạn/)).toBeVisible();
    await expect(page.getByLabel("Nhãn revision")).toHaveValue("IFC rev. 03");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(page.getByText("Đã gửi xử lý IFC")).toBeVisible();
    expect(log.initiates).toHaveLength(2);
    expect(log.initiates[1].key).toBe(log.initiates[0].key);
    expect(log.puts).toHaveLength(2);
    expect(log.process).toHaveLength(1);
  });

  test("a network failure during PUT keeps the intent: retry does not initiate again", async ({ page, baseURL }) => {
    const log = await setup(page, baseURL!, { putStatuses: [503, 200] });
    await page.getByLabel("Nhãn revision").fill("IFC rev. 03");
    await page.getByLabel("Tệp IFC").setInputFiles(ifc());
    await page.getByRole("button", { name: "Tải lên và xử lý" }).click();
    await expect(page.getByText("Tải lên chưa hoàn tất")).toBeVisible();
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(page.getByText("Đã gửi xử lý IFC")).toBeVisible();
    expect(log.initiates).toHaveLength(1);
    expect(log.puts).toHaveLength(2);
  });

  test("double click starts one upload", async ({ page, baseURL }) => {
    const log = await setup(page, baseURL!);
    await page.getByLabel("Nhãn revision").fill("IFC rev. 03");
    await page.getByLabel("Tệp IFC").setInputFiles(ifc());
    await page.getByRole("button", { name: "Tải lên và xử lý" }).dblclick();
    await expect(page.getByText("Đã gửi xử lý IFC")).toBeVisible();
    expect(log.initiates).toHaveLength(1);
    expect(log.process).toHaveLength(1);
  });

  test("rejects a non-IFC file before any request", async ({ page, baseURL }) => {
    const log = await setup(page, baseURL!);
    await page.getByLabel("Nhãn revision").fill("IFC rev. 03");
    await page.getByLabel("Tệp IFC").setInputFiles({ name: "model.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    await expect(page.getByText("Hãy chọn một tệp IFC (.ifc) không rỗng.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tải lên và xử lý" })).toBeDisabled();
    expect(log.initiates).toHaveLength(0);
  });
});

test.describe("processing, QA and polling", () => {
  test("polls a job that has no result yet; a finished job is NOT shown as QA passed", async ({ page }) => {
    await signIn(page);
    const states = ["Queued", "Running", "Succeeded"];
    let polls = 0;
    await mockBuilding(page);
    await page.route("**/api/revisions/rev-2/processing-jobs?*", (route) => { const status = states[Math.min(polls, states.length - 1)]; polls++; return route.fulfill({ json: page1([job(status)]) }); });
    await page.route("**/api/processing-jobs/job-1", (route) => route.fulfill({ json: jobDetail(states[Math.min(polls - 1, 2)]) }));
    await page.route("**/api/processing-jobs/job-1/qa?*", (route) => route.fulfill({ json: { jobId: "job-1", currentAttemptId: "att-1", validationRuns: page1([]) } }));
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    await expect(page.getByText("Đang chờ worker").first()).toBeVisible();
    await expect(page.getByText("Đang chờ kết quả QA")).toBeVisible();
    await expect(page.getByText("Worker chạy xong").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Chưa có kết quả QA")).toBeVisible();
    await expect(page.getByText("QA đạt", { exact: true })).toHaveCount(0);
    await expect(page.getByText("không có nghĩa là QA đạt")).toBeVisible();
    const seen = polls;
    await page.waitForTimeout(4000);
    expect(polls).toBe(seen); // polling stopped on the terminal state
  });

  test("Succeeded job with a Failed run or Error/Critical issues reads as QA failed; a Passed run reads as passed", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page, { jobs: () => [job("Succeeded")], issues: [issue("Critical"), issue("Warning"), issue("Info"), issue("Error", false, "old")] });
    await page.route("**/api/processing-jobs/job-1", (route) => route.fulfill({ json: jobDetail("Succeeded") }));
    await page.route("**/api/processing-jobs/job-1/qa?*", (route) => route.fulfill({ json: { jobId: "job-1", currentAttemptId: "att-1", validationRuns: page1([run("Passed")]) } }));
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    // Run says Passed but a current Critical issue exists: not passed.
    await expect(page.getByText("QA không đạt")).toBeVisible();
    await expect(page.getByText("Có 1 issue mức Error/Critical")).toBeVisible();
    await page.getByRole("tab", { name: "Issue" }).click();
    await expect(page.getByText("Vấn đề mức Critical")).toBeVisible();
    await expect(page.getByText("Vấn đề mức Error")).toHaveCount(0); // history hidden by default
    await page.getByLabel("Lọc theo mức độ").selectOption("Warning");
    await expect(page.getByText("Vấn đề mức Critical")).toHaveCount(0);
    await expect(page.getByText("Vấn đề mức Warning")).toBeVisible();
    await page.getByLabel("Chỉ lần chạy hiện hành").uncheck();
    await page.getByLabel("Lọc theo mức độ").selectOption("Error");
    await expect(page.getByText("Vấn đề mức Error")).toBeVisible();
  });

  test("a clean Passed run is shown as QA passed", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page, { jobs: () => [job("Succeeded")], issues: [issue("Info")] });
    await page.route("**/api/processing-jobs/job-1", (route) => route.fulfill({ json: jobDetail("Succeeded") }));
    await page.route("**/api/processing-jobs/job-1/qa?*", (route) => route.fulfill({ json: { jobId: "job-1", currentAttemptId: "att-1", validationRuns: page1([run("Passed")]) } }));
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    await expect(page.getByText("QA đạt", { exact: true })).toBeVisible();
  });

  test("a Failed job offers a retry with a reason and a stable requestId", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page, { jobs: () => [job("Failed")] });
    await page.route("**/api/processing-jobs/job-1", (route) => route.fulfill({ json: jobDetail("Failed") }));
    const bodies: Array<{ requestId: string; reason: string }> = [];
    let attempts = 0;
    await page.route("**/api/processing-jobs/job-1/retry", async (route) => {
      bodies.push(route.request().postDataJSON());
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 503, json: { title: "busy" } });
      return route.fulfill({ status: 202, json: { jobId: "job-1", outcome: "Requeued" } });
    });
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    await page.getByRole("button", { name: "Chạy lại job thất bại" }).click();
    await page.getByRole("button", { name: "Chạy lại", exact: true }).click();
    await expect(page.getByText("Nhập lý do chạy lại.")).toBeVisible();
    await page.getByLabel("Lý do chạy lại").fill("Worker bị timeout");
    await page.getByRole("button", { name: "Chạy lại", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(/Hệ thống đang bận/)).toBeVisible();
    await page.getByRole("button", { name: "Chạy lại", exact: true }).click();
    await expect(page.getByText("Đã yêu cầu chạy lại job")).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[1].requestId).toBe(bodies[0].requestId);
    expect(bodies[1].reason).toBe("Worker bị timeout");
  });

  test("the process button sends an Idempotency-Key and ignores a double click", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page);
    const keys: Array<string | undefined> = [];
    await page.route("**/api/revisions/rev-2/process", async (route) => { keys.push(route.request().headers()["idempotency-key"]); await route.fulfill({ status: 202, json: { jobId: "job-9" } }); });
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    await page.getByRole("button", { name: "Chạy xử lý IFC" }).dblclick();
    await expect(page.getByText("Đã gửi yêu cầu xử lý").first()).toBeVisible();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBeTruthy();
  });
});

test.describe("preview", () => {
  test("NotReady is an explained empty state, not an error", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page);
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    await expect(page.getByText("Preview chưa sẵn sàng")).toBeVisible();
  });

  test("a failing signed URL asks for a new URL once, then shows a retry", async ({ page, baseURL }) => {
    await signIn(page);
    let previews = 0;
    const ready = () => ({ buildingId: "building-1", revisionId: "rev-2", revisionStatus: "ReadyForScenario", status: "Ready", artifactId: "art-1", attemptId: "att-1", sha256Hash: "b".repeat(64), downloadUrl: `${baseURL}/mock-storage/model-${previews}.glb`, expiresAt: "2099-01-01T00:00:00Z", coordinateTransform: null, floors: null, semanticMapping: null });
    await mockBuilding(page);
    await page.route("**/api/buildings/building-1/editor-preview?*", (route) => { previews++; return route.fulfill({ json: ready() }); });
    await page.route("**/mock-storage/model-*.glb", (route) => route.fulfill({ status: 403, body: "expired" }));
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    await expect(page.getByText(/Không tải được mô hình/)).toBeVisible({ timeout: 15000 });
    await expect.poll(() => previews).toBeGreaterThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Thử lại" }).first()).toBeVisible();
  });
});

test.describe("annotations", () => {
  test("a 412 keeps what the user typed and offers the newer version", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page);
    const put: Array<{ ifMatch: string | undefined; body: { items: Array<{ label: string }> } }> = [];
    const remote = { revisionId: "rev-2", id: "ann-2", version: 4, data: { items: [{ id: "11111111-1111-4111-8111-111111111111", ifcGlobalId: "2O2Fr$t4X7Zf8NOew3FLOH", label: "Bản của người khác", note: null }] }, provenance: null, createdBy: null, createdAt: null };
    let gets = 0;
    await page.route("**/api/revisions/rev-2/annotations", async (route) => {
      if (route.request().method() === "PUT") { put.push({ ifMatch: route.request().headers()["if-match"], body: route.request().postDataJSON() }); return route.fulfill({ status: 412, json: { title: "stale", code: "PRECONDITION_FAILED" } }); }
      gets++;
      return route.fulfill({ json: gets === 1 ? { ...remote, version: 3, data: { items: [] } } : remote });
    });
    await page.goto("/workspace/buildings/building-1?tab=ifc");
    await page.getByRole("button", { name: "Thêm annotation" }).first().click();
    await page.getByLabel(/IFC GlobalId #1/).fill("0abcDEF");
    await page.getByLabel(/Nhãn #1/).fill("Cửa thoát hiểm chính");
    await page.getByRole("button", { name: "Lưu annotation" }).click();
    expect(put[0].ifMatch).toBe('"3"');
    await expect(page.getByText(/phiên bản mới hơn/)).toBeVisible();
    await expect(page.getByText("Bản của người khác").first()).toBeVisible();
    await expect(page.getByLabel(/Nhãn #1/)).toHaveValue("Cửa thoát hiểm chính");
    await expect(page.getByRole("button", { name: "Lưu annotation" })).toBeDisabled();
    await page.getByRole("button", { name: "Giữ bản của tôi để ghi đè" }).click();
    await page.getByRole("button", { name: "Lưu annotation" }).click();
    await expect.poll(() => put.length).toBe(2);
    expect(put[1].ifMatch).toBe('"4"');
    expect(put[1].body.items[0].label).toBe("Cửa thoát hiểm chính");
  });
});

test.describe("participation access", () => {
  test("rotate asks for confirmation, shows the new code once and never again after reload", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page);
    const rotate: Array<string | undefined> = [];
    await page.route("**/api/buildings/building-1/participation-code/rotate", async (route) => {
      rotate.push(route.request().headers()["if-match"]);
      await route.fulfill({ json: { buildingId: "building-1", visibility: "Private", accessRevision: 4, hasParticipationCode: true, code: "ONE-TIME-CODE-abc123" }, headers: { ETag: '"access-4"' } });
    });
    await page.goto("/workspace/buildings/building-1?tab=access");
    await page.getByRole("button", { name: "Tạo mã mới" }).click();
    await expect(page.getByRole("dialog", { name: "Tạo mã tham gia mới?" })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("MỘT LẦN");
    expect(rotate).toHaveLength(0); // nothing is sent before confirming
    await page.getByRole("button", { name: "Tạo mã mới" }).last().dblclick();
    await expect(page.getByTestId("participation-code")).toHaveText("ONE-TIME-CODE-abc123");
    await expect(page.getByText("Mã này chỉ hiển thị một lần")).toBeVisible();
    expect(rotate).toEqual(['"access-3"']);
    await page.getByRole("button", { name: "Tôi đã lưu mã, ẩn đi" }).click();
    await expect(page.getByTestId("participation-code")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Phiên bản quyền")).toBeVisible();
    await expect(page.getByTestId("participation-code")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes("ONE-TIME-CODE"))).toBe(false);
  });

  test("changing visibility and revoking need confirmation; a 412 asks to reload and applies nothing", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page);
    const patches: Array<{ ifMatch: string | undefined; body: unknown }> = [];
    await page.route("**/api/buildings/building-1/access", async (route) => {
      if (route.request().method() === "PATCH") { patches.push({ ifMatch: route.request().headers()["if-match"], body: route.request().postDataJSON() }); return route.fulfill({ status: 412, json: { title: "stale", code: "PRECONDITION_FAILED" } }); }
      return route.fulfill({ json: { buildingId: "building-1", visibility: "Private", accessRevision: 3, hasParticipationCode: true }, headers: { ETag: '"access-3"' } });
    });
    let revokes = 0;
    await page.route("**/api/buildings/building-1/participation-code", async (route) => { revokes++; await route.fulfill({ json: { buildingId: "building-1", visibility: "Private", accessRevision: 4, hasParticipationCode: false } }); });
    await page.goto("/workspace/buildings/building-1?tab=access");
    await page.getByLabel("Chế độ truy cập").selectOption("Public");
    await page.getByRole("button", { name: "Áp dụng chế độ" }).click();
    await expect(page.getByRole("dialog")).toContainText("làm mất hiệu lực quyền tham gia");
    expect(patches).toHaveLength(0);
    await page.getByRole("button", { name: "Đổi chế độ" }).click();
    await expect(page.getByText("Cài đặt truy cập đã thay đổi")).toBeVisible();
    expect(patches).toEqual([{ ifMatch: '"access-3"', body: { visibility: "Public" } }]);
    await page.getByRole("button", { name: "Tải bản mới" }).click();
    await page.getByRole("button", { name: "Thu hồi mã" }).click();
    await expect(page.getByRole("dialog")).toContainText("vô hiệu");
    expect(revokes).toBe(0);
    await page.getByRole("dialog").getByRole("button", { name: "Thu hồi mã" }).click();
    await expect(page.getByText("Chưa có mã")).toBeVisible();
    expect(revokes).toBe(1);
  });
});

test.describe("scenarios", () => {
  test("creating a scenario sends an Idempotency-Key, ignores a double click and reuses the key on retry", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page);
    const calls: Array<{ key: string | undefined; body: unknown }> = [];
    await page.route("**/api/scenarios", async (route) => {
      calls.push({ key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() });
      if (calls.length === 1) return route.fulfill({ status: 503, json: { title: "busy" } });
      return route.fulfill({ status: 201, json: { id: "sc-new" } });
    });
    await page.goto("/workspace/buildings/building-1?tab=scenarios");
    await page.getByLabel("Tên kịch bản").fill("Thoát hiểm tầng 1");
    await page.getByRole("button", { name: "Tạo kịch bản" }).dblclick();
    await expect(page.getByText(/Hệ thống đang bận/)).toBeVisible();
    expect(calls).toHaveLength(1);
    await expect(page.getByLabel("Tên kịch bản")).toHaveValue("Thoát hiểm tầng 1");
    await page.getByRole("button", { name: "Tạo kịch bản" }).click();
    await expect(page.getByText("Đã tạo kịch bản")).toBeVisible();
    expect(calls).toHaveLength(2);
    expect(calls[1].key).toBe(calls[0].key);
    expect(calls[0].key).toBeTruthy();
    expect(calls[1].body).toEqual({ buildingId: "building-1", name: "Thoát hiểm tầng 1" });
  });
});

test.describe("overview quick edit", () => {
  test("edits through the drawer and keeps input on failure", async ({ page }) => {
    await signIn(page);
    await mockBuilding(page);
    let attempts = 0;
    let query = "";
    await page.route("**/api/buildings/building-1?*", async (route) => { query = new URL(route.request().url()).search; await route.fulfill({ json: building }); });
    await page.route("**/api/buildings/building-1", async (route) => {
      if (route.request().method() !== "PUT") return route.fulfill({ json: building });
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 500, json: { title: "x" } });
      return route.fulfill({ json: { ...building, name: "Tên mới" } });
    });
    await page.goto("/workspace/buildings/building-1");
    await page.getByRole("button", { name: "Sửa nhanh" }).click();
    await page.getByLabel("Tên công trình", { exact: true }).fill("Tên mới");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText(/Nội dung bạn nhập vẫn được giữ lại/)).toBeVisible();
    await expect(page.getByLabel("Tên công trình", { exact: true })).toHaveValue("Tên mới");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText("Đã lưu công trình")).toBeVisible();
    expect(attempts).toBe(2);
    expect(query).toBe(""); // OrganizationUser never sends organizationId
  });
});

test.describe("PlatformAdmin by organization", () => {
  const orgs = { items: [{ id: "org-1", name: "FET3D Lab", slug: "fet3d-lab", isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }, { id: "org-2", name: "Trường ABC", slug: "abc", isActive: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }], totalCount: 2, page: 1, pageSize: 100 };
  const summary = { id: "building-1", name: "Trường Tiểu học", buildingType: "Trường học", totalFloors: 3, isActive: true, createdAt: "2026-10-05T00:00:00Z" };

  test("lists, creates and archives buildings of the selected organization through organizationId", async ({ page }) => {
    await signIn(page, admin);
    const requests: Array<{ method: string; url: URL; body?: unknown }> = [];
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: orgs }));
    await page.route("**/api/organizations/org-1", (route) => route.fulfill({ json: orgs.items[0] }));
    await page.route("**/api/buildings?*", (route) => { requests.push({ method: "GET", url: new URL(route.request().url()) }); return route.fulfill({ json: page1([summary]) }); });
    await page.route("**/api/buildings", async (route) => { requests.push({ method: route.request().method(), url: new URL(route.request().url()), body: route.request().postDataJSON() }); await route.fulfill({ status: 201, json: building }); });
    await page.route("**/api/buildings/building-1?*", async (route) => { requests.push({ method: route.request().method(), url: new URL(route.request().url()) }); await route.fulfill({ json: summary }); });

    await page.goto("/admin/organizations/org-1/buildings");
    await expect(page.getByRole("heading", { name: "Công trình · FET3D Lab" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Đường dẫn" })).toContainText("Quản trị");
    await expect(page.getByRole("navigation", { name: "Đường dẫn" })).toContainText("Tổ chức");
    await expect(page.getByRole("link", { name: summary.name })).toBeVisible();
    expect(requests[0].url.searchParams.get("organizationId")).toBe("org-1");
    await expect(page.getByText("hãy đăng nhập bằng tài khoản OrganizationUser")).toHaveCount(0);

    await page.getByRole("button", { name: "Lưu trữ Trường Tiểu học" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Lưu trữ" }).click();
    await expect.poll(() => requests.some((request) => request.method === "DELETE")).toBe(true);
    expect(requests.find((request) => request.method === "DELETE")?.url.searchParams.get("organizationId")).toBe("org-1");

    await page.getByRole("button", { name: "Tạo công trình", exact: true }).click();
    await page.getByLabel("Tên công trình", { exact: true }).fill("Công trình của tổ chức");
    await page.getByRole("button", { name: "Tạo và thêm IFC" }).click();
    await expect.poll(() => requests.some((request) => request.method === "POST")).toBe(true);
    expect(requests.find((request) => request.method === "POST")?.body).toMatchObject({ name: "Công trình của tổ chức", organizationId: "org-1" });
  });

  test("/workspace/buildings lets the admin pick an organization (no request before choosing)", async ({ page }) => {
    await signIn(page, admin);
    let listCalls = 0;
    await page.route("**/api/organizations?*", (route) => route.fulfill({ json: orgs }));
    await page.route("**/api/organizations/org-2", (route) => route.fulfill({ json: orgs.items[1] }));
    await page.route("**/api/buildings?*", (route) => { listCalls++; return route.fulfill({ json: page1([summary]) }); });
    await page.goto("/workspace/buildings");
    await expect(page.getByText("Chọn tổ chức để xem công trình")).toBeVisible();
    expect(listCalls).toBe(0);
    await page.getByLabel("Tổ chức", { exact: true }).selectOption("org-2");
    await expect(page).toHaveURL(/org=org-2/);
    await expect(page.getByRole("link", { name: summary.name })).toBeVisible();
    expect(listCalls).toBe(1);
  });

  test("an OrganizationUser never sends organizationId on list", async ({ page }) => {
    await signIn(page, owner);
    const urls: URL[] = [];
    await page.route("**/api/buildings?*", (route) => { urls.push(new URL(route.request().url())); return route.fulfill({ json: page1([summary]) }); });
    await page.goto("/workspace/buildings?org=org-2");
    await expect(page.getByRole("link", { name: summary.name })).toBeVisible();
    expect(urls.every((url) => !url.searchParams.has("organizationId"))).toBe(true);
  });

  test("admin opens the building detail and edits on behalf of its organization", async ({ page }) => {
    await signIn(page, admin);
    await mockBuilding(page);
    const queries: string[] = [];
    await page.route("**/api/buildings/building-1?*", async (route) => { queries.push(new URL(route.request().url()).search); await route.fulfill({ json: building }); });
    await page.goto("/workspace/buildings/building-1");
    await expect(page.getByRole("heading", { name: building.name, level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Đường dẫn" })).toContainText("Quản trị");
    await page.getByRole("button", { name: "Sửa nhanh" }).click();
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect.poll(() => queries.length).toBe(1);
    expect(queries[0]).toBe("?organizationId=org-1");
  });
});

test.describe("responsive and themes", () => {
  for (const { width, height } of [{ width: 1440, height: 900 }, { width: 375, height: 700 }]) {
    for (const scheme of ["dark", "light"] as const) {
      test(`building detail has no horizontal overflow at ${width}px (${scheme})`, async ({ page }, testInfo) => {
        await signIn(page);
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height });
        await mockBuilding(page, { jobs: () => [job("Succeeded")], issues: [issue("Critical"), issue("Warning")] });
        await page.route("**/api/processing-jobs/job-1", (route) => route.fulfill({ json: jobDetail("Succeeded") }));
        await page.route("**/api/processing-jobs/job-1/qa?*", (route) => route.fulfill({ json: { jobId: "job-1", currentAttemptId: "att-1", validationRuns: page1([run("Failed")]) } }));
        for (const tab of ["overview", "ifc", "scenarios", "access"]) {
          await page.goto(`/workspace/buildings/building-1?tab=${tab}`);
          await expect(page.getByRole("tablist", { name: "Chi tiết công trình" }).getByRole("tab", { selected: true })).toBeVisible();
          await page.waitForTimeout(500);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await page.screenshot({ path: testInfo.outputPath(`detail-${tab}-${width}-${scheme}.png`), fullPage: true });
        }
      });
    }
  }
});

test.describe("helpers", () => {
  test("SHA-256 of small and chunked inputs matches the native digest", async () => {
    const data = new Uint8Array(200_000).map((_, index) => index % 251);
    const file = new File([data], "x.ifc");
    const native = await sha256OfFile(file);
    const chunked = await sha256OfFile(file, { nativeLimitBytes: 0, chunkBytes: 7_777 });
    expect(chunked).toBe(native);
    expect(await sha256OfFile(new File([], "e.ifc"), { nativeLimitBytes: 0 })).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const progress: number[] = [];
    await sha256OfFile(file, { nativeLimitBytes: 0, chunkBytes: 100_000, onProgress: (done) => progress.push(done) });
    expect(progress).toEqual([100_000, 200_000]);
  });

  test("uploadIfcRevision resumes: the hash and the initiated intent are not repeated after a PUT failure", async () => {
    const file = new File(["IFC"], "school.ifc");
    const session = {};
    let initiates = 0;
    let hashes = 0;
    let fail = true;
    const args = {
      file, versionLabel: "v1", session,
      hash: async () => { hashes++; return "c".repeat(64); },
      initiate: async () => { initiates++; return { revisionId: "r", uploadUrl: "https://storage.test/u", objectKey: "k" }; },
      finalize: async () => undefined,
      put: async () => { if (fail) { fail = false; throw new IfcPutError("boom", 503); } },
    };
    await expect(uploadIfcRevision(args)).rejects.toMatchObject({ stage: "upload", retryable: true });
    await expect(uploadIfcRevision(args)).resolves.toMatchObject({ revisionId: "r" });
    expect(initiates).toBe(1);
    expect(hashes).toBe(1);
  });

  test("classifies upload failures", () => {
    expect(classifyUploadError("initiate", new ApiError("x", 503, undefined, 7, "IFC_UPLOAD_DISABLED"))).toMatchObject({ retryable: true, retryAfterSeconds: 7, code: "IFC_UPLOAD_DISABLED" });
    expect(classifyUploadError("complete", new ApiError("x", 410))).toMatchObject({ restart: true });
    expect(classifyUploadError("complete", new ApiError("x", 422, undefined, undefined, "IFC_SOURCE_MISMATCH"))).toMatchObject({ restart: true });
    expect(classifyUploadError("upload", new IfcPutError("x", 403))).toMatchObject({ renewUrl: true });
    expect(classifyUploadError("upload", new IfcPutError("x", 0))).toMatchObject({ retryable: true });
    expect(classifyUploadError("initiate", new ApiError("x", 409, undefined, undefined, "IDEMPOTENCY_KEY_CONFLICT"))).toMatchObject({ restart: true });
  });

  test("QA verdict never promotes a Succeeded job to Passed", () => {
    const base = { job: { id: "j", revisionId: "r", sourceDocumentId: "s", scenarioVersionId: null, kind: "Geometry", status: "Succeeded", createdAt: "" }, detail: null };
    expect(deriveQaVerdict({ ...base, qa: null }, []).state).toBe("unavailable");
    expect(deriveQaVerdict({ ...base, qa: { jobId: "j", currentAttemptId: null, validationRuns: page1([]) } as never }, []).state).toBe("unavailable");
    expect(deriveQaVerdict({ job: { ...base.job, status: "Running" }, detail: null, qa: null }, []).state).toBe("pending");
  });

  test("next allows the admin organization buildings route", () => {
    expect(safeNext("/admin/organizations/org-1/buildings")).toBe("/admin/organizations/org-1/buildings");
    expect(safeNext("/admin/organizations/org-1/other")).toBe("/learning-hub");
    expect(postLoginRoute({ role: 0 }, "/admin/organizations/org-1/buildings")).toBe("/admin/organizations/org-1/buildings");
    expect(postLoginRoute({ role: 1 }, "/admin/organizations/org-1/buildings")).toBe("/workspace/buildings");
  });
});
