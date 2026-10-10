/**
 * Evidence level: Playwright route MOCKS of the BE contract (ScenariosController, ScenarioPackageBuildsController,
 * ScenarioContentReviewsController, ReleasesController, IfcQueriesController). This is not integration evidence
 * against a real BE.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { postLoginRoute, safeNext } from "../../src/features/auth/redirect";

const IDS = {
  scenario: "11111111-1111-4111-8111-111111111111",
  version: "22222222-2222-4222-8222-222222222222",
  revision: "33333333-3333-4333-8333-333333333333",
  draft: "44444444-4444-4444-8444-444444444444",
  newVersion: "55555555-5555-4555-8555-555555555555",
  job: "66666666-6666-4666-8666-666666666666",
  run: "77777777-7777-4777-8777-777777777777",
  artifact: "88888888-8888-4888-8888-888888888888",
  review: "99999999-9999-4999-8999-999999999999",
  confirm: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  release: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  retryJob: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const HASH = "a".repeat(64);
const RUBRIC_HASH = "b".repeat(64);
const base = `/workspace/buildings/building-1/scenarios/${IDS.scenario}/versions`;

const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "owner", role: 1, organizationId: "org-1", profileRevision: 1 };

const versionSummary = { id: IDS.version, scenarioId: IDS.scenario, revisionId: IDS.revision, buildingId: "building-1", organizationId: "org-1", versionNumber: 1, name: "Sơ tán tầng 3", schemaVersion: "7", algorithmVersion: "1", timeLimitSeconds: 300, scenarioHash: HASH, createdAt: "2026-10-09T08:00:00Z" };
const versionDetail = {
  ...versionSummary,
  randomSeed: 7,
  replanIntervalSeconds: 5,
  configuration: { spawn: [{ x: 1, y: 0, z: 2 }], goal: [], fireSource: [], npc: [], blockedElements: [], routing: { evacuationRoutes: ["A"] }, scoring: { baseScore: 100 }, modePolicy: {}, safetyThresholds: {} },
  stateSnapshot: { name: "Sơ tán tầng 3" },
  rubric: { schema_version: "1", pass_threshold: 70, criteria: [{ id: "time", metric: "evacuation_time", mandatory: true, weight: 1, threshold: 120, operator: "lte" }] },
  learningObjectives: ["Biết lối thoát gần nhất"],
  learnerInstructions: "Di chuyển ra cầu thang bộ.",
};

type Mock = {
  snapshotCalls: Array<{ key: string | null; ifMatch: string | null }>;
  snapshotResponses: number[]; // status per call, last repeats
  buildCalls: Array<{ key: string | null; body: unknown }>;
  buildResponses: number[];
  retryCalls: Array<{ requestId: string }>;
  retryResponses: number[];
  jobSequence: string[]; // job status per poll, last repeats
  jobPolls: number;
  qa: { runs: unknown[]; issues: unknown[] };
  confirmBody: unknown;
  submitCalls: Array<{ key: string | null }>;
  releaseCalls: Array<{ key: string | null; body: unknown }>;
  publishCalls: number;
  draftEtag: string;
  draftEtags: string[];
  jobList: unknown[];
};

function newMock(patch: Partial<Mock> = {}): Mock {
  return { snapshotCalls: [], snapshotResponses: [201], buildCalls: [], buildResponses: [202], retryCalls: [], retryResponses: [202], jobSequence: ["Succeeded"], jobPolls: 0, qa: { runs: [], issues: [] }, confirmBody: null, submitCalls: [], releaseCalls: [], publishCalls: 0, draftEtag: '"12"', draftEtags: [], jobList: [], ...patch };
}

const problem = (route: Route, status: number, code: string, extra: Record<string, unknown> = {}) =>
  route.fulfill({ status, contentType: "application/problem+json", json: { title: code, status, code, ...extra } });

async function setup(page: Page, mock: Mock, role = 1) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ver-access", refreshToken: "ver-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...owner, role }, headers: { ETag: '"1"' } }));
  await page.route(`**/api/scenarios/${IDS.scenario}`, (route) => route.fulfill({ json: { id: IDS.scenario, buildingId: "building-1", organizationId: "org-1", name: "Kịch bản tầng 3", createdAt: "2026-10-01T00:00:00Z" } }));
  await page.route(`**/api/scenarios/${IDS.scenario}/versions?*`, (route) => route.fulfill({ json: { items: [versionSummary], totalCount: 1, page: 1, pageSize: 20 } }));
  await page.route(`**/api/scenario-versions/${IDS.version}`, (route) => route.fulfill({ json: versionDetail }));
  await page.route(`**/api/scenario-drafts/${IDS.draft}`, (route) => {
    const etag = mock.draftEtags.length ? mock.draftEtags.shift() as string : mock.draftEtag;
    return route.fulfill({ json: { id: IDS.draft, scenarioId: IDS.scenario, revisionId: IDS.revision, draftNumber: 2, state: { name: etag === '"12"' ? "Bản cũ" : "Bản mới", rubric: { criteria: [{}, {}] }, learningObjectives: ["a"] }, updatedAt: "2026-10-10T01:00:00Z", version: 12 }, headers: { ETag: etag } });
  });
  await page.route(`**/api/scenario-drafts/${IDS.draft}/validate`, (route) => route.fulfill({ json: { draftId: IDS.draft, version: 12, isValid: false, issues: [{ code: "SPAWN_REQUIRED", path: "$.spawnPoints", message: "At least one spawn point is required." }] } }));
  await page.route(`**/api/scenario-drafts/${IDS.draft}/snapshot`, (route) => {
    const request = route.request();
    mock.snapshotCalls.push({ key: request.headers()["idempotency-key"] ?? null, ifMatch: request.headers()["if-match"] ?? null });
    const status = mock.snapshotResponses[Math.min(mock.snapshotCalls.length - 1, mock.snapshotResponses.length - 1)];
    if (status === 201) return route.fulfill({ status: 201, json: { id: IDS.newVersion } });
    if (status === 0) return route.abort("failed");
    return problem(route, status, status === 412 ? "PRECONDITION_FAILED" : "VALIDATION_ERROR");
  });
  await page.route(`**/api/scenario-versions/${IDS.newVersion}`, (route) => route.fulfill({ json: { ...versionDetail, id: IDS.newVersion, versionNumber: 2 } }));
  await page.route(`**/api/revisions/${IDS.revision}/processing-jobs?*`, (route) => route.fulfill({ json: { items: mock.jobList, totalCount: mock.jobList.length, page: 1, pageSize: 100 } }));
  await page.route(`**/api/scenario-versions/${IDS.version}/package-builds`, (route) => {
    const request = route.request();
    mock.buildCalls.push({ key: request.headers()["idempotency-key"] ?? null, body: request.postDataJSON() });
    const status = mock.buildResponses[Math.min(mock.buildCalls.length - 1, mock.buildResponses.length - 1)];
    if (status === 202) {
      mock.jobList = [{ id: IDS.job, revisionId: IDS.revision, sourceDocumentId: "src", scenarioVersionId: IDS.version, kind: "ReleasePackage", status: "Queued", createdAt: "2026-10-10T02:00:00Z" }];
      return route.fulfill({ status: 202, json: { jobId: IDS.job } });
    }
    if (status === 0) return route.abort("failed");
    return problem(route, status, "IFC_SOURCE_NOT_VERIFIED");
  });
  await page.route("**/api/processing-jobs/**", (route) => {
    const url = route.request().url();
    const jobId = url.split("/processing-jobs/")[1].split(/[/?]/)[0];
    if (url.includes("/qa")) return route.fulfill({ json: { jobId, currentAttemptId: "att-1", validationRuns: { items: mock.qa.runs, totalCount: mock.qa.runs.length, page: 1, pageSize: 20 } } });
    const status = mock.jobSequence[Math.min(mock.jobPolls, mock.jobSequence.length - 1)];
    mock.jobPolls += 1;
    return route.fulfill({ json: { job: { id: jobId, revisionId: IDS.revision, sourceDocumentId: "src", scenarioVersionId: IDS.version, kind: "ReleasePackage", status, createdAt: "2026-10-10T02:00:00Z" }, inputHash: "c".repeat(64), currentAttemptId: "att-1", currentAttempt: { id: "att-1", attemptNumber: 1, status, toolchainVersion: "tc-1", startedAt: "2026-10-10T02:01:00Z", finishedAt: status === "Succeeded" || status === "Failed" ? "2026-10-10T02:05:00Z" : null, outputHash: null } } });
  });
  await page.route("**/api/processing-jobs/*/retry", (route) => {
    const body = route.request().postDataJSON() as { requestId: string };
    mock.retryCalls.push({ requestId: body.requestId });
    const status = mock.retryResponses[Math.min(mock.retryCalls.length - 1, mock.retryResponses.length - 1)];
    if (status === 202) { mock.jobSequence = ["Queued"]; mock.jobPolls = 0; return route.fulfill({ status: 202, json: { jobId: IDS.retryJob, outcome: "Requeued" } }); }
    return route.abort("failed");
  });
  await page.route(`**/api/revisions/${IDS.revision}/issues?*`, (route) => route.fulfill({ json: { items: mock.qa.issues, totalCount: mock.qa.issues.length, page: 1, pageSize: 100 } }));
  await page.route(`**/api/revisions/${IDS.revision}/confirm-for-training`, (route) => { mock.confirmBody = route.request().postDataJSON(); return route.fulfill({ json: { reviewId: IDS.confirm } }); });
  await page.route(`**/api/scenario-versions/${IDS.version}/submit`, (route) => {
    mock.submitCalls.push({ key: route.request().headers()["idempotency-key"] ?? null });
    return route.fulfill({ status: 201, json: { code: "OK", reviewId: IDS.review, status: "Submitted", contentHash: HASH, rubricHash: RUBRIC_HASH } });
  });
  const release = (status: string) => ({ id: IDS.release, revisionId: IDS.revision, scenarioVersionId: IDS.version, buildingId: "building-1", organizationId: "org-1", confirmationReviewId: IDS.confirm, status, safetyThresholds: "{}", publishedBy: null, publishedAt: null, revokedBy: null, revokedReason: null, revokedAt: null, createdAt: "2026-10-10T03:00:00Z", updatedAt: "2026-10-10T03:00:00Z", package: { id: "pkg-1", candidateArtifactId: IDS.artifact, manifestUrl: "k/manifest", manifestSha256: "d".repeat(64), packageUrl: "k/package", checksumSha256: "e".repeat(64), packageSizeBytes: 123456, minRuntimeVersion: "1.0.0", schemaVersion: "1", buildTarget: "Windows" } });
  await page.route("**/api/releases", (route) => { mock.releaseCalls.push({ key: route.request().headers()["idempotency-key"] ?? null, body: route.request().postDataJSON() }); return route.fulfill({ status: 201, json: release("Built") }); });
  await page.route(`**/api/releases/${IDS.release}`, (route) => route.fulfill({ json: release("Built") }));
  await page.route(`**/api/releases/${IDS.release}/publish`, (route) => { mock.publishCalls += 1; return problem(route, 503, "PUBLISH_GATE_UNAVAILABLE"); });
  await page.route("**/api/buildings/building-1/trainings", (route) => route.fulfill({ json: [] }));
}

const passedRun = { id: IDS.run, revisionId: IDS.revision, processingJobId: IDS.job, processingAttemptId: "att-1", artifactId: IDS.artifact, scenarioVersionId: IDS.version, scope: "ReleasePackage", validatorVersion: "v1", status: "Passed", summary: {}, startedAt: null, finishedAt: "2026-10-10T02:05:00Z", createdAt: "2026-10-10T02:05:00Z" };

test.describe("snapshot", () => {
  test("keeps Idempotency-Key and If-Match when a lost response is retried", async ({ page }) => {
    const mock = newMock({ snapshotResponses: [0, 201] });
    await setup(page, mock);
    await page.goto(`${base}?draft=${IDS.draft}`);
    await expect(page.getByRole("heading", { name: "Phiên bản và readiness" })).toBeVisible();
    await page.getByRole("button", { name: "Tạo snapshot từ draft" }).first().click();
    await expect(page.getByLabel("Mã draft")).toHaveValue(IDS.draft);
    await page.getByRole("button", { name: "Tải draft" }).click();
    await expect(page.getByLabel("Tóm tắt draft đang xem")).toContainText('"12"');
    await page.getByRole("button", { name: "Kiểm tra draft" }).click();
    await expect(page.getByText("SPAWN_REQUIRED")).toBeVisible();
    await page.getByRole("button", { name: "Tạo snapshot", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Không tạo được snapshot" }).or(page.getByRole("alert")).first()).toBeVisible();
    await page.getByRole("button", { name: "Tạo snapshot", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`version=${IDS.newVersion}`));
    expect(mock.snapshotCalls).toHaveLength(2);
    expect(mock.snapshotCalls[0].key).toBeTruthy();
    expect(mock.snapshotCalls[1].key).toBe(mock.snapshotCalls[0].key);
    expect(mock.snapshotCalls[1].ifMatch).toBe('"12"');
  });

  test("412 keeps the draft the user was viewing and offers the newer one for comparison", async ({ page }) => {
    const mock = newMock({ snapshotResponses: [412], draftEtags: ['"12"', '"13"'] });
    await setup(page, mock);
    await page.goto(`${base}?draft=${IDS.draft}`);
    await page.getByRole("button", { name: "Tạo snapshot từ draft" }).first().click();
    await page.getByRole("button", { name: "Tải draft" }).click();
    await page.getByRole("button", { name: "Tạo snapshot", exact: true }).click();
    await expect(page.getByText("Draft đã thay đổi từ lần bạn tải")).toBeVisible();
    await expect(page.getByLabel("Tóm tắt draft đang xem")).toContainText('"12"');
    await page.getByRole("button", { name: "Tải bản mới để đối chiếu" }).click();
    await expect(page.getByLabel("Bản mới")).toContainText('"13"');
    await expect(page.getByLabel("Bản cũ")).toContainText('"12"');
    await expect(page.getByRole("button", { name: "Tạo snapshot", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Dùng bản mới" }).click();
    await expect(page.getByLabel("Tóm tắt draft đang xem")).toContainText('"13"');
    await expect(page.getByRole("button", { name: "Tạo snapshot", exact: true })).toBeEnabled();
  });
});

test.describe("package build and technical readiness", () => {
  test("202 is queued only: polling waits, then job Succeeded without a validation run is not QA Passed", async ({ page }) => {
    const mock = newMock({ jobSequence: ["Queued", "Running", "Succeeded"], qa: { runs: [], issues: [] } });
    await setup(page, mock);
    await page.goto(`${base}?tab=build`);
    await page.getByRole("button", { name: "Chạy package build" }).click();
    await expect(page.getByText("Đã xếp hàng package build")).toBeVisible();
    expect(mock.buildCalls[0].body).toEqual({ kind: "ReleasePackage", buildTarget: "Windows" });
    await expect(page.getByText("Đang chờ kết quả")).toBeVisible();
    await expect(page.locator("[data-gate=technical]")).toContainText("Đang xử lý");
    await expect(page.getByText("Job Succeeded chưa phải QA Passed", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-gate=technical]")).toContainText("Job xong, chưa có QA");
    await page.getByRole("tab", { name: "Kết quả kỹ thuật" }).click();
    await expect(page).toHaveURL(/tab=readiness/);
    await expect(page.getByText("QA Passed", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Xác nhận kỹ thuật" })).toBeDisabled();
    expect(mock.jobPolls).toBeGreaterThanOrEqual(3);
  });

  test("failed package build retries with the same Idempotency-Key", async ({ page }) => {
    const mock = newMock({ buildResponses: [0, 202] });
    await setup(page, mock);
    await page.goto(`${base}?tab=build`);
    await page.getByRole("button", { name: "Chạy package build" }).click();
    await expect(page.getByText("Thử lại dùng cùng Idempotency-Key")).toBeVisible();
    await page.getByRole("button", { name: /Thử lại \(cùng khóa\)/ }).click();
    await expect(page.getByText("Đã xếp hàng package build")).toBeVisible();
    expect(mock.buildCalls).toHaveLength(2);
    expect(mock.buildCalls[1].key).toBe(mock.buildCalls[0].key);
    expect(mock.buildCalls[0].key).toBeTruthy();
  });

  test("failed job can be requeued; a lost response reuses the same requestId", async ({ page }) => {
    const mock = newMock({ jobSequence: ["Failed"], retryResponses: [0, 202], jobList: [{ id: IDS.job, revisionId: IDS.revision, sourceDocumentId: "src", scenarioVersionId: IDS.version, kind: "ReleasePackage", status: "Failed", createdAt: "2026-10-10T02:00:00Z" }] });
    await setup(page, mock);
    await page.goto(`${base}?tab=build`);
    await expect(page.getByRole("alert").filter({ hasText: "Job thất bại" })).toBeVisible();
    await page.getByRole("button", { name: "Chạy lại job" }).click();
    await page.getByLabel("Lý do").fill("Worker bị ngắt");
    await page.getByRole("button", { name: "Chạy lại", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Chạy lại", exact: true }).click();
    await expect(page.getByText("Đã xếp hàng chạy lại job")).toBeVisible();
    expect(mock.retryCalls).toHaveLength(2);
    expect(mock.retryCalls[1].requestId).toBe(mock.retryCalls[0].requestId);
  });

  test("Succeeded job with a Failed QA run and Error issue blocks confirmation", async ({ page }) => {
    const mock = newMock({
      jobList: [{ id: IDS.job, revisionId: IDS.revision, sourceDocumentId: "src", scenarioVersionId: IDS.version, kind: "ReleasePackage", status: "Succeeded", createdAt: "2026-10-10T02:00:00Z" }],
      qa: { runs: [{ ...passedRun, status: "Failed" }], issues: [{ id: "i1", revisionId: IDS.revision, validationRunId: IDS.run, processingAttemptId: "att-1", artifactId: null, issueCode: "RUNTIME_CAPABILITY_MISSING", severity: "Error", status: "Open", message: "Thiết bị chưa hỗ trợ.", isCurrentAttempt: true, createdAt: "2026-10-10T02:05:00Z" }] },
    });
    await setup(page, mock);
    await page.goto(`${base}?tab=readiness`);
    await expect(page.getByText("QA Failed", { exact: true })).toBeVisible();
    await expect(page.getByText("RUNTIME_CAPABILITY_MISSING")).toBeVisible();
    await expect(page.locator("[data-gate=technical]")).toContainText("QA không đạt");
    await expect(page.getByRole("button", { name: "Xác nhận kỹ thuật" })).toBeDisabled();
  });

  test("QA Passed confirms exactly the version and validation run, separate from content approval", async ({ page }) => {
    const mock = newMock({
      jobList: [{ id: IDS.job, revisionId: IDS.revision, sourceDocumentId: "src", scenarioVersionId: IDS.version, kind: "ReleasePackage", status: "Succeeded", createdAt: "2026-10-10T02:00:00Z" }],
      qa: { runs: [passedRun], issues: [] },
    });
    await setup(page, mock);
    await page.goto(`${base}?tab=readiness`);
    await expect(page.getByText("QA Passed", { exact: true })).toBeVisible();
    await expect(page.locator("[data-gate=approval]")).toContainText("Chưa có dữ liệu (chờ BE)");
    await page.getByRole("button", { name: "Xác nhận kỹ thuật" }).click();
    await expect(page.getByTestId("confirm-review-id")).toHaveText(IDS.confirm);
    expect(mock.confirmBody).toEqual({ scenarioVersionId: IDS.version, validationRunId: IDS.run });
    await expect(page.locator("[data-gate=technical]")).toContainText("Đã xác nhận kỹ thuật");
    await expect(page.locator("[data-gate=approval]")).toContainText("Chưa có dữ liệu (chờ BE)");
  });
});

test.describe("review and release", () => {
  test("submit freezes hashes, shows the command response and the BE#52 gap, and never invents approval", async ({ page }) => {
    const mock = newMock();
    await setup(page, mock);
    await page.goto(`${base}?tab=review`);
    await expect(page.getByText("version mới", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("phải được duyệt lại")).toBeVisible();
    await page.getByRole("button", { name: "Gửi duyệt" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(page.getByTestId("review-id")).toHaveText(IDS.review);
    expect(mock.submitCalls).toHaveLength(1);
    expect(mock.submitCalls[0].key).toBeTruthy();
    await expect(page.locator("[data-gate=approval]")).toContainText("Đã gửi, chờ duyệt");
    await expect(page.getByTestId("be52-pending")).toContainText("Chờ BE #52");
    await expect(page.getByText("Đã duyệt", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Gửi duyệt" })).toBeDisabled();
  });

  test("Built is not Published: publish returns 503 PUBLISH_GATE_UNAVAILABLE and the release stays Built", async ({ page }) => {
    const mock = newMock();
    await setup(page, mock);
    await page.goto(`${base}?tab=release`);
    await page.getByLabel("Mã xác nhận kỹ thuật").fill(IDS.confirm);
    await page.getByLabel("Artifact ứng viên (gói release)").fill(IDS.artifact);
    await page.getByRole("button", { name: "Tạo release (Built)" }).click();
    await expect(page.getByTestId("release-status")).toHaveText("Built");
    expect(mock.releaseCalls[0].body).toEqual({ revisionId: IDS.revision, scenarioVersionId: IDS.version, confirmationReviewId: IDS.confirm, candidateArtifactId: IDS.artifact });
    expect(mock.releaseCalls[0].key).toBeTruthy();
    await expect(page.locator("[data-gate=release]")).toContainText("Built, chưa phát hành");
    await page.getByRole("button", { name: "Phát hành", exact: true }).click();
    await expect(page.getByText("503 PUBLISH_GATE_UNAVAILABLE")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "entitlement" }).filter({ hasText: "BE #51" })).toBeVisible();
    await expect(page.getByTestId("release-status")).toHaveText("Built");
    await expect(page.getByText("Published", { exact: true })).toHaveCount(0);
    expect(mock.publishCalls).toBe(1);
  });
});

test.describe("access and deep links", () => {
  test("anonymous deep link keeps its destination and calls no protected API", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/scenario**", (route) => { calls++; return route.fulfill({ status: 401 }); });
    await page.goto(`${base}?tab=release&version=${IDS.version}`);
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toHaveAttribute("href", `/login?next=${encodeURIComponent(`${base}?tab=release&version=${IDS.version}`)}`);
    expect(calls).toBe(0);
  });

  test("Trainee is blocked and no scenario API is called", async ({ page }) => {
    const mock = newMock();
    await setup(page, mock, 2);
    let calls = 0;
    await page.route("**/api/scenario**", (route) => { calls++; return route.fulfill({ status: 403 }); });
    await page.goto(base);
    await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
    expect(calls).toBe(0);
  });

  test("deep link opens the chosen version and tab; ?next= accepts the versions route only for organization roles", async ({ page }) => {
    await setup(page, newMock());
    await page.goto(`${base}?version=${IDS.version}&tab=review`);
    await expect(page.getByRole("tab", { name: "Gửi duyệt" })).toHaveAttribute("data-state", "active");
    await expect(page.getByTestId("be52-pending")).toBeVisible();
    await page.getByRole("tab", { name: "Release" }).click();
    await expect(page).toHaveURL(/tab=release/);
    await page.reload();
    await expect(page.getByRole("tab", { name: "Release" })).toHaveAttribute("data-state", "active");
    expect(safeNext(`${base}?tab=build`)).toBe(`${base}?tab=build`);
    expect(safeNext(`${base}/extra`)).toBe("/learning-hub");
    expect(postLoginRoute({ role: 2 }, base)).toBe("/learning-hub");
    expect(postLoginRoute({ role: 1 }, base)).toBe(base);
  });

  test("API errors show at the point of action with a retry", async ({ page }) => {
    await setup(page, newMock());
    await page.route(`**/api/scenarios/${IDS.scenario}/versions?*`, (route) => route.fulfill({ status: 500 }));
    await page.goto(base);
    await expect(page.getByRole("alert").filter({ hasText: "Không tải được danh sách phiên bản" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thử lại" }).first()).toBeVisible();
  });
});

for (const theme of ["dark", "light"] as const) {
  for (const width of [1440, 375]) {
    test(`layout has no horizontal overflow at ${width}px in ${theme} theme`, async ({ page }, testInfo) => {
      const mock = newMock({
        jobList: [{ id: IDS.job, revisionId: IDS.revision, sourceDocumentId: "src", scenarioVersionId: IDS.version, kind: "ReleasePackage", status: "Succeeded", createdAt: "2026-10-10T02:00:00Z" }],
        qa: { runs: [passedRun], issues: [] },
      });
      await page.addInitScript((value) => localStorage.setItem("fire3d-ops-theme", value), theme);
      await setup(page, mock);
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 700 });
      for (const tab of ["content", "build", "readiness", "review", "release"]) {
        await page.goto(`${base}?tab=${tab}`);
        await expect(page.getByRole("tab", { name: /./ }).first()).toBeVisible();
        await expect(page.locator(".ops-theme")).toHaveAttribute("data-resolved-theme", theme);
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${tab} overflow`).toBeLessThanOrEqual(width);
        await page.screenshot({ path: testInfo.outputPath(`versions-${tab}-${theme}-${width}.png`), fullPage: true });
      }
    });
  }
}
