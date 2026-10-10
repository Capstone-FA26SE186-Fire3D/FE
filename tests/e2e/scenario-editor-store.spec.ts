import { expect, test } from "@playwright/test";

import { applyCommand, arrayItemCommand, deleteCommand, placeCommand, pushCommand, revertCommand, setFieldCommand, transformCommand, emptyHistory } from "../../src/features/scenario-editor/store/commands";
import { editorReducer, initialEditorState, isDirty, saveStatus, type EditorState } from "../../src/features/scenario-editor/store/editor-store";
import { draftEtag, normalizeEtag } from "../../src/features/scenario-editor/store/etag";
import { deepEqual, parseJsonPath, type JsonObject } from "../../src/features/scenario-editor/store/json";
import { compareDrafts, resolveMerge } from "../../src/features/scenario-editor/store/merge";
import { prepareForSave, unknownKeys } from "../../src/features/scenario-editor/store/model";
import { mergeIssues, normalizeServerIssues, validateDraftState } from "../../src/features/scenario-editor/store/validation";
import { interpretCoordinateTransform } from "../../src/features/scenario-editor/scene/coordinate";
import { floorCeiling, parseFloors, parseLayers } from "../../src/features/scenario-editor/scene/preview-model";
import { FIXTURE_FLOORS, FIXTURE_SEMANTIC_MAPPING } from "../fixtures/scenario-editor/fixture-building";

// Evidence level: pure logic, no browser, no network. Contract assumptions are BE main @ b6a7d74 + BE#54.

const validDraft = (): JsonObject => ({
  spawnPoints: [{ x: 1, y: 0, z: 2, rotation: 90 }],
  hazards: [{ id: "hazard-1", type: "Fire", position: { x: 4, y: 0, z: 5, rotation: 0 }, intensity: 2, activationTime: 10 }],
  scoringConfig: { baseScore: 100, timeLimitSeconds: 300, penaltyPerMistake: 5 },
  routingConfig: { evacuationRoutes: ["Cầu thang B"] },
  learningObjectives: ["Nhận biết lối thoát"],
  learnerInstructions: "Hướng dẫn",
  rubric: { schema_version: "x", pass_threshold: 1, criteria: [{ id: "c1", metric: "m", mandatory: true, weight: 1, threshold: 1, operator: "gte" }] },
});

let n = 0;
const id = () => ++n;

test("place → edit → undo → redo restores exact drafts", () => {
  const start = validDraft();
  const place = placeCommand(start, id(), "spawn", { x: 3, y: 0, z: 3, rotation: 0 }, 1, null);
  const placed = applyCommand(start, place);
  expect((placed.spawnPoints as unknown[]).length).toBe(2);

  const move = transformCommand(placed, id(), "spawn", 1, { x: 7.5 }, { at: 2, label: "Di chuyển", mergeKey: "typing:x" })!;
  const moved = applyCommand(placed, move);
  expect((moved.spawnPoints as Array<{ x: number }>)[1].x).toBe(7.5);

  const field = setFieldCommand(moved, id(), ["scoringConfig", "timeLimitSeconds"], 240, { label: "Đổi", at: 3, selection: null })!;
  const edited = applyCommand(moved, field);

  expect(deepEqual(revertCommand(edited, field), moved)).toBe(true);
  expect(deepEqual(revertCommand(moved, move), placed)).toBe(true);
  expect(deepEqual(revertCommand(placed, place), start)).toBe(true);
  expect(deepEqual(applyCommand(revertCommand(edited, field), field), edited)).toBe(true);
});

