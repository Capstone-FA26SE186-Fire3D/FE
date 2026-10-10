import type { Page, Route } from "@playwright/test";

import { BUILDING_ID, DRAFT_ID, GLB_URL, REVISION_ID, SCENARIO_ID, buildFixtureGlb, notReadyPreview, readyPreview } from "./fixture-building";

export const EDITOR_URL = `/workspace/buildings/${BUILDING_ID}/scenarios/${SCENARIO_ID}?draft=${DRAFT_ID}`;

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

export type MockState = {
  version: number;
  state: Record<string, unknown>;
  puts: Array<{ body: Record<string, unknown>; ifMatch: string | undefined }>;
  putStatus: number[]; // queue: statuses to answer the next PUTs with (e.g. [412]); empty -> normal 204
  getCount: number;
  previewCalls: number;
  previewQueue: Array<"ready" | "not-ready" | "error">;
  glbStatus: number[]; // queue for the GLB download
  glbCalls: number;
  validate: { isValid: boolean; issues: Array<{ code: string; path: string; message: string }> };
  validateCalls: number;
  createDraftCalls: Array<{ key: string | undefined; body: unknown }>;
  stripEtagOnPut: boolean;
  expireFirstPreview: boolean;
  createDraftStatus: number[];
  floors?: unknown;
};

export function newMock(overrides: Partial<MockState> = {}): MockState {
  return {
    version: 51, state: sampleDraftState(), puts: [], putStatus: [], getCount: 0, previewCalls: 0, previewQueue: [], glbStatus: [], glbCalls: 0,
    validate: { isValid: true, issues: [] }, validateCalls: 0, createDraftCalls: [], stripEtagOnPut: false, expireFirstPreview: false, createDraftStatus: [], ...overrides,
  };
}

function draftBody(mock: MockState) {
  return {
    id: DRAFT_ID, scenarioId: SCENARIO_ID, revisionId: REVISION_ID, buildingId: BUILDING_ID, organizationId: "org-1", draftNumber: 3, state: mock.state, source: "Manual",
    lastAiRequestId: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", version: mock.version,
  };
}

export async function installEditorMocks(page: Page, mock: MockState, options: { theme?: "light" | "dark"; debug?: boolean } = {}) {
  const glb = buildFixtureGlb();
  await page.addInitScript(([theme, debug]) => {
    sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "editor-access", refreshToken: "editor-refresh" }));
    if (theme) localStorage.setItem("fire3d-ops-theme", theme);
    if (debug) localStorage.setItem("fire3d-editor-debug", "1");
  }, [options.theme ?? null, options.debug ?? true] as const);

  await page.route("**/api/auth/me", (route) => route.fulfill({ json: owner, headers: { ETag: '"1"' } }));
  await page.route(`**/api/scenarios/${SCENARIO_ID}`, (route) => route.fulfill({ json: { id: SCENARIO_ID, buildingId: BUILDING_ID, organizationId: "org-1", name: "Thoát hiểm tầng một", createdAt: "2026-10-01T00:00:00Z" } }));
  await page.route("**/api/scenario-interactions/catalog", (route) => route.fulfill({ json: [{ runtimeVersion: "1.0.0", protocolVersion: "1", manifestSchemaVersion: "1", capabilities: { fire: true } }] }));
  await page.route(`**/api/scenario-drafts/${DRAFT_ID}`, async (route: Route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      const status = mock.putStatus.shift();
      if (status && status !== 204) {
        const problem = { 412: { code: "PRECONDITION_FAILED", title: "Revision does not match." }, 428: { code: "PRECONDITION_REQUIRED", title: "If-Match is required." }, 400: { code: "INVALID_IF_MATCH", title: "If-Match must be one quoted draft revision." } }[status] ?? { title: "Lỗi" };
        await route.fulfill({ status, contentType: "application/problem+json", body: JSON.stringify({ status, ...problem }) });
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      mock.puts.push({ body, ifMatch: request.headers()["if-match"] });
      mock.state = body;
      mock.version += 1;
      await route.fulfill({ status: 204, headers: mock.stripEtagOnPut ? {} : { ETag: `"${mock.version}"`, "Access-Control-Expose-Headers": "ETag" } });
      return;
    }
    mock.getCount += 1;
    await route.fulfill({ json: draftBody(mock), headers: { ETag: `"${mock.version}"` } });
  });
  await page.route(`**/api/scenario-drafts/${DRAFT_ID}/validate`, (route) => {
    mock.validateCalls += 1;
    return route.fulfill({ json: { draftId: DRAFT_ID, version: mock.version, isValid: mock.validate.isValid, issues: mock.validate.issues } });
  });
  await page.route(`**/api/buildings/${BUILDING_ID}/editor-preview*`, (route) => {
    mock.previewCalls += 1;
    const next = mock.previewQueue.shift() ?? "ready";
    if (next === "error") return route.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ status: 500, title: "Preview lỗi" }) });
    return route.fulfill({ json: next === "ready" ? readyPreview({ downloadUrl: `${GLB_URL}&n=${mock.previewCalls}`, expiresAt: new Date(Date.now() + (mock.expireFirstPreview && mock.previewCalls === 1 ? -60_000 : 5 * 60_000)).toISOString(), floors: mock.floors ?? readyPreview().floors }) : notReadyPreview() });
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
    mock.createDraftCalls.push({ key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() });
    const failure = mock.createDraftStatus.shift();
    if (failure) { await route.fulfill({ status: failure, contentType: "application/problem+json", body: JSON.stringify({ status: failure, title: "Lỗi tạm thời" }) }); return; }
    await route.fulfill({ status: 201, json: { id: DRAFT_ID } });
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
  project: (kind: "spawn" | "hazard", index: number) => { x: number; y: number } | null;
  loseContext: () => void;
  restoreContext: () => void;
  markerPosition: (kind: "spawn" | "hazard", index: number) => number[] | null;
  clipConstant: () => number;
  gizmoAttached: () => boolean;
};

declare global {
  interface Window {
    __fire3dEditorScene?: EditorDebug;
    __fire3dEditorLog?: Array<{ event: string; geometries?: number; textures?: number }>;
  }
}
