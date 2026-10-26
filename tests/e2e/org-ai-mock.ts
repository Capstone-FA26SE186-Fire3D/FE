import type { Page, Route } from "@playwright/test";

import { BUILDING_ID, REVISION_ID, SCENARIO_ID } from "../fixtures/scenario-editor/fixture-building";
import { ARTIFACT_ID, GEOMETRY_HASH } from "../fixtures/scenario-editor/v1-fixtures";

/**
 * Stateful route mock of the AI endpoints (BE `docs/organization-ai.md`, OpenAPI `AiRequestView`, Docs v7 vocabulary since
 * BE#89: status Accepted|Processing|Succeeded|Failed|NeedsReconcile, resultType once Succeeded, result.status). It keeps state
 * the way the server does (requests, idempotency receipts, quota, policies, knowledge sources with revisions) so a reload
 * proves recovery from "server" data. Mock evidence only, never evidence against the real API.
 */
export const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };
export const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };

export const ids = {
  src1: "aaaaaaaa-0000-4000-8000-000000000001",
  src2: "aaaaaaaa-0000-4000-8000-000000000002",
  lib1: "aaaaaaaa-0000-4000-8000-000000000003",
  learn1: "aaaaaaaa-0000-4000-8000-000000000004",
  grant: "bbbbbbbb-0000-4000-8000-000000000001",
  policy: "cccccccc-0000-4000-8000-000000000001",
};
export const requestId = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

type Rec = Record<string, unknown>;
/** Scripted end of a request: "Succeeded" is the normal answer/draft; the next two succeed without content. */
export type Outcome = "Succeeded" | "InsufficientEvidence" | "RejectedBySafetyGate" | "Failed" | "NeedsReconcile";

/** Pre-v7 status names: the BE list filters answer 400 for them. */
const LEGACY_STATUSES = ["Queued", "Running", "SafetyRejected", "InsufficientEvidence"];

export type Call = { method: string; path: string; search: string; headers: Record<string, string>; body: unknown };

export type AiMock = {
  calls: Call[];
  sources: Rec[];
  quota: { units: Rec[] };
  /** Replaces the computed `GET /api/ai/organization/limits` items (e.g. a policy that is not active). */
  limits?: Rec[];
  /** Scripted result per operation. */
  outcome: { Answer: Outcome; ScenarioDraft: Outcome };
  /** How many GETs of a new request still answer Accepted before the final state (polling proof). */
  pendingPolls: number;
  /** Queue for the next POST submits: the server stores the request and the response is lost, or the call never arrives. */
  submitFaults: Array<"lost-response" | "never-arrives" | "status-503" | "status-429" | { status: number; json: Rec; headers?: Record<string, string> }>;
  /** Replaces `GET /api/ai/requests/{id}` answers once (e.g. 429 with Retry-After). */
  getFaults: Array<{ status: number; json?: Rec; headers?: Record<string, string> }>;
  requests: Rec[];
  receipts: Map<string, { hash: string; requestId: string }>;
  adminReceipts: Map<string, { requestId: string }>;
  draftState: Rec;
  policies: Rec[];
  knowledge: Rec[];
  orgs: Rec[];
  /** Knowledge-source writes bump the revision; a test can pre-bump to force 412. */
  buildings: Rec[];
  /** `GET /api/buildings/{id}/revisions` items (status ReadyForScenario/ConfirmedForTraining are draft-eligible). */
  revisions?: Rec[];
  scenarios: Rec[];
  counter: number;
};

export const noLink = { learnSlug: null, learnPostId: null, libraryItemId: null, sourceUri: null };

/** `AiCitationView`: title, version and link resolved by the BE from the pin. */
export function citationsFor() {
  return [{ kind: "KnowledgeSource", id: ids.src1, versionId: ids.src1, title: "QCVN 06:2022/BXD", versionLabel: "2022", chunkId: "c-1", locator: "Điều 3", relevance: 0.82, link: { ...noLink, sourceUri: "https://example.gov.vn/qcvn-06" } }];
}

export function pinnedSources() {
  return [{ kind: "KnowledgeSource", id: ids.src1, versionId: ids.src1, title: "QCVN 06:2022/BXD", versionLabel: "2022", contentHash: "a".repeat(64), link: { ...noLink, sourceUri: "https://example.gov.vn/qcvn-06" } }];
}

