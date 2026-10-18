import * as THREE from "three";
import { IfcAPI } from "web-ifc";
import { disposeObject3D } from "./dispose";
import { buildSceneScan, categorizeIfcType, classifyIfcType } from "./scan-suggestions";
import type { IfcBounds, IfcCategory, IfcElementDetails, IfcScanElement, IfcSceneScan, IfcStorey } from "./types";

export type IfcLoadPhase = "parse" | "geometry" | "edges";
export type IfcLoadProgress = { completed: number; total: number; phase?: IfcLoadPhase };

export type IfcMeshData = {
  expressID: number;
  typeName: string;
  category: IfcCategory;
  storeyID: number | null;
  ifcColor: readonly [number, number, number, number];
};

export type LoadedIfcModel = {
  group: THREE.Group;
  scan: IfcSceneScan;
  storeys: IfcStorey[];
  /** Floor level of each storey in viewer metres, measured from its own elements. */
  storeyLevels: ReadonlyMap<number, number>;
  categoryCounts: Readonly<Record<IfcCategory, number>>;
  triangleCount: number;
  meshes: readonly THREE.Mesh[];
  getDetails: (expressID: number) => IfcElementDetails | null;
  dispose: () => void;
};

/** Above this many triangles the viewer skips crease edges to stay interactive. */
export const EDGE_TRIANGLE_BUDGET = 900_000;
const EDGE_THRESHOLD_DEGREES = 28;
const YIELD_EVERY = 160;

type IfcRuntimeBinding = { delete?: unknown };

export function releaseIfcBinding(binding: IfcRuntimeBinding): void {
  if (typeof binding.delete === "function") binding.delete();
}

/**
 * web-ifc returns one interleaved float array per geometry: x, y, z, nx, ny, nz for every vertex.
 * Reading it as plain positions (stride 3) joins unrelated vertices and draws the shattered triangles
 * users saw on import, so position and normal are split from the same buffer here.
 */
