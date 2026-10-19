import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { applyCommand, revertCommand } from "../../src/features/scenario-editor/store/commands";
import { deepEqual, type JsonObject } from "../../src/features/scenario-editor/store/json";
import { compareDrafts, resolveMerge } from "../../src/features/scenario-editor/store/merge";
import { capabilitiesForKind, findCapability, findRuntime, parseRubricCatalog, parseRuntimeCatalog, validateParameters } from "../../src/features/scenario-editor/v1/catalog";
import { carryOverCandidates, carryOverExtras } from "../../src/features/scenario-editor/v1/carry-over";
import { addItemCommand, addObjectCommand, moveObjectCommand, pinGeometryCommand, removeObjectCommand, rotateObjectCommand, setCapabilityCommand, setFloorCommand, setPathCommand } from "../../src/features/scenario-editor/v1/commands";
import { isV1Dirty, initialV1State, v1Reducer, type V1EditorState } from "../../src/features/scenario-editor/v1/editor-state";
import { anchorsForFloor, parseFloorsResponse, parseGeometry } from "../../src/features/scenario-editor/v1/geometry";
import { createHash } from "node:crypto";
import { sha256Hex, stateHash } from "../../src/features/scenario-editor/v1/hash";
import { combineIssues, objectIssues, targetOf, toIssues } from "../../src/features/scenario-editor/v1/issues";
import { applyMatrix, glbToLocal, ifcToGlb, invertAffine, isUnitQuaternion, localToGlb, matrixProblem, near, quaternionToYaw, roundQuaternion, yawToQuaternion } from "../../src/features/scenario-editor/v1/matrix";
import { completenessIssues, initialStateV1, isV1State, readObjects, shapeIssues } from "../../src/features/scenario-editor/v1/state";
import { kindAvailability, placementBlocked } from "../../src/features/scenario-editor/v1/availability";
import { classifyDraft } from "../../src/features/scenario-editor/v1/mode";
import { floorCeiling, parseFloors, parseLayers } from "../../src/features/scenario-editor/scene/preview-model";

// Evidence level: pure logic against the BE contract fixtures (BE main @ 1eaf988, contracts/editor/v1). No browser, no network.

const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "scenario-editor", "v1", name), "utf8")) as JsonObject;
const stateFixture = () => fixture("scenario-state.valid.json");
const geometryMeta = () => fixture("geometry-metadata.valid.json");
const catalogSample = () => fixture("runtime-catalog.sample.json");

const ARTIFACT = "5f0f3d6e-8e43-4c36-9d2a-6c6c3e1b7a10";
const HASH = "b".repeat(64);

function readyGeometry() {
  const meta = geometryMeta();
  const reading = parseGeometry({ status: "Ready", artifactId: ARTIFACT, sha256Hash: HASH, coordinateTransform: meta.coordinateTransform, floors: meta.floors, semanticMapping: meta.semanticMapping, schemaVersion: "fet3d.editor/1", units: "m", upAxis: "Y", handedness: "right" });
  if (reading.kind !== "valid") throw new Error(`fixture geometry must parse: ${JSON.stringify(reading)}`);
  return reading.info;
}

const runtimes = () => parseRuntimeCatalog([catalogSample()]);

let counter = 0;
const nextId = () => ++counter;

// ───────── coordinates ─────────

test("BE fixture: IFC (1000, 2000, 3000) maps to GLB (-9, 3, 3) through coordinateTransform", () => {
  const meta = geometryMeta();
  expect(matrixProblem(meta.coordinateTransform)).toBeNull();
  const glb = ifcToGlb(meta.coordinateTransform as number[], { x: 1000, y: 2000, z: 3000 });
  expect(near(glb, { x: -9, y: 3, z: 3 }, 1e-9)).toBe(true);
});

test("BE fixture: local (1, 0, 2) on L2 (elevation 3.5) maps to GLB (1, 3.5, 2); L1 is the identity", () => {
  const geometry = readyGeometry();
  const l2 = geometry.floors.find((floor) => floor.id === "L2")!;
  const l1 = geometry.floors.find((floor) => floor.id === "L1")!;
  expect(l2.elevationMeters).toBe(3.5);
  expect(near(localToGlb(l2.transform, { x: 1, y: 0, z: 2 }), { x: 1, y: 3.5, z: 2 })).toBe(true);
  expect(near(localToGlb(l1.transform, { x: 1, y: 0, z: 2 }), { x: 1, y: 0, z: 2 })).toBe(true);
});

test("column-major layout: translation lives in 12..14 and a rotation matrix is read by column", () => {
  const translate = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1];
  expect(applyMatrix(translate, { x: 1, y: 2, z: 3 })).toEqual({ x: 8, y: 10, z: 12 });
  // 90 degrees about Y, column-major: x axis -> -z, z axis -> +x.
  const rotateY = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
  expect(near(applyMatrix(rotateY, { x: 1, y: 0, z: 0 }), { x: 0, y: 0, z: -1 })).toBe(true);
  expect(near(applyMatrix(rotateY, { x: 0, y: 0, z: 1 }), { x: 1, y: 0, z: 0 })).toBe(true);
});

test("picking: GLB point -> floor-local is the exact inverse of the floor transform (translation, rotation, scale)", () => {
  const geometry = readyGeometry();
  const l2 = geometry.floors.find((floor) => floor.id === "L2")!;
  expect(near(glbToLocal(l2.transform, { x: 1, y: 3.5, z: 2 })!, { x: 1, y: 0, z: 2 })).toBe(true);

  const tricky = [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 0.5, 0, 4, -5, 6, 1]; // rotation + non-uniform scale + translation
  expect(matrixProblem(tricky)).toBeNull();
  for (const local of [{ x: 1, y: 2, z: 3 }, { x: -4.5, y: 0.25, z: 12 }, { x: 0, y: 0, z: 0 }]) {
    const back = glbToLocal(tricky, localToGlb(tricky, local))!;
    expect(near(back, local, 1e-9)).toBe(true);
  }
  const inverse = invertAffine(tricky)!;
  expect(matrixProblem(inverse)).toBeNull();
  expect(glbToLocal([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], { x: 0, y: 0, z: 0 })).toBeNull();
});