/** Limits the BE computes per operation: reserve 50 against the pooled `available` of the mock quota. */
export function limitsFor(mock: AiMock): Rec[] {
  if (mock.limits) return mock.limits;
  const available = mock.quota.units.reduce((sum, unit) => sum + Number(unit.available ?? 0), 0);
  return ["Answer", "ScenarioDraft"].map((operation) => ({ operation, policyActive: true, quotaUnit: "tokens", estimatedReserve: 50, maxInputChars: 4000, maxSources: 20, availableUnits: available, canSubmit: available >= 50 }));
}

/** A complete `fet3d.editor/1` proposal pinned to the Geometry of the editor test building. */
export function proposalState(): Rec {
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  return {
    schemaVersion: "fet3d.editor/1",
    name: "Sơ tán do báo cháy tầng 2",
    geometry: { artifactId: ARTIFACT_ID, sha256Hash: GEOMETRY_HASH },
    runtimeVersion: "1.4.0",
    timeLimitSeconds: 480,
    modePolicy: { allowedModes: ["Learn", "Guided"] },
    learningObjectives: ["Nhận biết tín hiệu báo cháy", "Chọn lối thoát gần nhất"],
    learnerInstructions: "Rời tòa nhà theo lối thoát hiểm gần nhất.",
    rubric: { schema_version: "1", pass_threshold: 0.8, criteria: [{ id: "reached-exit", metric: "reached_exit", mandatory: true, weight: 1, operator: "eq", threshold: 1 }] },
    objects: [
      { id: "ai-spawn-1", kind: "Spawn", label: "Phòng học 201", placement: { floorId: "L2", position: { x: 2, y: 0, z: 3 }, rotation } },
      { id: "ai-goal-1", kind: "Goal", anchorId: "1hOSvn6df7F8_7GcBWlRGQ", placement: { floorId: "L1", position: { x: 5, y: 0, z: 1 }, rotation } },
      { id: "ai-spawn-9", kind: "Spawn", placement: { floorId: "L9", position: { x: 1, y: 0, z: 1 }, rotation } },
    ],
  };
}

export function newAiMock(overrides: Partial<AiMock> = {}): AiMock {
  return {
    calls: [],
    sources: [
      { kind: "KnowledgeSource", id: ids.src1, versionId: ids.src1, title: "QCVN 06:2022/BXD", versionLabel: "2022" },
      { kind: "KnowledgeSource", id: ids.src2, versionId: ids.src2, title: "TCVN 3890:2023", versionLabel: "2023" },
      { kind: "LibraryVersion", id: ids.lib1, versionId: ids.lib1, title: "EXT-01 Bình chữa cháy", versionLabel: "v2" },
      { kind: "LearnPost", id: ids.learn1, versionId: "eeeeeeee-0000-4000-8000-000000000001", title: "Cách dùng bình chữa cháy", versionLabel: "v3" },
    ],
    quota: { units: [{ quotaUnit: "tokens", granted: 1000, reserved: 0, consumed: 100, expired: 0, available: 900, scheduled: 0 }] },
    outcome: { Answer: "Succeeded", ScenarioDraft: "Succeeded" },
    pendingPolls: 1,
    submitFaults: [],
    getFaults: [],
    requests: [],
    receipts: new Map(),
    adminReceipts: new Map(),
    draftState: proposalState(),
    policies: [{ id: ids.policy, operation: "Answer", quotaUnit: "tokens", reserveUnits: 50, maxInputChars: 4000, maxSources: 20, effectiveFrom: iso(-60 * 24 * 30), effectiveUntil: null, createdAt: iso(-60 * 24 * 30) }],
    knowledge: [
      { id: ids.src1, visibility: "Common", organizationId: null, title: "QCVN 06:2022/BXD", sourceUri: "https://example.gov.vn/qcvn-06", versionLabel: "2022", sourceHash: "a".repeat(64), jurisdiction: "VN", effectiveFrom: null, effectiveUntil: null, approvalStatus: "Approved", approvedAt: iso(-1000), createdAt: iso(-2000), revision: 2, canUseInDraft: true, canPublishReference: true },
      { id: ids.src2, visibility: "Common", organizationId: null, title: "TCVN 3890:2023", sourceUri: null, versionLabel: "2023", sourceHash: "b".repeat(64), jurisdiction: null, effectiveFrom: null, effectiveUntil: null, approvalStatus: "Draft", approvedAt: null, createdAt: iso(-1500), revision: 1, canUseInDraft: true, canPublishReference: false },
    ],
    orgs: [{ id: "org-1", name: "Trường Mẫu", isActive: true }, { id: "org-2", name: "Công ty B", isActive: true }],
    buildings: [{ id: BUILDING_ID, name: "Tòa nhà A", buildingType: "Trường học", totalFloors: 2, isActive: true, createdAt: iso(-5000) }],
    revisions: [{ id: REVISION_ID, buildingId: BUILDING_ID, versionLabel: "IFC rev. 01", status: "ReadyForScenario", createdAt: iso(-4500), sourceDocument: null }],
    scenarios: [{ id: SCENARIO_ID, buildingId: BUILDING_ID, name: "Thoát hiểm tầng một", createdAt: iso(-4000) }],
    counter: 0,
    ...overrides,
  };
}