test("reducer: undo/redo move selection, edits clear redo, dirty tracks the baseline", () => {
  let state: EditorState = editorReducer(initialEditorState, { type: "loaded", draft: validDraft(), etag: '"5"', version: 5 });
  expect(isDirty(state)).toBe(false);
  state = editorReducer(state, { type: "edit", build: (draft, cid, selection) => placeCommand(draft, cid, "hazard", { x: 1, y: 0, z: 1, rotation: 0 }, 1, selection) });
  expect(state.selection).toEqual({ kind: "hazard", index: 1 });
  expect(isDirty(state)).toBe(true);
  expect(saveStatus(state, true)).toBe("dirty");
  state = editorReducer(state, { type: "undo" });
  expect(state.selection).toBeNull();
  expect(isDirty(state)).toBe(false); // back to the loaded content
  expect(state.history.future).toHaveLength(1);
  state = editorReducer(state, { type: "redo" });
  expect(state.selection).toEqual({ kind: "hazard", index: 1 });
  state = editorReducer(state, { type: "undo" });
  state = editorReducer(state, { type: "edit", build: (draft, cid, selection) => setFieldCommand(draft, cid, ["learnerInstructions"], "Khác", { label: "x", at: 9, selection }) });
  expect(state.history.future).toHaveLength(0);
});

test("a gizmo drag collapses into ONE history entry and a no-op drag leaves none", () => {
  let state = editorReducer(initialEditorState, { type: "loaded", draft: validDraft(), etag: '"1"', version: 1 });
  for (let i = 1; i <= 25; i++) {
    state = editorReducer(state, { type: "edit", build: (draft, cid) => transformCommand(draft, cid, "hazard", 0, { x: 4 + i * 0.1, z: 5 + i * 0.05 }, { at: i, label: "Di chuyển", mergeKey: "drag:1" }) });
  }
  expect(state.history.past).toHaveLength(1);
  const after = state.draft.hazards as Array<{ position: { x: number } }>;
  expect(after[0].position.x).toBeCloseTo(6.5);
  state = editorReducer(state, { type: "undo" });
  expect((state.draft.hazards as Array<{ position: { x: number; z: number } }>)[0].position).toEqual({ x: 4, y: 0, z: 5, rotation: 0 });
  expect(state.history.past).toHaveLength(0);

  // out and back to the start within one gesture: no entry
  let back = editorReducer(initialEditorState, { type: "loaded", draft: validDraft(), etag: '"1"', version: 1 });
  back = editorReducer(back, { type: "edit", build: (d, cid) => transformCommand(d, cid, "spawn", 0, { x: 9 }, { at: 1, label: "m", mergeKey: "drag:2" }) });
  back = editorReducer(back, { type: "edit", build: (d, cid) => transformCommand(d, cid, "spawn", 0, { x: 1 }, { at: 2, label: "m", mergeKey: "drag:2" }) });
  expect(back.history.past).toHaveLength(0);
  expect(isDirty(back)).toBe(false);
});

test("typing in one field merges inside the window and splits after it; different fields never merge", () => {
  let history = emptyHistory;
  const type = (path: string[], value: string, at: number) => {
    const command = setFieldCommand({}, id(), path, value, { label: "t", at, selection: null, mergeKey: `typing:${path.join(".")}` })!;
    history = pushCommand(history, command);
  };
  type(["learnerInstructions"], "a", 0);
  type(["learnerInstructions"], "ab", 400);
  type(["learnerInstructions"], "abc", 800);
  expect(history.past).toHaveLength(1);
  type(["learnerInstructions"], "abcd", 5000); // paused: new entry
  expect(history.past).toHaveLength(2);
  type(["runtimeVersion"], "1.0", 5100);
  expect(history.past).toHaveLength(3);
});