test("matrix validation follows the BE: 16 finite numbers, row 4 = 0,0,0,1, invertible", () => {
  const ok = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  expect(matrixProblem(ok)).toBeNull();
  expect(matrixProblem(ok.slice(0, 15))).not.toBeNull();
  expect(matrixProblem([...ok.slice(0, 3), 0.5, ...ok.slice(4)])).toMatch(/Hàng 4/);
  expect(matrixProblem([...ok.slice(0, 15), 2])).toMatch(/Hàng 4/);
  expect(matrixProblem([...ok.slice(0, 5), Number.NaN, ...ok.slice(6)])).toMatch(/hữu hạn/);
  expect(matrixProblem([1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).toMatch(/khả nghịch/);
});

test("quaternion: yaw <-> quaternion, unit tolerance 1e-3, tilted rotations are not 'pure yaw'", () => {
  const q = yawToQuaternion(90);
  expect(isUnitQuaternion(q)).toBe(true);
  expect(near({ x: q.x, y: q.y, z: q.z }, { x: 0, y: Math.SQRT1_2, z: 0 }, 1e-12)).toBe(true);
  expect(q.w).toBeCloseTo(Math.SQRT1_2, 12);
  for (const degrees of [0, 30, 90, 179.5, 270, 359]) {
    const back = quaternionToYaw(yawToQuaternion(degrees));
    expect(back.pure).toBe(true);
    expect(back.degrees).toBeCloseTo(degrees, 6);
  }
  // BE fixture rotation (0, 0.7071068, 0, 0.7071068) is within tolerance and reads as 90 degrees.
  const fixtureQ = { x: 0, y: 0.7071068, z: 0, w: 0.7071068 };
  expect(isUnitQuaternion(fixtureQ)).toBe(true);
  expect(quaternionToYaw(fixtureQ).degrees).toBeCloseTo(90, 4);
  expect(isUnitQuaternion({ x: 0, y: 0.7, z: 0, w: 0.7 })).toBe(false);
  const tilted = { x: 0.2588190451, y: 0, z: 0, w: 0.9659258263 }; // 30 degrees about X
  expect(quaternionToYaw(tilted).pure).toBe(false);
  expect(isUnitQuaternion(roundQuaternion({ x: 0.123456789, y: 0.5, z: 0.1, w: Math.sqrt(1 - 0.123456789 ** 2 - 0.25 - 0.01) }))).toBe(true);
});

// ───────── geometry from the server ─────────

test("geometry: the BE fixture parses; ReprocessRequired / NotReady / malformed are never turned into coordinates", () => {
  const info = readyGeometry();
  expect(info.floors.map((floor) => floor.id)).toEqual(["L1", "L2"]);
  expect(info.semantic).toHaveLength(4);
  expect(anchorsForFloor(info, "L1").map((entry) => entry.nodeId)).toEqual(["door_101", "door_102", "stair_1"]);
  expect(anchorsForFloor(info, "L2").map((entry) => entry.nodeId)).toEqual(["space_201"]);
  expect(anchorsForFloor(info, "L9")).toEqual([]);

  expect(parseGeometry({ status: "ReprocessRequired", artifactId: ARTIFACT, sha256Hash: HASH })).toEqual({ kind: "reprocess" });
  expect(parseGeometry({ status: "NotReady", artifactId: null })).toEqual({ kind: "not-ready" });
  expect(parseGeometry(null)).toEqual({ kind: "not-ready" });
  const meta = geometryMeta();
  const base = { status: "Ready", artifactId: ARTIFACT, sha256Hash: HASH, coordinateTransform: meta.coordinateTransform, floors: meta.floors, semanticMapping: meta.semanticMapping };
  expect(parseGeometry({ ...base, floors: [] }).kind).toBe("invalid");
  expect(parseGeometry({ ...base, coordinateTransform: [1, 2, 3] }).kind).toBe("invalid");
  expect(parseGeometry({ ...base, sha256Hash: "xyz" }).kind).toBe("invalid");
  expect(parseGeometry({ ...base, units: "mm" }).kind).toBe("invalid");
  expect(parseGeometry({ ...base, schemaVersion: "fet3d.editor/2" }).kind).toBe("invalid");
  expect(parseGeometry({ ...base, semanticMapping: [{ ifcGlobalId: "1hOSvn6df7F8_7GcBWlRGQ", nodeId: "n", floorId: "L9", semanticType: "IfcDoor" }] }).kind).toBe("invalid");
  // Ready answer without pin data is unusable, not guessed.
  expect(parseGeometry({ status: "Ready", artifactId: null, floors: null, coordinateTransform: null }).kind).toBe("invalid");
  // Valid metadata whose object cannot be confirmed (preview NotReady) still allows placing by coordinates.
  expect(parseGeometry({ ...base, status: "NotReady" }).kind).toBe("valid");
});

test("floors response: Ready pins artifact+hash, other states never expose a pin", () => {
  const meta = geometryMeta();
  const ready = parseFloorsResponse({ status: "Ready", artifactId: ARTIFACT, sha256Hash: HASH, schemaVersion: "fet3d.editor/1", floors: meta.floors });
  expect(ready.kind).toBe("valid");
  if (ready.kind === "valid") expect(ready.pin).toEqual({ artifactId: ARTIFACT, sha256Hash: HASH });
  expect(parseFloorsResponse({ status: "ReprocessRequired", artifactId: ARTIFACT, sha256Hash: HASH, floors: null })).toEqual({ kind: "reprocess" });
  expect(parseFloorsResponse({ status: "NotReady", artifactId: null, sha256Hash: null, floors: null })).toEqual({ kind: "not-ready" });
  expect(parseFloorsResponse({ status: "Ready", artifactId: "nope", sha256Hash: HASH, floors: meta.floors }).kind).toBe("invalid");
  expect(parseFloorsResponse({ status: "Ready", artifactId: ARTIFACT, sha256Hash: HASH, floors: [{ id: "L1" }] }).kind).toBe("invalid");
});

// ───────── state document: round trip, ids, shape ─────────

test("round trip: the BE scenario fixture is shape-valid, survives JSON round trip and unrelated edits keep every other field and object by reference", () => {
  const original = stateFixture();
  expect(isV1State(original)).toBe(true);
  expect(shapeIssues(original)).toEqual([]);
  expect(deepEqual(JSON.parse(JSON.stringify(original)), original)).toBe(true);

  // Edit one object's X: everything else is the same reference, and undo restores a deep-equal document.
  const move = moveObjectCommand(original, nextId(), 2, { x: 9.25 }, { at: 1, label: "Di chuyển" })!;
  const moved = applyCommand(original, move);
  expect(readObjects(moved)[2].position.x).toBe(9.25);
  const before = original.objects as JsonObject[];
  const after = moved.objects as JsonObject[];
  for (const index of [0, 1, 3, 4, 5]) expect(after[index]).toBe(before[index]);
  expect(moved.rubric).toBe(original.rubric);
  expect(moved.geometry).toBe(original.geometry);
  expect(deepEqual(revertCommand(moved, move), original)).toBe(true);

  // Parameters of the moved object are byte-identical (nothing normalised).
  expect((after[2] as JsonObject).parameters).toBe((before[2] as JsonObject).parameters);
  expect(JSON.stringify(readObjects(moved).map((object) => object.parameters))).toBe(JSON.stringify(readObjects(original).map((object) => object.parameters)));
});

test("round trip: a field the editor does not model is preserved through edits, undo and redo", () => {
  const original = stateFixture();
  const withExtra = { ...original, objects: (original.objects as JsonObject[]).map((object, index) => (index === 0 ? { ...object, label: "Phòng 101", extraFuture: { keep: [1, 2, 3] } } : object)) } as JsonObject;
  const rename = setPathCommand(withExtra, nextId(), ["objects", 0, "label"], "Phòng 102", { label: "Đổi nhãn", at: 1, selection: null })!;
  const renamed = applyCommand(withExtra, rename);
  expect(((renamed.objects as JsonObject[])[0] as JsonObject).extraFuture).toBe(((withExtra.objects as JsonObject[])[0] as JsonObject).extraFuture);
  expect(deepEqual(revertCommand(renamed, rename), withExtra)).toBe(true);
  // The shape check flags the unknown field, so it can never silently reach the server as a 422 surprise.
  expect(shapeIssues(withExtra).map((issue) => issue.code)).toContain("FIELD_UNKNOWN");
});

test("object ids stay unique: new ids skip used ones, duplicates are flagged where the BE flags them", () => {
  let draft = initialStateV1({ artifactId: ARTIFACT, sha256Hash: HASH });
  const place = (kind: "Spawn" | "Goal" | "Hazard") => {
    draft = applyCommand(draft, addObjectCommand(draft, nextId(), { kind, floorId: "L1", position: { x: 0, y: 0, z: 0 } }, 1, null));
  };
  place("Spawn"); place("Spawn"); place("Goal"); place("Hazard");
  expect(readObjects(draft).map((object) => object.id)).toEqual(["spawn-1", "spawn-2", "goal-1", "hazard-1"]);
  draft = applyCommand(draft, removeObjectCommand(draft, nextId(), 0, 1)!);
  place("Spawn");
  expect(readObjects(draft).map((object) => object.id)).toEqual(["spawn-2", "goal-1", "hazard-1", "spawn-1"]);
  expect(new Set(readObjects(draft).map((object) => object.id)).size).toBe(4);

  const duplicate = applyCommand(draft, setPathCommand(draft, nextId(), ["objects", 0, "id"], "goal-1", { label: "Đổi mã", at: 2, selection: null })!);
  const issues = shapeIssues(duplicate);
  expect(issues.map((issue) => `${issue.code}@${issue.path}`)).toContain("ID_DUPLICATE@$.objects[1].id");
  const badId = applyCommand(draft, setPathCommand(draft, nextId(), ["objects", 1, "id"], "bad id!", { label: "Đổi mã", at: 3, selection: null })!);
  expect(shapeIssues(badId).map((issue) => issue.code)).toContain("STRING_FORMAT_INVALID");
});

test("a new object carries a unit identity rotation and floor-local coordinates; nothing else is invented", () => {
  const draft = initialStateV1({ artifactId: ARTIFACT, sha256Hash: HASH });
  const next = applyCommand(draft, addObjectCommand(draft, nextId(), { kind: "BlockedElement", floorId: "L2", position: { x: 1, y: 0, z: 2 } }, 1, null));
  const object = (next.objects as JsonObject[])[0];
  expect(object).toEqual({ id: "blocked-1", kind: "BlockedElement", placement: { floorId: "L2", position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } });
  expect(Object.keys(next)).toEqual(["schemaVersion", "geometry", "objects"]); // no zero scores, empty arrays or defaults
  expect(shapeIssues(next)).toEqual([]);
});

test("rotation: untouched objects keep the original quaternion bit for bit; rotating writes all four components", () => {
  const original = stateFixture();
  const objects = original.objects as JsonObject[];
  const quaternionBefore = (objects[0].placement as JsonObject).rotation;
  const moved = applyCommand(original, moveObjectCommand(original, nextId(), 0, { z: 8 }, { at: 1, label: "Di chuyển" })!);
  expect((((moved.objects as JsonObject[])[0].placement as JsonObject).rotation)).toBe(quaternionBefore);

  const turned = applyCommand(original, rotateObjectCommand(original, nextId(), 0, roundQuaternion(yawToQuaternion(45)), { at: 2, label: "Xoay" })!);
  const rotation = readObjects(turned)[0].rotation;
  expect(isUnitQuaternion(rotation)).toBe(true);
  expect(quaternionToYaw(rotation).degrees).toBeCloseTo(45, 4);
  expect(shapeIssues({ ...original, objects: [{ ...objects[0], placement: { ...(objects[0].placement as JsonObject), rotation: { x: 0, y: 0.5, z: 0, w: 0.5 } } }] })[0].code).toBe("QUATERNION_NOT_NORMALIZED");
});

test("shape check mirrors the PUT validator: partial drafts pass, malformed documents explain themselves", () => {
  expect(shapeIssues({ schemaVersion: "fet3d.editor/1" })).toEqual([]);
  expect(shapeIssues(initialStateV1({ artifactId: ARTIFACT, sha256Hash: HASH }))).toEqual([]);
  expect(shapeIssues({ schemaVersion: "fet3d.editor/2" })[0].code).toBe("VALUE_UNSUPPORTED");
  expect(shapeIssues({})[0].code).toBe("VALUE_UNSUPPORTED");
  const codes = (draft: JsonObject) => shapeIssues({ schemaVersion: "fet3d.editor/1", ...draft }).map((issue) => `${issue.code}@${issue.path}`);
  expect(codes({ timeLimitSeconds: 0 })).toEqual(["NUMBER_OUT_OF_RANGE@$.timeLimitSeconds"]);
  expect(codes({ timeLimitSeconds: 86_401 })).toEqual(["NUMBER_OUT_OF_RANGE@$.timeLimitSeconds"]);
  expect(codes({ timeLimitSeconds: 1.5 })).toEqual(["INTEGER_INVALID@$.timeLimitSeconds"]);
  expect(codes({ timeLimitSeconds: 86_400, replanIntervalSeconds: 0, randomSeed: -7 })).toEqual([]);
  expect(codes({ replanIntervalSeconds: 3_601 })).toEqual(["NUMBER_OUT_OF_RANGE@$.replanIntervalSeconds"]);
  expect(codes({ modePolicy: { allowedModes: [] } })).toContain("FIELD_REQUIRED@$.modePolicy.allowedModes");
  expect(codes({ modePolicy: { allowedModes: ["Learn", "Learn"] } })).toEqual(["ID_DUPLICATE@$.modePolicy.allowedModes[1]"]);
  expect(codes({ modePolicy: { allowedModes: ["Practice"] } })).toEqual(["STRING_INVALID@$.modePolicy.allowedModes[0]"]);
  expect(codes({ learningObjectives: ["a", "a"] })).toEqual(["ID_DUPLICATE@$.learningObjectives[1]"]);
  expect(codes({ learningObjectives: ["ok", ""] })).toEqual(["STRING_INVALID@$.learningObjectives[1]"]);
  expect(codes({ learningObjectives: Array.from({ length: 51 }, (_, i) => `m${i}`) })).toEqual(["ARRAY_TOO_LARGE@$.learningObjectives"]);
  expect(codes({ learnerInstructions: "x".repeat(10_001) })).toEqual(["STRING_INVALID@$.learnerInstructions"]);
  expect(codes({ rubric: { schema_version: "1", criteria: [] } })).toEqual(["FIELD_REQUIRED@$.rubric.pass_threshold"]);
  expect(codes({ rubric: { schema_version: "v1", pass_threshold: 1, criteria: [] } })).toEqual(["RUBRIC_SCHEMA_VERSION_UNSUPPORTED@$.rubric.schema_version"]);
  expect(codes({ rubric: { schema_version: "1", pass_threshold: 1, criteria: [{ id: "a", metric: "reached_exit", mandatory: true }] } })).toEqual(["FIELD_REQUIRED@$.rubric.criteria[0].weight", "FIELD_REQUIRED@$.rubric.criteria[0].threshold", "FIELD_REQUIRED@$.rubric.criteria[0].operator"]);
  expect(codes({ objects: [{ id: "a", kind: "Wall", placement: { floorId: "L1", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }] })).toEqual(["VALUE_UNSUPPORTED@$.objects[0].kind"]);
  expect(codes({ objects: [{ id: "a", kind: "Spawn" }] })).toEqual(["FIELD_REQUIRED@$.objects[0].placement"]);
  expect(codes({ objects: [{ id: "a", kind: "Spawn", placement: { floorId: "L1", position: { x: 200_000, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }] })).toEqual(["NUMBER_OUT_OF_RANGE@$.objects[0].placement.position.x"]);
  expect(codes({ objects: [{ id: "a", kind: "Goal", anchorId: "short", placement: { floorId: "L1", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } }] })).toEqual(["STRING_FORMAT_INVALID@$.objects[0].anchorId"]);
});

// ───────── catalog, capabilities, parameters ─────────

test("runtime catalog: capabilities are offered per object kind; contracts that are not listed or malformed are ignored; empty catalog is empty", () => {
  const [runtime] = runtimes();
  expect(runtime.runtimeVersion).toBe("1.4.0");
  expect(capabilitiesForKind(runtime, "Hazard").map((capability) => capability.id)).toEqual(["fire.source"]);
  expect(capabilitiesForKind(runtime, "Npc").map((capability) => capability.id)).toEqual(["npc.evacuee"]);
  expect(capabilitiesForKind(runtime, "Equipment").map((capability) => capability.id)).toEqual(["equipment.extinguisher"]);
  expect(capabilitiesForKind(runtime, "Goal")).toEqual([]); // no capability published for Goal: the UI says so, nothing is seeded
  expect(capabilitiesForKind(undefined, "Hazard")).toEqual([]);
  expect(findRuntime(runtimes(), "9.9.9")).toBeUndefined();

  expect(parseRuntimeCatalog([])).toEqual([]);
  expect(parseRuntimeCatalog(null)).toEqual([]);
  const legacy = parseRuntimeCatalog([{ runtimeVersion: "1.0.0", protocolVersion: "1", manifestSchemaVersion: "1", capabilities: { fire: true } }]);
  expect(legacy[0].capabilities).toEqual([]); // legacy capability lists give no contract: no capability can be placed
  const sample = catalogSample() as { capabilityContracts: Record<string, unknown> };
  const unlisted = parseRuntimeCatalog([{ ...sample, capabilities: ["fire.source"], capabilityContracts: { ...sample.capabilityContracts } }]);
  expect(unlisted[0].capabilities.map((capability) => capability.id)).toEqual(["fire.source"]);
  const broken = parseRuntimeCatalog([{ ...sample, capabilityContracts: { "fire.source": { version: "x", objectKinds: ["Hazard"] } } }]);
  expect(broken[0].capabilities).toEqual([]);
});

test("parameter form schema and validation: number/integer/string/boolean/enum, min/max, required, closed set", () => {
  const [runtime] = runtimes();
  const fire = findCapability(runtime, "fire.source")!;
  expect(fire.fields.map((field) => `${field.name}:${field.type}:${field.required}`)).toEqual(["intensity:number:true", "activationSeconds:integer:false"]);
  const codes = (value: unknown) => validateParameters(fire, value).map((problem) => `${problem.code}@${problem.name}`);
  expect(codes({ intensity: 6.5, activationSeconds: 30 })).toEqual([]);
  expect(codes({})).toEqual(["FIELD_REQUIRED@intensity"]);
  expect(codes({ intensity: 11 })).toEqual(["PARAMETER_OUT_OF_RANGE@intensity"]);
  expect(codes({ intensity: -0.1 })).toEqual(["PARAMETER_OUT_OF_RANGE@intensity"]);
  expect(codes({ intensity: 1, activationSeconds: 1.5 })).toEqual(["INTEGER_INVALID@activationSeconds"]);
  expect(codes({ intensity: 1, activationSeconds: 3601 })).toEqual(["PARAMETER_OUT_OF_RANGE@activationSeconds"]);
  expect(codes({ intensity: "high" })).toEqual(["NUMBER_INVALID@intensity"]);
  expect(codes({ intensity: 1, extra: true })).toEqual(["FIELD_UNKNOWN@extra"]);

  const npc = findCapability(runtime, "npc.evacuee")!;
  expect(validateParameters(npc, { behaviour: "panic", mobilityImpaired: false })).toEqual([]);
  expect(validateParameters(npc, { behaviour: "run" }).map((problem) => problem.code)).toEqual(["PARAMETER_NOT_ALLOWED"]);
  expect(validateParameters(npc, { mobilityImpaired: "no" }).map((problem) => problem.code)).toEqual(["TYPE_INVALID"]);
  expect(validateParameters(npc, {})).toEqual([]); // nothing required: no default is injected

  // No capability, or a capability without a parameter schema, accepts no parameters.
  expect(validateParameters(undefined, { a: 1 }).map((problem) => problem.code)).toEqual(["PARAMETERS_NOT_ALLOWED"]);
  expect(validateParameters(undefined, {})).toEqual([]);
});

test("capability commands: choosing a different capability drops the old parameters, the same one keeps them", () => {
  const original = stateFixture();
  const hazard = (original.objects as JsonObject[]).findIndex((object) => object.kind === "Hazard");
  const same = applyCommand(original, setCapabilityCommand(original, nextId(), hazard, { id: "fire.source", version: "1.0.0" }, 1) ?? ({ id: 0, label: "", patches: [], at: 0 }));
  expect(deepEqual(same, original)).toBe(true);
  const switched = applyCommand(original, setCapabilityCommand(original, nextId(), hazard, { id: "smoke.spread", version: "1.0.0" }, 2)!);
  const object = (switched.objects as JsonObject[])[hazard];
  expect(object.capability).toEqual({ id: "smoke.spread", version: "1.0.0" });
  expect("parameters" in object).toBe(false);
  const cleared = applyCommand(original, setCapabilityCommand(original, nextId(), hazard, undefined, 3)!);
  expect("capability" in (cleared.objects as JsonObject[])[hazard]).toBe(false);
  expect("parameters" in (cleared.objects as JsonObject[])[hazard]).toBe(false);
});

test("floor change keeps floor-local coordinates and clears an anchor that is not on the new floor (undoable in one step)", () => {
  const geometry = readyGeometry();
  const original = stateFixture();
  const doorIndex = (original.objects as JsonObject[]).findIndex((object) => object.id === "blocked-door");
  const command = setFloorCommand(original, nextId(), doorIndex, "L2", geometry, 1)!;
  const moved = applyCommand(original, command);
  const object = readObjects(moved)[doorIndex];
  expect(object.floorId).toBe("L2");
  expect(object.position).toEqual({ x: 8, y: 0, z: 1 });
  expect(object.anchorId).toBeUndefined();
  expect(command.label).toMatch(/bỏ neo/);
  expect(deepEqual(revertCommand(moved, command), original)).toBe(true);
  // An object without an anchor, or whose anchor is on the target floor, only changes the floor.
  const spawn = (original.objects as JsonObject[]).findIndex((object) => object.id === "spawn-1");
  expect(setFloorCommand(original, nextId(), spawn, "L2", geometry, 2)!.patches).toHaveLength(1);
});

test("completeness mirrors validate: the BE fixture is complete against its own geometry and catalog; gaps use the BE codes and paths", () => {
  const geometry = readyGeometry();
  const context = { geometry, runtimes: runtimes(), metrics: new Set(["reached_exit", "completion_time_seconds", "wrong_exits", "hazard_exposure", "distance_meters"]) };
  expect(completenessIssues(stateFixture(), context)).toEqual([]);

  const empty = completenessIssues({ schemaVersion: "fet3d.editor/1" }, { geometry, runtimes: null, metrics: null });
  expect(empty.map((issue) => issue.path).sort()).toEqual(["$.geometry", "$.learnerInstructions", "$.learningObjectives", "$.objects", "$.objects", "$.rubric", "$.runtimeVersion", "$.timeLimitSeconds"].sort());
  expect(empty.map((issue) => issue.code)).toContain("SPAWN_REQUIRED");
  expect(empty.map((issue) => issue.code)).toContain("GOAL_REQUIRED");

  // Missing capability / anchor / wrong floor / wrong parameters are attached to the exact object.
  let draft = stateFixture();
  const objects = draft.objects as JsonObject[];
  draft = { ...draft, objects: objects.map((object) => {
    if (object.id === "fire-1") return { id: object.id, kind: object.kind, placement: object.placement };
    if (object.id === "blocked-door") return { id: object.id, kind: object.kind, placement: object.placement };
    if (object.id === "npc-1") return { ...object, parameters: { behaviour: "run" } };
    if (object.id === "ext-1") return { ...object, placement: { ...(object.placement as JsonObject), floorId: "L9" } };
    if (object.id === "goal-exit") return { ...object, anchorId: "3cUkl32yn9qRSPvBJVyWYp" }; // exists, but on L2 while the goal is on L1
    return object;
  }) } as JsonObject;
  const found = completenessIssues(draft, context).map((issue) => `${issue.code}@${issue.path}`);
  expect(found).toContain("CAPABILITY_REQUIRED@$.objects[2].capability");
  expect(found).toContain("ANCHOR_REQUIRED@$.objects[4].anchorId");
  expect(found).toContain("PARAMETER_NOT_ALLOWED@$.objects[3].parameters.behaviour");
  expect(found).toContain("FLOOR_NOT_FOUND@$.objects[5].placement.floorId");
  expect(found).toContain("ANCHOR_FLOOR_MISMATCH@$.objects[1].anchorId");
});

test("rubric catalog: metrics come from the server, nothing is defaulted", () => {
  expect(parseRubricCatalog(null)).toBeNull();
  const catalog = parseRubricCatalog({
    supportedSchemaVersions: ["1"], defaultSchemaVersion: "1", operators: ["gte", "lte", "eq"], maxCriteria: 100, rubricFields: ["schema_version", "pass_threshold", "criteria"],
    metrics: [{ id: "reached_exit", description: "Đến được lối thoát" }, { id: "bad id", description: "x" }],
    criterion: { requiredFields: [], optionalFields: [], idPattern: "", idMaxLength: 64, descriptionMaxLength: 500, weightMinimum: 0 },
  })!;
  expect(catalog.metrics.map((metric) => metric.id)).toEqual(["reached_exit"]);
  expect(catalog.defaultSchemaVersion).toBe("1");
  expect(catalog.idMaxLength).toBe(64);
});

// ───────── stateHash ─────────

test("stateHash is the SHA-256 of the exact body the client sends (BE #90 hashes the received bytes), Vietnamese included", () => {
  expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  const body = {
    schemaVersion: "fet3d.editor/1",
    name: "Sơ tán <a> & \"b\" + c' `d` \\ / \u007f \u0001 \n\t 😀 é ~ ! # $ % ( ) * , - . : ; = ? @ [ ] ^ { | }",
    n: [0.7071068, 1, 1.5, -0, 1e21, 1e-7, 123456789012345680000, 5e-324, 0.1, 100, 1e300],
    o: { "ключ": "значение", "a/b": 1 }, a: [], e: {}, t: true, f: false, z: null, skipped: undefined,
  };
  const bytesHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
  expect(stateHash(body)).toBe(bytesHash(body));
  expect(stateHash(stateFixture())).toBe(bytesHash(stateFixture()));
  // A different edit gives a different hash (this is how a result is recognised as stale).
  const edited = applyCommand(stateFixture(), moveObjectCommand(stateFixture(), nextId(), 0, { x: 3 }, { at: 1, label: "Di chuyển" })!);
  expect(stateHash(edited)).not.toBe(stateHash(stateFixture()));
});

// ───────── issues -> UI ─────────

test("issue paths map to the object, field, rubric criterion or scenario group that owns them", () => {
  expect(targetOf("$.objects[3].parameters.intensity")).toEqual({ section: "object", index: 3, field: "parameters.intensity" });
  expect(targetOf("$.objects[0].placement.rotation")).toEqual({ section: "object", index: 0, field: "placement.rotation" });
  expect(targetOf("$.objects")).toEqual({ section: "objects" });
  expect(targetOf("$.rubric.criteria[0]")).toEqual({ section: "rubric", criterion: 0, field: "" });
  expect(targetOf("$.rubric.criteria[2].metric")).toEqual({ section: "rubric", criterion: 2, field: "metric" });
  expect(targetOf("$.rubric.pass_threshold")).toEqual({ section: "rubric", criterion: null, field: "pass_threshold" });
  expect(targetOf("$.geometry.artifactId")).toEqual({ section: "geometry" });
  expect(targetOf("$.timeLimitSeconds")).toEqual({ section: "scenario", field: "timeLimitSeconds" });
  expect(targetOf("$.learningObjectives[1]")).toEqual({ section: "scenario", field: "learningObjectives.1" });

  const issues = toIssues([{ code: "PARAMETER_OUT_OF_RANGE", path: "$.objects[3].parameters.intensity", message: "x" }, { code: "A", path: "$.objects[30].id", message: "y" }, 5, null]);
  expect(issues).toHaveLength(2);
  expect(objectIssues(issues, 3)).toHaveLength(1); // index 3 must not match 30
  const merged = combineIssues([{ code: "PARAMETER_OUT_OF_RANGE", path: "$.objects[3].parameters.intensity", message: "client", source: "client" }], issues);
  expect(merged.filter((issue) => issue.path === "$.objects[3].parameters.intensity")).toHaveLength(1);
  expect(merged[0].source).toBe("server");
});

// ───────── carry-over from a legacy draft ─────────

test("carry-over offers only valid non-spatial fields and never a position", () => {
  const legacy: JsonObject = {
    spawnPoints: [{ x: 1, y: 2, z: 3, rotation: 90 }], hazards: [{ id: "h", type: "Fire", position: { x: 1, y: 1, z: 1, rotation: 0 }, intensity: 1, activationTime: 0 }],
    scoringConfig: { baseScore: 100, timeLimitSeconds: 300, penaltyPerMistake: 5 },
    learningObjectives: ["Nhận biết lối thoát", "Nhận biết lối thoát"], learnerInstructions: "Hướng dẫn",
    rubric: { schema_version: "rubric-1", pass_threshold: 60, criteria: [] }, runtimeVersion: "1.0.0", randomSeed: 5,
  };
  const items = carryOverCandidates(legacy);
  expect(items.map((item) => item.key)).toEqual(["learnerInstructions", "timeLimitSeconds", "randomSeed", "runtimeVersion"]); // duplicate objectives and an old rubric schema are not offered
  const extras = carryOverExtras(items, new Set(["learnerInstructions", "timeLimitSeconds"]));
  expect(extras).toEqual({ learnerInstructions: "Hướng dẫn", timeLimitSeconds: 300 });
  const created = initialStateV1({ artifactId: ARTIFACT, sha256Hash: HASH }, extras);
  expect(shapeIssues(created)).toEqual([]);
  expect(JSON.stringify(created)).not.toMatch(/spawnPoints|hazards|"x":/);
  const v1Rubric = carryOverCandidates({ rubric: { schema_version: "1", pass_threshold: 1, criteria: [{ id: "a", metric: "reached_exit", mandatory: true, weight: 1, threshold: 1, operator: "eq" }] } });
  expect(v1Rubric.map((item) => item.key)).toEqual(["rubric"]);
});

// ───────── reducer ─────────

test("reducer: place, edit, undo, redo; selection follows; dirty is measured against the saved document; replace drops history", () => {
  const start = stateFixture();
  let state: V1EditorState = v1Reducer(initialV1State, { type: "loaded", draft: start, etag: '"5"', version: 5 });
  expect(isV1Dirty(state)).toBe(false);
  state = v1Reducer(state, { type: "edit", build: (draft, id, selection) => addObjectCommand(draft, id, { kind: "Equipment", floorId: "L1", position: { x: 1, y: 0, z: 1 } }, 1, selection) });
  expect(readObjects(state.draft)).toHaveLength(7);
  expect(state.selection).toEqual({ kind: "object", index: 6 });
  expect(isV1Dirty(state)).toBe(true);
  state = v1Reducer(state, { type: "edit", build: (draft, id, selection) => setPathCommand(draft, id, ["objects", 6, "label"], "Bình CO2", { label: "Đổi nhãn", at: 2, selection, typing: true }) });
  state = v1Reducer(state, { type: "edit", build: (draft, id, selection) => setPathCommand(draft, id, ["objects", 6, "label"], "Bình CO2 số 1", { label: "Đổi nhãn", at: 3, selection, typing: true }) });
  expect(state.history.past).toHaveLength(2); // typing merged
  state = v1Reducer(state, { type: "undo" });
  expect(readObjects(state.draft)[6].label).toBe("");
  state = v1Reducer(state, { type: "undo" });
  expect(deepEqual(state.draft, start)).toBe(true);
  expect(state.selection).toBeNull();
  expect(isV1Dirty(state)).toBe(false);
  state = v1Reducer(state, { type: "redo" });
  expect(readObjects(state.draft)).toHaveLength(7);

  // Save while the author keeps editing: the baseline is what was sent, so the later edit stays dirty.
  const sent = state.draft;
  state = v1Reducer(state, { type: "save-start" });
  state = v1Reducer(state, { type: "edit", build: (draft, id, selection) => setPathCommand(draft, id, ["name"], "Tên mới", { label: "Đổi tên", at: 9, selection }) });
  state = v1Reducer(state, { type: "save-ok", payload: sent, etag: '"6"' });
  expect(state.etag).toBe('"6"');
  expect(isV1Dirty(state)).toBe(true);
  expect(state.draft.name).toBe("Tên mới");

  state = v1Reducer(state, { type: "replace", draft: start, baseline: start, etag: '"9"', version: 9 });
  expect(state.history).toEqual({ past: [], future: [] });
  expect(isV1Dirty(state)).toBe(false);
});

test("412 comparison works on v1 documents: fields only the server changed are taken, both-changed fields are kept for the author to decide", () => {
  const base = stateFixture();
  const mine = applyCommand(base, setPathCommand(base, nextId(), ["name"], "Của tôi", { label: "Đổi tên", at: 1, selection: null })!);
  const theirs = applyCommand(base, setPathCommand(base, nextId(), ["timeLimitSeconds"], 900, { label: "Đổi thời gian", at: 1, selection: null })!);
  const units = compareDrafts(mine, theirs, base);
  expect(units.map((unit) => `${unit.key}:${unit.status}`).sort()).toEqual(["name:mine", "timeLimitSeconds:theirs"]);
  const merged = resolveMerge(theirs, units, {});
  expect(merged.name).toBe("Của tôi");
  expect(merged.timeLimitSeconds).toBe(900);
  expect(isV1State(merged)).toBe(true);
  const pinned = applyCommand(base, pinGeometryCommand(base, nextId(), { artifactId: ARTIFACT, sha256Hash: HASH }, 1, null)!);
  expect((pinned.geometry as JsonObject).artifactId).toBe(ARTIFACT);
  const list = applyCommand(base, addItemCommand(base, nextId(), ["learningObjectives"], "Mục mới", 1, "Thêm mục tiêu", null)!);
  expect((list.learningObjectives as string[]).at(-1)).toBe("Mục mới");
});

// ───────── mode and availability ─────────

test("draft mode follows the stored state: v1, empty, legacy (never converted) or unsupported", () => {
  expect(classifyDraft(stateFixture())).toEqual({ mode: "v1", schemaVersion: "fet3d.editor/1" });
  expect(classifyDraft({})).toEqual({ mode: "empty", schemaVersion: null });
  expect(classifyDraft({ spawnPoints: [], hazards: [] })).toEqual({ mode: "legacy", schemaVersion: null });
  expect(classifyDraft({ schemaVersion: "fet3d.editor/2" })).toEqual({ mode: "unsupported", schemaVersion: "fet3d.editor/2" });
  expect(classifyDraft({ schemaVersion: 1 })).toEqual({ mode: "unsupported", schemaVersion: "" });
  expect(classifyDraft(null).mode).toBe("unsupported");
  expect(classifyDraft([]).mode).toBe("unsupported");
});

test("kind availability comes from real Geometry and the real catalog: no fixed flags, nothing seeded", () => {
  const geometryInfo = readyGeometry();
  const base = { geometry: "valid" as const, geometryInfo, catalog: { loading: false, error: false, runtimes: runtimes() }, runtimeVersion: "1.4.0" };
  const ready = kindAvailability(base);
  expect(ready.Spawn).toEqual({ state: "ready", capabilities: 0 });
  expect(ready.Goal).toEqual({ state: "ready", capabilities: 0 });
  expect(ready.Hazard).toEqual({ state: "ready", capabilities: 1 });
  expect(ready.Npc).toEqual({ state: "ready", capabilities: 1 });
  expect(ready.Equipment).toEqual({ state: "ready", capabilities: 1 });
  expect(ready.BlockedElement).toEqual({ state: "ready", capabilities: 0 });
  expect(Object.values(ready).some(placementBlocked)).toBe(false);

  // Geometry not usable: every kind waits for it, with the reason.
  for (const geometry of ["reprocess", "not-ready", "invalid", "loading"] as const) {
    const blocked = kindAvailability({ ...base, geometry, geometryInfo: null });
    expect(Object.values(blocked).every((status) => status.state === "needs-geometry")).toBe(true);
    expect(blocked.Spawn).toEqual({ state: "needs-geometry", geometry });
  }

  // Empty catalog: capability kinds are blocked and say how many runtimes there are (zero); the others stay available.
  const empty = kindAvailability({ ...base, catalog: { loading: false, error: false, runtimes: [] }, runtimeVersion: undefined });
  expect(empty.Hazard).toEqual({ state: "no-capability", runtime: null, runtimes: 0 });
  expect(placementBlocked(empty.Hazard)).toBe(true);
  expect(empty.Spawn.state).toBe("ready");
  // A selected runtime that has no capability for a kind names that runtime.
  const onlyFire = parseRuntimeCatalog([{ ...catalogSample(), capabilities: ["fire.source"], capabilityContracts: { "fire.source": (catalogSample().capabilityContracts as Record<string, unknown>)["fire.source"] } }]);
  const partial = kindAvailability({ ...base, catalog: { loading: false, error: false, runtimes: onlyFire } });
  expect(partial.Npc).toEqual({ state: "no-capability", runtime: "1.4.0", runtimes: 1 });
  expect(partial.Hazard.state).toBe("ready");
  // Loading and failed catalogs are not reported as "empty".
  expect(kindAvailability({ ...base, catalog: { loading: true, error: false, runtimes: [] } }).Hazard.state).toBe("catalog-loading");
  expect(kindAvailability({ ...base, catalog: { loading: false, error: true, runtimes: [] } }).Hazard.state).toBe("catalog-error");
  // A blocked element needs an anchor: Geometry without a semantic mapping cannot offer one.
  const noMapping = kindAvailability({ ...base, geometryInfo: { ...geometryInfo, semantic: [] } });
  expect(noMapping.BlockedElement).toEqual({ state: "no-anchor" });
  expect(placementBlocked(noMapping.BlockedElement)).toBe(true);
});

test("the legacy viewport helpers also understand fet3d.editor/1 metadata (elevationMeters, semanticMapping array) so a legacy draft opened on a v1 revision still gets floors and layers", () => {
  const meta = geometryMeta();
  const floors = parseFloors(meta.floors);
  expect(floors.map((floor) => [floor.key, floor.elevation])).toEqual([["L1", 0], ["L2", 3.5]]);
  expect(floorCeiling(floors, "L1")).toBe(3.5);
  const layers = parseLayers(meta.semanticMapping);
  expect(layers.map((layer) => layer.key).sort()).toEqual(["IfcDoor", "IfcSpace", "IfcStair"]);
  expect(layers.find((layer) => layer.key === "IfcDoor")!.nodeNames).toEqual(["door_101", "door_102"]);
});