export function buildIfcGeometry(vertexData: Float32Array, indexData: Uint32Array): THREE.BufferGeometry {
  if (vertexData.length % 6 !== 0) throw new Error(`Dữ liệu đỉnh IFC không hợp lệ (${vertexData.length} số).`);
  const interleaved = new THREE.InterleavedBuffer(new Float32Array(vertexData), 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
  geometry.setAttribute("normal", new THREE.InterleavedBufferAttribute(interleaved, 3, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexData), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function toBounds(box: THREE.Box3 | undefined): IfcBounds | null {
  if (!box || box.isEmpty()) return null;
  return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
}

function nextFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function emptyCategoryCounts(): Record<IfcCategory, number> {
  return { wall: 0, slab: 0, roof: 0, door: 0, window: 0, stair: 0, railing: 0, structure: 0, space: 0, furniture: 0, equipment: 0, site: 0, other: 0 };
}

type SpatialNode = { expressID: number; type: string; children: SpatialNode[] };

/** Maps every element contained (directly or through decomposition) in a storey to that storey. */
function collectStoreys(root: SpatialNode) {
  const storeyNodes: SpatialNode[] = [];
  const storeyOf = new Map<number, number>();

  const visit = (node: SpatialNode, storeyID: number | null) => {
    const isStorey = node.type.toUpperCase() === "IFCBUILDINGSTOREY";
    const owner = isStorey ? node.expressID : storeyID;
    if (isStorey) storeyNodes.push(node);
    else if (owner !== null) storeyOf.set(node.expressID, owner);
    for (const child of node.children) visit(child, owner);
  };
  visit(root, null);
  return { storeyNodes, storeyOf };
}

function readText(value: unknown): string | null {
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value: unknown }).value;
    return inner === null || inner === undefined || inner === "" ? null : String(inner);
  }
  return null;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export async function loadIfcFile(file: File, onProgress?: (progress: IfcLoadProgress) => void): Promise<LoadedIfcModel> {
  const api = new IfcAPI();
  let modelID: number | null = null;
  const group = new THREE.Group();
  group.name = file.name;

  try {
    onProgress?.({ completed: 0, total: 1, phase: "parse" });
    api.SetWasmPath("/ifc/", true);
    await api.Init();
    modelID = api.OpenModel(new Uint8Array(await file.arrayBuffer()), { COORDINATE_TO_ORIGIN: true });
    if (modelID < 0) throw new Error("Không thể mở tệp IFC này.");
    const openModel = modelID;

    const { storeyNodes, storeyOf } = collectStoreys(await api.properties.getSpatialStructure(openModel, false) as SpatialNode);
    await nextFrame();

    const flatMeshes = api.LoadAllGeometry(openModel);
    const total = flatMeshes.size();
    const boundsByExpressID = new Map<number, THREE.Box3>();
    const typeByExpressID = new Map<number, string>();
    const meshes: THREE.Mesh[] = [];
    const placeholder = new THREE.MeshBasicMaterial();
    let triangleCount = 0;

    for (let index = 0; index < total; index += 1) {
      const flatMesh = flatMeshes.get(index);
      const typeName = api.GetNameFromTypeCode(api.GetLineType(openModel, flatMesh.expressID));
      typeByExpressID.set(flatMesh.expressID, typeName);
      const category = categorizeIfcType(typeName);

      for (let geometryIndex = 0; geometryIndex < flatMesh.geometries.size(); geometryIndex += 1) {
        const placed = flatMesh.geometries.get(geometryIndex);
        const ifcGeometry = api.GetGeometry(openModel, placed.geometryExpressID);
        const geometry = buildIfcGeometry(
          api.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize()),
          api.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize()),
        );
        releaseIfcBinding(ifcGeometry);
        if (!geometry.index?.count) { geometry.dispose(); continue; }

        const mesh = new THREE.Mesh(geometry, placeholder);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.fromArray(placed.flatTransformation);
        mesh.updateMatrixWorld(true);
        const data: IfcMeshData = {
          expressID: flatMesh.expressID,
          typeName,
          category,
          storeyID: storeyOf.get(flatMesh.expressID) ?? null,
          ifcColor: [placed.color.x, placed.color.y, placed.color.z, placed.color.w],
        };
        mesh.userData = { ...data, kind: classifyIfcType(typeName) };
        group.add(mesh);
        meshes.push(mesh);
        triangleCount += geometry.index.count / 3;

        const bounds = geometry.boundingBox?.clone().applyMatrix4(mesh.matrix);
        if (bounds) boundsByExpressID.set(flatMesh.expressID, boundsByExpressID.get(flatMesh.expressID)?.union(bounds) ?? bounds);
      }

      releaseIfcBinding(flatMesh);
      if (index % YIELD_EVERY === 0 || index === total - 1) {
        onProgress?.({ completed: index + 1, total, phase: "geometry" });
        await nextFrame();
      }
    }

    // Storey floor levels come from the geometry itself so they share the viewer's units and origin shift.
    const minsByStorey = new Map<number, number[]>();
    boundsByExpressID.forEach((box, expressID) => {
      const storeyID = storeyOf.get(expressID);
      if (storeyID === undefined) return;
      const list = minsByStorey.get(storeyID) ?? [];
      list.push(box.min.y);
      minsByStorey.set(storeyID, list);
    });
    const storeyLevels = new Map<number, number>();
    const storeys: IfcStorey[] = storeyNodes.map((node) => {
      const line = api.GetLine(openModel, node.expressID);
      const level = percentile(minsByStorey.get(node.expressID) ?? [], 0.12);
      if (level !== null) storeyLevels.set(node.expressID, level);
      return {
        expressID: node.expressID,
        name: readText(line?.Name) ?? readText(line?.LongName) ?? `Tầng #${node.expressID}`,
        elevation: level,
        elementCount: minsByStorey.get(node.expressID)?.length ?? 0,
      };
    }).sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));

    // Elements outside the spatial tree (common in Revit exports) join the storey whose floor is just below them.
    const orderedLevels = storeys.filter((storey) => storeyLevels.has(storey.expressID));
    for (const mesh of meshes) {
      const data = mesh.userData as IfcMeshData;
      if (data.storeyID !== null || !orderedLevels.length) continue;
      const minY = boundsByExpressID.get(data.expressID)?.min.y ?? 0;
      const below = orderedLevels.filter((storey) => (storeyLevels.get(storey.expressID) ?? 0) <= minY + 0.3);
      data.storeyID = (below.at(-1) ?? orderedLevels[0]).expressID;
    }

    if (triangleCount <= EDGE_TRIANGLE_BUDGET) {
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1b2225, transparent: true, opacity: 0.55 });
      for (let index = 0; index < meshes.length; index += 1) {
        const mesh = meshes[index];
        const category = (mesh.userData as IfcMeshData).category;
        if (category === "space" || category === "site") continue;
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEGREES), edgeMaterial);
        edges.name = "ifc-edges";
        edges.raycast = () => {};
        mesh.add(edges);
        if (index % YIELD_EVERY === 0) {
          onProgress?.({ completed: index + 1, total: meshes.length, phase: "edges" });
          await nextFrame();
        }
      }
    }

    const categoryCounts = emptyCategoryCounts();
    const countedElements = new Set<number>();
    for (const mesh of meshes) {
      const data = mesh.userData as IfcMeshData;
      if (countedElements.has(data.expressID)) continue;
      countedElements.add(data.expressID);
      categoryCounts[data.category] += 1;
    }

    const semantic: IfcScanElement[] = [];
    for (const { typeID, typeName } of api.GetAllTypesOfModel(openModel)) {
      const kind = classifyIfcType(typeName);
      if (kind === "other") continue;
      const ids = api.GetLineIDsWithType(openModel, typeID);
      for (let index = 0; index < ids.size(); index += 1) {
        const expressID = ids.get(index);
        semantic.push({ expressID, typeName, kind, bounds: toBounds(boundsByExpressID.get(expressID)) });
      }
    }
    const scan = buildSceneScan(file.name, api.GetModelSchema(openModel), semantic.sort((left, right) => left.expressID - right.expressID));
    const storeyNames = new Map(storeys.map((storey) => [storey.expressID, storey.name]));
    let disposed = false;

    onProgress?.({ completed: total, total, phase: "geometry" });

    return {
      group,
      scan,
      storeys,
      storeyLevels,
      categoryCounts,
      triangleCount,
      meshes,
      getDetails: (expressID) => {
        if (disposed) return null;
        const line = api.GetLine(openModel, expressID);
        const typeName = typeByExpressID.get(expressID) ?? api.GetNameFromTypeCode(api.GetLineType(openModel, expressID));
        const box = boundsByExpressID.get(expressID);
        const size = box ? box.getSize(new THREE.Vector3()) : null;
        const owner = meshes.find((mesh) => (mesh.userData as IfcMeshData).expressID === expressID);
        const storeyID = owner ? (owner.userData as IfcMeshData).storeyID : storeyOf.get(expressID) ?? null;
        return {
          expressID,
          typeName,
          category: categorizeIfcType(typeName),
          globalId: readText(line?.GlobalId),
          name: readText(line?.Name),
          objectType: readText(line?.ObjectType) ?? readText(line?.PredefinedType),
          storeyName: storeyID === null ? null : storeyNames.get(storeyID) ?? null,
          size: size ? [size.x, size.y, size.z] : null,
        };
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        disposeObject3D(group);
        placeholder.dispose();
        api.CloseModel(openModel);
        api.Dispose();
      },
    };
  } catch (error) {
    disposeObject3D(group);
    if (modelID !== null && modelID >= 0) api.CloseModel(modelID);
    api.Dispose();
    throw error instanceof Error ? error : new Error("Không thể đọc tệp IFC này.");
  }
}
