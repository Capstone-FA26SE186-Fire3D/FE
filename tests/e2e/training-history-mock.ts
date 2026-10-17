import type { Page, Route } from "@playwright/test";

/*
 * Stateful MOCK of the Trainee training history (BE docs/learner-sessions.md, TrainingSessionsController,
 * LearnerSessionList.sql, LearnerSessions.sql @633bba4). It keeps sessions per owner so a reload "recovers from the
 * server", filters/sorts/pages like learner_session_list_gate, hides other learners' sessions behind 404 and answers
 * RESULT_NOT_READY (409) until a result is stored. It is mock evidence only: nothing here proves the deployed API.
 */

export const learner = { id: "learner", email: "learner@fire3d.test", fullName: "Học viên", role: 2, organizationId: null };
export const orgOwner = { id: "org-owner", email: "owner@fire3d.test", fullName: "Chủ tổ chức", role: 1, organizationId: "org-1", profileRevision: 1 };
export type Actor = "trainee" | "org" | "guest";

export type Criterion = { id: string; metric: string; value: unknown; operator: string; threshold: number; mandatory: boolean; weight: number; passed: boolean; reason: string | null };
export type StoredResult = { outcome: string; reason: string; scorePercent: number | null; criteria: Criterion[] | null; metrics: Record<string, unknown>; mode?: string };

export type SessionSeed = {
  id?: string;
  owner?: string;
  /** Stored status; a Running session with `completionRequested` reads as AwaitingSync (as in the BE read model). */
  status: string;
  completionRequested?: boolean;
  mode: string;
  startedAt: string;
  endedAt?: string | null;
  endReason?: string | null;
  training?: string;
  scenario?: string;
  versionNumber?: number;
  building?: string;
  result?: StoredResult;
  resultCreatedAt?: string;
};

type Session = Required<Pick<SessionSeed, "id" | "owner" | "status" | "mode" | "startedAt">> & Omit<SessionSeed, "id" | "owner" | "status" | "mode" | "startedAt">;
type Reply = { status: number; json?: unknown; headers?: Record<string, string>; delayMs?: number };
export type Call = { method: string; path: string; search: string; params: URLSearchParams; headers: Record<string, string> };

const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const buildingIds: Record<string, string> = { "Trường Tiểu học Ánh Dương": "b1d00000-0000-4000-8000-000000000001", "Tòa nhà Hoa Sen": "b1d00000-0000-4000-8000-000000000002" };

export const statuses = ["Launching", "Running", "AwaitingSync", "Completed", "CompletedWithSupersededRelease", "ScenarioUnsurvivable", "Aborted", "Abandoned", "Crashed"];
/** The only `status` filter values the v7 list accepts (BE learner-sessions.md); other values answer 400. */
export const filterStatuses = ["Launching", "Running", "AwaitingSync", "Completed"];
const modes = ["Learn", "Guided", "Assessment"];

export class TrainingBackend {
  actor: Actor = "trainee";
  calls: Call[] = [];
  sessions: Session[] = [];
  private overrides: Array<{ method: string; pattern: RegExp; reply: Reply }> = [];
  private counter = 1;

  failNext(method: string, pattern: RegExp, reply: Reply) { this.overrides.push({ method, pattern, reply }); }
  takeOverride(method: string, path: string): Reply | undefined {
    const index = this.overrides.findIndex((item) => item.method === method && item.pattern.test(path));
    return index >= 0 ? this.overrides.splice(index, 1)[0].reply : undefined;
  }
  callsTo(method: string, pattern: RegExp) { return this.calls.filter((call) => call.method === method && pattern.test(call.path)); }
  lists() { return this.callsTo("GET", /^\/api\/training\/sessions$/); }
  /** Pass threshold returned with Assessment results (0–100). */
  passThresholdPercent: number | null = 70;

  add(seed: SessionSeed): Session {
    const session: Session = { owner: "learner", ...seed, id: seed.id ?? uuid("5e550000", this.counter++) };
    this.sessions.push(session);
    return session;
  }

  /** The stored result appears (the offline device synced): what a Tải lại then reads. */
  storeResult(id: string, result: StoredResult, at = "2026-10-12T09:30:00Z") {
    const session = this.sessions.find((item) => item.id === id)!;
    session.result = result;
    session.resultCreatedAt = at;
    session.status = "Completed";
    session.completionRequested = false;
    session.endedAt = at;
  }