test("delete and array commands are reversible and never touch other items", () => {
  const draft = validDraft();
  const add = arrayItemCommand(draft, id(), ["learningObjectives"], { type: "add", value: "Mục tiêu 2" }, 1, "add")!;
  const added = applyCommand(draft, add);
  expect(added.learningObjectives).toEqual(["Nhận biết lối thoát", "Mục tiêu 2"]);
  const removed = applyCommand(added, arrayItemCommand(added, id(), ["learningObjectives"], { type: "remove", index: 0 }, 2, "rm")!);
  expect(removed.learningObjectives).toEqual(["Mục tiêu 2"]);
  const del = deleteCommand(draft, id(), "hazard", 0, 3)!;
  const without = applyCommand(draft, del);
  expect(without.hazards).toEqual([]);
  expect(deepEqual(revertCommand(without, del), draft)).toBe(true);
  // creating a rubric branch from nothing is undone as a whole
  const create = arrayItemCommand({}, id(), ["rubric", "criteria"], { type: "add", value: { id: "" } }, 1, "c")!;
  expect(applyCommand({}, create)).toEqual({ rubric: { criteria: [{ id: "" }] } });
  expect(revertCommand(applyCommand({}, create), create)).toEqual({});
});

test("unknown draft fields survive editing byte-for-byte (read–write preservation)", () => {
  const unknownGoal = { id: "goal-1", kind: "Exit", extra: { deep: [1, 2, { x: 3 }] } };
  const draft: JsonObject = {
    ...validDraft(),
    goals: [unknownGoal],
    npcs: [{ id: "npc-1", anything: true }],
    blockedElements: [],
    modePolicy: { a: 1 },
    experimentalFlag: { nested: [1, 2, 3] }, // outside the DTO: BE would drop it on save, the editor keeps it in memory
  };
  const hazardExtra = structuredClone(draft);
  (hazardExtra.hazards as Array<Record<string, unknown>>)[0].colour = "red"; // unknown field INSIDE a hazard

  for (const base of [draft, hazardExtra]) {
    let state = editorReducer(initialEditorState, { type: "loaded", draft: base, etag: '"9"', version: 9 });
    state = editorReducer(state, { type: "edit", build: (d, cid) => transformCommand(d, cid, "hazard", 0, { x: 12.5, rotation: 45 }, { at: 1, label: "m", mergeKey: "drag:1" }) });
    state = editorReducer(state, { type: "edit", build: (d, cid) => setFieldCommand(d, cid, ["hazards", 0, "intensity"], 3, { label: "i", at: 2, selection: null }) });
    state = editorReducer(state, { type: "edit", build: (d, cid) => placeCommand(d, cid, "spawn", { x: 0, y: 0, z: 0, rotation: 0 }, 3, null) });
    const body = prepareForSave(state.draft);
    expect(body.goals).toBe(base.goals); // same reference: not rebuilt
    expect(body.npcs).toBe(base.npcs);
    expect(body.modePolicy).toBe(base.modePolicy);
    expect(body.experimentalFlag).toEqual({ nested: [1, 2, 3] });
    const hazard = (body.hazards as Array<Record<string, unknown>>)[0];
    expect(hazard.colour).toBe((base.hazards as Array<Record<string, unknown>>)[0].colour);
    expect((hazard.position as { x: number }).x).toBe(12.5);
    expect(hazard.id).toBe("hazard-1");
    // full undo returns a draft equal to the original
    let undone = state;
    while (undone.history.past.length) undone = editorReducer(undone, { type: "undo" });
    expect(deepEqual(undone.draft, base)).toBe(true);
  }
  expect(unknownKeys(draft)).toEqual(["experimentalFlag"]);
});

test("a brand-new draft ({}) saves as a valid DTO and is validated client-side without a preset policy", () => {
  const body = prepareForSave({});
  expect(body).toEqual({ spawnPoints: [], hazards: [], scoringConfig: { baseScore: 0, timeLimitSeconds: 0, penaltyPerMistake: 0 }, routingConfig: { evacuationRoutes: [] } });
  const codes = validateDraftState(body).map((issue) => issue.code);
  expect(codes).toEqual(expect.arrayContaining(["SPAWN_REQUIRED", "TIME_LIMIT_INVALID", "ROUTE_REQUIRED", "LEARNING_OBJECTIVES_REQUIRED", "LEARNER_INSTRUCTIONS_REQUIRED", "RUBRIC_REQUIRED"]));
  expect(validateDraftState(prepareForSave(validDraft()))).toEqual([]);
});

