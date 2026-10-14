/**
 * Evidence level: Playwright route MOCKS of the BE contract at main @ 1eaf988 (PlaytestsController, POST /api/scenarios/{id}/playtests,
 * ScenariosController readiness/versions, ReleasesController list, processing jobs). The mock keeps the state a real server keeps
 * (playtest status, open handoff, idempotency replay) so reload proves recovery from the server. Not integration evidence:
 * Mobile redeem/start/launch and Unity are NOT exercised here, and the mock treats any request to those endpoints as a failure.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

import { acceptStatus } from "../../src/features/playtest/status";
import type { PlaytestStatus } from "../../src/features/playtest/types";

const IDS = {
  scenario: "11111111-1111-4111-8111-111111111111",
  version: "22222222-2222-4222-8222-222222222222",
  version2: "22222222-2222-4222-8222-222222222223",
  revision: "33333333-3333-4333-8333-333333333333",
  job: "66666666-6666-4666-8666-666666666666",
  run: "77777777-7777-4777-8777-777777777777",
  artifact: "88888888-8888-4888-8888-888888888888",
  playtest: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  playtest2: "dddddddd-dddd-4ddd-8ddd-ddddddddddde",
  release: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
const HASH = "a".repeat(64);
const base = `/workspace/buildings/building-1/scenarios/${IDS.scenario}/versions`;
const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "owner", role: 1, organizationId: "org-1", profileRevision: 1 };

type Reply = number | { status: number; code: string; retryAfter?: string };

type PlaytestRow = {
  id: string;
  status: string;
  boundToMobile: boolean;
  openHandoffExpiresAt: string | null;
  completion: unknown;
  canCancel: boolean;
  versionId: string;
};

type Mock = {
  prepareReplies: Reply[];
  handoffReplies: Reply[];
  cancelReplies: Reply[];
  /** Status the n-th GET reports (the server advances the lifecycle); last repeats. Empty keeps the stored status. */
  progress: string[];
  progressIndex: number;
  /** Delay (ms) before the n-th GET answers with the state captured when it arrived. */
  getDelays: number[];
  getFails: Reply | null;
  handoffTtlMs: number;
  // recorded
  prepareCalls: Array<{ key: string | null; body: unknown; query: string }>;
  handoffCalls: Array<{ key: string | null }>;
  cancelCalls: Array<{ key: string | null }>;
  getCalls: number;
  forbidden: string[];
  // server state
  playtest: PlaytestRow | null;
  handoffsByKey: Map<string, { code: string; expiresAt: string }>;
  codeCount: number;
  // version side
  jobs: Array<{ id: string; status: string; kind: string }>;
  qa: "passed" | "failed" | "none";
  versions: boolean;
  draftCount: number | undefined;
  reviewStatus: string | undefined;
  readiness: "error" | { packageJob: { jobId: string; status: string; currentAttemptId: string } | null; outcome: string | null; blockerCount: number; confirmationReviewId: string | null; technicalReady: boolean; missing: string[] };
  release: null | "Built" | "Published" | "Revoked" | "error";
  role: number;
};

function newMock(patch: Partial<Mock> = {}): Mock {
  return {
    prepareReplies: [201], handoffReplies: [201], cancelReplies: [200], progress: [], progressIndex: 0, getDelays: [], getFails: null, handoffTtlMs: 5 * 60_000,
    prepareCalls: [], handoffCalls: [], cancelCalls: [], getCalls: 0, forbidden: [],
    playtest: null, handoffsByKey: new Map(), codeCount: 0,
    jobs: [{ id: IDS.job, status: "Succeeded", kind: "PlaytestPackage" }], qa: "passed",
    versions: true, draftCount: 1, reviewStatus: "NotSubmitted",
    readiness: { packageJob: { jobId: IDS.job, status: "Succeeded", currentAttemptId: "att-1" }, outcome: "Passed", blockerCount: 0, confirmationReviewId: null, technicalReady: false, missing: ["CONFIRMATION_REQUIRED"] },
    release: null, role: 1,
    ...patch,
  };
}

const problem = (route: Route, status: number, code: string, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: "application/problem+json", headers, json: { title: code, status, code } });

function reply(replies: Reply[], count: number): Reply {
  return replies[Math.min(count - 1, replies.length - 1)];
}

function statusBody(row: PlaytestRow) {
  const started = ["Launching", "Running", "Completed"].includes(row.status) || (row.status === "Cancelled" && false);
  const launched = ["Running", "Completed"].includes(row.status);
  const ended = ["Completed", "Cancelled"].includes(row.status);
  return {
    id: row.id, buildingId: "building-1", revisionId: IDS.revision, scenarioVersionId: row.versionId, status: row.status, createdAt: "2026-10-12T01:00:00Z",
    startedAt: started ? "2026-10-12T01:05:00Z" : null, endedAt: ended ? "2026-10-12T01:20:00Z" : null, runtimeVersion: started ? "1.0.0" : null,
    package: { artifactId: IDS.artifact, manifestArtifactId: "99999999-9999-4999-8999-999999999999", validationRunId: IDS.run, packageHash: "c".repeat(64), manifestHash: "d".repeat(64), buildTarget: "Android", protocolVersion: "1", manifestSchemaVersion: "1" },
    grant: started ? { generation: 1, issuedAt: "2026-10-12T01:05:00Z", expiresAt: "2026-10-12T01:10:00Z" } : null,
    launchedAt: launched ? "2026-10-12T01:06:00Z" : null, lastHeartbeatAt: launched ? "2026-10-12T01:07:00Z" : null, acknowledgedSequence: launched ? 12 : 0,
    boundToMobile: row.boundToMobile, launchSession: true, openHandoffExpiresAt: row.openHandoffExpiresAt,
    recovery: { canStart: false, canReissueGrant: false, canSync: false, canCancel: row.canCancel && !ended },
    completion: row.status === "Completed" ? row.completion : null,
  };
}

function newRow(patch: Partial<PlaytestRow> = {}): PlaytestRow {
  return { id: IDS.playtest, status: "Created", boundToMobile: false, openHandoffExpiresAt: null, completion: null, canCancel: true, versionId: IDS.version, ...patch };
}