  private state(session: Session) { return session.status === "Running" && session.completionRequested ? "AwaitingSync" : session.status; }

  private item(session: Session) {
    return {
      sessionId: session.id, status: this.state(session), mode: session.mode, resultStatus: session.result?.outcome ?? null, endReason: session.endReason ?? null,
      startedAt: session.startedAt, endedAt: session.endedAt ?? null, resultCreatedAt: session.resultCreatedAt ?? null,
      training: { id: uuid("7a000000", 1), name: session.training ?? "Sơ tán tầng 3" }, releaseId: uuid("4e1e0000", 1),
      building: { id: buildingIds[session.building ?? "Trường Tiểu học Ánh Dương"] ?? uuid("b1d00001", 9), name: session.building ?? "Trường Tiểu học Ánh Dương" },
      scenario: { id: uuid("5c000000", 1), versionId: uuid("5c0e0000", 1), name: session.scenario ?? "Cháy hành lang tầng 3", versionNumber: session.versionNumber ?? 2 },
    };
  }

  private problem(status: number, code: string, title: string, errors?: Record<string, string[]>, headers?: Record<string, string>): Reply {
    return { status, json: { title, status, code, errors }, headers };
  }

  private authFailure(): Reply | null {
    if (this.actor === "guest") return this.problem(401, "UNAUTHORIZED", "Sign in again.");
    if (this.actor !== "trainee") return this.problem(403, "FORBIDDEN", "Only Trainee accounts have a training history.");
    return null;
  }

  handle(method: string, path: string, params: URLSearchParams): Reply | null {
    if (method !== "GET") return null;
    if (path === "/api/training/buildings") {
      const denied = this.authFailure();
      if (denied) return denied;
      return this.buildings(params);
    }
    const match = /^\/api\/training\/sessions(?:\/([0-9a-fA-F-]{36}))?(\/result)?$/.exec(path);
    if (!match) return null;
    const denied = this.authFailure();
    if (denied) return denied;
    const [, id, result] = match;
    if (!id) return this.list(params);
    const session = this.sessions.find((item) => item.id === id.toLowerCase() && item.owner === "learner");
    if (!session) return this.problem(404, "NOT_FOUND", "Session not found.");
    if (result) {
      if (!session.result) return this.problem(409, "RESULT_NOT_READY", "Result is not ready.");
      const stored = session.result;
      const assessment = (stored.mode ?? session.mode) === "Assessment";
      return { status: 200, json: { sessionId: session.id, mode: stored.mode ?? session.mode, outcome: stored.outcome, reason: stored.reason, scorePercent: stored.scorePercent, passThresholdPercent: assessment ? this.passThresholdPercent : null, rubricHash: "a".repeat(64), criteria: stored.criteria, metrics: stored.metrics, lastEventSequence: 42, createdAt: session.resultCreatedAt } };
    }
    return { status: 200, json: { id: session.id, status: this.state(session), trainingId: uuid("7a000000", 1), releaseId: uuid("4e1e0000", 1), scenarioVersionId: uuid("5c0e0000", 1), buildingId: this.item(session).building.id, mode: session.mode, runtimeVersion: "1.0.0", scenarioHash: "b".repeat(64), rubricHash: null, package: {}, preparedAt: null, expiresAt: null, startedAt: session.startedAt, launchedAt: session.startedAt, endedAt: session.endedAt ?? null, lastHeartbeatAt: null, grant: null, launchSession: null, continuationExpiresAt: null, acknowledgedSequence: 0, completion: session.completionRequested || session.endReason ? { lastEventSequence: 5, endReason: session.endReason ?? "Finished", requestedAt: session.startedAt } : null, hasResult: !!session.result } };
  }