test("client validation mirrors BE codes and paths", () => {
  const draft = validDraft();
  (draft.hazards as unknown[]).push({ id: "hazard-1", type: "", position: { x: 1, y: 0, z: 0 }, intensity: -1, activationTime: -5 });
  (draft.rubric as { criteria: unknown[] }).criteria.push({ id: "c1", metric: "", mandatory: "yes", weight: -1, threshold: 1, operator: "gt" });
  const issues = validateDraftState(draft);
  const find = (code: string) => issues.find((issue) => issue.code === code);
  expect(find("HAZARD_ID_DUPLICATE")?.path).toBe("$.hazards[1].id");
  expect(find("HAZARD_TYPE_REQUIRED")?.path).toBe("$.hazards[1].type");
  expect(find("POSITION_INVALID")?.path).toBe("$.hazards[1].position");
  expect(find("HAZARD_INTENSITY_INVALID")?.path).toBe("$.hazards[1].intensity");
  expect(find("HAZARD_ACTIVATION_TIME_INVALID")?.path).toBe("$.hazards[1].activationTime");
  expect(find("RUBRIC_CRITERION_INVALID")?.path).toBe("$.rubric.criteria[1]");
  expect(parseJsonPath("$.hazards[1].position.x")).toEqual(["hazards", 1, "position", "x"]);
});

test("server issues merge with client issues by code+path; strings from older builds are tolerated", () => {
  const server = normalizeServerIssues([{ code: "ANCHOR_NOT_FOUND", path: "$.objectAnchors", message: "Không có neo" }, { code: "SPAWN_REQUIRED", path: "$.spawnPoints", message: "server msg" }, "legacy string"]);
  expect(server.map((i) => i.source)).toEqual(["server", "server", "server"]);
  expect(server[2]).toMatchObject({ code: "ISSUE", path: "$", message: "legacy string" });
  const client = validateDraftState(prepareForSave({}));
  const merged = mergeIssues(client, server);
  const spawn = merged.filter((issue) => issue.code === "SPAWN_REQUIRED");
  expect(spawn).toHaveLength(1);
  expect(spawn[0].source).toBe("server");
  expect(merged.some((issue) => issue.code === "ANCHOR_NOT_FOUND")).toBe(true);
});

test("ETag: reads the BE quoted revision, rejects weak/garbage values, falls back to body version", () => {
  expect(normalizeEtag('"52"')).toBe('"52"');
  expect(normalizeEtag("52")).toBe('"52"');
  expect(normalizeEtag('W/"52"')).toBe('"52"');
  expect(normalizeEtag('"0"')).toBeNull(); // BE rejects revision 0
  expect(normalizeEtag('"abc"')).toBeNull();
  expect(normalizeEtag("")).toBeNull();
  expect(draftEtag(new Headers({ ETag: '"7"' }), 3)).toBe('"7"');
  expect(draftEtag(new Headers(), 8)).toBe('"8"');
  expect(draftEtag(new Headers(), null)).toBeNull();
});

test("412 comparison: per-field status and a merge that never writes anything", () => {
  const base = validDraft();
  const mine = structuredClone(base);
  (mine.scoringConfig as { timeLimitSeconds: number }).timeLimitSeconds = 240; // only I changed
  mine.learnerInstructions = "Của tôi"; // both changed
  const theirs = structuredClone(base);
  theirs.learnerInstructions = "Của họ";
  (theirs.routingConfig as { evacuationRoutes: string[] }).evacuationRoutes = ["Cầu thang B", "Cầu thang A"]; // only they changed
  const units = compareDrafts(mine, theirs, base);
  const status = Object.fromEntries(units.map((u) => [u.key, u.status]));
  expect(status).toEqual({ learnerInstructions: "conflict", routingConfig: "theirs", scoringConfig: "mine" });
  expect(units.find((u) => u.key === "scoringConfig")?.changes[0].path).toBe("$.scoringConfig.timeLimitSeconds");

  const merged = resolveMerge(theirs, units, {});
  expect((merged.scoringConfig as { timeLimitSeconds: number }).timeLimitSeconds).toBe(240);
  expect(merged.learnerInstructions).toBe("Của tôi"); // my typing is kept until I choose otherwise
  expect((merged.routingConfig as { evacuationRoutes: string[] }).evacuationRoutes).toHaveLength(2);
  const takeTheirs = resolveMerge(theirs, units, { learnerInstructions: "theirs" });
  expect(takeTheirs.learnerInstructions).toBe("Của họ");
  expect(mine.learnerInstructions).toBe("Của tôi"); // inputs untouched
});

