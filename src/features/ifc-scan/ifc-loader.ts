import * as THREE from "three";
import { IfcAPI } from "web-ifc";
import { disposeObject3D } from "./dispose";
import { buildSceneScan, classifyIfcType } from "./scan-suggestions";
import type { IfcBounds, IfcScanElement, IfcSceneScan } from "./types";

export type IfcLoadProgress = { completed: number; total: number };

export type LoadedIfcModel = {
  group: THREE.Group;
  scan: IfcSceneScan;
  dispose: () => void;
};

type IfcRuntimeBinding = { delete?: unknown };

export function releaseIfcBinding(binding: IfcRuntimeBinding): void {
  if (typeof binding.delete === "function") binding.delete();
}

function materialFor(color: { x: number; y: number; z: number; w: number }, cache: Map<string, THREE.MeshStandardMaterial>) {
  const key = [color.x, color.y, color.z, color.w].map((value) => value.toFixed(3)).join(":");
  const existing = cache.get(key);
  if (existing) return existing;

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color.x, color.y, color.z),
    opacity: Math.max(0.2, color.w),
    transparent: color.w < 0.99,
    roughness: 0.82,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  cache.set(key, material);
  return material;
}

function toBounds(box: THREE.Box3 | undefined): IfcBounds | null {
  if (!box || box.isEmpty()) return null;
  return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
}

function collectSemanticElements(api: IfcAPI, modelID: number, boundsByExpressID: ReadonlyMap<number, THREE.Box3>): IfcScanElement[] {
  const elements: IfcScanElement[] = [];

  for (const { typeID, typeName } of api.GetAllTypesOfModel(modelID)) {
    const kind = classifyIfcType(typeName);
    if (kind === "other") continue;
    const ids = api.GetLineIDsWithType(modelID, typeID);
    for (let index = 0; index < ids.size(); index += 1) {
      const expressID = ids.get(index);
      elements.push({ expressID, typeName, kind, bounds: toBounds(boundsByExpressID.get(expressID)) });
    }
  }

  return elements.sort((left, right) => left.expressID - right.expressID);
}

export async function loadIfcFile(file: File, onProgress?: (progress: IfcLoadProgress) => void): Promise<LoadedIfcModel> {
  const api = new IfcAPI();
  let modelID: number | null = null;
  const group = new THREE.Group();
  const materials = new Map<string, THREE.MeshStandardMaterial>();

  try {
    api.SetWasmPath("/ifc/", true);
    await api.Init();
    modelID = api.OpenModel(new Uint8Array(await file.arrayBuffer()), { COORDINATE_TO_ORIGIN: true });
    if (modelID < 0) throw new Error("Không thể mở tệp IFC này.");

    const flatMeshes = api.LoadAllGeometry(modelID);
    const boundsByExpressID = new Map<number, THREE.Box3>();
    const total = flatMeshes.size();

    for (let index = 0; index < total; index += 1) {
      const flatMesh = flatMeshes.get(index);
      const typeName = api.GetNameFromTypeCode(api.GetLineType(modelID, flatMesh.expressID));
      const kind = classifyIfcType(typeName);

      for (let geometryIndex = 0; geometryIndex < flatMesh.geometries.size(); geometryIndex += 1) {
        const placedGeometry = flatMesh.geometries.get(geometryIndex);
        const ifcGeometry = api.GetGeometry(modelID, placedGeometry.geometryExpressID);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(api.GetVertexArray(ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize()), 3));
        geometry.setIndex(new THREE.BufferAttribute(api.GetIndexArray(ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize()), 1));
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        const mesh = new THREE.Mesh(geometry, materialFor(placedGeometry.color, materials));
        mesh.matrixAutoUpdate = false;
        mesh.matrix.fromArray(placedGeometry.flatTransformation);
        mesh.userData = { expressID: flatMesh.expressID, typeName, kind };
        group.add(mesh);

        const bounds = geometry.boundingBox?.clone().applyMatrix4(mesh.matrix);
        if (bounds) boundsByExpressID.set(flatMesh.expressID, boundsByExpressID.get(flatMesh.expressID)?.union(bounds) ?? bounds);
        releaseIfcBinding(ifcGeometry);
      }

      releaseIfcBinding(flatMesh);
      onProgress?.({ completed: index + 1, total });
    }

    const scan = buildSceneScan(file.name, api.GetModelSchema(modelID), collectSemanticElements(api, modelID, boundsByExpressID));
    let disposed = false;

    return {
      group,
      scan,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        disposeObject3D(group);
        if (modelID !== null) api.CloseModel(modelID);
        api.Dispose();
      },
    };
  } catch (error) {
    disposeObject3D(group);
    if (modelID !== null) api.CloseModel(modelID);
    api.Dispose();
    throw error instanceof Error ? error : new Error("Không thể đọc tệp IFC này.");
  }
}
