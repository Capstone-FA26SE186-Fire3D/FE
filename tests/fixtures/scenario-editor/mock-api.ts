import type { Page, Route } from "@playwright/test";

import { shapeIssues } from "../../../src/features/scenario-editor/v1/state";
import { stateHash } from "../../../src/features/scenario-editor/v1/hash";
import { BUILDING_ID, DRAFT_ID, GLB_URL, REVISION_ID, SCENARIO_ID, buildFixtureGlb, notReadyPreview, readyPreview } from "./fixture-building";
import { NEW_DRAFT_ID, RUBRIC_CATALOG, floorsResponse, reprocessPreview, v1Preview, type FloorsStatus } from "./v1-fixtures";

export const EDITOR_URL = `/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}?draft=${DRAFT_ID}`;
export const NEW_EDITOR_URL = `/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}?draft=${NEW_DRAFT_ID}`;

export const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };

export function sampleDraftState(): Record<string, unknown> {
  return {
    spawnPoints: [{ x: -6, y: 0.3, z: 2, rotation: 90 }],
    hazards: [
      { id: "hazard-1", type: "Fire", position: { x: 4, y: 0.3, z: -2, rotation: 0 }, intensity: 2, activationTime: 20 },
      { id: "hazard-2", type: "Smoke", position: { x: 0, y: 3.5, z: 1, rotation: 0 }, intensity: 1, activationTime: 60 },
    ],
    scoringConfig: { baseScore: 100, timeLimitSeconds: 300, penaltyPerMistake: 5 },
    routingConfig: { evacuationRoutes: ["Cầu thang bộ B xuống sảnh tầng 1"] },
    learningObjectives: ["Nhận biết lối thoát gần nhất"],
    learnerInstructions: "Di chuyển ra khỏi tòa nhà theo lối thoát hiểm.",
    rubric: { schema_version: "rubric-1", pass_threshold: 60, criteria: [{ id: "c1", metric: "evacuation_time", mandatory: true, weight: 1, threshold: 240, operator: "lte" }] },
    // Fields the editor does not edit: must come back byte-for-byte in every PUT.
    goals: [{ id: "goal-1", kind: "ExitZone", box: { min: [1, 2, 3], max: [4, 5, 6] } }],
    npcs: [{ id: "npc-1", route: ["a", "b"] }],
    blockedElements: [],
    modePolicy: { guided: { hints: true } },
    runtimeVersion: "1.0.0",
    requiredCapabilities: [],
  };
}

export type DraftStore = { version: number; state: Record<string, unknown> };
export type PutProblem = { status: number; body: Record<string, unknown> };

export type MockState = {
  version: number;
  state: Record<string, unknown>;
  puts: Array<{ body: Record<string, unknown>; ifMatch: string | undefined; draftId: string }>;
  putStatus: number[]; // queue: statuses to answer the next PUTs with (e.g. [412]); empty -> normal 204
  /** Queue of full problem answers for the next PUTs (422 with issues, 400 EDITOR_JSON_MALFORMED...). */
  putProblems: PutProblem[];
  /** Delay (ms) before a successful PUT answers, to edit while a save is in flight. */
  putDelayMs: number;
  /** v1 bodies refused by the mock the way the BE refuses them (shape check -> 422 EDITOR_SCHEMA_INVALID). */
  rejected: Array<{ body: Record<string, unknown>; issues: unknown }>;
  getCount: number;
  previewCalls: number;
  previewQueue: Array<"ready" | "not-ready" | "error">;
  /** What a "ready" preview looks like: the old hand-built metadata (default), versioned fet3d.editor/1, versioned but object not confirmed (NotReady with data), or ReprocessRequired. */
  previewKind: "legacy" | "v1" | "v1-no-url" | "reprocess";
  glbStatus: number[]; // queue for the GLB download
  glbCalls: number;
  validate: { isValid: boolean; issues: Array<{ code: string; path: string; message: string }> };
  validateCalls: number;
  /** `validate-state`: issues returned for the body that was sent. A function sees the body (so a test can answer per content). */
  validateState: { isValid?: boolean; issues: Array<{ code: string; path: string; message: string }> | ((body: Record<string, unknown>) => Array<{ code: string; path: string; message: string }>); delayMs?: number; hashOverride?: string; status?: number };
  validateStateCalls: Array<{ body: Record<string, unknown>; draftId: string }>;
  createDraftCalls: Array<{ key: string | undefined; body: unknown }>;
  stripEtagOnPut: boolean;
  expireFirstPreview: boolean;
  createDraftStatus: number[];
  /** Id returned by POST draft. DRAFT_ID (default) keeps the old single-draft tests; NEW_DRAFT_ID creates an empty `{}` draft like the BE. */
  createdDraftId: string;
  newDraft: DraftStore | null;
  floors?: unknown;
  floorsStatus: FloorsStatus | "error";
  floorsCalls: number;
  /** `GET /api/scenario-interactions/catalog` answer. Default: the old runtime row without capabilityContracts. */
  catalog: unknown;
  catalogCalls: number;
  /** `GET /api/scenario-rubrics/catalog` answer, or null for a 503. */
  rubricCatalog: unknown | null;
  /** Drafts the server lists for the scenario (newest save first). Empty -> the entry screen offers only "create". */
  drafts: Array<{ id: string; draftNumber: number; version: number; updatedAt: string; lastEditedByName: string | null; schemaVersion: string | null }>;
  /** `currentDraftId` reported on the scenario detail (BE#53). */
  currentDraftId: string | null;
  draftListCalls: number;
};

