import { expect, test, type Page } from "@playwright/test";
import { buildingIds, criteriaFixture, installTrainingBackend, learner, metricsFixture, signInAs, TrainingBackend, type Actor } from "./training-history-mock";

/*
 * Trainee "Lịch sử" and personal result in the Learning Hub, against a stateful MOCK of GET /api/training/sessions,
 * /{id} and /{id}/result (BE @633bba4). Evidence of UI behaviour only; the real API is a separate read-only smoke.
 */

test.use({ timezoneId: "Asia/Ho_Chi_Minh" });

const sid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = { passed: sid(1), notPassed: sid(2), incomplete: sid(3), learn: sid(4), running: sid(5), awaiting: sid(6), aborted: sid(7), abandoned: sid(8), crashed: sid(9), launching: sid(10), superseded: sid(11), unsurvivable: sid(12), foreign: sid(99) };
const at = (day: number, hour = 9) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`;
const HOA_SEN = "Tòa nhà Hoa Sen";
const ANH_DUONG = "Trường Tiểu học Ánh Dương";

/** Twelve sessions, one of each kind the BE can return, newest first in the order below (10 on page 1, 2 on page 2). */
function seedMix(backend: TrainingBackend) {
  backend.add({ id: ids.passed, status: "Completed", mode: "Assessment", startedAt: at(12, 9), endedAt: at(12, 10), endReason: "Finished", training: "Sơ tán tầng 3", scenario: "Cháy hành lang tầng 3", versionNumber: 2, result: { outcome: "Passed", reason: "ALL_REQUIREMENTS_MET", scorePercent: 80, criteria: criteriaFixture(), metrics: metricsFixture }, resultCreatedAt: at(12, 10) });
  backend.add({ id: ids.notPassed, status: "Completed", mode: "Assessment", startedAt: at(12, 8), endedAt: at(12, 8), endReason: "Finished", training: "Sơ tán tầng 1", scenario: "Cháy sảnh", result: { outcome: "NotPassed", reason: "MANDATORY_CRITERION_FAILED", scorePercent: 35.5, criteria: criteriaFixture().map((criterion) => ({ ...criterion, passed: false })), metrics: metricsFixture }, resultCreatedAt: at(12, 8) });
  backend.add({ id: ids.incomplete, status: "Completed", mode: "Assessment", startedAt: at(11, 9), endedAt: at(11, 9), endReason: "Abandoned", result: { outcome: "Incomplete", reason: "ENDED_BEFORE_COMPLETION", scorePercent: null, criteria: criteriaFixture(), metrics: { reached_exit: 0 } }, resultCreatedAt: at(11, 9) });
  backend.add({ id: ids.learn, status: "Completed", mode: "Learn", startedAt: at(11, 8), endedAt: at(11, 8), endReason: "Finished", building: HOA_SEN, training: "Làm quen lối thoát", result: { outcome: "NotAssessed", reason: "MODE_NOT_ASSESSED", scorePercent: null, criteria: null, metrics: metricsFixture }, resultCreatedAt: at(11, 8) });
  backend.add({ id: ids.running, status: "Running", mode: "Guided", startedAt: at(10, 9), training: "Luyện thoát hiểm" });
  backend.add({ id: ids.awaiting, status: "Running", completionRequested: true, mode: "Guided", startedAt: at(10, 8), endReason: "Finished", training: "Luyện thoát hiểm" });
  backend.add({ id: ids.aborted, status: "Aborted", mode: "Learn", startedAt: at(9, 9), training: "Bài bị hủy" });
  backend.add({ id: ids.abandoned, status: "Abandoned", mode: "Learn", startedAt: at(9, 8), training: "Bài bỏ dở" });
  backend.add({ id: ids.crashed, status: "Crashed", mode: "Guided", startedAt: at(8, 9), training: "Bài gặp lỗi" });
  backend.add({ id: ids.launching, status: "Launching", mode: "Learn", startedAt: at(8, 8), training: "Bài đang khởi động" });
  backend.add({ id: ids.superseded, status: "CompletedWithSupersededRelease", mode: "Learn", startedAt: at(7, 9), building: HOA_SEN, training: "Bài bản cũ", result: { outcome: "NotAssessed", reason: "MODE_NOT_ASSESSED", scorePercent: null, criteria: null, metrics: {} }, resultCreatedAt: at(7, 9) });
  backend.add({ id: ids.unsurvivable, status: "ScenarioUnsurvivable", mode: "Guided", startedAt: at(6, 9), building: HOA_SEN, training: "Bài không khả thi" });
  // Another learner's session: never listed and answered with 404.
  backend.add({ id: ids.foreign, owner: "other", status: "Completed", mode: "Assessment", startedAt: at(12, 12), training: "BÀI CỦA NGƯỜI KHÁC", result: { outcome: "Passed", reason: "ALL_REQUIREMENTS_MET", scorePercent: 99, criteria: criteriaFixture(), metrics: metricsFixture } });
}

async function start(page: Page, backend: TrainingBackend, path = "/learning-hub?view=history", actor: Actor = "trainee") {
  await signInAs(page, backend, actor);
  await installTrainingBackend(page, backend);
  await page.goto(path);
}

/** Set TH_SHOTS=<dir> to keep the screenshots of the layout cases for a visual review; otherwise they stay in the test output. */
const shotPath = (testInfo: import("@playwright/test").TestInfo, name: string) => (process.env.TH_SHOTS ? `${process.env.TH_SHOTS}/${name}` : testInfo.outputPath(name));

const row = (page: Page, id: string) => page.locator(`[data-session-id="${id}"]`);
const rows = (page: Page) => page.getByTestId("history-row");
const openDetail = (page: Page, id: string) => row(page, id).getByRole("button", { name: /Xem chi tiết/ }).click();

test.describe("list: session state and result are shown apart", () => {
  test("every kind of session has its own words and the result column never copies the session state", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await expect(page.getByRole("heading", { level: 1, name: "Lịch sử", exact: true })).toBeVisible();
    await expect(rows(page)).toHaveCount(10);
    await expect(page.getByText("BÀI CỦA NGƯỜI KHÁC")).toHaveCount(0);

    const expected: Array<[string, string, string]> = [
      [ids.passed, "Đã hoàn thành", "Đạt"],
      [ids.notPassed, "Đã hoàn thành", "Chưa đạt"],
      [ids.incomplete, "Đã hoàn thành", "Chưa hoàn tất"],
      [ids.learn, "Đã hoàn thành", "Không chấm điểm"],
      [ids.running, "Đang chơi", "Chưa có kết quả"],
      [ids.awaiting, "Chờ đồng bộ", "Chưa có kết quả"],
      [ids.aborted, "Đã hủy", "Không có kết quả"],
      [ids.abandoned, "Đã bỏ dở", "Không có kết quả"],
      [ids.crashed, "Gặp lỗi", "Không có kết quả"],
      [ids.launching, "Đang khởi động", "Chưa có kết quả"],
    ];
    for (const [id, session, result] of expected) {
      await expect(row(page, id).getByTestId("row-session-status"), id).toContainText(session);
      await expect(row(page, id).getByTestId("row-result-status"), id).toContainText(result);
    }
    // Completion is not a pass: the "Đã hoàn thành" cell of a NotPassed row sits next to "Chưa đạt", and nothing says certificate.
    await expect(row(page, ids.notPassed)).not.toContainText(/chứng nhận|chứng chỉ/i);
    await expect(row(page, ids.incomplete).getByTestId("row-session-status")).toContainText("Rời bài giữa chừng");
    await expect(row(page, ids.passed)).toContainText("Sơ tán tầng 3");
    await expect(row(page, ids.passed)).toContainText("Cháy hành lang tầng 3 · phiên bản 2");
    await expect(row(page, ids.passed)).toContainText(ANH_DUONG);
    await expect(row(page, ids.passed)).toContainText("Đánh giá");
    await expect(row(page, ids.learn)).toContainText(HOA_SEN);

    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page)).toHaveCount(2);
    await expect(row(page, ids.superseded).getByTestId("row-session-status")).toContainText("Hoàn thành, bản phát hành đã thay");
    await expect(row(page, ids.unsurvivable).getByTestId("row-session-status")).toContainText("Kịch bản không khả thi");
    await expect(row(page, ids.unsurvivable).getByTestId("row-result-status")).toContainText("Không có kết quả");
  });

  test("each v7 status is reachable through the status filter; legacy states are labelled but not offered as filters", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    const labels: Record<string, [string, number]> = {
      Launching: ["Đang khởi động", 1], Running: ["Đang chơi", 1], AwaitingSync: ["Chờ đồng bộ", 1], Completed: ["Đã hoàn thành", 4],
    };
    await expect(page.getByLabel("Trạng thái phiên").locator("option")).toHaveCount(5);
    // An old link with a legacy status shows the unfiltered list instead of a 400.
    await page.goto("/learning-hub?view=history&status=Crashed");
    await expect(rows(page)).toHaveCount(10);
    await expect(page.getByLabel("Trạng thái phiên")).toHaveValue("");
    expect(backend.lists().every((call) => !["Crashed", "Aborted", "Abandoned"].includes(call.params.get("status") ?? ""))).toBe(true);
    for (const [status, [label, count]] of Object.entries(labels)) {
      await page.goto(`/learning-hub?view=history&status=${status}`);
      await expect(rows(page), status).toHaveCount(count);
      await expect(page.getByTestId("row-session-status").first()).toContainText(label);
      await expect(page.getByLabel("Trạng thái phiên")).toHaveValue(status);
    }
    // AwaitingSync (a Running session with a pinned completion) is not mixed into Running.
    expect(backend.lists().some((call) => call.params.get("status") === "AwaitingSync")).toBe(true);
  });

  test("paging, filters and the open page survive reload and Back/Forward because they live in the URL", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await page.reload();
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByText("Trang 2/2")).toBeVisible();
    await page.goBack();
    await expect(rows(page)).toHaveCount(10);
    await page.goForward();
    await expect(rows(page)).toHaveCount(2);

    await page.getByLabel("Chế độ").selectOption("Assessment");
    await expect(page).toHaveURL(/mode=Assessment/);
    await expect(page).not.toHaveURL(/page=2/); // a filter change goes back to page 1
    await expect(rows(page)).toHaveCount(3);
    await page.getByLabel("Building").selectOption({ label: HOA_SEN });
    await expect(page).toHaveURL(new RegExp(`building=${buildingIds[HOA_SEN]}`));
    await expect(page.getByTestId("history-filtered-empty")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Chế độ")).toHaveValue("Assessment");
    await expect(page.getByLabel("Building")).toHaveValue(buildingIds[HOA_SEN]);
    await expect(page.getByTestId("history-filtered-empty")).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("Building")).toHaveValue("");
    await expect(rows(page)).toHaveCount(3);
    const last = backend.lists().at(-1)!;
    expect(last.params.get("mode")).toBe("Assessment");
    expect(last.params.get("pageSize")).toBe("10");
    // The Building filter comes from GET /api/training/buildings, not from an extra read of the history list.
    expect(backend.callsTo("GET", /^\/api\/training\/buildings$/).length).toBeGreaterThan(0);
    expect(backend.lists().some((call) => call.params.get("pageSize") === "100")).toBe(false);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => /history|session-list|training/i.test(key)))).toEqual([]);
  });

  test("the date range is the learner's own days: from inclusive, to exclusive (start of the next day), sent as UTC instants", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await page.getByLabel("Từ ngày").fill("2026-10-10");
    await page.getByLabel("Đến ngày").fill("2026-10-12");
    await expect(page).toHaveURL(/from=2026-10-10/);
    await expect(page).toHaveURL(/to=2026-10-12/);
    await expect.poll(() => backend.lists().at(-1)?.params.get("to")).toBe("2026-10-12T17:00:00.000Z");
    expect(backend.lists().at(-1)!.params.get("from")).toBe("2026-10-09T17:00:00.000Z");
    // 12 Oct 08:00 UTC is 15:00 local on the 12th: inside. 12 Oct 12:00 UTC (the other learner) never shows.
    await expect(rows(page)).toHaveCount(6);
    await expect(row(page, ids.passed)).toBeVisible();
    await expect(row(page, ids.crashed)).toHaveCount(0);

    // End before start: explained on the field, no request is sent.
    const before = backend.lists().length;
    await page.getByLabel("Từ ngày").fill("2026-10-13");
    await expect(page.getByText("Ngày kết thúc phải từ ngày bắt đầu trở đi.")).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(backend.lists().length).toBe(before);
    await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("hand-edited URL values are ignored instead of reaching the server", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend, "/learning-hub?view=history&status=Hacked&mode=Exam&building=not-a-uuid&from=2026-13-40&to=abc");
    await expect(rows(page)).toHaveCount(10);
    const call = backend.lists().find((item) => item.params.get("pageSize") === "10")!;
    for (const name of ["status", "mode", "buildingId", "from", "to"]) expect(call.params.has(name), name).toBe(false);
  });
});

test.describe("list: empty, loading, errors", () => {
  test("a learner with no session sees how to start one; a filter with no match says so differently", async ({ page }) => {
    const backend = new TrainingBackend();
    await start(page, backend);
    const empty = page.getByTestId("history-empty");
    await expect(empty).toContainText("Bạn chưa có lượt tập nào");
    await expect(empty).toContainText("Quét mã QR");
    await expect(empty.getByRole("link", { name: "Xem trang ứng dụng" })).toHaveAttribute("href", "/download");
    await expect(empty.getByRole("link", { name: "Đọc bài trong Learn" })).toHaveAttribute("href", "/learn");
    await expect(page.getByTestId("history-filtered-empty")).toHaveCount(0);

    backend.add({ status: "Completed", mode: "Learn", startedAt: at(12), result: { outcome: "NotAssessed", reason: "MODE_NOT_ASSESSED", scorePercent: null, criteria: null, metrics: {} } });
    await page.goto("/learning-hub?view=history&status=Running");
    const filtered = page.getByTestId("history-filtered-empty");
    await expect(filtered).toContainText("Không có lượt tập nào khớp bộ lọc");
    await expect(page.getByTestId("history-empty")).toHaveCount(0);
    await filtered.getByRole("button", { name: "Xóa bộ lọc" }).click();
    await expect(rows(page)).toHaveCount(1);
  });

  test("a page past the end is explained and goes back to page 1", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend, "/learning-hub?view=history&page=9");
    await expect(page.getByTestId("history-page-empty")).toContainText("Trang này không có lượt tập");
    await page.getByRole("button", { name: "Về trang đầu" }).click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("loading skeleton, a 500 with its code, and retry", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    backend.failNext("GET", /^\/api\/training\/sessions$/, { status: 200, delayMs: 700, json: { items: [], totalCount: 0, page: 1, pageSize: 10 } });
    await start(page, backend);
    await expect(page.getByRole("status").filter({ hasText: "Đang tải lịch sử lượt tập…" })).toBeVisible();
    await expect(page.getByTestId("history-empty")).toBeVisible();

    backend.failNext("GET", /^\/api\/training\/sessions$/, { status: 500, json: { title: "boom", status: 500, code: "INTERNAL" } });
    await page.reload();
    const alert = page.getByRole("alert").filter({ hasText: "Không tải được lịch sử lượt tập" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("mã lỗi: INTERNAL");
    await expect(rows(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("429/503 shows the server's Retry-After", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    backend.failNext("GET", /^\/api\/training\/sessions$/, { status: 503, headers: { "Retry-After": "7" }, json: { title: "busy", status: 503, code: "SERVICE_UNAVAILABLE" } });
    await start(page, backend);
    await expect(page.getByRole("alert").filter({ hasText: "Máy chủ đang bận" })).toContainText("thử lại sau 7 giây");
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("network loss then retry restores the list", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await expect(rows(page)).toHaveCount(10);
    const offline = (route: import("@playwright/test").Route) => route.abort("internetdisconnected");
    const listUrl = /\/api\/training\/sessions(\?|$)/;
    await page.route(listUrl, offline);
    await page.getByLabel("Chế độ").selectOption("Learn");
    await expect(page.getByRole("alert").filter({ hasText: "Mất kết nối tới máy chủ" })).toBeVisible();
    await expect(rows(page)).toHaveCount(0); // no row of the previous filter stays under the failure
    await page.unroute(listUrl, offline);
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(rows(page)).toHaveCount(5);
  });

  test("401 and 403 are answers about rights: no retry button, no rows", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    backend.failNext("GET", /^\/api\/training\/sessions$/, { status: 401, json: { title: "Sign in again.", status: 401, code: "UNAUTHORIZED" } });
    await start(page, backend);
    const expired = page.getByRole("alert").filter({ hasText: "Phiên đăng nhập đã hết hạn" });
    await expect(expired).toBeVisible();
    await expect(expired).toContainText("UNAUTHORIZED");
    await expect(page.getByRole("button", { name: "Thử lại" })).toHaveCount(0);
    backend.failNext("GET", /^\/api\/training\/sessions$/, { status: 403, json: { title: "no", status: 403, code: "FORBIDDEN" } });
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "không có lịch sử lượt tập" })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });

  test("a response that arrives late never overwrites the newer query", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await expect(rows(page)).toHaveCount(10);
    const staleItem = { sessionId: sid(500), status: "Completed", mode: "Learn", resultStatus: null, endReason: null, startedAt: at(1), endedAt: null, resultCreatedAt: null, training: { id: sid(501), name: "BÀI CŨ ĐẾN MUỘN" }, releaseId: sid(502), building: { id: sid(503), name: "X" }, scenario: { id: sid(504), versionId: sid(505), name: "Y", versionNumber: 1 } };
    backend.failNext("GET", /^\/api\/training\/sessions$/, { status: 200, delayMs: 1200, json: { items: [staleItem], totalCount: 1, page: 1, pageSize: 10 } });
    await page.getByLabel("Chế độ").selectOption("Guided");
    await page.getByLabel("Chế độ").selectOption("Assessment");
    await expect(rows(page)).toHaveCount(3);
    await page.waitForTimeout(1500);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByText("BÀI CŨ ĐẾN MUỘN")).toHaveCount(0);
  });
});

test.describe("detail drawer: result", () => {
  test("an Assessment result shows outcome, the server's reason, score, criteria and metrics; the session state stays separate", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await openDetail(page, ids.passed);
    await expect(page).toHaveURL(new RegExp(`session=${ids.passed}`));
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "Sơ tán tầng 3" })).toBeVisible();
    await expect(drawer.getByTestId("detail-session-status")).toContainText("Đã hoàn thành");
    await expect(drawer.getByTestId("detail-session-status")).toContainText("không có nghĩa là đạt");
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Đạt");
    await expect(drawer.getByTestId("result-outcome")).toContainText("Đã đáp ứng các yêu cầu của bài.");
    await expect(drawer.getByTestId("result-outcome")).toContainText("ALL_REQUIREMENTS_MET");
    await expect(drawer.getByTestId("result-score")).toContainText("80%");
    await expect(drawer).toContainText(ANH_DUONG);
    await expect(drawer).toContainText("Cháy hành lang tầng 3 · phiên bản 2");

    const criteria = drawer.getByTestId("criterion");
    await expect(criteria).toHaveCount(4);
    await expect(criteria.nth(0)).toContainText("Đã tới lối ra");
    await expect(criteria.nth(0)).toContainText("Yêu cầu: = Có · Bắt buộc · Trọng số 50");
    await expect(criteria.nth(0)).toContainText("Đạt");
    await expect(criteria.nth(1)).toContainText("Yêu cầu: ≤ 2 phút · Không bắt buộc");
    await expect(criteria.nth(1)).toContainText("Đo được: 1 phút 36 giây");
    await expect(criteria.nth(2)).toContainText("Chưa đạt");
    await expect(criteria.nth(2)).toContainText("Đo được: 3");
    await expect(criteria.nth(3)).toContainText("Đo được: Không có");
    await expect(criteria.nth(3)).toContainText("Không có số đo để so sánh");
    const metrics = drawer.getByTestId("metrics");
    await expect(metrics).toContainText("Thời gian hoàn thành");
    await expect(metrics).toContainText("1 phút 36 giây");
    await expect(metrics).toContainText("184,25 m");
    await expect(drawer).toContainText("không phải chứng nhận");
    await expect(drawer.getByTestId("ask-about-result")).toHaveAttribute("href", `/learning-hub?view=questions&session=${ids.passed}`);
    expect(backend.callsTo("GET", new RegExp(`/${ids.passed}/result$`))).toHaveLength(1);
    // The row was known: no extra state read.
    expect(backend.callsTo("GET", new RegExp(`/${ids.passed}$`))).toHaveLength(0);
  });

  test("NotPassed and Incomplete use their own wording; unknown reason codes are shown as received", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    backend.storeResult(ids.incomplete, { outcome: "Incomplete", reason: "SOMETHING_NEW", scorePercent: null, criteria: [], metrics: {} });
    await start(page, backend);
    await openDetail(page, ids.notPassed);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Chưa đạt");
    await expect(drawer.getByTestId("result-outcome")).toContainText("Có tiêu chí bắt buộc chưa đạt.");
    await expect(drawer.getByTestId("result-score")).toContainText("35,5%");
    await page.keyboard.press("Escape");
    await openDetail(page, ids.incomplete);
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Chưa hoàn tất");
    await expect(drawer.getByTestId("result-outcome")).toContainText("SOMETHING_NEW");
    await expect(drawer.getByTestId("result-score")).toContainText("Chưa có");
    await expect(drawer.getByTestId("no-criteria")).toBeVisible();
  });

  test("a Learn result shows exactly what the server returned: no score and no criteria are invented or hidden", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await openDetail(page, ids.learn);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Không chấm điểm");
    await expect(drawer.getByTestId("result-outcome")).toContainText("Chế độ này không chấm đạt hoặc chưa đạt.");
    await expect(drawer.getByTestId("result-score")).toContainText("Chưa có");
    await expect(drawer.getByTestId("no-criteria")).toContainText("Máy chủ không trả tiêu chí chi tiết");
    await expect(drawer.getByTestId("criterion")).toHaveCount(0);
    await expect(drawer.getByTestId("metrics")).toContainText("Quãng đường di chuyển");
    await expect(drawer).toContainText("Học (Learn)");
  });

  test("the detail's only link is the real Trainee AI question about this result; no lesson or certificate link", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await openDetail(page, ids.passed);
    const links = page.getByRole("dialog").getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links).toHaveText("Hỏi AI về kết quả này");
    await expect(page.getByRole("dialog")).not.toContainText(/chứng nhận\b(?! hay)|chứng chỉ/i);
  });

  test("409 RESULT_NOT_READY is a waiting state with reload, not an error; the result appears after sync", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    backend.failNext("GET", new RegExp(`/${ids.passed}/result$`), { status: 409, json: { title: "Result is not ready.", status: 409, code: "RESULT_NOT_READY" } });
    await start(page, backend);
    await openDetail(page, ids.passed);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Kết quả chưa sẵn sàng")).toBeVisible();
    await expect(drawer).toContainText("Đây không phải lỗi");
    await expect(drawer.getByRole("alert")).toHaveCount(0);
    await drawer.getByRole("button", { name: "Tải lại" }).click();
    await expect(drawer.getByTestId("result-score")).toContainText("80%");
    await expect(drawer.getByText("Kết quả chưa sẵn sàng")).toHaveCount(0);
  });

  test("a session waiting for sync does not call /result; Tải lại picks the result up once the device synced", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await openDetail(page, ids.awaiting);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("detail-session-status")).toContainText("Chờ đồng bộ");
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Chưa có kết quả");
    await expect(drawer.getByText("Lượt tập này chưa có kết quả")).toBeVisible();
    expect(backend.callsTo("GET", /\/result$/)).toHaveLength(0);
    backend.storeResult(ids.awaiting, { outcome: "NotAssessed", reason: "MODE_NOT_ASSESSED", scorePercent: null, criteria: null, metrics: metricsFixture });
    await drawer.getByRole("button", { name: "Tải lại" }).click();
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Không chấm điểm");
    await expect(drawer.getByTestId("detail-session-status")).toContainText("Đã hoàn thành");
    expect(backend.callsTo("GET", /\/result$/).length).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(row(page, ids.awaiting).getByTestId("row-session-status")).toContainText("Đã hoàn thành");
  });

  test("an aborted or crashed session explains there is no valid result instead of showing an empty result", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await openDetail(page, ids.crashed);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("detail-session-status")).toContainText("Gặp lỗi");
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Không có kết quả");
    await expect(drawer).toContainText("không có điểm hay tiêu chí để hiển thị");
    expect(backend.callsTo("GET", /\/result$/)).toHaveLength(0);
  });

  test("a deep link to a session that is not on the current page reads its state first, then the result, and survives reload", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend, `/learning-hub?view=history&session=${ids.superseded}`);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("detail-session-status")).toContainText("Hoàn thành, bản phát hành đã thay");
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Không chấm điểm");
    expect(backend.callsTo("GET", new RegExp(`/${ids.superseded}$`)).length).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByRole("dialog").getByTestId("detail-result-status")).toContainText("Không chấm điểm");
    await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/session=/);
    await page.goBack();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("another learner's id, an unknown id and a malformed id are not found and show nothing of any session", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend, `/learning-hub?view=history&session=${ids.foreign}`);
    let drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Không tìm thấy lượt tập này")).toBeVisible();
    await expect(drawer).toContainText("không thuộc tài khoản của bạn");
    await expect(drawer).not.toContainText("BÀI CỦA NGƯỜI KHÁC");
    await expect(drawer).not.toContainText("99%");
    await expect(drawer.getByRole("button", { name: "Thử lại" })).toHaveCount(0);
    await page.goto(`/learning-hub?view=history&session=${sid(404)}`);
    await expect(page.getByRole("dialog").getByText("Không tìm thấy lượt tập này")).toBeVisible();
    const before = backend.calls.length;
    await page.goto("/learning-hub?view=history&session=../../admin");
    drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Liên kết lượt tập không hợp lệ")).toBeVisible();
    expect(backend.calls.slice(before).filter((call) => /\/api\/training\/sessions\/../.test(call.path))).toHaveLength(0);
  });

  test("403 on the result is explained; other errors offer retry with the code", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    backend.failNext("GET", new RegExp(`/${ids.passed}/result$`), { status: 403, json: { title: "no", status: 403, code: "FORBIDDEN" } });
    await start(page, backend);
    await openDetail(page, ids.passed);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("alert").filter({ hasText: "không có lịch sử lượt tập" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Thử lại" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    backend.failNext("GET", new RegExp(`/${ids.notPassed}/result$`), { status: 500, json: { title: "boom", status: 500, code: "INTERNAL" } });
    await openDetail(page, ids.notPassed);
    await expect(drawer.getByRole("alert").filter({ hasText: "mã lỗi: INTERNAL" })).toBeVisible();
    await drawer.getByRole("button", { name: "Thử lại" }).click();
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Chưa đạt");
  });

  test("switching ?session= between two ids never shows the first one's data, and the first one's late answer is dropped", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await expect(rows(page)).toHaveCount(10);
    // Open A (slow result), then go to B through the router while A is still loading.
    backend.failNext("GET", new RegExp(`/${ids.passed}/result$`), { status: 200, delayMs: 1200, json: { sessionId: ids.passed, mode: "Assessment", outcome: "Passed", reason: "ALL_REQUIREMENTS_MET", scorePercent: 80, rubricHash: null, criteria: null, metrics: {}, lastEventSequence: 1, createdAt: at(12) } });
    await openDetail(page, ids.passed);
    await expect(page.getByRole("dialog").getByRole("status").filter({ hasText: "Đang tải kết quả lượt tập…" })).toBeVisible();
    await page.evaluate((id) => (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push(`/learning-hub?view=history&session=${id}`), ids.notPassed);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("detail-result-status")).toContainText("Chưa đạt");
    await expect(drawer.getByTestId("result-score")).toContainText("35,5%");
    await page.waitForTimeout(1500);
    await expect(drawer.getByTestId("result-score")).toContainText("35,5%");
    // Foreign id next: the previous learner-owned data must be gone while it loads and after it answers 404.
    await page.evaluate((id) => (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push(`/learning-hub?view=history&session=${id}`), ids.foreign);
    await expect(drawer.getByText("Không tìm thấy lượt tập này")).toBeVisible();
    await expect(drawer.getByTestId("result-score")).toHaveCount(0);
    await expect(drawer).not.toContainText("35,5%");
  });

  test("keyboard: the drawer traps focus, Escape closes it and focus returns to the row button that opened it", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    const opener = row(page, ids.notPassed).getByRole("button", { name: /Xem chi tiết/ });
    await opener.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("result-outcome")).toBeVisible();
    for (let index = 0; index < 14; index += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), `tab ${index}`).toBe(true);
    }
    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page).not.toHaveURL(/session=/);
    await expect(opener).toBeFocused();
  });
});

test.describe("hub integration", () => {
  test("Lịch sử and Hỏi đáp are both real views", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend, "/learning-hub?view=history");
    await expect(page.getByRole("link", { name: /^Hỏi đáp/ })).not.toContainText(/chưa khả dụng/i);
    await expect(page.getByRole("link", { name: /^Lịch sử/ })).not.toContainText(/chưa khả dụng/i);
    await page.getByRole("link", { name: /^Lịch sử/ }).click();
    await expect(page).toHaveURL(/view=history/);
    await expect(page.getByTestId("capability-unavailable")).toHaveCount(0);
    await expect(rows(page)).toHaveCount(10);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("prototype") || key.includes("demo")))).toEqual([]);
  });

  test("an organization account is pointed to its own area and no history request is sent; a guest must sign in", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend, "/learning-hub?view=history", "org");
    await expect(page.getByText("Lịch sử lượt tập dành cho tài khoản học viên")).toBeVisible();
    expect(backend.lists()).toHaveLength(0);
    const guest = await page.context().newPage();
    const guestBackend = new TrainingBackend();
    await signInAs(guest, guestBackend, "guest");
    await installTrainingBackend(guest, guestBackend);
    await guest.goto("/learning-hub?view=history");
    await expect(guest.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
    expect(guestBackend.lists()).toHaveLength(0);
  });

  test("the requests carry the learner's bearer token and never another user's id", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    await start(page, backend);
    await expect(rows(page)).toHaveCount(10);
    await openDetail(page, ids.passed);
    await expect(page.getByRole("dialog").getByTestId("result-score")).toBeVisible();
    for (const call of backend.calls) expect(call.headers.authorization, call.path).toBe("Bearer history-access");
    expect(backend.calls.every((call) => !call.search.includes(learner.id))).toBe(true);
  });
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 667 }]) {
  for (const scheme of ["dark", "light"] as const) {
    test(`list and detail fit ${viewport.width}px (${scheme}), targets are at least 44px and nothing overflows`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      const backend = new TrainingBackend();
      seedMix(backend);
      await start(page, backend);
      await expect(rows(page)).toHaveCount(10);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      for (const control of [page.getByLabel("Chế độ"), page.getByLabel("Từ ngày"), row(page, ids.passed).getByRole("button", { name: /Xem chi tiết/ }), page.getByRole("button", { name: "Trang sau" })]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
      }
      await page.screenshot({ path: shotPath(testInfo, `history-${viewport.width}-${scheme}.png`), fullPage: true });
      await openDetail(page, ids.passed);
      const drawer = page.getByRole("dialog");
      await expect(drawer.getByTestId("criterion")).toHaveCount(4);
      const box = (await drawer.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: shotPath(testInfo, `detail-${viewport.width}-${scheme}.png`) });
    });
  }
}

test.describe("v7 contract details", () => {
  test("the Building filter comes from /api/training/buildings, including Buildings older than the latest sessions", async ({ page }) => {
    const backend = new TrainingBackend();
    seedMix(backend);
    // 120 newer sessions in one Building would push Hoa Sen out of a "latest 100 sessions" sample.
    for (let n = 0; n < 120; n += 1) backend.add({ status: "Completed", mode: "Learn", startedAt: `2026-10-20T${String(n % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00Z`, building: ANH_DUONG, training: `Bài ${n}`, result: { outcome: "NotAssessed", reason: "MODE_NOT_ASSESSED", scorePercent: null, criteria: null, metrics: {} } });
    await start(page, backend);
    await expect(page.getByLabel("Building").locator("option", { hasText: HOA_SEN })).toHaveCount(1);
    await expect(page.getByLabel("Building").locator("option", { hasText: ANH_DUONG })).toHaveCount(1);
    expect(backend.callsTo("GET", /^\/api\/training\/buildings$/).length).toBeGreaterThan(0);
    // The filter options no longer come from a 100-session read of the history list.
    expect(backend.lists().some((call) => call.params.get("pageSize") === "100")).toBe(false);
  });

  test("an Assessment result shows the pass threshold and the author's criterion label", async ({ page }) => {
    const backend = new TrainingBackend();
    backend.add({ id: ids.passed, status: "Completed", mode: "Assessment", startedAt: at(12, 9), endedAt: at(12, 10), endReason: "Finished", training: "Sơ tán tầng 3", result: { outcome: "Passed", reason: "ALL_REQUIREMENTS_MET", scorePercent: 80, criteria: criteriaFixture().map((criterion, index) => (index === 0 ? { ...criterion, label: "Thoát ra ngoài an toàn", description: "Tới lối ra cuối cùng trước khi hết giờ." } : criterion)), metrics: metricsFixture }, resultCreatedAt: at(12, 10) });
    await start(page, backend);
    await openDetail(page, ids.passed);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("result-threshold")).toContainText("70");
    await expect(drawer.getByTestId("criterion-label").first()).toHaveText("Thoát ra ngoài an toàn");
    await expect(drawer.getByTestId("criterion").first()).toContainText("Tới lối ra cuối cùng trước khi hết giờ.");
  });
});
