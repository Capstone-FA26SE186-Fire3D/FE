import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { collapseBay } from "./collapse-timeline";

/** Batch only immutable geometry inside one visibility unit (one storey).
 * Animated ceilings, people and effects remain independently owned.
 */
export function batchStatic(root: THREE.Group, excluded: Set<THREE.Object3D>) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<string, THREE.Mesh[]>();
  const centre = new THREE.Vector3();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || excluded.has(object) || Array.isArray(object.material)) return;
    object.geometry.computeBoundingBox();
    object.geometry.boundingBox!.getCenter(centre).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
    const key = `${object.material.uuid}:${collapseBay(centre.z)}`;
    const list = batches.get(key) ?? []; list.push(object); batches.set(key, list);
  });
  const results: THREE.BufferGeometry[] = [];
  for (const meshes of batches.values()) {
    const material = meshes[0].material;
    if (meshes.length < 2) continue;
    const copies = meshes.map(mesh => {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      geometry.deleteAttribute("uv1"); return geometry;
    });
    const geometry = mergeGeometries(copies, false);
    copies.forEach(copy => copy.dispose());
    if (!geometry) continue;
    const merged = new THREE.Mesh(geometry, material); merged.name = "static-bay-batch";
    merged.castShadow = true; merged.receiveShadow = true;
    meshes.forEach(mesh => mesh.removeFromParent()); root.add(merged); results.push(geometry);
  }
  return results;
}