  private list(params: URLSearchParams): Reply {
    const errors: Record<string, string[]> = {};
    const status = params.get("status");
    const mode = params.get("mode");
    const from = params.get("from");
    const to = params.get("to");
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 20);
    const known = (value: string | null, allowed: string[]) => (value === null ? null : allowed.find((item) => item.toLowerCase() === value.trim().toLowerCase()) ?? undefined);
    const wantedStatus = known(status, filterStatuses);
    const wantedMode = known(mode, modes);
    if (wantedStatus === undefined) errors.status = [`status must be one of ${filterStatuses.join(", ")}.`];
    if (wantedMode === undefined) errors.mode = ["mode must be Learn, Guided or Assessment."];
    if (from && to && Date.parse(from) > Date.parse(to)) errors.from = ["from must not be later than to."];
    if (!(page >= 1)) errors.page = ["page must be at least 1."];
    if (!(pageSize >= 1 && pageSize <= 100)) errors.pageSize = ["pageSize must be 1-100."];
    if (Object.keys(errors).length) return this.problem(400, "VALIDATION_ERROR", "Training history filters are invalid.", errors);
    const buildingId = params.get("buildingId");
    const rows = this.sessions
      .filter((session) => session.owner === "learner")
      .filter((session) => (!wantedMode || session.mode === wantedMode) && (!buildingId || this.item(session).building.id === buildingId))
      .filter((session) => (!from || Date.parse(session.startedAt) >= Date.parse(from)) && (!to || Date.parse(session.startedAt) < Date.parse(to)))
      .filter((session) => !wantedStatus || this.state(session) === wantedStatus)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || (b.id < a.id ? -1 : 1));
    return { status: 200, json: { items: rows.slice((page - 1) * pageSize, page * pageSize).map((session) => this.item(session)), totalCount: rows.length, page, pageSize } };
  }

  /** `GET /api/training/buildings`: Buildings of the caller's own started sessions, most recent first. */
  private buildings(params: URLSearchParams): Reply {
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 20);
    if (!(page >= 1) || !(pageSize >= 1 && pageSize <= 100)) return this.problem(400, "VALIDATION_ERROR", "Invalid paging.");
    const byId = new Map<string, { id: string; name: string; sessionCount: number; lastSessionAt: string }>();
    for (const session of this.sessions.filter((item) => item.owner === "learner").sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
      const building = this.item(session).building;
      const entry = byId.get(building.id);
      if (entry) entry.sessionCount += 1;
      else byId.set(building.id, { id: building.id, name: building.name, sessionCount: 1, lastSessionAt: session.startedAt });
    }
    const items = [...byId.values()];
    return { status: 200, json: { items: items.slice((page - 1) * pageSize, page * pageSize), totalCount: items.length, page, pageSize } };
  }
}

/** Routes the training endpoints to the model; every other request falls through to other mocks. */
export async function installTrainingBackend(page: Page, backend: TrainingBackend) {
  await page.route("**/api/training/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = Object.fromEntries(Object.entries(request.headers()).map(([key, value]) => [key.toLowerCase(), value]));
    backend.calls.push({ method: request.method(), path: url.pathname, search: url.search, params: url.searchParams, headers });
    const forced = backend.takeOverride(request.method(), url.pathname);
    const reply = forced ?? backend.handle(request.method(), url.pathname, url.searchParams);
    if (!reply) return route.fallback();
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    return route.fulfill({ status: reply.status, json: reply.json, headers: reply.headers });
  });
}

/** Session for the hub: /api/auth/me answers for whoever the model currently is (guest = 401). */
export async function signInAs(page: Page, backend: TrainingBackend, actor: Actor) {
  backend.actor = actor;
  if (actor !== "guest") await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "history-access", refreshToken: "history-refresh" })));
  await page.route("**/api/auth/me", (route) => {
    const user = backend.actor === "trainee" ? learner : backend.actor === "org" ? orgOwner : null;
    return user ? route.fulfill({ json: user, headers: { ETag: '"1"' } }) : route.fulfill({ status: 401, body: "" });
  });
}

export const criteriaFixture = (): Criterion[] => [
  { id: "reach-exit", metric: "reached_exit", value: 1, operator: "eq", threshold: 1, mandatory: true, weight: 50, passed: true, reason: null },
  { id: "time-limit", metric: "completion_time_seconds", value: 95.5, operator: "lte", threshold: 120, mandatory: false, weight: 30, passed: true, reason: null },
  { id: "no-wrong-exit", metric: "wrong_exits", value: 3, operator: "lte", threshold: 1, mandatory: false, weight: 20, passed: false, reason: null },
  { id: "hazard", metric: "hazard_exposure", value: null, operator: "lte", threshold: 5, mandatory: false, weight: 10, passed: false, reason: "METRIC_UNAVAILABLE" },
];
export const metricsFixture = { reached_exit: 1, completion_time_seconds: 95.5, wrong_exits: 3, distance_meters: 184.25 };
