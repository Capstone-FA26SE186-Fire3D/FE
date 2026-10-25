import { expect, test, type Page } from "@playwright/test";
import { derivePipelineProgress, emptyPipeline } from "../../src/features/buildings/pipeline";

// IFC progress view on the Building IFC tab: upload → file check → geometry → QA → exit door → ready, with one call to action
// per blocking status. Route mocks follow the BE contract (retry only for Failed jobs, process returns the existing job,
// QA moves the revision with the Succeeded job). UI evidence, not BE integration.

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
const building = { id: "building-1", name: "Trường Tiểu học", buildingType: "Trường học", totalFloors: 3, isActive: true, organizationId: "org-1", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", location: null, contact: null };
const page1 = <T,>(items: T[]) => ({ items, totalCount: items.length, page: 1, pageSize: 20 });
const source = (quarantineStatus = "Accepted") => ({ id: "src-2", originalFilename: "school.ifc", fileSizeBytes: 256, quarantineStatus, createdAt: "2026-10-02T00:00:00Z" });
const rev = (status: string, extra: Record<string, unknown> = {}) => ({ id: "rev-2", buildingId: "building-1", versionLabel: "IFC rev. 02", status, createdAt: "2026-10-02T00:00:00Z", sourceDocument: source(), ...extra });
const newer = { id: "rev-3", buildingId: "building-1", versionLabel: "IFC rev. 03", status: "ReadyForScenario", createdAt: "2026-10-03T00:00:00Z", sourceDocument: source() };
const job = (status: string) => ({ id: "job-1", revisionId: "rev-2", sourceDocumentId: "src-2", scenarioVersionId: null, kind: "Geometry", status, createdAt: "2026-10-02T01:00:00Z" });
const detail = (status: string, attemptNumber = 1) => ({ job: job(status), inputHash: "a".repeat(64), currentAttemptId: status === "Queued" ? null : "att-1", currentAttempt: status === "Queued" ? null : { id: "att-1", attemptNumber, status: status === "Running" ? "Running" : status, toolchainVersion: "ifc-2.1", startedAt: "2026-10-02T01:01:00Z", finishedAt: status === "Running" ? null : "2026-10-02T01:05:00Z", outputHash: null } });
const run = (outcome: string) => ({ id: "run-1", revisionId: "rev-2", processingJobId: "job-1", processingAttemptId: "att-1", artifactId: null, scenarioVersionId: null, scope: "Geometry", validatorVersion: "v1", status: outcome, summary: { outcome }, startedAt: null, finishedAt: "2026-10-02T01:05:00Z", createdAt: "2026-10-02T01:05:00Z" });
const issue = (issueCode: string, severity: string, id = issueCode) => ({ id, revisionId: "rev-2", validationRunId: "run-1", processingAttemptId: "att-1", artifactId: null, issueCode, severity, status: "Open", message: `Worker: ${issueCode}`, evidence: {}, isCurrentAttempt: true, createdAt: "2026-10-02T01:05:00Z" });
const notReady = { buildingId: "building-1", revisionId: "rev-2", revisionStatus: "Uploaded", status: "NotReady", artifactId: null, attemptId: null, sha256Hash: null, downloadUrl: null, expiresAt: null, coordinateTransform: null, floors: null, semanticMapping: null };

type Mock = {
  revisions: unknown[];
  /** Fresh `GET /api/revisions/rev-2`; defaults to the listed revision. */
  revision?: () => unknown;
  jobStatus?: string;
  attemptNumber?: number;
  qa?: { status: number; body: unknown };
  issues?: unknown[];
  logs?: unknown[];
  preview?: () => unknown;
  equipment?: unknown;
};

async function open(page: Page, mock: Mock, url = "/workspace/buildings/building-1?tab=ifc") {
  const calls = { revision: 0, preview: 0, logs: 0 };
  await page.addInitScript(() => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" }));
    localStorage.setItem("fire3d-org-tour", "done"); // the spotlight tour must never cover the page under test
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
  await page.route("**/api/buildings/building-1", (route) => route.fulfill({ json: building, headers: { ETag: '"3"' } }));
  await page.route("**/api/buildings/building-1/revisions?*", (route) => route.fulfill({ json: page1(mock.revisions) }));
  await page.route("**/api/buildings/building-1/scenarios?*", (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*", (route) => { calls.revision++; return route.fulfill({ json: mock.revision?.() ?? mock.revisions.find((item) => (item as { id: string }).id === route.request().url().split("/").pop()) }); });
  await page.route("**/api/revisions/*/processing-jobs?*", (route) => route.fulfill({ json: page1(mock.jobStatus ? [job(mock.jobStatus)] : []) }));
  await page.route("**/api/processing-jobs/job-1", (route) => route.fulfill({ json: detail(mock.jobStatus ?? "Queued", mock.attemptNumber) }));
  await page.route("**/api/processing-jobs/job-1/qa?*", (route) => route.fulfill(mock.qa ? { status: mock.qa.status, json: mock.qa.body } : { json: { jobId: "job-1", currentAttemptId: "att-1", validationRuns: page1([run("Passed")]) } }));
  await page.route("**/api/revisions/*/issues?*", (route) => route.fulfill({ json: page1(mock.issues ?? []) }));
  await page.route("**/api/revisions/*/processing-logs?*", (route) => { calls.logs++; return route.fulfill({ json: page1(mock.logs ?? []) }); });
  for (const part of ["artifacts", "bim-facts"]) await page.route(`**/api/revisions/*/${part}?*`, (route) => route.fulfill({ json: page1([]) }));
  await page.route("**/api/revisions/*/annotations", (route) => route.fulfill({ json: { revisionId: "rev-2", id: null, version: 0, data: { items: [] }, provenance: null, createdBy: null, createdAt: null } }));
  await page.route("**/api/buildings/building-1/editor-preview?*", (route) => { calls.preview++; return route.fulfill({ json: mock.preview?.() ?? notReady }); });
  await page.route("**/api/revisions/*/equipment-candidates", (route) => mock.equipment
    ? route.fulfill({ json: mock.equipment, headers: { ETag: '"1"' } })
    : route.fulfill({ status: 409, contentType: "application/problem+json", body: JSON.stringify({ status: 409, title: "unavailable", code: "EQUIPMENT_CANDIDATES_UNAVAILABLE" }) }));
  await page.route("**/api/scenario-interactions/catalog", (route) => route.fulfill({ json: [{ runtimeVersion: "2.0.0", protocolVersion: "1", capabilities: ["door.standard", "door.exit"], capabilityContracts: { "door.standard": { version: "1.0.0", objectKinds: ["Equipment"] }, "door.exit": { version: "1.0.0", objectKinds: ["Equipment"] } } }] }));
  await page.goto(url);
  // The progress view is the default IFC sub-tab; `?sub=preview` shows the viewer card instead.
  await expect(url.includes("sub=preview") ? page.locator("#revision-preview") : page.getByTestId("pipeline-progress")).toBeVisible();
  return calls;
}

const step = (page: Page, id: string) => page.getByTestId("pipeline-progress").locator(`li[data-step="${id}"]`);
const next = (page: Page) => page.getByTestId("pipeline-next");
/** "Tải lên IFC mới" opens the upload modal (Radix focuses the dialog's close button first, so the file input is not focused). */
const uploadModal = (page: Page) => page.getByTestId("ifc-upload-modal");

test.describe("IFC progress view", () => {
  test("a running job shows the attempt and the latest processing step; the file check stays non-blocking while Pending", async ({ page }) => {
    await open(page, {
      revisions: [rev("Uploaded", { sourceDocument: source("Pending") })],
      jobStatus: "Running",
      attemptNumber: 2,
      logs: [
        { id: "l1", revisionId: "rev-2", jobId: "job-1", step: "Parse", status: "Success", message: null, durationMs: 10, attemptNumber: 2, loggedAt: "2026-10-02T01:02:00Z" },
        { id: "l2", revisionId: "rev-2", jobId: "job-1", step: "GenNavMesh", status: "Started", message: null, durationMs: null, attemptNumber: 2, loggedAt: "2026-10-02T01:03:00Z" },
      ],
    });
    await expect(step(page, "upload")).toHaveAttribute("data-state", "done");
    await expect(step(page, "quarantine")).toHaveAttribute("data-state", "skipped");
    await expect(step(page, "quarantine")).toContainText("Chưa có kết quả kiểm tra tệp");
    await expect(step(page, "geometry")).toHaveAttribute("data-state", "active");
    await expect(step(page, "geometry")).toContainText("lượt xử lý thứ 2");
    await expect(step(page, "geometry")).toContainText("bước Tạo lưới di chuyển");
    await expect(step(page, "qa")).toHaveAttribute("data-state", "todo");
    await expect(step(page, "exit")).toHaveCount(0);
    await expect(next(page)).toContainText("Đang dựng mô hình 3D");
    await expect(next(page).getByRole("button")).toHaveCount(0);
  });

  test("Failed job: the geometry step is in error and the call to action opens the existing retry dialog", async ({ page }) => {
    await open(page, { revisions: [rev("Uploaded")], jobStatus: "Failed" });
    await expect(step(page, "geometry")).toHaveAttribute("data-state", "error");
    await expect(next(page)).toContainText("Xử lý IFC thất bại");
    await next(page).getByRole("button", { name: "Chạy lại lượt xử lý bị lỗi" }).click();
    await expect(page.getByRole("dialog", { name: "Chạy lại lượt xử lý bị lỗi?" })).toBeVisible();
    await expect(page.getByLabel("Lý do chạy lại")).toBeVisible();
    await page.getByRole("button", { name: "Hủy" }).click();
    await next(page).getByRole("button", { name: "Tải lên IFC mới" }).click();
    await expect(uploadModal(page)).toBeVisible();
    await expect(uploadModal(page).getByLabel("Chọn tệp IFC")).toBeAttached();
  });

  test("NeedsFix with IFC_EXIT_UNKNOWN: QA done, the exit step blocks and its action goes to the exit door choice", async ({ page }) => {
    const door = { id: "c-door", ifcGlobalId: "2O2Fr$t4X7Zf8NOew3FLOH", catalogKey: "door.standard", source: "ifc", ifcClass: "IfcDoor", confidence: 0.95, floorId: "L1", position: [1, 0, 2], rotationY: 0, bbox: null, needsConfirmation: false, decision: null, suggestedDecision: null };
    await open(page, {
      revisions: [rev("NeedsFix")],
      jobStatus: "Succeeded",
      issues: [issue("IFC_EXIT_UNKNOWN", "Warning"), issue("IFC_NO_FIRE_EQUIPMENT", "Info")],
      equipment: { revisionId: "rev-2", artifactId: "art-1", metadataAvailable: true, version: 1, items: [door], revisionStatus: "NeedsFix", exitConfirmationRequired: true },
    });
    await expect(step(page, "qa")).toHaveAttribute("data-state", "done");
    await expect(step(page, "qa")).toContainText("0 lỗi · 1 cảnh báo");
    await expect(step(page, "exit")).toHaveAttribute("data-state", "error");
    await expect(step(page, "ready")).toHaveAttribute("data-state", "todo");
    await expect(next(page)).toContainText("Chọn cửa thoát ra ngoài");
    // The action switches to the "Thiết bị" sub-tab, then focuses the first exit-door button.
    await next(page).getByRole("button", { name: "Chọn cửa thoát" }).click();
    await expect(page).toHaveURL(/sub=equipment/);
    await expect(page.getByTestId("equipment-exit").first()).toBeFocused();
    await expect(page.getByTestId("exit-step")).toBeVisible();

    // Per-issue next step from the QA guide (Issue chip of the "Kỹ thuật" sub-tab).
    await page.getByTestId("ifc-sub-technical").click();
    await expect(page.getByTestId("details-tab-issues")).toHaveAttribute("aria-pressed", "true");
    const exitRow = page.locator('[data-testid="issue-row"][data-code="IFC_EXIT_UNKNOWN"]');
    await expect(exitRow.getByTestId("issue-action")).toHaveAttribute("data-action", "equipment");
    const editorRow = page.locator('[data-testid="issue-row"][data-code="IFC_NO_FIRE_EQUIPMENT"]');
    await editorRow.getByTestId("issue-action").click();
    await expect(page).toHaveURL(/tab=scenarios/);
  });

  test("NeedsFix from QA errors: explicit guidance, open the issues and upload a new IFC", async ({ page }) => {
    await open(page, { revisions: [rev("NeedsFix")], jobStatus: "Succeeded", qa: { status: 200, body: { jobId: "job-1", currentAttemptId: "att-1", validationRuns: page1([run("Failed")]) } }, issues: [issue("IFC_NO_SPACES", "Error")] });
    await expect(step(page, "qa")).toHaveAttribute("data-state", "error");
    await expect(step(page, "qa")).toContainText("1 lỗi · 0 cảnh báo");
    await expect(step(page, "exit")).toHaveCount(0);
    await expect(next(page)).toContainText("Mô hình cần sửa");
    await expect(next(page)).toContainText("tải lên IFC mới");
    // Leave the technical details on "Nhật ký", go back to the progress view: "Xem các vấn đề" must land on the Vấn đề chip.
    await page.getByTestId("ifc-sub-technical").click();
    await page.getByRole("button", { name: "Nhật ký", exact: true }).click();
    await expect(page.getByRole("button", { name: "Nhật ký", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("ifc-sub-progress").click();
    await next(page).getByRole("button", { name: "Xem các vấn đề" }).click();
    await expect(page).toHaveURL(/sub=technical/);
    await expect(page.getByTestId("details-tab-issues")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("issue-row").getByTestId("issue-action").click(); // IFC_NO_SPACES → re-upload
    await expect(uploadModal(page)).toBeVisible();
  });

  test("ReadyForScenario: every step done and “Soạn kịch bản” opens the scenarios tab", async ({ page }) => {
    await open(page, { revisions: [rev("ReadyForScenario")], jobStatus: "Succeeded", issues: [issue("IFC_SPACE_UNNAMED", "Warning")] });
    for (const id of ["upload", "quarantine", "geometry", "qa", "ready"]) await expect(step(page, id)).toHaveAttribute("data-state", "done");
    await expect(next(page)).toContainText("Sẵn sàng soạn kịch bản");
    await expect(next(page)).toContainText("còn 1 cảnh báo, không ảnh hưởng");
    await next(page).getByRole("button", { name: "Soạn kịch bản" }).click();
    await expect(page).toHaveURL(/tab=scenarios/);
    await expect(page).toHaveURL(/revision=rev-2/);
    await expect(page.getByTestId("building-tab-scenarios")).toHaveAttribute("aria-selected", "true");
  });

  test("Rejected, rejected file and Superseded each get explicit guidance", async ({ page }) => {
    await open(page, { revisions: [newer, rev("Superseded")], jobStatus: "Succeeded" }, "/workspace/buildings/building-1?tab=ifc&revision=rev-2");
    await expect(step(page, "ready")).toHaveAttribute("data-state", "skipped");
    await expect(next(page)).toContainText("Bản IFC đã được thay thế");
    await next(page).getByRole("button", { name: "Xem bản IFC mới nhất" }).click();
    await expect(page).toHaveURL(/revision=rev-3/);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await open(page, { revisions: [rev("Rejected")], jobStatus: "Succeeded" });
    await expect(step(page, "ready")).toHaveAttribute("data-state", "error");
    await expect(next(page)).toContainText("Bản IFC bị từ chối");
    await expect(next(page).getByRole("button")).toHaveText(["Tải lên IFC mới"]);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await open(page, { revisions: [rev("Uploaded", { sourceDocument: source("Rejected") })] });
    await expect(step(page, "quarantine")).toHaveAttribute("data-state", "error");
    await expect(next(page)).toContainText("Tệp IFC bị từ chối khi kiểm tra");
  });

  test("after the job succeeds the revision is read again until QA settles it, then polling stops", async ({ page }) => {
    let reads = 0;
    const calls = await open(page, { revisions: [rev("Uploaded")], jobStatus: "Succeeded", revision: () => (++reads < 2 ? rev("Uploaded") : rev("ReadyForScenario")) });
    await expect(next(page)).toContainText("Sẵn sàng soạn kịch bản", { timeout: 15_000 });
    await expect(step(page, "ready")).toHaveAttribute("data-state", "done");
    const seen = calls.revision;
    await page.waitForTimeout(4000);
    expect(calls.revision).toBe(seen);
  });

  test("a failing /qa is surfaced, not read as “no QA yet”", async ({ page }) => {
    await open(page, { revisions: [rev("NeedsFix")], jobStatus: "Succeeded", qa: { status: 500, body: { title: "boom" } } });
    await expect(step(page, "qa")).toHaveAttribute("data-state", "error");
    await expect(next(page)).toContainText("Không tải được kết quả kiểm tra");
    await expect(page.getByRole("button", { name: "Tải lại kết quả kiểm tra" })).toBeVisible();
    await expect(page.getByText("Kiểm tra đạt", { exact: true })).toHaveCount(0);
  });

  test("preview: NotReady is checked again every 5s; ReprocessRequired explains the re-upload", async ({ page }) => {
    const previewUrl = "/workspace/buildings/building-1?tab=ifc&sub=preview";
    const calls = await open(page, { revisions: [rev("Uploaded")], jobStatus: "Running" }, previewUrl);
    await expect(page.getByText("Xem trước 3D chưa sẵn sàng")).toBeVisible();
    await expect.poll(() => calls.preview, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await open(page, { revisions: [rev("ReadyForScenario")], jobStatus: "Succeeded", preview: () => ({ ...notReady, revisionStatus: "ReadyForScenario", status: "ReprocessRequired", artifactId: "art-1", sha256Hash: "b".repeat(64) }) }, previewUrl);
    const reprocess = page.getByTestId("preview-reprocess");
    await expect(reprocess).toContainText("tải lên lại tệp IFC");
    await reprocess.getByRole("button", { name: "Tải lên IFC mới" }).click();
    await expect(uploadModal(page)).toBeVisible();
  });

  test("stepper screenshot", async ({ page }, testInfo) => {
    await open(page, { revisions: [rev("NeedsFix")], jobStatus: "Succeeded", issues: [issue("IFC_EXIT_UNKNOWN", "Warning")] });
    await expect(step(page, "exit")).toHaveAttribute("data-state", "error");
    await page.getByTestId("pipeline-progress").screenshot({ path: testInfo.outputPath("pipeline-progress.png") });
  });
});

test.describe("progress model", () => {
  const base = { id: "rev-2", buildingId: "b", versionLabel: "v", createdAt: "", sourceDocument: source() };
  test("no call to action is guessed before the first poll answers, and an Uploaded revision without a job offers processing", () => {
    expect(derivePipelineProgress({ revision: { ...base, status: "Uploaded" }, pipeline: emptyPipeline, currentIssues: [], loaded: false, hasNewerRevision: false }).next.actions).toEqual([]);
    expect(derivePipelineProgress({ revision: { ...base, status: "Uploaded" }, pipeline: emptyPipeline, currentIssues: [], loaded: true, hasNewerRevision: false }).next.actions).toEqual(["process"]);
  });
  test("a Cancelled job is never offered a retry (the BE requeues Failed jobs only)", () => {
    const model = derivePipelineProgress({ revision: { ...base, status: "Uploaded" }, pipeline: { job: job("Cancelled"), detail: null, qa: null }, currentIssues: [], loaded: true, hasNewerRevision: false });
    expect(model.next.actions).toEqual(["upload"]);
  });
});
