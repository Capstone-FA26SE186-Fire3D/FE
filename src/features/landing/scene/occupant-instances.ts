import * as THREE from "three";

/** Share draw calls without sharing each person's pose or trajectory. */
export function createOccupantInstances(actors: THREE.Group) {
  const group = new THREE.Group(); group.name = "instanced-occupant-bodies";
  const buckets = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; members: { mesh: THREE.Mesh; actor: THREE.Object3D }[] }>();
  for (const actor of actors.children) actor.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const key = `${object.geometry.uuid}:${object.material.uuid}`;
    const bucket = buckets.get(key) ?? { geometry: object.geometry, material: object.material, members: [] as { mesh: THREE.Mesh; actor: THREE.Object3D }[] };
    bucket.members.push({ mesh: object, actor }); buckets.set(key, bucket);
    object.visible = false;
  });
  const batches = [...buckets.values()].map(bucket => {
    const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.members.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true; mesh.frustumCulled = false; group.add(mesh);
    return { mesh, members: bucket.members };
  });
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    update() {
      actors.updateMatrixWorld(true);
      for (const batch of batches) {
        batch.members.forEach(({ mesh, actor }, index) => batch.mesh.setMatrixAt(index, actor.visible ? mesh.matrixWorld : hidden));
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { batches.forEach(batch => batch.mesh.dispose()); group.clear(); },
  };
}