export const calls = (mock: AiMock, method: string, path: string) => mock.calls.filter((call) => call.method === method && call.path === path);

/** Seeds a stored request as the server would hold it. */
export function seedRequest(mock: AiMock, partial: Rec = {}): Rec {
  mock.counter += 1;
  const operation = (partial.operation as "Answer" | "ScenarioDraft") ?? "Answer";
  const request: Rec = {
    requestId: requestId(mock.counter), operation, status: "Succeeded", quotaUnit: "tokens", reservedUnits: 50, consumedUnits: 42, sources: pinnedSources(),
    ...outcomeFields(mock, operation, "Succeeded"), createdAt: iso(-10 - mock.counter), completedAt: iso(-9 - mock.counter), revision: 3,
    organizationId: "org-1", actorUserId: "owner", policyId: ids.policy, attempts: 1, updatedAt: iso(-9),
    ...partial,
  };
  mock.requests.unshift(request);
  return request;
}

/** `status`, `resultType`, `result` and top-level `citations` of a Succeeded request, as `AiRequestView` returns them. */
export function outcomeFields(mock: AiMock, operation: "Answer" | "ScenarioDraft", outcome: Outcome): Rec {
  if (outcome === "Succeeded") {
    return operation === "Answer"
      ? { status: "Succeeded", resultType: "KnowledgeAnswer", citations: citationsFor(), result: { status: "Answered", answer: "Lối thoát nạn phải đảm bảo chiều rộng thông thủy tối thiểu theo quy chuẩn.\nXem Điều 3." } }
      : { status: "Succeeded", resultType: "ScenarioDraft", citations: citationsFor(), result: { status: "NeedsUserEdit", draft: { state: mock.draftState, notes: "Cần kiểm tra lại vị trí các điểm xuất phát." } } };
  }
  if (outcome === "InsufficientEvidence") return { status: "Succeeded", resultType: outcome, citations: [], result: { status: outcome, message: "Các nguồn đã chọn chưa nêu yêu cầu này." } };
  if (outcome === "RejectedBySafetyGate") return { status: "Succeeded", resultType: outcome, citations: [], result: { status: outcome, message: "Nội dung bị chặn bởi cổng an toàn." } };
  return { status: outcome, resultType: null, citations: [], result: null };
}

function finalize(mock: AiMock, request: Rec) {
  const operation = request.operation as "Answer" | "ScenarioDraft";
  const outcome = mock.outcome[operation];
  if (outcome === "Failed") Object.assign(request, { status: "Failed", failureCode: "AI_PROVIDER_REJECTED", completedAt: iso(0), consumedUnits: undefined, revision: 3 });
  else if (outcome === "NeedsReconcile") Object.assign(request, { status: "NeedsReconcile", failureCode: "AI_OUTCOME_UNKNOWN", consumedUnits: undefined, revision: 3 });
  else Object.assign(request, { ...outcomeFields(mock, operation, outcome), completedAt: iso(0), consumedUnits: outcome === "Succeeded" ? 42 : 0, revision: 3 });
}

const strip = (request: Rec, admin: boolean): Rec => {
  const copy: Rec = { ...request };
  delete copy.polls;
  delete copy.reconcileReads;
  // resultType exists only once Succeeded (a seed may override status alone).
  if (copy.status !== "Succeeded") copy.resultType = null;
  else if (!copy.resultType) copy.resultType = copy.operation === "ScenarioDraft" ? "ScenarioDraft" : "KnowledgeAnswer";
  if (!admin) for (const key of ["organizationId", "actorUserId", "policyId", "attempts", "reconcileRequestedAt", "providerResult", "updatedAt", "allocations"]) delete copy[key];
  for (const key of Object.keys(copy)) if (copy[key] === undefined) delete copy[key];
  return copy;
};