const versionSummary = (mock: Mock, id = IDS.version, number = 1) => ({
  id, scenarioId: IDS.scenario, revisionId: IDS.revision, buildingId: "building-1", organizationId: "org-1", versionNumber: number, name: "Sơ tán tầng 3", schemaVersion: "7", algorithmVersion: "1", timeLimitSeconds: 300,
  scenarioHash: HASH, createdAt: "2026-10-09T08:00:00Z", ...(mock.reviewStatus ? { reviewStatus: mock.reviewStatus, reviewId: null, rejectReason: null } : {}),
});
const versionExtra = {
  randomSeed: 7, replanIntervalSeconds: 5,
  configuration: { spawn: [], goal: [], fireSource: [], npc: [], blockedElements: [], routing: {}, scoring: {}, modePolicy: {}, safetyThresholds: {} },
  stateSnapshot: null, rubric: null, learningObjectives: [], learnerInstructions: null,
};

const jobRow = (job: { id: string; status: string; kind: string }) => ({ id: job.id, revisionId: IDS.revision, sourceDocumentId: "src", scenarioVersionId: IDS.version, kind: job.kind, status: job.status, createdAt: "2026-10-10T02:00:00Z" });

async function setup(page: Page, mock: Mock) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "pt-access", refreshToken: "pt-refresh" })));
  await page.route("**/api/**", (route) => problem(route, 404, "NOT_FOUND")); // anything unmocked fails loudly instead of reaching Next
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...owner, role: mock.role }, headers: { ETag: '"1"' } }));
  await page.route(`**/api/scenarios/${IDS.scenario}`, (route) => route.fulfill({ json: { id: IDS.scenario, buildingId: "building-1", organizationId: "org-1", name: "Kịch bản tầng 3", createdAt: "2026-10-01T00:00:00Z", ...(mock.draftCount === undefined ? {} : { currentDraftId: mock.draftCount ? "44444444-4444-4444-8444-444444444444" : null, currentDraftVersion: 12, draftCount: mock.draftCount }) } }));
  await page.route(`**/api/scenarios/${IDS.scenario}/versions?*`, (route) => route.fulfill({ json: { items: mock.versions ? [versionSummary(mock)] : [], totalCount: mock.versions ? 1 : 0, page: 1, pageSize: 20 } }));
  await page.route(`**/api/scenario-versions/${IDS.version}`, (route) => route.fulfill({ json: { ...versionSummary(mock), ...versionExtra } }));
  await page.route(`**/api/scenario-versions/${IDS.version}/readiness`, (route) => {
    if (mock.readiness === "error") return problem(route, 500, "INTERNAL_ERROR");
    return route.fulfill({ json: { scenarioVersionId: IDS.version, revisionId: IDS.revision, scenarioHash: HASH, reviewStatus: mock.reviewStatus ?? "NotSubmitted", validationRunId: mock.readiness.outcome ? IDS.run : null, blockers: [], candidateArtifactId: null, ...mock.readiness } });
  });
  await page.route(`**/api/scenario-versions/${IDS.version}/review`, (route) => problem(route, 404, "NOT_FOUND"));
  await page.route(/\/api\/releases(\?.*)?$/, (route) => {
    if (mock.release === "error") return problem(route, 500, "INTERNAL_ERROR");
    const items = mock.release ? [{ id: IDS.release, buildingId: "building-1", scenarioId: IDS.scenario, scenarioVersionId: IDS.version, versionNumber: 1, scenarioName: "Kịch bản tầng 3", status: mock.release, createdAt: "2026-10-10T03:00:00Z", publishedAt: null, revokedAt: null }] : [];
    return route.fulfill({ json: { items, totalCount: items.length, page: 1, pageSize: 100 } });
  });
  await page.route(`**/api/releases/${IDS.release}`, (route) => problem(route, 404, "NOT_FOUND"));
  await page.route(`**/api/revisions/${IDS.revision}/processing-jobs?*`, (route) => route.fulfill({ json: { items: mock.jobs.map(jobRow), totalCount: mock.jobs.length, page: 1, pageSize: 100 } }));
  await page.route("**/api/processing-jobs/**", (route) => {
    const url = route.request().url();
    const id = url.split("/processing-jobs/")[1].split(/[/?]/)[0];
    const job = mock.jobs.find((item) => item.id === id) ?? mock.jobs[0] ?? { id, status: "Succeeded", kind: "ReleasePackage" };
    if (url.includes("/qa")) {
      const runs = mock.qa === "none" ? [] : [{ id: IDS.run, revisionId: IDS.revision, processingJobId: id, processingAttemptId: "att-1", artifactId: IDS.artifact, scenarioVersionId: IDS.version, scope: "PlaytestPackage", validatorVersion: "v1", status: mock.qa === "passed" ? "Passed" : "Failed", summary: {}, startedAt: null, finishedAt: "2026-10-10T02:05:00Z", createdAt: "2026-10-10T02:05:00Z" }];
      return route.fulfill({ json: { jobId: id, currentAttemptId: "att-1", validationRuns: { items: runs, totalCount: runs.length, page: 1, pageSize: 20 } } });
    }
    return route.fulfill({ json: { job: jobRow({ ...job, id }), inputHash: "e".repeat(64), currentAttemptId: "att-1", currentAttempt: { id: "att-1", attemptNumber: 1, status: job.status, toolchainVersion: "tc-1", startedAt: "2026-10-10T02:01:00Z", finishedAt: null, outputHash: null } } });
  });
  await page.route(`**/api/revisions/${IDS.revision}/issues?*`, (route) => route.fulfill({ json: { items: mock.qa === "failed" ? [{ id: "iss-1", revisionId: IDS.revision, validationRunId: IDS.run, processingAttemptId: "att-1", artifactId: null, issueCode: "X", severity: "Error", status: "Open", message: "x", isCurrentAttempt: true, createdAt: "2026-10-10T02:05:00Z" }] : [], totalCount: 0, page: 1, pageSize: 100 } }));

  await page.route(`**/api/scenarios/${IDS.scenario}/playtests*`, async (route) => {
    const request = route.request();
    const count = mock.prepareCalls.push({ key: request.headers()["idempotency-key"] ?? null, body: request.postDataJSON(), query: new URL(request.url()).search });
    const next = reply(mock.prepareReplies, count);
    if (next === 0) return route.abort("failed");
    if (typeof next === "object") return problem(route, next.status, next.code, next.retryAfter ? { "Retry-After": next.retryAfter } : {});
    mock.playtest = newRow();
    return route.fulfill({ status: 201, json: { id: IDS.playtest, scenarioVersionId: IDS.version, artifactId: IDS.artifact, validationRunId: IDS.run, packageHash: "c".repeat(64), manifestHash: "d".repeat(64), buildTarget: "Android" } });
  });

  await page.route("**/api/playtests/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/playtests\//, "");
    // Everything below belongs to the Mobile/Unity session. The Web must never reach it.
    if (/^handoffs\/redeem$|\/(start|launch-grants|launched|heartbeat|events:batch|complete)$/.test(path)) {
      mock.forbidden.push(`${request.method()} ${path}`);
      return problem(route, 500, "WEB_MUST_NOT_CALL");
    }
    const [id, action] = path.split("/");
    if (!mock.playtest || mock.playtest.id !== id) return problem(route, 404, "NOT_FOUND");
    const row = mock.playtest;

    if (!action && request.method() === "GET") {
      mock.getCalls += 1;
      if (mock.getFails !== null) {
        const fail = mock.getFails;
        if (typeof fail === "number") return route.abort("failed");
        return problem(route, fail.status, fail.code, fail.retryAfter ? { "Retry-After": fail.retryAfter } : {});
      }
      if (mock.progress.length) { row.status = mock.progress[Math.min(mock.progressIndex, mock.progress.length - 1)]; mock.progressIndex += 1; }
      if (row.status === "Completed") row.completion = row.completion ?? { result: "Passed", durationSeconds: 42, detail: { exits: 2 } };
      const body = statusBody(row);
      const delay = mock.getDelays[mock.getCalls - 1] ?? 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      return route.fulfill({ json: body });
    }
    if (action === "handoffs") {
      const key = request.headers()["idempotency-key"] ?? null;
      const count = mock.handoffCalls.push({ key });
      const next = reply(mock.handoffReplies, count);
      if (next === 0) return route.abort("failed");
      if (typeof next === "object") return problem(route, next.status, next.code, next.retryAfter ? { "Retry-After": next.retryAfter } : {});
      let handoff = key ? mock.handoffsByKey.get(key) : undefined;
      if (!handoff) {
        mock.codeCount += 1;
        handoff = { code: `Hf${String(mock.codeCount).padStart(2, "0")}`.padEnd(43, "x"), expiresAt: new Date(Date.now() + mock.handoffTtlMs).toISOString() };
        if (key) mock.handoffsByKey.set(key, handoff);
        row.openHandoffExpiresAt = handoff.expiresAt;
      }
      return route.fulfill({ status: 201, json: { handoffId: "ffffffff-ffff-4fff-8fff-ffffffffffff", playtestId: id, code: handoff.code, deepLink: `fet3d://playtest/handoff?code=${handoff.code}`, expiresAt: handoff.expiresAt } });
    }
    if (action === "cancel") {
      const count = mock.cancelCalls.push({ key: request.headers()["idempotency-key"] ?? null });
      const next = reply(mock.cancelReplies, count);
      if (next === 0) { row.status = "Cancelled"; return route.abort("failed"); } // server executed, response lost
      if (typeof next === "object") return problem(route, next.status, next.code);
      row.status = "Cancelled";
      row.openHandoffExpiresAt = null;
      return route.fulfill({ json: statusBody(row) });
    }
    return problem(route, 404, "NOT_FOUND");
  });
}

