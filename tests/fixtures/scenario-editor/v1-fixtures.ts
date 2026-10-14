/**
 * fet3d.editor/1 fixtures for the editor tests (BE contracts/editor/v1 @ BE main 1eaf988). Mock evidence, NOT a real worker artifact:
 * the floors/transform are the BE fixture values, the GLB is the hand-built two-storey box model.
 */
import { BUILDING_ID, GLB_URL, REVISION_ID } from "./fixture-building";

export const NEW_DRAFT_ID = "55555555-5555-4555-8555-555555555555";
export const ARTIFACT_ID = "5f0f3d6e-8e43-4c36-9d2a-6c6c3e1b7a10";
export const GEOMETRY_HASH = "b".repeat(64);

/** 22-character IFC GlobalId made from a short seed (the contract only checks `^[0-9A-Za-z_$]{22}$`). */
export const gid = (seed: string) => `${seed}0000000000000000000000`.slice(0, 22);

/** IFC mm / Z-up → GLB m / Y-up: IFC (1000, 2000, 3000) → GLB (-9, 3, 3). */
export const V1_COORDINATE_TRANSFORM = [0.001, 0, 0, 0, 0, 0, -0.001, 0, 0, 0.001, 0, 0, -10, 0, 5, 1];
export const V1_FLOORS = [
  { id: "L1", name: "Tầng 1", elevationMeters: 0, ifcGlobalId: "0BTBFw6f90Nfh9rP1dlXrb", transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  { id: "L2", name: "Tầng 2", elevationMeters: 3.5, ifcGlobalId: "0BTBFw6f90Nfh9rP1dlXrc", transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 3.5, 0, 1] },
];
export const V1_SEMANTIC_MAPPING = [
  { ifcGlobalId: "1hOSvn6df7F8_7GcBWlRGQ", nodeId: "door_101", floorId: "L1", semanticType: "IfcDoor" },
  { ifcGlobalId: "1hOSvn6df7F8_7GcBWlRGR", nodeId: "door_102", floorId: "L1", semanticType: "IfcDoor" },
  { ifcGlobalId: "2O2Fr$t4X7Zf8NOew3FLOH", nodeId: "stair_1", floorId: "L1", semanticType: "IfcStair" },
  { ifcGlobalId: "3cUkl32yn9qRSPvBJVyWYp", nodeId: "space_201", floorId: "L2", semanticType: "IfcSpace" },
  // Node names that exist in the hand-built GLB, so picking a wall on the model can offer it as an anchor.
  { ifcGlobalId: gid("4wallN"), nodeId: "Floor_0_WallN", floorId: "L1", semanticType: "IfcWall" },
  { ifcGlobalId: gid("5wallN"), nodeId: "Floor_1_WallN", floorId: "L2", semanticType: "IfcWall" },
];

export function v1Preview(overrides: Record<string, unknown> = {}) {
  return {
    buildingId: BUILDING_ID, revisionId: REVISION_ID, revisionStatus: "ReadyForScenario", status: "Ready", artifactId: ARTIFACT_ID, attemptId: "66666666-6666-4666-8666-666666666666",
    sha256Hash: GEOMETRY_HASH, downloadUrl: GLB_URL, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    coordinateTransform: V1_COORDINATE_TRANSFORM, floors: V1_FLOORS, semanticMapping: V1_SEMANTIC_MAPPING,
    schemaVersion: "fet3d.editor/1", units: "m", upAxis: "Y", handedness: "right", ...overrides,
  };
}

/** Legacy Geometry metadata: the BE reports ReprocessRequired with no coordinates, floors, mapping or URL. */
export function reprocessPreview() {
  return { buildingId: BUILDING_ID, revisionId: REVISION_ID, revisionStatus: "ReadyForScenario", status: "ReprocessRequired", artifactId: ARTIFACT_ID, attemptId: "66666666-6666-4666-8666-666666666666", sha256Hash: GEOMETRY_HASH, downloadUrl: null, expiresAt: null, coordinateTransform: null, floors: null, semanticMapping: null, schemaVersion: null, units: null, upAxis: null, handedness: null };
}

export type FloorsStatus = "Ready" | "NotReady" | "ReprocessRequired";

export function floorsResponse(status: FloorsStatus) {
  const ready = status === "Ready";
  return { revisionId: REVISION_ID, buildingId: BUILDING_ID, status, artifactId: status === "NotReady" ? null : ARTIFACT_ID, sha256Hash: status === "NotReady" ? null : GEOMETRY_HASH, schemaVersion: ready ? "fet3d.editor/1" : null, floors: ready ? V1_FLOORS : null };
}

/** `runtime-catalog.sample.json` of the BE contract (a test fixture there, not a seed: operators publish the real catalog). */
export const SAMPLE_RUNTIME_CATALOG = [{
  runtimeVersion: "1.4.0", protocolVersion: "1", manifestSchemaVersion: "1",
  capabilities: ["fire.source", "npc.evacuee", "equipment.extinguisher", "smoke.spread"],
  capabilityContracts: {
    "fire.source": { version: "1.0.0", objectKinds: ["Hazard"], description: "Point fire source.", parameters: { type: "object", additionalProperties: false, required: ["intensity"], properties: { intensity: { type: "number", minimum: 0, maximum: 10 }, activationSeconds: { type: "integer", minimum: 0, maximum: 3600 } } } },
    "npc.evacuee": { version: "2.1.0", objectKinds: ["Npc"], parameters: { type: "object", additionalProperties: false, properties: { behaviour: { type: "string", enum: ["follow", "panic", "wait"] }, mobilityImpaired: { type: "boolean" } } } },
    "equipment.extinguisher": { version: "1.0.0", objectKinds: ["Equipment"], parameters: { type: "object", additionalProperties: false, properties: { agent: { type: "string", enum: ["CO2", "Powder", "Foam"] } } } },
  },
}];

/** `GET /api/scenario-rubrics/catalog` (OpenAPI RubricCatalog). The metrics are the BE's server-computed ones; the UI adds none. */
export const RUBRIC_CATALOG = {
  supportedSchemaVersions: ["1"], defaultSchemaVersion: "1",
  metrics: [
    { id: "reached_exit", description: "Người học đến được lối thoát." }, { id: "completion_time_seconds", description: "Thời gian hoàn thành (giây)." },
    { id: "wrong_exits", description: "Số lần chọn sai lối thoát." }, { id: "hazard_exposure", description: "Mức tiếp xúc nguy cơ." }, { id: "distance_meters", description: "Quãng đường di chuyển (mét)." },
  ],
  operators: ["gte", "lte", "eq"], maxCriteria: 100, rubricFields: ["schema_version", "pass_threshold", "criteria"],
  criterion: { requiredFields: ["id", "metric", "mandatory", "weight", "threshold", "operator"], optionalFields: ["description"], idPattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$", idMaxLength: 128, descriptionMaxLength: 1000, weightMinimum: 0 },
};