const problem = (route: Route, status: number, code: string, title: string, extra: Rec = {}, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: "application/problem+json", headers, body: JSON.stringify({ status, title, code, ...extra }) });

const lowered = (headers: Record<string, string>) => Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

export async function signInAs(page: Page, user: typeof owner | typeof admin) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ai-access", refreshToken: "ai-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

function page_(url: URL, items: Rec[], mapper: (item: Rec) => Rec = (item) => item) {
  const page = Number(url.searchParams.get("page") ?? 1);
  const size = Number(url.searchParams.get("pageSize") ?? 20);
  return { items: items.slice((page - 1) * size, page * size).map(mapper), total: items.length, page, pageSize: size };
}

export async function mockAi(page: Page, mock: AiMock) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const relevant = /^\/api\/(ai|admin\/ai|admin\/knowledge-sources|organizations\/me\/ai-quota|organizations$|buildings)/.test(path);
    if (!relevant) return route.fallback();
    const headers = lowered(request.headers());
    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = undefined; }
    mock.calls.push({ method, path, search: url.search, headers, body });

    // ───── organization ─────
    if (method === "GET" && path === "/api/organizations/me/ai-quota") return route.fulfill({ json: { organizationId: "org-1", asOf: iso(0), units: mock.quota.units } });
    if (method === "GET" && path === "/api/ai/organization/sources") return route.fulfill({ json: { items: mock.sources } });
    if (method === "GET" && path === "/api/ai/organization/limits") return route.fulfill({ json: { items: limitsFor(mock) } });
    const revisions = /^\/api\/buildings\/([^/]+)\/revisions$/.exec(path);
    if (method === "GET" && revisions && mock.revisions) {
      const items = (mock.revisions ?? []).filter((revision) => revision.buildingId === revisions[1]);
      return route.fulfill({ json: { items, totalCount: items.length, page: 1, pageSize: 50 } });
    }
    if (method === "GET" && path === "/api/buildings") return route.fulfill({ json: { items: mock.buildings, totalCount: mock.buildings.length, page: 1, pageSize: 100 } });
    if (method === "GET" && new RegExp(`^/api/buildings/${BUILDING_ID}/scenarios$`).test(path)) return route.fulfill({ json: { items: mock.scenarios, totalCount: mock.scenarios.length, page: 1, pageSize: 100 } });
    if (!/^\/api\/(ai|admin|organizations)/.test(path)) return route.fallback();

    if (method === "POST" && (path === "/api/ai/organization/answer" || path === "/api/ai/organization/scenario-draft")) {
      const operation = path.endsWith("answer") ? "Answer" : "ScenarioDraft";
      const key = headers["idempotency-key"];
      if (!key) return problem(route, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
      const fault = mock.submitFaults.shift();
      if (fault === "never-arrives") return route.abort("connectionreset");
      if (fault === "status-503") return problem(route, 503, "AI_PROVIDER_UNAVAILABLE", "The AI service is not configured.");
      if (fault === "status-429") return problem(route, 429, "RATE_LIMITED", "Too many requests.", {}, { "Retry-After": "7" });
      if (fault && typeof fault === "object") return route.fulfill({ status: fault.status, contentType: "application/problem+json", headers: fault.headers, body: JSON.stringify(fault.json) });
      const hash = JSON.stringify({ operation, body });
      const receipt = mock.receipts.get(key);
      let stored: Rec | undefined;
      if (receipt) {
        if (receipt.hash !== hash) return problem(route, 409, "IDEMPOTENCY_KEY_CONFLICT", "The Idempotency-Key was used with a different request.");
        stored = mock.requests.find((item) => item.requestId === receipt.requestId);
      } else {
        const exhausted = mock.quota.units.every((unit) => (unit.available as number) <= 0);
        if (exhausted) return problem(route, 409, "AI_QUOTA_EXHAUSTED", "Not enough AI quota.");
        mock.counter += 1;
        const input = (body ?? {}) as { question?: string; prompt?: string; buildingId?: string; revisionId?: string; sources?: Array<{ kind: string; id: string }> };
        if (operation === "ScenarioDraft") {
          const eligible = (mock.revisions ?? []).filter((revision) => revision.buildingId === input.buildingId && ["ReadyForScenario", "ConfirmedForTraining"].includes(String(revision.status)));
          if (mock.revisions && (input.revisionId ? !eligible.some((revision) => revision.id === input.revisionId) : eligible.length === 0)) return problem(route, 409, "AI_REVISION_NOT_READY", "No revision with accepted geometry.");
        }
        const building = mock.buildings.find((item) => item.id === input.buildingId);
        stored = {
          requestId: requestId(mock.counter), audience: "organization", operation, status: "Accepted", resultType: null, citations: [], quotaUnit: "tokens", reservedUnits: 50,
          input: { text: input.question ?? input.prompt ?? "", inputHash: "f".repeat(64), buildingId: input.buildingId ?? null, buildingName: building?.name ?? null, revisionId: input.revisionId ?? null, requestedSources: input.sources ?? [], context: null },
          sources: input.sources?.length ? pinnedSources().filter((source) => input.sources!.some((ref) => ref.id === source.id)) : pinnedSources(),
          createdAt: iso(0), revision: 1, organizationId: "org-1", actorUserId: "owner", policyId: ids.policy, attempts: 0, updatedAt: iso(0), polls: 0,
        };
        mock.requests.unshift(stored);
        mock.receipts.set(key, { hash, requestId: stored.requestId as string });
      }
      if (fault === "lost-response") return route.abort("timedout");
      return route.fulfill({ status: 202, headers: { Location: `/api/ai/requests/${stored!.requestId}` }, json: strip(stored!, false) });
    }

    if (method === "GET" && path === "/api/ai/requests") {
      const status = url.searchParams.get("status");
      const resultType = url.searchParams.get("resultType");
      const operation = url.searchParams.get("operation");
      const mine = url.searchParams.get("mine") === "true";
      if (status && LEGACY_STATUSES.includes(status)) return problem(route, 400, "VALIDATION_ERROR", "Unknown status.");
      const items = mock.requests.filter((item) => (!status || item.status === status) && (!resultType || (item.status === "Succeeded" && item.resultType === resultType)) && (!operation || item.operation === operation) && (!mine || item.actorUserId === "owner"));
      return route.fulfill({ json: page_(url, items, (item) => strip(item, false)) });
    }
    const orgGet = /^\/api\/ai\/requests\/([0-9a-f-]{36})$/.exec(path);
    if (method === "GET" && orgGet) {
      const fault = mock.getFaults.shift();
      if (fault) return route.fulfill({ status: fault.status, contentType: "application/problem+json", headers: fault.headers, body: JSON.stringify(fault.json ?? { status: fault.status, title: "x" }) });
      const found = mock.requests.find((item) => item.requestId === orgGet[1]);
      if (!found || found.organizationId !== "org-1") return problem(route, 404, "NOT_FOUND", "Not found.");
      if (found.status === "Accepted" || found.status === "Processing") {
        found.polls = ((found.polls as number) ?? 0) + 1;
        if ((found.polls as number) > mock.pendingPolls) finalize(mock, found);
      }
      return route.fulfill({ json: strip(found, false) });
    }

    // ───── admin ─────
    if (method === "GET" && path === "/api/organizations") return route.fulfill({ json: { items: mock.orgs, totalCount: mock.orgs.length, page: 1, pageSize: 100 } });
    if (method === "GET" && path === "/api/admin/ai/requests") {
      const status = url.searchParams.get("status");
      const org = url.searchParams.get("organizationId");
      const operation = url.searchParams.get("operation");
      const audience = url.searchParams.get("audience");
      if (status && LEGACY_STATUSES.includes(status)) return problem(route, 400, "VALIDATION_ERROR", "Unknown status.");
      if (operation && !["Answer", "ScenarioDraft", "TraineeAnswer"].includes(operation)) return problem(route, 400, "VALIDATION_ERROR", "Unknown operation.");
      if (audience && !["organization", "trainee"].includes(audience)) return problem(route, 400, "VALIDATION_ERROR", "Unknown audience.");
      const items = mock.requests.filter((item) => (!status || item.status === status) && (!org || item.organizationId === org) && (!operation || item.operation === operation) && (!audience || (item.audience ?? "organization") === audience));
      return route.fulfill({ json: page_(url, items, (item) => strip(item, true)) });
    }
    const adminGet = /^\/api\/admin\/ai\/requests\/([0-9a-f-]{36})$/.exec(path);
    if (method === "GET" && adminGet) {
      const found = mock.requests.find((item) => item.requestId === adminGet[1]);
      if (!found) return problem(route, 404, "NOT_FOUND", "Not found.");
      // After a reconcile the worker looks the id up at the provider: the next reads show the settled request.
      if (found.status === "NeedsReconcile" && found.reconcileRequestedAt && ((found.reconcileReads as number) ?? 0) >= 1) {
        Object.assign(found, { ...outcomeFields(mock, found.operation as "Answer" | "ScenarioDraft", "Succeeded"), failureCode: undefined, consumedUnits: 42, completedAt: iso(0), providerResult: undefined });
      } else if (found.reconcileRequestedAt) found.reconcileReads = ((found.reconcileReads as number) ?? 0) + 1;
      return route.fulfill({ json: strip(found, true) });
    }
    const reconcile = /^\/api\/admin\/ai\/requests\/([0-9a-f-]{36})\/reconcile$/.exec(path);
    if (method === "POST" && reconcile) {
      const key = headers["idempotency-key"];
      if (!key) return problem(route, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
      const fault = mock.submitFaults.shift();
      if (fault === "never-arrives") return route.abort("connectionreset");
      const replay = mock.adminReceipts.get(key);
      const found = mock.requests.find((item) => item.requestId === reconcile[1]);
      if (!found) return problem(route, 404, "NOT_FOUND", "Not found.");
      if (replay) return route.fulfill({ status: 202, json: strip(found, true) });
      if (found.status !== "NeedsReconcile") return problem(route, 409, "AI_RECONCILE_NOT_ALLOWED", "Only a NeedsReconcile request can be reconciled.");
      found.reconcileRequestedAt = found.reconcileRequestedAt ?? iso(0);
      mock.adminReceipts.set(key, { requestId: found.requestId as string });
      if (fault === "lost-response") return route.abort("timedout");
      return route.fulfill({ status: 202, json: strip(found, true) });
    }
    if (method === "GET" && path === "/api/admin/ai/policies") {
      const operation = url.searchParams.get("operation");
      return route.fulfill({ json: page_(url, mock.policies.filter((item) => !operation || item.operation === operation)) });
    }
    const endPolicy = /^\/api\/admin\/ai\/policies\/([^/]+)\/end$/.exec(path);
    if (method === "POST" && endPolicy) {
      const key = headers["idempotency-key"];
      if (!key) return problem(route, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
      const policy = mock.policies.find((item) => item.id === endPolicy[1]);
      if (!policy) return problem(route, 404, "NOT_FOUND", "Policy not found.");
      if (mock.adminReceipts.get(`end:${key}`)) return route.fulfill({ json: policy });
      if (policy.effectiveUntil && new Date(policy.effectiveUntil as string).getTime() <= Date.now()) return problem(route, 409, "AI_POLICY_ENDED", "The policy has already ended.");
      const until = (body as Rec | undefined)?.effectiveUntil as string | undefined;
      if (until && new Date(until).getTime() <= Date.now()) return problem(route, 422, "AI_POLICY_END_INVALID", "effectiveUntil must not be in the past.");
      policy.effectiveUntil = until ?? iso(0);
      mock.adminReceipts.set(`end:${key}`, { requestId: policy.id as string });
      return route.fulfill({ json: policy });
    }
    if (method === "POST" && path === "/api/admin/ai/policies") {
      const key = headers["idempotency-key"];
      if (!key) return problem(route, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
      const input = body as Rec;
      const replay = mock.adminReceipts.get(`policy:${key}`);
      if (replay) return route.fulfill({ status: 201, json: mock.policies.find((item) => item.id === replay.requestId) });
      const from = input.effectiveFrom ? new Date(input.effectiveFrom as string).getTime() : Date.now();
      const until = input.effectiveUntil ? new Date(input.effectiveUntil as string).getTime() : Infinity;
      const overlap = mock.policies.some((item) => item.operation === input.operation && from < (item.effectiveUntil ? new Date(item.effectiveUntil as string).getTime() : Infinity) && new Date(item.effectiveFrom as string).getTime() < until);
      if (!["tokens", "requests"].includes(String(input.quotaUnit))) return problem(route, 422, "AI_QUOTA_UNIT_UNSUPPORTED", "Use tokens or requests.");
      if (overlap) return problem(route, 409, "AI_POLICY_OVERLAP", "Policy periods overlap.");
      if (input.operation === "TraineeAnswer" && !(Number(input.dailyUnits) >= Number(input.reserveUnits))) return problem(route, 422, "CONTENT_INVALID", "Invalid policy.", { issues: [{ code: "FIELD_INVALID", path: "$.dailyUnits", message: "dailyUnits is required for TraineeAnswer." }], errors: { dailyUnits: ["dailyUnits is required for TraineeAnswer."] } });
      const created = { id: `cccccccc-0000-4000-8000-${String(mock.policies.length + 10).padStart(12, "0")}`, operation: input.operation, quotaUnit: input.quotaUnit, reserveUnits: input.reserveUnits, maxInputChars: input.maxInputChars, maxSources: input.maxSources, dailyUnits: input.operation === "TraineeAnswer" ? input.dailyUnits : null, effectiveFrom: input.effectiveFrom ?? iso(0), effectiveUntil: input.effectiveUntil ?? null, createdAt: iso(0) };
      mock.policies.unshift(created);
      mock.adminReceipts.set(`policy:${key}`, { requestId: created.id as string });
      return route.fulfill({ status: 201, json: created });
    }
    if (method === "GET" && path === "/api/admin/knowledge-sources") {
      const status = url.searchParams.get("status");
      const visibility = url.searchParams.get("visibility");
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const items = mock.knowledge.filter((item) => (!status || item.approvalStatus === status) && (!visibility || item.visibility === visibility) && (!search || String(item.title).toLowerCase().includes(search)));
      return route.fulfill({ json: page_(url, items) });
    }
    if (method === "POST" && path === "/api/admin/knowledge-sources") {
      const key = headers["idempotency-key"];
      if (!key) return problem(route, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
      const input = body as Rec;
      const replay = mock.adminReceipts.get(`source:${key}`);
      if (replay) return route.fulfill({ status: 201, json: mock.knowledge.find((item) => item.id === replay.requestId) });
      const created = { id: `aaaaaaaa-0000-4000-8000-${String(mock.knowledge.length + 20).padStart(12, "0")}`, visibility: input.visibility, organizationId: input.organizationId ?? null, title: input.title, sourceUri: input.sourceUri ?? null, versionLabel: input.versionLabel, sourceHash: input.sourceHash, jurisdiction: input.jurisdiction ?? null, effectiveFrom: input.effectiveFrom ?? null, effectiveUntil: input.effectiveUntil ?? null, approvalStatus: "Draft", approvedAt: null, createdAt: iso(0), revision: 1, canUseInDraft: input.visibility === "Common", canPublishReference: false };
      mock.knowledge.unshift(created);
      mock.adminReceipts.set(`source:${key}`, { requestId: created.id as string });
      return route.fulfill({ status: 201, json: created });
    }
    const source = /^\/api\/admin\/knowledge-sources\/([0-9a-f-]{36})(?:\/(approve|retire))?$/.exec(path);
    if (source) {
      const found = mock.knowledge.find((item) => item.id === source[1]);
      if (!found) return problem(route, 404, "NOT_FOUND", "Not found.");
      if (method === "GET" && !source[2]) return route.fulfill({ json: found, headers: { ETag: `"${found.revision}"` } });
      if (method === "POST" && source[2]) {
        const ifMatch = headers["if-match"];
        if (!ifMatch) return problem(route, 428, "PRECONDITION_REQUIRED", "If-Match is required.");
        if (ifMatch !== `"${found.revision}"`) return problem(route, 412, "PRECONDITION_FAILED", "The source changed.");
        if (source[2] === "approve" && found.approvalStatus !== "Draft" || source[2] === "retire" && found.approvalStatus !== "Approved") return problem(route, 409, "KNOWLEDGE_SOURCE_STATE_CONFLICT", "State conflict.");
        found.approvalStatus = source[2] === "approve" ? "Approved" : "Retired";
        if (source[2] === "approve") { found.approvedAt = iso(0); found.canPublishReference = found.visibility === "Common"; } else found.canPublishReference = false;
        found.revision = (found.revision as number) + 1;
        return route.fulfill({ json: found, headers: { ETag: `"${found.revision}"` } });
      }
    }
    return route.fallback();
  });
}

export async function seedWide(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
}
