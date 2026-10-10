/**
 * Hand-built fixtures for the scenario editor tests (mock evidence, NOT a real worker artifact).
 * The GLB is a small two-storey building made of box nodes; `coordinateTransform` is the identity in the
 * column-major 4x4 layout assumed in src/features/scenario-editor/scene/coordinate.ts.
 */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function unitCube() {
  const faces: Array<{ n: number[]; v: number[][] }> = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach((face, f) => {
    face.v.forEach((vertex) => { positions.push(vertex[0] / 2, vertex[1] / 2, vertex[2] / 2); normals.push(...face.n); });
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

export type FixtureOptions = { floors?: number; floorHeight?: number };

export function buildFixtureGlb({ floors = 2, floorHeight = 3.2 }: FixtureOptions = {}): Buffer {
  const cube = unitCube();
  const pos = Buffer.from(cube.positions.buffer);
  const nor = Buffer.from(cube.normals.buffer);
  const idx = Buffer.from(cube.indices.buffer);
  const bin = Buffer.concat([pos, nor, idx]);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);

  const nodes: object[] = [];
  const children: number[] = [];
  const add = (node: object) => { children.push(nodes.length); nodes.push(node); };
  for (let k = 0; k < floors; k++) {
    const y = k * floorHeight;
    add({ name: `Floor_${k}_Slab`, mesh: 0, scale: [20, 0.3, 12], translation: [0, y + 0.15, 0] });
    add({ name: `Floor_${k}_WallN`, mesh: 1, scale: [20, floorHeight - 0.3, 0.3], translation: [0, y + 0.3 + (floorHeight - 0.3) / 2, -5.85] });
    add({ name: `Floor_${k}_WallS`, mesh: 1, scale: [20, floorHeight - 0.3, 0.3], translation: [0, y + 0.3 + (floorHeight - 0.3) / 2, 5.85] });
    add({ name: `Floor_${k}_WallE`, mesh: 1, scale: [0.3, floorHeight - 0.3, 12], translation: [9.85, y + 0.3 + (floorHeight - 0.3) / 2, 0] });
    add({ name: `Floor_${k}_WallW`, mesh: 1, scale: [0.3, floorHeight - 0.3, 12], translation: [-9.85, y + 0.3 + (floorHeight - 0.3) / 2, 0] });
    add({ name: `Floor_${k}_Stair`, mesh: 2, scale: [2.5, floorHeight - 0.3, 5], translation: [7, y + 0.3 + (floorHeight - 0.3) / 2, 0] });
  }
  const root = nodes.length;
  nodes.push({ name: "Building", children });

  const json = {
    asset: { version: "2.0", generator: "fire3d-test-fixture" },
    scene: 0,
    scenes: [{ nodes: [root] }],
    nodes,
    meshes: [
      { name: "slab", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] },
      { name: "wall", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 1 }] },
      { name: "stair", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 2 }] },
    ],
    materials: [
      { name: "slab", pbrMetallicRoughness: { baseColorFactor: [0.62, 0.66, 0.68, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
      { name: "wall", pbrMetallicRoughness: { baseColorFactor: [0.82, 0.8, 0.76, 1], metallicFactor: 0, roughnessFactor: 0.95 } },
      { name: "stair", pbrMetallicRoughness: { baseColorFactor: [0.55, 0.42, 0.34, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length, byteLength: nor.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nor.length, byteLength: idx.length, target: 34963 },
    ],
    buffers: [{ byteLength: binPadded.length }],
  };
  const jsonText = JSON.stringify(json);
  const jsonBuf = Buffer.from(jsonText + " ".repeat((4 - (jsonText.length % 4)) % 4));
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonBuf.length, 0);
  jsonHead.write("JSON", 4, "ascii");
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binPadded.length, 0);
  binHead.write("BIN\0", 4, "ascii");
  return Buffer.concat([header, jsonHead, jsonBuf, binHead, binPadded]);
}

export const FIXTURE_FLOORS = [
  { id: "storey-0", name: "Tầng 1", elevation: 0 },
  { id: "storey-1", name: "Tầng 2", elevation: 3.2 },
];

/** Layer guess (BE#54): `{ category: [glTF node names] }`. */
export const FIXTURE_SEMANTIC_MAPPING = {
  Tường: ["Floor_0_WallN", "Floor_0_WallS", "Floor_0_WallE", "Floor_0_WallW", "Floor_1_WallN", "Floor_1_WallS", "Floor_1_WallE", "Floor_1_WallW"],
  "Cầu thang": ["Floor_0_Stair", "Floor_1_Stair"],
};

export const FIXTURE_IDENTITY = IDENTITY;

export const BUILDING_ID = "11111111-1111-4111-8111-111111111111";
export const SCENARIO_ID = "22222222-2222-4222-8222-222222222222";
export const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
export const REVISION_ID = "44444444-4444-4444-8444-444444444444";

export const GLB_URL = "https://storage.fire3d.test/previews/model.glb?sig=abc";

export function readyPreview(overrides: Record<string, unknown> = {}) {
  return {
    buildingId: BUILDING_ID, revisionId: REVISION_ID, revisionStatus: "ReadyForScenario", status: "Ready", artifactId: "artifact-1", attemptId: "attempt-1",
    sha256Hash: "a".repeat(64), downloadUrl: GLB_URL, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    coordinateTransform: FIXTURE_IDENTITY, floors: FIXTURE_FLOORS, semanticMapping: FIXTURE_SEMANTIC_MAPPING, ...overrides,
  };
}

export function notReadyPreview() {
  return { buildingId: BUILDING_ID, revisionId: REVISION_ID, revisionStatus: "Processing", status: "NotReady", artifactId: null, attemptId: null, sha256Hash: null, downloadUrl: null, expiresAt: null, coordinateTransform: null, floors: null, semanticMapping: null };
}