async function openTab(page: Page, query = "") {
  await page.goto(`${base}?tab=playtest${query}`);
  await expect(page.getByRole("heading", { name: "Playtest trên Mobile" })).toBeVisible();
}

const create = (page: Page) => page.getByTestId("playtest-create");
const statusBox = (page: Page) => page.getByTestId("playtest-status");

test.describe("prepare and follow", () => {
  test("a lost response is retried with the same Idempotency-Key; a new playtest later gets a new key", async ({ page }) => {
    const mock = newMock({ prepareReplies: [0, 201, 201] });
    await setup(page, mock);
    await openTab(page);
    await expect(create(page)).toBeEnabled();
    await create(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Không kết nối được máy chủ" })).toBeVisible();
    await create(page).click();
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    await expect(page).toHaveURL(new RegExp(`playtest=${IDS.playtest}`));
    expect(mock.prepareCalls).toHaveLength(2);
    expect(mock.prepareCalls[1].key).toBe(mock.prepareCalls[0].key);
    expect(mock.prepareCalls[0].body).toEqual({ revisionId: IDS.revision, scenarioVersionId: IDS.version });
    expect(mock.prepareCalls[0].query).toContain("buildingId=building-1");
    expect(mock.prepareCalls[0].key).toBeTruthy();

    // Cancel, then a new playtest is a new intent with a new key.
    await page.getByRole("button", { name: "Hủy playtest" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Hủy playtest" }).click();
    await expect(statusBox(page)).toContainText("Đã hủy");
    await page.getByRole("button", { name: "Tạo playtest mới" }).click();
    await expect(create(page)).toBeVisible();
    await create(page).click();
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    expect(mock.prepareCalls).toHaveLength(3);
    expect(mock.prepareCalls[2].key).not.toBe(mock.prepareCalls[0].key);
    expect(mock.forbidden).toEqual([]);
  });

  test("the QR encodes exactly the opaque deep link BE returned; a lost response replays the same code", async ({ page }) => {
    const mock = newMock({ playtest: newRow(), handoffReplies: [0, 201] });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    await expect(page.getByTestId("qr-code")).toHaveCount(0);
    await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Không kết nối được máy chủ" })).toBeVisible();
    await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
    const qr = page.getByTestId("qr-code");
    await expect(qr).toBeVisible();
    expect(mock.handoffCalls).toHaveLength(2);
    expect(mock.handoffCalls[1].key).toBe(mock.handoffCalls[0].key);
    const code = `Hf01`.padEnd(43, "x");
    const deepLink = `fet3d://playtest/handoff?code=${code}`;
    await expect(page.getByTestId("handoff-code")).toHaveText(code);
    await expect(qr).toHaveAttribute("data-qr-value-length", String(deepLink.length));
    expect(deepLink.length).not.toBe(code.length);
    await expect(page.getByTestId("handoff-countdown")).toContainText(/[0-4]:\d\d/);
    // The page never carries a credential: nothing in the DOM looks like a token and the deep link is text, not an anchor.
    await expect(page.locator("a[href^='fet3d:']")).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toContain("pt-access");
    expect(mock.forbidden).toEqual([]);
  });

  test("an expired code is replaced by a new one under a new key", async ({ page }) => {
    const mock = newMock({ playtest: newRow(), handoffTtlMs: 2500 });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
    await expect(page.getByTestId("qr-code")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Mã đã hết hạn" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("qr-code")).toHaveCount(0);
    await page.getByRole("button", { name: "Cấp lại mã" }).click();
    await expect(page.getByTestId("qr-code")).toBeVisible();
    expect(mock.handoffCalls).toHaveLength(2);
    expect(mock.handoffCalls[1].key).not.toBe(mock.handoffCalls[0].key);
    await expect(page.getByTestId("handoff-code")).toHaveText("Hf02".padEnd(43, "x"));
    expect(mock.forbidden).toEqual([]);
  });

  test("polls the lifecycle to the final state, shows the result and stops polling", async ({ page }) => {
    const mock = newMock({ playtest: newRow(), progress: ["Created", "Launching", "Running", "Completed"] });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    await expect(statusBox(page)).toContainText("Đang khởi chạy", { timeout: 10_000 });
    await expect(statusBox(page)).toContainText("Đang chạy trên thiết bị", { timeout: 10_000 });
    await expect(page.getByTestId("playtest-facts")).toContainText("12 sự kiện");
    await expect(statusBox(page)).toContainText("Đã hoàn tất", { timeout: 10_000 });
    const completion = page.getByTestId("playtest-completion");
    await expect(completion).toContainText("Passed");
    await expect(completion).toContainText("42");
    await expect(page.getByTestId("handoff-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hủy playtest" })).toHaveCount(0);
    const settled = mock.getCalls;
    await page.waitForTimeout(3600);
    expect(mock.getCalls).toBe(settled);
    expect(mock.forbidden).toEqual([]);
  });

  test("a Mobile session that redeemed the code hides the QR and stops Web from issuing more", async ({ page }) => {
    const mock = newMock({ playtest: newRow(), progress: [] });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
    await expect(page.getByTestId("qr-code")).toBeVisible();
    mock.playtest = { ...(mock.playtest as PlaytestRow), boundToMobile: true, openHandoffExpiresAt: null };
    await expect(statusBox(page)).toContainText("Đã gắn với Mobile", { timeout: 10_000 });
    await expect(page.getByTestId("qr-code")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Cấp lại mã|Tạo mã/ })).toHaveCount(0);
    await expect(page.getByTestId("handoff-card")).toContainText("Web không cấp thêm mã");
  });
});

test.describe("cancel", () => {
  test("asks for confirmation, sends one keyed request and shows Cancelled", async ({ page }) => {
    const mock = newMock({ playtest: newRow() });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await page.getByRole("button", { name: "Hủy playtest" }).click();
    await expect(page.getByRole("dialog")).toContainText("chưa trừ lượt dùng thử");
    await page.getByRole("dialog").getByRole("button", { name: "Giữ lại" }).click();
    expect(mock.cancelCalls).toHaveLength(0);
    await page.getByRole("button", { name: "Hủy playtest" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Hủy playtest" }).click();
    await expect(statusBox(page)).toContainText("Đã hủy");
    expect(mock.cancelCalls).toHaveLength(1);
    expect(mock.cancelCalls[0].key).toBeTruthy();
    await expect(page.getByRole("button", { name: "Hủy playtest" })).toHaveCount(0);
  });

  test("a lost cancel response is retried with the same key and ends Cancelled", async ({ page }) => {
    const mock = newMock({ playtest: newRow({ status: "Running" }), cancelReplies: [0, 200] });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(page.getByRole("button", { name: "Hủy playtest" })).toBeVisible();
    await page.getByRole("button", { name: "Hủy playtest" }).click();
    await expect(page.getByRole("dialog")).toContainText("không được hoàn lại tự động");
    await page.getByRole("dialog").getByRole("button", { name: "Hủy playtest" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Hủy playtest" }).click();
    await expect(statusBox(page)).toContainText("Đã hủy");
    expect(mock.cancelCalls).toHaveLength(2);
    expect(mock.cancelCalls[1].key).toBe(mock.cancelCalls[0].key);
  });

  test("a hidden cancel button when BE says the session cannot cancel; 409 PLAYTEST_TERMINAL re-reads the state", async ({ page }) => {
    const mock = newMock({ playtest: newRow({ canCancel: false }) });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    await expect(page.getByRole("button", { name: "Hủy playtest" })).toHaveCount(0);
    await expect(page.getByText("Máy chủ không cho phép phiên này hủy playtest")).toBeVisible();

    const second = newMock({ playtest: newRow(), cancelReplies: [{ status: 409, code: "PLAYTEST_TERMINAL" }] });
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await setup(page, second);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await page.getByRole("button", { name: "Hủy playtest" }).click();
    second.playtest = { ...(second.playtest as PlaytestRow), status: "Completed" };
    await page.getByRole("dialog").getByRole("button", { name: "Hủy playtest" }).click();
    await expect(statusBox(page)).toContainText("Đã hoàn tất");
  });

  test("a poll answered late never moves the view back after Cancel", async ({ page }) => {
    // 2nd GET (the first poll after load) answers 3s late with the state captured on arrival: still Created.
    const mock = newMock({ playtest: newRow(), getDelays: [0, 3000, 0, 0] });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    await expect.poll(() => mock.getCalls, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
    await page.getByRole("button", { name: "Hủy playtest" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Hủy playtest" }).click();
    await expect(statusBox(page)).toContainText("Đã hủy");
    await page.waitForTimeout(3500);
    await expect(statusBox(page)).toContainText("Đã hủy");
    await expect(statusBox(page)).toHaveAttribute("data-status", "Cancelled");
  });
});

test.describe("reload", () => {
  test("?playtest= restores status and the open handoff from the server, but the code is not shown again", async ({ page }) => {
    const mock = newMock();
    await setup(page, mock);
    await openTab(page);
    await create(page).click();
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
    await expect(page.getByTestId("qr-code")).toBeVisible();

    await page.reload();
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    await expect(page.getByTestId("playtest-facts")).toContainText(IDS.playtest);
    await expect(page.getByTestId("qr-code")).toHaveCount(0);
    await expect(page.getByTestId("handoff-card")).toContainText("không thể xem lại");
    await page.getByRole("button", { name: "Cấp lại mã" }).click();
    await expect(page.getByTestId("qr-code")).toBeVisible();
    await expect(page.getByTestId("handoff-code")).toHaveText("Hf02".padEnd(43, "x"));
    expect(mock.forbidden).toEqual([]);
  });

  test("reopens a Running playtest by id after a reload", async ({ page }) => {
    const mock = newMock({ playtest: newRow({ status: "Running" }) });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(statusBox(page)).toContainText("Đang chạy trên thiết bị");
    await expect(page.getByTestId("handoff-card")).toContainText("Playtest đã bắt đầu");
    await page.reload();
    await expect(statusBox(page)).toContainText("Đang chạy trên thiết bị");
    expect(mock.prepareCalls).toHaveLength(0);
  });

  test("a playtest of another version is flagged instead of shown as this version's", async ({ page }) => {
    const mock = newMock({ playtest: newRow({ versionId: IDS.version2 }) });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(page.getByRole("status").filter({ hasText: "thuộc phiên bản khác" })).toBeVisible();
  });

  test("an invalid ?playtest= value is refused without a request", async ({ page }) => {
    const mock = newMock();
    await setup(page, mock);
    await openTab(page, "&playtest=not-a-uuid");
    await expect(page.getByText("không hợp lệ").first()).toBeVisible();
    expect(mock.getCalls).toBe(0);
    await page.getByRole("button", { name: "Bỏ mã này" }).click();
    await expect(create(page)).toBeVisible();
  });
});

const prepareErrors: Array<{ name: string; reply: Reply; text: RegExp }> = [
  { name: "package not ready", reply: { status: 409, code: "PLAYTEST_PACKAGE_REQUIRED" }, text: /chưa có PlaytestPackage đã dựng/ },
  { name: "snapshot required", reply: { status: 409, code: "DRAFT_SNAPSHOT_REQUIRED" }, text: /snapshot/ },
  { name: "runtime incompatible", reply: { status: 409, code: "RUNTIME_INCOMPATIBLE" }, text: /không tương thích runtime/ },
  { name: "entitlement or Trial exhausted", reply: { status: 409, code: "PLAYTEST_ENTITLEMENT_REQUIRED" }, text: /dịch vụ trả phí còn hiệu lực hoặc gói dùng thử đã hết/ },
  { name: "rollout not enabled", reply: { status: 503, code: "PLAYTEST_LAUNCH_UNAVAILABLE" }, text: /chưa được bật ở môi trường này/ },
  { name: "cross tenant 404", reply: { status: 404, code: "NOT_FOUND" }, text: /không thuộc tài khoản\/tổ chức của bạn/ },
  { name: "forbidden 403", reply: { status: 403, code: "FORBIDDEN" }, text: /Chỉ tài khoản OrganizationUser/ },
  { name: "idempotency conflict", reply: { status: 409, code: "IDEMPOTENCY_KEY_CONFLICT" }, text: /cùng khóa nhưng nội dung khác/ },
];

test.describe("errors", () => {
  for (const item of prepareErrors) {
    test(`prepare: ${item.name} shows the exact reason and the code`, async ({ page }) => {
      const mock = newMock({ prepareReplies: [item.reply, 201] });
      await setup(page, mock);
      await openTab(page);
      await create(page).click();
      const alert = page.getByRole("alert").filter({ hasText: typeof item.reply === "object" ? item.reply.code : "" });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(item.text);
      // A definite 4xx refusal is a new intent next time (new key); a 5xx may have been executed, so its retry keeps the key.
      await create(page).click();
      await expect(statusBox(page)).toContainText("Đã chuẩn bị");
      const unknownOutcome = typeof item.reply === "object" && item.reply.status >= 500;
      if (unknownOutcome) expect(mock.prepareCalls[1].key).toBe(mock.prepareCalls[0].key);
      else expect(mock.prepareCalls[1].key).not.toBe(mock.prepareCalls[0].key);
    });
  }

  test("prepare: 429 shows Retry-After and holds the button", async ({ page }) => {
    const mock = newMock({ prepareReplies: [{ status: 429, code: "RATE_LIMITED", retryAfter: "4" }, 201] });
    await setup(page, mock);
    await openTab(page);
    await create(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Thử lại sau 4 giây" })).toBeVisible();
    await expect(create(page)).toBeDisabled();
    await expect(create(page)).toBeEnabled({ timeout: 8000 });
    // 429 never reached the endpoint: the retry keeps the same key.
    await create(page).click();
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    expect(mock.prepareCalls[1].key).toBe(mock.prepareCalls[0].key);
  });

  const handoffErrors: Array<{ name: string; reply: Reply; text: RegExp }> = [
    { name: "handoff not configured (503)", reply: { status: 503, code: "PLAYTEST_HANDOFF_UNAVAILABLE" }, text: /Chuyển sang Mobile chưa được bật/ },
    { name: "already started (409)", reply: { status: 409, code: "PLAYTEST_ALREADY_STARTED" }, text: /đã bắt đầu/ },
    { name: "code expired (409)", reply: { status: 409, code: "PLAYTEST_HANDOFF_EXPIRED" }, text: /hết hạn/ },
    { name: "code already used (409)", reply: { status: 409, code: "PLAYTEST_HANDOFF_USED" }, text: /đã được một phiên Mobile khác dùng/ },
    { name: "not recoverable (409)", reply: { status: 409, code: "PLAYTEST_HANDOFF_NOT_RECOVERABLE" }, text: /Hãy tạo mã mới/ },
    { name: "wrong tenant (404)", reply: { status: 404, code: "NOT_FOUND" }, text: /không thuộc tài khoản\/tổ chức/ },
  ];
  for (const item of handoffErrors) {
    test(`handoff: ${item.name}`, async ({ page }) => {
      const mock = newMock({ playtest: newRow(), handoffReplies: [item.reply, 201] });
      await setup(page, mock);
      await openTab(page, `&playtest=${IDS.playtest}`);
      await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
      const alert = page.getByTestId("handoff-card").getByRole("alert");
      await expect(alert).toContainText(item.text);
      await expect(page.getByTestId("qr-code")).toHaveCount(0);
      await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
      await expect(page.getByTestId("qr-code")).toBeVisible();
      const unknownOutcome = typeof item.reply === "object" && item.reply.status >= 500;
      if (unknownOutcome) expect(mock.handoffCalls[1].key).toBe(mock.handoffCalls[0].key);
      else expect(mock.handoffCalls[1].key).not.toBe(mock.handoffCalls[0].key);
    });
  }

  test("GET 404 (another tenant) is a final error: one request, no polling, retry on demand", async ({ page }) => {
    const mock = newMock({ playtest: newRow(), getFails: { status: 404, code: "NOT_FOUND" } });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(page.getByRole("alert").filter({ hasText: "ngoài phạm vi của bạn" })).toBeVisible();
    await page.waitForTimeout(3600);
    expect(mock.getCalls).toBe(1);
    await expect(page.getByRole("button", { name: "Bỏ playtest này" })).toBeVisible();
    mock.getFails = null;
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
  });

  test("GET 403 is a final error too", async ({ page }) => {
    const mock = newMock({ playtest: newRow(), getFails: { status: 403, code: "FORBIDDEN" } });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(page.getByRole("alert").filter({ hasText: "Không có quyền chạy thử" })).toBeVisible();
    await page.waitForTimeout(3600);
    expect(mock.getCalls).toBe(1);
  });

  test("a failing poll keeps the last status as stale data and backs off, then recovers", async ({ page }) => {
    const mock = newMock({ playtest: newRow() });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    mock.getFails = { status: 500, code: "INTERNAL_ERROR" };
    await expect(page.getByRole("status").filter({ hasText: "Dữ liệu có thể đã cũ" })).toBeVisible({ timeout: 10_000 });
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    mock.getFails = null;
    mock.playtest = { ...(mock.playtest as PlaytestRow), status: "Launching" };
    await expect(statusBox(page)).toContainText("Đang khởi chạy", { timeout: 20_000 });
  });

  test("GET 429 with Retry-After is honoured: the next poll waits at least that long", async ({ page }) => {
    const mock = newMock({ playtest: newRow() });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(statusBox(page)).toContainText("Đã chuẩn bị");
    mock.getFails = { status: 429, code: "RATE_LIMITED", retryAfter: "7" };
    await expect.poll(() => mock.getCalls, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
    const afterFirst429 = mock.getCalls;
    await page.waitForTimeout(5000);
    expect(mock.getCalls).toBe(afterFirst429); // would be +1 or +2 at the 3s cadence if Retry-After were ignored
  });
});

test.describe("package preconditions come from the server", () => {
  const cases: Array<{ name: string; patch: Partial<Mock>; missing?: RegExp; enabled: boolean }> = [
    { name: "no PlaytestPackage job", patch: { jobs: [] }, missing: /Chưa có job dựng PlaytestPackage/, enabled: false },
    { name: "only a ReleasePackage job", patch: { jobs: [{ id: IDS.job, status: "Succeeded", kind: "ReleasePackage" }] }, missing: /Chưa có job dựng PlaytestPackage/, enabled: false },
    { name: "job still running", patch: { jobs: [{ id: IDS.job, status: "Running", kind: "PlaytestPackage" }] }, missing: /đang được dựng/, enabled: false },
    { name: "job failed", patch: { jobs: [{ id: IDS.job, status: "Failed", kind: "PlaytestPackage" }] }, missing: /đã thất bại/, enabled: false },
    { name: "job succeeded but QA failed", patch: { qa: "failed" }, missing: /QA của PlaytestPackage không đạt/, enabled: false },
    { name: "job succeeded, QA passed", patch: {}, enabled: true },
  ];
  for (const item of cases) {
    test(item.name, async ({ page }) => {
      const mock = newMock(item.patch);
      await setup(page, mock);
      await openTab(page);
      if (item.enabled) {
        await expect(create(page)).toBeEnabled();
        await expect(page.getByTestId("playtest-package")).toContainText("Job xong, QA đạt");
        await expect(page.getByTestId("playtest-missing")).toHaveCount(0);
      } else {
        await expect(page.getByTestId("playtest-missing")).toContainText(item.missing as RegExp);
        await expect(create(page)).toBeDisabled();
        await expect(page.getByRole("link", { name: "Mở tab Package build" })).toBeVisible();
      }
      expect(mock.prepareCalls).toHaveLength(0);
    });
  }
});

test.describe("roles and boundary", () => {
  test("PlatformAdmin is not a playtest actor: no create button and no playtest request", async ({ page }) => {
    const mock = newMock({ role: 0, playtest: newRow() });
    await setup(page, mock);
    await openTab(page, `&playtest=${IDS.playtest}`);
    await expect(page.getByRole("status").filter({ hasText: "Chỉ OrganizationUser chạy thử được" })).toBeVisible();
    await expect(create(page)).toHaveCount(0);
    await expect(statusBox(page)).toHaveCount(0);
    expect(mock.getCalls).toBe(0);
    expect(mock.prepareCalls).toHaveLength(0);
  });

  test("a full lifecycle never reaches redeem, start, launch-grants, launched, heartbeat, events or complete", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/playtests")) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
    const mock = newMock();
    await setup(page, mock);
    await openTab(page);
    await create(page).click();
    await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
    await expect(page.getByTestId("qr-code")).toBeVisible();
    mock.progress = ["Launching", "Running", "Completed"]; // the Mobile app now takes over
    await expect(statusBox(page)).toContainText("Đã hoàn tất", { timeout: 25_000 });
    expect(mock.forbidden).toEqual([]);
    expect(requests.some((line) => /redeem|\/start|launch-grants|launched|heartbeat|events:batch|\/complete/.test(line))).toBe(false);
    expect(requests.some((line) => line.startsWith("POST") && line.endsWith("/handoffs"))).toBe(true);
  });
});

test.describe("ordering guard", () => {
  const make = (status: string, extra: Partial<PlaytestStatus> = {}) => ({ id: IDS.playtest, status, grant: null, ...extra }) as PlaytestStatus;

  test("a response behind the shown state, or a different terminal state, is ignored", () => {
    expect(acceptStatus(undefined, make("Created")).status).toBe("Created");
    expect(acceptStatus(make("Launching"), make("Created")).status).toBe("Launching");
    expect(acceptStatus(make("Running"), make("Launching")).status).toBe("Running");
    expect(acceptStatus(make("Cancelled"), make("Running")).status).toBe("Cancelled");
    expect(acceptStatus(make("Cancelled"), make("Completed")).status).toBe("Cancelled");
    expect(acceptStatus(make("Created"), make("Cancelled")).status).toBe("Cancelled");
    expect(acceptStatus(make("Launching", { grant: { generation: 2, issuedAt: "", expiresAt: "" } }), make("Launching", { grant: { generation: 1, issuedAt: "", expiresAt: "" } })).grant?.generation).toBe(2);
    expect(acceptStatus(make("Created"), { ...make("Running"), id: IDS.playtest2 }).id).toBe(IDS.playtest2);
  });
});

type JourneyCase = {
  name: string;
  patch: Partial<Mock>;
  next: string | null;
  steps: Record<string, { state: string; text: RegExp }>;
};

const journeyCases: JourneyCase[] = [
  {
    name: "no version yet: snapshot is next, later steps have no data",
    patch: { versions: false, draftCount: 1 },
    next: "snapshot",
    steps: { draft: { state: "done", text: /1 draft/ }, validate: { state: "unknown", text: /Chưa có dữ liệu/ }, snapshot: { state: "todo", text: /Chưa có phiên bản/ }, package: { state: "unknown", text: /Chưa có dữ liệu/ }, readiness: { state: "unknown", text: /Chưa có dữ liệu/ }, review: { state: "unknown", text: /Chưa có dữ liệu/ }, release: { state: "unknown", text: /Chưa có dữ liệu/ }, publish: { state: "unknown", text: /Chưa có dữ liệu/ } },
  },
  {
    name: "no draft: the draft step is next",
    patch: { versions: false, draftCount: 0 },
    next: "draft",
    steps: { draft: { state: "todo", text: /Chưa có draft/ } },
  },
  {
    name: "scenario without draft counts: draft step has no data and is next",
    patch: { versions: false, draftCount: undefined },
    next: "draft",
    steps: { draft: { state: "unknown", text: /Chưa có dữ liệu/ } },
  },
  {
    name: "version without package job: build package is next",
    patch: { readiness: { packageJob: null, outcome: null, blockerCount: 0, confirmationReviewId: null, technicalReady: false, missing: ["PACKAGE_VALIDATION_REQUIRED"] }, jobs: [] },
    next: "package",
    steps: { snapshot: { state: "done", text: /Đã có v1/ }, package: { state: "todo", text: /Chưa dựng package/ }, readiness: { state: "todo", text: /Chưa có kết quả QA/ }, review: { state: "todo", text: /Chưa gửi duyệt/ }, release: { state: "todo", text: /Chưa có release/ } },
  },
  {
    name: "job running: package is active and still next",
    patch: { readiness: { packageJob: { jobId: IDS.job, status: "Running", currentAttemptId: "att-1" }, outcome: null, blockerCount: 0, confirmationReviewId: null, technicalReady: false, missing: ["PACKAGE_VALIDATION_REQUIRED"] }, jobs: [{ id: IDS.job, status: "Running", kind: "ReleasePackage" }] },
    next: "package",
    steps: { package: { state: "active", text: /Đang chạy/ } },
  },
  {
    name: "job Succeeded is not QA Passed: package done, readiness still open",
    patch: { readiness: { packageJob: { jobId: IDS.job, status: "Succeeded", currentAttemptId: "att-1" }, outcome: null, blockerCount: 0, confirmationReviewId: null, technicalReady: false, missing: ["PACKAGE_VALIDATION_REQUIRED"] } },
    next: "readiness",
    steps: { package: { state: "done", text: /Job Succeeded/ }, readiness: { state: "todo", text: /Chưa có kết quả QA/ } },
  },
  {
    name: "QA passed without confirmation: readiness is active",
    patch: {},
    next: "readiness",
    steps: { package: { state: "done", text: /Job Succeeded/ }, readiness: { state: "active", text: /QA đạt, chờ xác nhận/ } },
  },
  {
    name: "QA failed: readiness blocked",
    patch: { readiness: { packageJob: { jobId: IDS.job, status: "Succeeded", currentAttemptId: "att-1" }, outcome: "Failed", blockerCount: 2, confirmationReviewId: null, technicalReady: false, missing: ["QA_NOT_PASSED"] } },
    next: "readiness",
    steps: { readiness: { state: "blocked", text: /QA không đạt/ } },
  },
  {
    name: "technically ready and not submitted: review is next",
    patch: { readiness: { packageJob: { jobId: IDS.job, status: "Succeeded", currentAttemptId: "att-1" }, outcome: "Passed", blockerCount: 0, confirmationReviewId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", technicalReady: true, missing: [] } },
    next: "review",
    steps: { readiness: { state: "done", text: /Sẵn sàng kỹ thuật/ }, review: { state: "todo", text: /Chưa gửi duyệt/ } },
  },
  {
    name: "submitted: review is active; approval stays independent of technical state",
    patch: { reviewStatus: "Submitted" },
    next: "readiness",
    steps: { readiness: { state: "active", text: /chờ xác nhận/ }, review: { state: "active", text: /Chờ duyệt/ } },
  },
  {
    name: "approved and ready, no release: create release is next",
    patch: { reviewStatus: "Approved", readiness: { packageJob: { jobId: IDS.job, status: "Succeeded", currentAttemptId: "att-1" }, outcome: "Passed", blockerCount: 0, confirmationReviewId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", technicalReady: true, missing: [] } },
    next: "release",
    steps: { review: { state: "done", text: /Đã duyệt/ }, release: { state: "todo", text: /Chưa có release/ }, publish: { state: "todo", text: /Chưa phát hành/ } },
  },
  {
    name: "Built release: publish is next, Built is not Published",
    patch: { reviewStatus: "Approved", release: "Built", readiness: { packageJob: { jobId: IDS.job, status: "Succeeded", currentAttemptId: "att-1" }, outcome: "Passed", blockerCount: 0, confirmationReviewId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", technicalReady: true, missing: [] } },
    next: "publish",
    steps: { release: { state: "done", text: /Release Built/ }, publish: { state: "todo", text: /Built, chưa phát hành/ } },
  },
  {
    name: "Published: every main step is done",
    patch: { reviewStatus: "Approved", release: "Published", readiness: { packageJob: { jobId: IDS.job, status: "Succeeded", currentAttemptId: "att-1" }, outcome: "Passed", blockerCount: 0, confirmationReviewId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", technicalReady: true, missing: [] } },
    next: null,
    steps: { publish: { state: "done", text: /Đã phát hành/ } },
  },
  {
    name: "Revoked release is blocked, not published",
    patch: { reviewStatus: "Approved", release: "Revoked", readiness: { packageJob: { jobId: IDS.job, status: "Succeeded", currentAttemptId: "att-1" }, outcome: "Passed", blockerCount: 0, confirmationReviewId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", technicalReady: true, missing: [] } },
    next: "publish",
    steps: { publish: { state: "blocked", text: /Đã thu hồi/ } },
  },
  {
    name: "readiness unreadable: its steps say so and review is still read from the version",
    patch: { readiness: "error", reviewStatus: "Rejected" },
    next: "package",
    steps: { package: { state: "unknown", text: /Chưa có dữ liệu/ }, readiness: { state: "unknown", text: /Chưa có dữ liệu/ }, review: { state: "blocked", text: /Bị từ chối/ } },
  },
  {
    name: "releases unreadable: release steps say so",
    patch: { release: "error", reviewStatus: "Approved" },
    next: "readiness",
    steps: { release: { state: "unknown", text: /Chưa có dữ liệu/ }, publish: { state: "unknown", text: /Chưa có dữ liệu/ } },
  },
  {
    name: "no review status from the server: review is not guessed",
    patch: { reviewStatus: undefined },
    next: "readiness",
    steps: { review: { state: "unknown", text: /Chưa có dữ liệu/ } },
  },
];

test.describe("journey", () => {
  for (const item of journeyCases) {
    test(item.name, async ({ page }) => {
      const mock = newMock(item.patch);
      await setup(page, mock);
      await page.goto(base);
      const journey = page.getByTestId("journey");
      await expect(journey).toBeVisible();
      await expect(journey.getByRole("listitem")).toHaveCount(9); // eight steps and the optional playtest branch
      for (const [id, expected] of Object.entries(item.steps)) {
        const step = journey.locator(`[data-step='${id}']`);
        await expect(step).toHaveAttribute("data-state", expected.state);
        await expect(step).toContainText(expected.text);
      }
      if (item.next) {
        await expect(journey.locator("[data-next='true']")).toHaveAttribute("data-step", item.next);
        await expect(journey.locator("[data-next='true']")).toContainText("Bước tiếp theo");
        await expect(journey.locator("[data-next='true']")).toHaveAttribute("aria-current", "step");
      } else {
        await expect(journey.locator("[data-next='true']")).toHaveCount(0);
      }
      // Draft validation is never stored by the server: it is always "no data" and never the next step.
      await expect(journey.locator("[data-step='validate']")).toHaveAttribute("data-state", "unknown");
      await expect(journey.locator("[data-step='validate'][data-next='true']")).toHaveCount(0);
      // The three independent gates are still there once a version is selected.
      if (item.patch.versions !== false) await expect(page.getByRole("list", { name: /Ba cổng độc lập/ })).toBeVisible();
    });
  }

  test("the next step links to where it is done; the playtest branch opens the Playtest tab", async ({ page }) => {
    const mock = newMock({ readiness: { packageJob: null, outcome: null, blockerCount: 0, confirmationReviewId: null, technicalReady: false, missing: ["PACKAGE_VALIDATION_REQUIRED"] }, jobs: [] });
    await setup(page, mock);
    await page.goto(base);
    const journey = page.getByTestId("journey");
    await expect(journey.locator("[data-step='package']")).toHaveAttribute("data-state", "todo");
    await expect(journey.locator("[data-step='playtest']")).toContainText("Chưa dựng PlaytestPackage");
    await expect(journey.locator("[data-step='playtest'][data-next='true']")).toHaveCount(0);
    await journey.getByRole("button", { name: "Mở Package build" }).click();
    await expect(page).toHaveURL(/tab=build/);
    await journey.getByRole("button", { name: "Mở tab Playtest" }).click();
    await expect(page).toHaveURL(/tab=playtest/);
    await expect(page.getByRole("heading", { name: "Playtest trên Mobile" })).toBeVisible();
  });
});

test.describe("layout", () => {
  for (const width of [375, 1440]) {
    for (const scheme of ["light", "dark"] as const) {
      test(`playtest tab and journey fit ${width}px ${scheme}`, async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 720 });
        const mock = newMock({ playtest: newRow() });
        await setup(page, mock);
        await openTab(page, `&playtest=${IDS.playtest}`);
        await page.getByRole("button", { name: "Tạo mã chuyển sang Mobile" }).click();
        await expect(page.getByTestId("qr-code")).toBeVisible();
        await expect(page.getByTestId("journey")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const box = await page.getByTestId("qr-code").boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
        for (const button of await page.getByTestId("handoff-card").getByRole("button").all()) {
          const size = await button.boundingBox();
          expect(size && size.height >= 40).toBe(true);
        }
        await page.screenshot({ path: testInfo.outputPath(`playtest-${scheme}-${width}.png`), fullPage: true });
      });
    }
  }
});