export function newMock(overrides: Partial<MockState> = {}): MockState {
  return {
    version: 51, state: sampleDraftState(), puts: [], putStatus: [], putProblems: [], putDelayMs: 0, rejected: [], getCount: 0, previewCalls: 0, previewQueue: [], previewKind: "legacy", glbStatus: [], glbCalls: 0,
    validate: { isValid: true, issues: [] }, validateCalls: 0, validateState: { issues: [] }, validateStateCalls: [], createDraftCalls: [], stripEtagOnPut: false, expireFirstPreview: false, createDraftStatus: [],
    createdDraftId: DRAFT_ID, newDraft: null, floorsStatus: "Ready", floorsCalls: 0,
    catalog: [{ runtimeVersion: "1.0.0", protocolVersion: "1", manifestSchemaVersion: "1", capabilities: { fire: true } }], catalogCalls: 0, rubricCatalog: RUBRIC_CATALOG,
    drafts: [], currentDraftId: null, draftListCalls: 0, ...overrides,
  };
}

function draftBody(id: string, store: DraftStore) {
  return {
    id, scenarioId: SCENARIO_ID, revisionId: REVISION_ID, buildingId: BUILDING_ID, organizationId: "org-1", draftNumber: id === DRAFT_ID ? 3 : 4, state: store.state, source: "Manual",
    lastAiRequestId: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", version: store.version,
  };
}

const problem = (route: Route, status: number, body: Record<string, unknown>) => route.fulfill({ status, contentType: "application/problem+json", body: JSON.stringify({ status, ...body }) });

