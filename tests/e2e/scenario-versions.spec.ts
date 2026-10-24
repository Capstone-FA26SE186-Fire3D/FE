/**
 * Evidence level: Playwright route MOCKS of the BE contract at main @ 1eaf988 (ScenariosController incl. drafts/readiness,
 * ScenarioPackageBuildsController, ScenarioContentReviewsController, ReleasesController incl. list/publish, IfcQueriesController).
 * The mock keeps the state a real server would keep (review status, confirmation, release) so a reload proves recovery
 * from server state. This is not integration evidence against a real BE.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { postLoginRoute, safeNext } from "../../src/features/auth/redirect";

const IDS = {
  scenario: "11111111-1111-4111-8111-111111111111",
  version: "22222222-2222-4222-8222-222222222222",
  revision: "33333333-3333-4333-8333-333333333333",
  draft: "44444444-4444-4444-8444-444444444444",
  draft2: "44444444-4444-4444-8444-444444444445",
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

const versionBase = { id: IDS.version, scenarioId: IDS.scenario, revisionId: IDS.revision, buildingId: "building-1", organizationId: "org-1", versionNumber: 1, name: "Sơ tán tầng 3", schemaVersion: "7", algorithmVersion: "1", timeLimitSeconds: 300, scenarioHash: HASH, createdAt: "2026-10-09T08:00:00Z" };
const versionExtra = {
  randomSeed: 7,
  replanIntervalSeconds: 5,
  configuration: { spawn: [{ x: 1, y: 0, z: 2 }], goal: [], fireSource: [], npc: [], blockedElements: [], routing: { evacuationRoutes: ["A"] }, scoring: { baseScore: 100 }, modePolicy: {}, safetyThresholds: {} },
  stateSnapshot: { name: "Sơ tán tầng 3" },
  rubric: { schema_version: "1", pass_threshold: 70, criteria: [{ id: "time", metric: "evacuation_time", mandatory: true, weight: 1, threshold: 120, operator: "lte" }] },
  learningObjectives: ["Biết lối thoát gần nhất"],
  learnerInstructions: "Di chuyển ra cầu thang bộ.",
};

type DraftRow = { id: string; draftNumber: number; version: number; updatedAt: string; lastEditedByName: string | null };

type Mock = {
  // what the browser sent
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
  publishCalls: Array<{ key: string | null }>;
  publishResponses: number[]; // status per call, last repeats; 200 publishes
  draftEtag: string;
  draftEtags: string[];
  jobList: unknown[];
  // what the server remembers (survives a page reload)
  reviewStatus: string;
  reviewId: string | null;
  rejectReason: string | null;
  confirmed: string | null;
  release: { status: string } | null;
  drafts: DraftRow[];
  currentDraftId: string | null;
  readinessCalls: number;
  reviewReads: number;
};

function newMock(patch: Partial<Mock> = {}): Mock {
  return {
    snapshotCalls: [], snapshotResponses: [201], buildCalls: [], buildResponses: [202], retryCalls: [], retryResponses: [202], jobSequence: ["Succeeded"], jobPolls: 0,
    qa: { runs: [], issues: [] }, confirmBody: null, submitCalls: [], releaseCalls: [], publishCalls: [], publishResponses: [503], draftEtag: '"12"', draftEtags: [], jobList: [],
    reviewStatus: "NotSubmitted", reviewId: null, rejectReason: null, confirmed: null, release: null,
    drafts: [{ id: IDS.draft, draftNumber: 2, version: 12, updatedAt: "2026-10-10T01:00:00Z", lastEditedByName: "Nguyễn Văn A" }], currentDraftId: IDS.draft, readinessCalls: 0, reviewReads: 0,
    ...patch,
  };
}

const problem = (route: Route, status: number, code: string, extra: Record<string, unknown> = {}) =>
  route.fulfill({ status, contentType: "application/problem+json", json: { title: code, status, code, ...extra } });

const job = (status = "Succeeded", id = IDS.job) => ({ id, revisionId: IDS.revision, sourceDocumentId: "src", scenarioVersionId: IDS.version, kind: "ReleasePackage", status, createdAt: "2026-10-10T02:00:00Z" });

function readinessOf(mock: Mock) {
  const runs = mock.qa.runs as Array<{ id: string; status: string; artifactId: string | null }>;
  const run = runs[0];
  const blockers = (mock.qa.issues as Array<{ issueCode: string; severity: string; message: string }>).filter((issue) => ["Error", "Critical"].includes(issue.severity));
  const passed = run?.status === "Passed" && blockers.length === 0;
  const jobs = mock.jobList as Array<{ id: string; status: string }>;
  const missing: string[] = [];
  if (!run) missing.push("PACKAGE_VALIDATION_REQUIRED");
  else if (run.status !== "Passed") missing.push("QA_NOT_PASSED");
  if (blockers.length) missing.push("QA_BLOCKERS_PRESENT");
  if (passed && !mock.confirmed) missing.push("CONFIRMATION_REQUIRED");
  return {
    scenarioVersionId: IDS.version, revisionId: IDS.revision, scenarioHash: HASH, reviewStatus: mock.reviewStatus,
    packageJob: jobs[0] ? { jobId: jobs[0].id, status: jobs[0].status, currentAttemptId: "att-1" } : null,
    validationRunId: run?.id ?? null, outcome: run?.status ?? null, blockerCount: blockers.length, blockers,
    confirmationReviewId: mock.confirmed, candidateArtifactId: passed ? run.artifactId : null, technicalReady: passed && Boolean(mock.confirmed), missing,
  };
}

function releaseBody(status: string) {
  return {
    id: IDS.release, revisionId: IDS.revision, scenarioVersionId: IDS.version, buildingId: "building-1", organizationId: "org-1", confirmationReviewId: IDS.confirm, status, safetyThresholds: "{}",
    publishedBy: status === "Published" ? "owner" : null, publishedAt: status === "Published" ? "2026-10-10T04:00:00Z" : null, revokedBy: null, revokedReason: null, revokedAt: null,
    createdAt: "2026-10-10T03:00:00Z", updatedAt: "2026-10-10T03:00:00Z",
    package: { id: "pkg-1", candidateArtifactId: IDS.artifact, manifestUrl: "k/manifest", manifestSha256: "d".repeat(64), packageUrl: "k/package", checksumSha256: "e".repeat(64), packageSizeBytes: 123456, minRuntimeVersion: "1.0.0", schemaVersion: "1", buildTarget: "Android" },
    entitlement: { id: "ent-1", status: "Active", startsAt: "2026-10-01T00:00:00Z", endsAt: "2027-04-01T00:00:00Z", paid: true, learnerLimit: 50 },
  };
}

async function setup(page: Page, mock: Mock, role = 1) {
  const summary = () => ({ ...versionBase, reviewStatus: mock.reviewStatus, reviewId: mock.reviewId, rejectReason: mock.rejectReason });
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ver-access", refreshToken: "ver-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...owner, role }, headers: { ETag: '"1"' } }));
  await page.route(`**/api/scenarios/${IDS.scenario}`, (route) => route.fulfill({ json: { id: IDS.scenario, buildingId: "building-1", organizationId: "org-1", name: "Kịch bản tầng 3", createdAt: "2026-10-01T00:00:00Z", currentDraftId: mock.currentDraftId, currentDraftVersion: 12, draftCount: mock.drafts.length, latestVersionId: IDS.version, latestVersionNumber: 1 } }));
  await page.route(`**/api/scenarios/${IDS.scenario}/versions?*`, (route) => route.fulfill({ json: { items: [{ ...summary() }], totalCount: 1, page: 1, pageSize: 20 } }));
  await page.route(`**/api/scenarios/${IDS.scenario}/drafts?*`, (route) => route.fulfill({ json: { items: mock.drafts.map((draft) => ({ id: draft.id, scenarioId: IDS.scenario, revisionId: IDS.revision, draftNumber: draft.draftNumber, source: "Manual", schemaVersion: "fet3d.editor/1", version: draft.version, createdBy: "owner", createdAt: "2026-10-01T00:00:00Z", updatedAt: draft.updatedAt, lastEditedById: "owner", lastEditedByName: draft.lastEditedByName })), totalCount: mock.drafts.length, page: 1, pageSize: 50 } }));
  await page.route(`**/api/scenario-versions/${IDS.version}`, (route) => route.fulfill({ json: { ...summary(), ...versionExtra } }));
  await page.route(`**/api/scenario-versions/${IDS.version}/readiness`, (route) => { mock.readinessCalls += 1; return route.fulfill({ json: readinessOf(mock) }); });
  await page.route(`**/api/scenario-versions/${IDS.version}/review`, (route) => {
    mock.reviewReads += 1;
    if (mock.reviewStatus === "NotSubmitted" || !mock.reviewId) return problem(route, 404, "NOT_FOUND");
    return route.fulfill({ json: { review: { reviewId: mock.reviewId, scenarioVersionId: IDS.version, status: mock.reviewStatus, contentHash: HASH, rubricHash: RUBRIC_HASH, submittedBy: "owner", submittedAt: "2026-10-10T05:00:00Z", decidedBy: mock.reviewStatus === "Submitted" ? null : "admin", decidedAt: mock.reviewStatus === "Submitted" ? null : "2026-10-10T06:00:00Z", reason: mock.rejectReason, versionNumber: 1 }, readiness: { validationRunId: null, outcome: null, blockerCount: 0, confirmationReviewId: mock.confirmed, candidateArtifactId: null, technicalReady: false } } });
  });
  await page.route(`**/api/scenario-drafts/${IDS.draft}`, (route) => {
    const etag = mock.draftEtags.length ? mock.draftEtags.shift() as string : mock.draftEtag;
    return route.fulfill({ json: { id: IDS.draft, scenarioId: IDS.scenario, revisionId: IDS.revision, draftNumber: 2, state: { name: etag === '"12"' ? "Bản cũ" : "Bản mới", rubric: { criteria: [{}, {}] }, learningObjectives: ["a"] }, updatedAt: "2026-10-10T01:00:00Z", version: 12 }, headers: { ETag: etag } });
  });
  await page.route(`**/api/scenario-drafts/${IDS.draft2}`, (route) => route.fulfill({ json: { id: IDS.draft2, scenarioId: IDS.scenario, revisionId: IDS.revision, draftNumber: 3, state: { name: "Bản thứ hai", rubric: { criteria: [{}] }, learningObjectives: [] }, updatedAt: "2026-10-11T01:00:00Z", version: 4 }, headers: { ETag: '"4"' } }));
  await page.route(`**/api/scenario-drafts/${IDS.draft}/validate`, (route) => route.fulfill({ json: { draftId: IDS.draft, version: 12, isValid: false, issues: [{ code: "SPAWN_REQUIRED", path: "$.spawnPoints", message: "At least one spawn point is required." }] } }));
  await page.route(`**/api/scenario-drafts/${IDS.draft}/snapshot`, (route) => {
    const request = route.request();
    mock.snapshotCalls.push({ key: request.headers()["idempotency-key"] ?? null, ifMatch: request.headers()["if-match"] ?? null });
    const status = mock.snapshotResponses[Math.min(mock.snapshotCalls.length - 1, mock.snapshotResponses.length - 1)];
    if (status === 201) return route.fulfill({ status: 201, json: { id: IDS.newVersion } });
    if (status === 0) return route.abort("failed");
    return problem(route, status, status === 412 ? "PRECONDITION_FAILED" : "VALIDATION_ERROR");
  });
  await page.route(`**/api/scenario-versions/${IDS.newVersion}`, (route) => route.fulfill({ json: { ...summary(), ...versionExtra, id: IDS.newVersion, versionNumber: 2, reviewStatus: "NotSubmitted", reviewId: null, rejectReason: null } }));
  await page.route(`**/api/scenario-versions/${IDS.newVersion}/readiness`, (route) => route.fulfill({ json: { ...readinessOf(newMock()), scenarioVersionId: IDS.newVersion } }));
  await page.route(`**/api/revisions/${IDS.revision}/processing-jobs?*`, (route) => route.fulfill({ json: { items: mock.jobList, totalCount: mock.jobList.length, page: 1, pageSize: 100 } }));
  await page.route(`**/api/revisions/${IDS.revision}/validation-runs?*`, (route) => {
    const runs = mock.qa.runs as Array<{ id: string; status: string; artifactId: string | null; createdAt: string; finishedAt: string | null }>;
    return route.fulfill({ json: { items: runs.map((run) => ({ id: run.id, revisionId: IDS.revision, processingJobId: IDS.job, jobKind: "ReleasePackage", processingAttemptId: "att-1", attemptStatus: "Succeeded", artifactId: run.artifactId, scenarioVersionId: IDS.version, scope: "ReleasePackage", validatorVersion: "v1", outcome: run.status, isCurrent: true, startedAt: null, finishedAt: run.finishedAt, createdAt: run.createdAt })), totalCount: runs.length, page: 1, pageSize: 20 } });
  });
  await page.route(`**/api/scenario-versions/${IDS.version}/package-builds`, (route) => {
    const request = route.request();
    mock.buildCalls.push({ key: request.headers()["idempotency-key"] ?? null, body: request.postDataJSON() });
    const status = mock.buildResponses[Math.min(mock.buildCalls.length - 1, mock.buildResponses.length - 1)];
    if (status === 202) {
      mock.jobList = [job("Queued")];
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
    return route.fulfill({ json: { job: job(status, jobId), inputHash: "c".repeat(64), currentAttemptId: "att-1", currentAttempt: { id: "att-1", attemptNumber: 1, status, toolchainVersion: "tc-1", startedAt: "2026-10-10T02:01:00Z", finishedAt: status === "Succeeded" || status === "Failed" ? "2026-10-10T02:05:00Z" : null, outputHash: null } } });
  });
  await page.route("**/api/processing-jobs/*/retry", (route) => {
    const body = route.request().postDataJSON() as { requestId: string };
    mock.retryCalls.push({ requestId: body.requestId });
    const status = mock.retryResponses[Math.min(mock.retryCalls.length - 1, mock.retryResponses.length - 1)];
    if (status === 202) { mock.jobSequence = ["Queued"]; mock.jobPolls = 0; return route.fulfill({ status: 202, json: { jobId: IDS.retryJob, outcome: "Requeued" } }); }
    return route.abort("failed");
  });
  await page.route(`**/api/revisions/${IDS.revision}/issues?*`, (route) => route.fulfill({ json: { items: mock.qa.issues, totalCount: mock.qa.issues.length, page: 1, pageSize: 100 } }));
  await page.route(`**/api/revisions/${IDS.revision}/confirm-for-training`, (route) => { mock.confirmBody = route.request().postDataJSON(); mock.confirmed = IDS.confirm; return route.fulfill({ json: { reviewId: IDS.confirm } }); });
  await page.route(`**/api/scenario-versions/${IDS.version}/submit`, (route) => {
    mock.submitCalls.push({ key: route.request().headers()["idempotency-key"] ?? null });
    mock.reviewStatus = "Submitted";
    mock.reviewId = IDS.review;
    return route.fulfill({ status: 201, json: { code: "OK", reviewId: IDS.review, status: "Submitted", contentHash: HASH, rubricHash: RUBRIC_HASH } });
  });
  await page.route(/\/api\/releases(\?.*)?$/, (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      mock.releaseCalls.push({ key: request.headers()["idempotency-key"] ?? null, body: request.postDataJSON() });
      mock.release = { status: "Built" };
      return route.fulfill({ status: 201, json: releaseBody("Built") });
    }
    const items = mock.release ? [{ id: IDS.release, buildingId: "building-1", scenarioId: IDS.scenario, scenarioVersionId: IDS.version, versionNumber: 1, scenarioName: "Kịch bản tầng 3", status: mock.release.status, createdAt: "2026-10-10T03:00:00Z", publishedAt: mock.release.status === "Published" ? "2026-10-10T04:00:00Z" : null, revokedAt: null }] : [];
    return route.fulfill({ json: { items, totalCount: items.length, page: 1, pageSize: 100 } });
  });
  await page.route(`**/api/releases/${IDS.release}`, (route) => mock.release ? route.fulfill({ json: releaseBody(mock.release.status) }) : problem(route, 404, "NOT_FOUND"));
  await page.route(`**/api/releases/${IDS.release}/publish`, (route) => {
    mock.publishCalls.push({ key: route.request().headers()["idempotency-key"] ?? null });
    const status = mock.publishResponses[Math.min(mock.publishCalls.length - 1, mock.publishResponses.length - 1)];
    if (status === 200) {
      mock.release = { status: "Published" };
      return route.fulfill({ json: releaseBody("Published") });
    }
    return problem(route, status, status === 503 ? "PUBLISH_GATE_UNAVAILABLE" : "BUILDING_ENTITLEMENT_REQUIRED");
  });
  await page.route("**/api/buildings/building-1/trainings", (route) => route.fulfill({ json: [] }));
}

const passedRun = { id: IDS.run, revisionId: IDS.revision, processingJobId: IDS.job, processingAttemptId: "att-1", artifactId: IDS.artifact, scenarioVersionId: IDS.version, scope: "ReleasePackage", validatorVersion: "v1", status: "Passed", outcome: "Passed", summary: {}, startedAt: null, finishedAt: "2026-10-10T02:05:00Z", createdAt: "2026-10-10T02:05:00Z" };

test.describe("snapshot", () => {
  test("keeps Idempotency-Key and If-Match when a lost response is retried", async ({ page }) => {
    const mock = newMock({ snapshotResponses: [0, 201] });
    await setup(page, mock);
    await page.goto(`${base}?draft=${IDS.draft}`);
    await expect(page.getByRole("heading", { name: "Phiên bản và phát hành" })).toBeVisible();
    await page.getByRole("button", { name: "Tạo phiên bản mới từ draft" }).first().click();
    await expect(page.getByLabel("Bản nháp")).toHaveValue(IDS.draft);
    // The draft loads on its own: no extra "Tải draft" click before "Tạo snapshot" is usable.
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

  test("drafts come from the server: with no ?draft= the scenario's current draft is preselected and others are listed", async ({ page }) => {
    const mock = newMock({
      drafts: [
        { id: IDS.draft2, draftNumber: 3, version: 4, updatedAt: "2026-10-11T01:00:00Z", lastEditedByName: "Trần Thị B" },
        { id: IDS.draft, draftNumber: 2, version: 12, updatedAt: "2026-10-10T01:00:00Z", lastEditedByName: "Nguyễn Văn A" },
      ],
      currentDraftId: IDS.draft2,
    });
    await setup(page, mock);
    await page.goto(base);
    await page.getByRole("button", { name: "Tạo phiên bản mới từ draft" }).first().click();
    await expect(page.getByLabel("Bản nháp")).toHaveValue(IDS.draft2);
    await expect(page.getByLabel("Bản nháp").getByRole("option")).toHaveCount(2);
    await expect(page.getByLabel("Bản nháp").getByRole("option").first()).toContainText("hiện tại");
    await expect(page.getByLabel("Tóm tắt draft đang xem")).toContainText('"4"');
    await page.getByLabel("Bản nháp").selectOption(IDS.draft);
    // Picking another draft loads that one (the summary never shows the previous draft's ETag for it).
    await expect(page.getByLabel("Tóm tắt draft đang xem")).toContainText('"12"');
  });

  test("a scenario without drafts points to the editor instead of asking for an id", async ({ page }) => {
    const mock = newMock({ drafts: [], currentDraftId: null });
    await setup(page, mock);
    await page.goto(base);
    await page.getByRole("button", { name: "Tạo phiên bản mới từ draft" }).first().click();
    await expect(page.getByText("Kịch bản này chưa có draft")).toBeVisible();
    await expect(page.getByRole("link", { name: "Mở trình soạn để tạo draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tải draft" })).toBeDisabled();
    // A disabled snapshot button says why.
    await expect(page.getByRole("button", { name: "Tạo snapshot", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Chưa có draft để tạo snapshot." })).toBeVisible();
  });

  test("412 keeps the draft the user was viewing and offers the newer one for comparison", async ({ page }) => {
    const mock = newMock({ snapshotResponses: [412], draftEtags: ['"12"', '"13"'] });
    await setup(page, mock);
    await page.goto(`${base}?draft=${IDS.draft}`);
    await page.getByRole("button", { name: "Tạo phiên bản mới từ draft" }).first().click();
    await expect(page.getByLabel("Tóm tắt draft đang xem")).toContainText('"12"');
    await page.getByRole("button", { name: "Tạo snapshot", exact: true }).click();
    await expect(page.getByText("Draft đã thay đổi từ lần bạn tải")).toBeVisible();
    await expect(page.getByLabel("Tóm tắt draft đang xem")).toContainText('"12"');
    await page.getByRole("button", { name: "Tải bản mới để đối chiếu" }).click();
    await expect(page.getByLabel("Bản mới")).toContainText('"13"');
    await expect(page.getByLabel("Bản cũ")).toContainText('"12"');
    await expect(page.getByRole("button", { name: "Tạo snapshot", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Chọn bản draft để dùng ở phần đối chiếu trước." })).toBeVisible();
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
    // The platform is a select with Android only and preselected (the BE serves no other target by default).
    await expect(page.getByLabel("Nền tảng dựng")).toHaveValue("Android");
    await expect(page.getByLabel("Nền tảng dựng").getByRole("option")).toHaveCount(1);
    await page.getByRole("button", { name: "Chạy package build" }).click();
    await expect(page.getByText("Đã xếp hàng package build")).toBeVisible();
    expect(mock.buildCalls[0].body).toEqual({ kind: "ReleasePackage", buildTarget: "Android" });
    await expect(page.getByText("Đang chờ kết quả")).toBeVisible();
    await expect(page.locator("[data-gate=technical]")).toContainText("Đang xử lý");
    await expect(page.getByText("Job Succeeded chưa phải QA Passed", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-gate=technical]")).toContainText("Job xong, chưa có QA");
    await page.getByRole("tab", { name: "Kết quả kỹ thuật" }).click();
    await expect(page).toHaveURL(/tab=readiness/);
    await expect(page.getByText("QA Passed", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Xác nhận kỹ thuật" })).toBeDisabled();
    await expect(page.getByTestId("readiness-missing")).toContainText("PACKAGE_VALIDATION_REQUIRED");
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
    const mock = newMock({ jobSequence: ["Failed"], retryResponses: [0, 202], jobList: [job("Failed")] });
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
      jobList: [job()],
      qa: { runs: [{ ...passedRun, status: "Failed", outcome: "Failed" }], issues: [{ id: "i1", revisionId: IDS.revision, validationRunId: IDS.run, processingAttemptId: "att-1", artifactId: null, issueCode: "RUNTIME_CAPABILITY_MISSING", severity: "Error", status: "Open", message: "Thiết bị chưa hỗ trợ.", isCurrentAttempt: true, createdAt: "2026-10-10T02:05:00Z" }] },
    });
    await setup(page, mock);
    await page.goto(`${base}?tab=readiness`);
    await expect(page.getByText("QA Failed", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("RUNTIME_CAPABILITY_MISSING").first()).toBeVisible();
    await expect(page.locator("[data-gate=technical]")).toContainText("QA không đạt");
    await expect(page.getByRole("button", { name: "Xác nhận kỹ thuật" })).toBeDisabled();
    await expect(page.getByTestId("readiness-missing")).toContainText("QA_NOT_PASSED");
  });

  test("QA Passed confirms exactly the version and validation run; the confirmation comes back from the server after a reload", async ({ page }) => {
    const mock = newMock({ jobList: [job()], qa: { runs: [passedRun], issues: [] } });
    await setup(page, mock);
    await page.goto(`${base}?tab=readiness`);
    await expect(page.getByText("QA Passed", { exact: true }).first()).toBeVisible();
    await expect(page.locator("[data-gate=approval]")).toContainText("Chưa gửi duyệt");
    await expect(page.getByTestId("readiness-missing")).toContainText("CONFIRMATION_REQUIRED");
    await page.getByRole("tabpanel", { name: "Kết quả kỹ thuật" }).getByRole("button", { name: "Xác nhận kỹ thuật" }).click();
    await expect(page.getByTestId("confirm-review-id")).toHaveText(IDS.confirm);
    expect(mock.confirmBody).toEqual({ scenarioVersionId: IDS.version, validationRunId: IDS.run });
    await expect(page.locator("[data-gate=technical]")).toContainText("Đã xác nhận kỹ thuật");
    await expect(page.locator("[data-gate=approval]")).toContainText("Chưa gửi duyệt");
    await expect(page.getByRole("button", { name: "Đã xác nhận" })).toBeDisabled();
    // The QA history is the server's list, not a browser memory.
    await expect(page.getByRole("table", { name: "Lịch sử validation run" })).toContainText("ReleasePackage");

    await page.reload();
    await expect(page.getByTestId("confirm-review-id")).toHaveText(IDS.confirm);
    await expect(page.locator("[data-gate=technical]")).toContainText("Đã xác nhận kỹ thuật");
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("version-memory")))).toEqual([]);
  });
});

test.describe("review and release", () => {
  test("submit freezes hashes; the state and hashes are read back from the server and survive a reload", async ({ page }) => {
    const mock = newMock();
    await setup(page, mock);
    await page.goto(`${base}?tab=review`);
    await expect(page.getByText("version mới", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("phải được duyệt lại")).toBeVisible();
    await expect(page.locator("[data-gate=approval]")).toContainText("Chưa gửi duyệt");
    await page.getByRole("button", { name: "Gửi duyệt", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Gửi duyệt", exact: true }).click();
    await expect(page.getByTestId("review-id")).toHaveText(IDS.review);
    await expect(page.getByTestId("review-status")).toHaveText("Submitted");
    expect(mock.submitCalls).toHaveLength(1);
    expect(mock.submitCalls[0].key).toBeTruthy();
    await expect(page.locator("[data-gate=approval]")).toContainText("Đã gửi, chờ duyệt");
    await expect(page.getByText("Đã duyệt", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Gửi duyệt", exact: true })).toBeDisabled();

    await page.reload();
    await expect(page.getByTestId("review-id")).toHaveText(IDS.review);
    await expect(page.locator("[data-gate=approval]")).toContainText("Đã gửi, chờ duyệt");
    await expect(page.getByRole("button", { name: "Gửi duyệt", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("version-memory")))).toEqual([]);
  });

  test("a rejection and its reason are shown after reload; the version list carries the review badge", async ({ page }) => {
    const mock = newMock({ reviewStatus: "Rejected", reviewId: IDS.review, rejectReason: "Rubric thiếu tiêu chí thời gian" });
    await setup(page, mock);
    await page.goto(`${base}?tab=review`);
    await expect(page.locator("[data-gate=approval]")).toContainText("Bị từ chối");
    await expect(page.locator("[data-gate=approval]")).toContainText("Rubric thiếu tiêu chí thời gian");
    await expect(page.getByTestId("review-reason")).toHaveText("Rubric thiếu tiêu chí thời gian");
    await expect(page.getByLabel("Lịch sử phiên bản").getByText("Bị từ chối")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gửi duyệt", exact: true })).toBeDisabled();
  });

  test("Built is not Published: the release is created from server readiness, a blocked publish keeps it Built and a retry reuses the key", async ({ page }) => {
    const mock = newMock({ jobList: [job()], qa: { runs: [passedRun], issues: [] }, confirmed: IDS.confirm, reviewStatus: "Approved", reviewId: IDS.review, publishResponses: [503, 200] });
    await setup(page, mock);
    await page.goto(`${base}?tab=release`);
    await expect(page.getByTestId("release-confirmation")).toHaveText(IDS.confirm);
    await expect(page.getByTestId("release-artifact")).toHaveText(IDS.artifact);
    await page.getByRole("button", { name: "Tạo release (Built)" }).click();
    await expect(page.getByTestId("release-status")).toHaveText("Built");
    expect(mock.releaseCalls[0].body).toEqual({ revisionId: IDS.revision, scenarioVersionId: IDS.version, confirmationReviewId: IDS.confirm, candidateArtifactId: IDS.artifact });
    expect(mock.releaseCalls[0].key).toBeTruthy();
    await expect(page.locator("[data-gate=release]")).toContainText("Built, chưa phát hành");
    await expect(page.getByTestId("release-entitlement")).toContainText("đã thanh toán");

    // Survives a reload: the release is found again from the server list, not from the browser.
    await page.reload();
    await expect(page.getByTestId("release-status")).toHaveText("Built");

    await page.getByRole("button", { name: "Phát hành", exact: true }).click();
    await expect(page.getByText("Cổng phát hành chưa được bật ở môi trường này").first()).toBeVisible();
    await expect(page.getByTestId("release-status")).toHaveText("Built");
    await expect(page.getByText("Published", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Thử lại phát hành (cùng khóa)" }).click();
    await expect(page.getByTestId("release-status")).toHaveText("Published");
    await expect(page.locator("[data-gate=release]")).toContainText("Published");
    expect(mock.publishCalls).toHaveLength(2);
    expect(mock.publishCalls[0].key).toBeTruthy();
    expect(mock.publishCalls[1].key).toBe(mock.publishCalls[0].key);
  });

  test("publish refused by the entitlement gate (409) leaves the release Built with the specific reason", async ({ page }) => {
    const mock = newMock({ jobList: [job()], qa: { runs: [passedRun], issues: [] }, confirmed: IDS.confirm, reviewStatus: "Approved", reviewId: IDS.review, release: { status: "Built" }, publishResponses: [409] });
    await setup(page, mock);
    await page.goto(`${base}?tab=release`);
    await expect(page.getByTestId("release-status")).toHaveText("Built");
    await page.getByRole("button", { name: "Phát hành", exact: true }).click();
    await expect(page.getByText("Công trình chưa có dịch vụ trả phí còn hiệu lực")).toBeVisible();
    await expect(page.getByTestId("release-status")).toHaveText("Built");
  });

  test("without confirmation or QA the release tab lists what is missing and cannot build", async ({ page }) => {
    const mock = newMock();
    await setup(page, mock);
    await page.goto(`${base}?tab=release`);
    await expect(page.getByTestId("release-confirmation")).toContainText("Chưa có");
    await expect(page.getByTestId("release-missing")).toContainText("PACKAGE_VALIDATION_REQUIRED");
    await expect(page.getByRole("button", { name: "Tạo release (Built)" })).toBeDisabled();
    expect(mock.releaseCalls).toHaveLength(0);
  });

  test("a release created on another machine is found from the server on a fresh load", async ({ page }) => {
    const mock = newMock({ jobList: [job()], qa: { runs: [passedRun], issues: [] }, confirmed: IDS.confirm, reviewStatus: "Approved", reviewId: IDS.review, release: { status: "Published" } });
    await setup(page, mock);
    await page.goto(`${base}?tab=release`);
    await expect(page.getByTestId("release-id")).toHaveText(IDS.release);
    await expect(page.getByTestId("release-status")).toHaveText("Published");
    await expect(page.locator("[data-gate=release]")).toContainText("Published");
    await expect(page.locator("[data-gate=approval]")).toContainText("Đã duyệt");
    await expect(page.locator("[data-gate=technical]")).toContainText("Đã xác nhận kỹ thuật");
    await expect(page.getByRole("button", { name: "Phát hành", exact: true })).toHaveCount(0);
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

  test("a failed readiness read says so instead of showing an invented state", async ({ page }) => {
    await setup(page, newMock());
    await page.route(`**/api/scenario-versions/${IDS.version}/readiness`, (route) => route.fulfill({ status: 500 }));
    await page.goto(`${base}?tab=readiness`);
    await expect(page.getByRole("alert").filter({ hasText: "Không đọc được readiness từ máy chủ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thử lại" }).first()).toBeVisible();
  });
});

for (const theme of ["dark", "light"] as const) {
  for (const width of [1440, 375]) {
    test(`layout has no horizontal overflow at ${width}px in ${theme} theme`, async ({ page }, testInfo) => {
      const mock = newMock({ jobList: [job()], qa: { runs: [passedRun], issues: [] }, confirmed: IDS.confirm, reviewStatus: "Approved", reviewId: IDS.review, release: { status: "Built" } });
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