test("a failed save keeps the author's content; conflict is its own status", () => {
  let state = editorReducer(initialEditorState, { type: "loaded", draft: validDraft(), etag: '"5"', version: 5 });
  state = editorReducer(state, { type: "edit", build: (d, cid, sel) => setFieldCommand(d, cid, ["learnerInstructions"], "Giữ lại", { label: "x", at: 1, selection: sel }) });
  state = editorReducer(state, { type: "save-start" });
  expect(saveStatus(state, true)).toBe("saving");
  state = editorReducer(state, { type: "save-fail", message: "412", conflict: true });
  expect(saveStatus(state, true)).toBe("conflict");
  expect(state.draft.learnerInstructions).toBe("Giữ lại");
  expect(state.etag).toBe('"5"'); // unchanged: no guessing the next revision
  // a successful save moves the baseline and the ETag
  state = editorReducer(state, { type: "save-ok", payload: prepareForSave(state.draft), etag: '"6"' });
  expect(isDirty(state)).toBe(false);
  expect(state.etag).toBe('"6"');
});

test("coordinate transform: assumptions are explicit; malformed or non-affine input is refused, never guessed", () => {
  const identity = interpretCoordinateTransform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  expect(identity).toMatchObject({ ok: true, isIdentity: true });
  const translate = interpretCoordinateTransform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
  expect(translate).toMatchObject({ ok: true, isIdentity: false, translation: [10, 20, 30] });
  const mm = interpretCoordinateTransform([1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1]);
  expect(mm.ok && mm.warnings.length).toBeGreaterThan(0);
  expect(interpretCoordinateTransform(null)).toMatchObject({ ok: false });
  expect(interpretCoordinateTransform([1, 2, 3])).toMatchObject({ ok: false });
  expect(interpretCoordinateTransform(Array(16).fill(Number.NaN))).toMatchObject({ ok: false });
  expect(interpretCoordinateTransform([1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toMatchObject({ ok: false }); // not affine column-major
  expect(interpretCoordinateTransform(Array(16).fill(0))).toMatchObject({ ok: false });
});

test("floors/semanticMapping: parse what is recognisable, degrade to nothing otherwise", () => {
  const floors = parseFloors(FIXTURE_FLOORS);
  expect(floors.map((f) => [f.name, f.elevation])).toEqual([["Tầng 1", 0], ["Tầng 2", 3.2]]);
  expect(floorCeiling(floors, "storey-0")).toBe(3.2);
  expect(floorCeiling(floors, "storey-1")).toBeNull();
  expect(parseFloors(null)).toEqual([]);
  expect(parseFloors({ not: "an array" })).toEqual([]);
  expect(parseFloors([{ name: "T3", level: 6.4 }, { name: "T1", elevation: 0 }, 7, "Mái"]).map((f) => f.name)).toEqual(["T1", "T3", "Tầng 3", "Mái"]); // ordered by elevation, unknown last
  const layers = parseLayers(FIXTURE_SEMANTIC_MAPPING);
  expect(layers.map((l) => l.key)).toEqual(["Tường", "Cầu thang"]);
  expect(parseLayers(null)).toEqual([]);
  expect(parseLayers({ nodeA: "Tường", nodeB: "Tường", nodeC: "Cửa" }).map((l) => [l.key, l.nodeNames.length])).toEqual([["Tường", 2], ["Cửa", 1]]);
});