export async function installEditorMocks(page: Page, mock: MockState, options: { theme?: "light" | "dark"; debug?: boolean } = {}) {
  const glb = buildFixtureGlb();
  await page.addInitScript(([theme, debug]) => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "editor-access", refreshToken: "editor-refresh" }));
    if (theme) localStorage.setItem("fire3d-ops-theme", theme);
    if (debug) localStorage.setItem("fire3d-editor-debug", "1");
  }, [options.theme ?? null, options.debug ?? true] as const);

  // The primary draft reads/writes `mock.state` / `mock.version` so tests can mutate them directly (e.g. to simulate another editor).
  const store = (id: string): DraftStore | null => {
    if (id === DRAFT_ID) return { get version() { return mock.version; }, set version(value: number) { mock.version = value; }, get state() { return mock.state; }, set state(value: Record<string, unknown>) { mock.state = value; } };
    if (id === NEW_DRAFT_ID) return mock.newDraft;
    return null;
  };

  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
  await page.route(`**/api/scenarios/${SCENARIO_ID}`, (route) => route.fulfill({ json: { id: SCENARIO_ID, buildingId: BUILDING_ID, organizationId: "org-1", name: "Thoát hiểm tầng một", createdAt: "2026-10-01T00:00:00Z", currentDraftId: mock.currentDraftId, currentDraftVersion: mock.currentDraftId ? mock.drafts.find((draft) => draft.id === mock.currentDraftId)?.version ?? null : null, draftCount: mock.drafts.length, latestVersionId: null, latestVersionNumber: null } }));
  await page.route(`**/api/scenarios/${SCENARIO_ID}/drafts?*`, (route) => {
    mock.draftListCalls += 1;
    return route.fulfill({ json: { items: mock.drafts.map((draft) => ({ id: draft.id, scenarioId: SCENARIO_ID, revisionId: REVISION_ID, draftNumber: draft.draftNumber, source: "Manual", schemaVersion: draft.schemaVersion, version: draft.version, createdBy: "owner", createdAt: "2026-10-01T00:00:00Z", updatedAt: draft.updatedAt, lastEditedById: "owner", lastEditedByName: draft.lastEditedByName })), totalCount: mock.drafts.length, page: 1, pageSize: 50 } });
  });
  await page.route("**/api/scenario-interactions/catalog", (route) => {
    mock.catalogCalls += 1;
    return route.fulfill({ json: mock.catalog });
  });
  await page.route("**/api/scenario-rubrics/catalog", (route) => (mock.rubricCatalog === null ? problem(route, 503, { title: "Danh mục rubric tạm thời không có." }) : route.fulfill({ json: mock.rubricCatalog })));
  await page.route(/\/api\/scenario-drafts\/[0-9a-f-]{36}$/, async (route: Route) => {
    const request = route.request();
    const id = request.url().split("/").pop() ?? "";
    const target = store(id);
    if (!target) { await problem(route, 404, { title: "Not found" }); return; }
    if (request.method() === "PUT") {
      const queued = mock.putProblems.shift();
      if (queued) { await problem(route, queued.status, queued.body); return; }
      const status = mock.putStatus.shift();
      if (status && status !== 204) {
        const body = { 412: { code: "PRECONDITION_FAILED", title: "Revision does not match." }, 428: { code: "PRECONDITION_REQUIRED", title: "If-Match is required." }, 400: { code: "INVALID_IF_MATCH", title: "If-Match must be one quoted draft revision." } }[status] ?? { title: "Lỗi" };
        await problem(route, status, body);
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      // The BE shape-checks versioned bodies on PUT (partial drafts are fine) and answers 422 EDITOR_SCHEMA_INVALID with issues.
      if (body.schemaVersion !== undefined) {
        const issues = shapeIssues(body as never).map(({ code, path, message }) => ({ code, path, message }));
        if (issues.length > 0) {
          mock.rejected.push({ body, issues });
          await problem(route, 422, { code: "EDITOR_SCHEMA_INVALID", title: "Draft state does not satisfy fet3d.editor/1.", issues });
          return;
        }
      }
      if (mock.putDelayMs) await new Promise((resolve) => setTimeout(resolve, mock.putDelayMs));
      mock.puts.push({ body, ifMatch: request.headers()["if-match"], draftId: id });
      target.state = body;
      target.version += 1;
      await route.fulfill({ status: 204, headers: mock.stripEtagOnPut ? {} : { ETag: `"${target.version}"`, "Access-Control-Expose-Headers": "ETag" } });
      return;
    }
    mock.getCount += 1;
    await route.fulfill({ json: draftBody(id, target), headers: { ETag: `"${target.version}"` } });
  });
  await page.route(`**/api/scenario-drafts/${DRAFT_ID}/validate`, (route) => {
    mock.validateCalls += 1;
    return route.fulfill({ json: { draftId: DRAFT_ID, version: mock.version, isValid: mock.validate.isValid, issues: mock.validate.issues } });
  });
  await page.route(/\/api\/scenario-drafts\/[0-9a-f-]{36}\/validate-state$/, async (route) => {
    const id = route.request().url().split("/").slice(-2)[0];
    const target = store(id);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mock.validateStateCalls.push({ body, draftId: id });
    if (mock.validateState.delayMs) await new Promise((resolve) => setTimeout(resolve, mock.validateState.delayMs));
    if (mock.validateState.status) { await problem(route, mock.validateState.status, { code: mock.validateState.status === 400 ? "EDITOR_JSON_MALFORMED" : "ERROR", title: "validate-state failed" }); return; }
    if (!target) { await problem(route, 404, { title: "Not found" }); return; }
    const issues = typeof mock.validateState.issues === "function" ? mock.validateState.issues(body) : mock.validateState.issues;
    await route.fulfill({ json: { draftId: id, storedVersion: target.version, stateHash: mock.validateState.hashOverride ?? stateHash(body), isValid: mock.validateState.isValid ?? issues.length === 0, issues } });
  });
  await page.route(`**/api/buildings/${BUILDING_ID}/editor-preview*`, (route) => {
    mock.previewCalls += 1;
    const next = mock.previewQueue.shift() ?? "ready";
    if (next === "error") return route.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ status: 500, title: "Preview lỗi" }) });
    if (next === "not-ready") return route.fulfill({ json: notReadyPreview() });
    const url = `${GLB_URL}&n=${mock.previewCalls}`;
    const expiresAt = new Date(Date.now() + (mock.expireFirstPreview && mock.previewCalls === 1 ? -60_000 : 5 * 60_000)).toISOString();
    if (mock.previewKind === "reprocess") return route.fulfill({ json: reprocessPreview() });
    if (mock.previewKind === "v1") return route.fulfill({ json: v1Preview({ downloadUrl: url, expiresAt }) });
    if (mock.previewKind === "v1-no-url") return route.fulfill({ json: v1Preview({ status: "NotReady", downloadUrl: null, expiresAt: null }) });
    return route.fulfill({ json: readyPreview({ downloadUrl: url, expiresAt, floors: mock.floors ?? readyPreview().floors }) });
  });
  await page.route(`**/api/revisions/${REVISION_ID}/floors`, (route) => {
    mock.floorsCalls += 1;
    if (mock.floorsStatus === "error") return problem(route, 500, { title: "Floors lỗi" });
    return route.fulfill({ json: floorsResponse(mock.floorsStatus) });
  });
  await page.route("https://storage.fire3d.test/**", (route) => {
    mock.glbCalls += 1;
    const status = mock.glbStatus.shift();
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (status && status !== 200) return route.fulfill({ status, headers: cors, body: "<Error>expired</Error>", contentType: "application/xml" });
    return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "model/gltf-binary" }, body: glb });
  });
  await page.route(`**/api/buildings/${BUILDING_ID}/revisions*`, (route) => route.fulfill({ json: { items: [{ id: REVISION_ID, buildingId: BUILDING_ID, versionLabel: "IFC rev. 01", status: "ReadyForScenario", createdAt: "2026-10-01T00:00:00Z", sourceDocument: null }], totalCount: 1, page: 1, pageSize: 50 } }));
  await page.route(`**/api/scenarios/${SCENARIO_ID}/draft`, async (route) => {
    const key = route.request().headers()["idempotency-key"];
    mock.createDraftCalls.push({ key, body: route.request().postDataJSON() });
    const failure = mock.createDraftStatus.shift();
    if (failure) { await route.fulfill({ status: failure, contentType: "application/problem+json", body: JSON.stringify({ status: failure, title: "Lỗi tạm thời" }) }); return; }
    // The BE creates a draft whose state is `{}`; a replay with the same Idempotency-Key returns the same draft.
    if (mock.createdDraftId === NEW_DRAFT_ID && !mock.newDraft) mock.newDraft = { version: 1, state: {} };
    await route.fulfill({ status: 201, json: { id: mock.createdDraftId } });
  });
}

/** Collects console errors/warnings and page errors so a test can assert there is no WebGL/shader noise. */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return {
    problems,
    /** Everything WebGL/three/shader related, plus uncaught exceptions. Expected-failure requests (4xx used on purpose) are ignored. */
    relevant: () => problems.filter((text) => /webgl|shader|three\.|glsl|gl_|program|context|uncaught|pageerror|hydrat/i.test(text) && !/Failed to load resource|GPU stall due to ReadPixels/i.test(text)),
  };
}

export type EditorDebug = {
  stats: () => { renders: number; geometries: number; textures: number; programs: number; lost: boolean; markers: number };
  project: (kind: string, index: number) => { x: number; y: number } | null;
  projectNode: (name: string) => { x: number; y: number } | null;
  simulateDrag: (kind: string, index: number, position: { x: number; y: number; z: number }, yawDegrees?: number) => boolean;
  loseContext: () => void;
  restoreContext: () => void;
  markerPosition: (kind: string, index: number) => number[] | null;
  clipConstant: () => number;
  gizmoAttached: () => boolean;
};

declare global {
  interface Window {
    __fire3dEditorScene?: EditorDebug;
    __fire3dEditorLog?: Array<{ event: string; geometries?: number; textures?: number }>;
  }
}
