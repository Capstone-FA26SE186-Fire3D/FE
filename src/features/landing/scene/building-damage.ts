import * as THREE from "three";
import { bayFall, collapseBay } from "./collapse-timeline";

/** Authored cinematic collapse, timed in seconds spent viewing the cutaway. */
export function createBuildingDamage(levels: THREE.Group[], parent: THREE.Group, visibilityControlled: ReadonlySet<THREE.Object3D> = new Set()) {
  const originals = new Map<THREE.Material, { color: THREE.Color; emissive?: THREE.Color }>();
  parent.updateMatrixWorld(true);
  const pieces: { mesh: THREE.Mesh; position: THREE.Vector3; rotation: THREE.Quaternion; centre: THREE.Vector3; height: number; level: number; bay: number }[] = [];
  levels.forEach((level, index) => level.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeBoundingBox();
    const centre = object.geometry.boundingBox!.getCenter(new THREE.Vector3()).multiply(object.scale);
    const world = object.localToWorld(object.geometry.boundingBox!.getCenter(new THREE.Vector3()));
    pieces.push({ mesh: object, position: object.position.clone(), rotation: object.quaternion.clone(), centre,
      height: world.y, level: index, bay: collapseBay(world.z) });
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if ((material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) && !originals.has(material)) {
        originals.set(material, { color: material.color.clone(), emissive: material instanceof THREE.MeshStandardMaterial ? material.emissive.clone() : undefined });
      }
    });
  }));
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x252321, roughness: 1 });
  const rubble = new THREE.InstancedMesh(geometry, material, 180);
  rubble.name = "collapsed-building-debris"; rubble.frustumCulled = false;
  rubble.castShadow = rubble.receiveShadow = true; parent.add(rubble);
  const pose = new THREE.Object3D(), char = new THREE.Color(0x171513);
  const tilt = new THREE.Quaternion(), angles = new THREE.Euler(), offset = new THREE.Vector3();
  return {
    update(time: number) {
      const soot = THREE.MathUtils.smoothstep(time, 65, 105);
      const collapse = THREE.MathUtils.smoothstep(time, 110, 143);
      originals.forEach((original, item) => {
        const colored = item as THREE.MeshStandardMaterial;
        colored.color.copy(original.color).lerp(char, soot * .94);
        if (original.emissive) colored.emissive.copy(original.emissive).multiplyScalar(1 - soot);
      });
      pieces.forEach((piece, index) => {
        const fall = bayFall(time, piece.level, piece.bay);
        const seed = piece.bay*3.7 + index*.61;
        angles.set(Math.sin(seed)*fall*.85, Math.cos(seed)*fall*.25, Math.sin(seed*2)*fall*.65);
        tilt.setFromEuler(angles);
        piece.mesh.quaternion.copy(piece.rotation).multiply(tilt);
        piece.mesh.position.copy(piece.position).add(offset.copy(piece.centre).applyQuaternion(piece.rotation));
        piece.mesh.position.sub(offset.copy(piece.centre).applyQuaternion(piece.mesh.quaternion));
        piece.mesh.position.x += Math.sin(seed)*fall*.55;
        piece.mesh.position.y -= Math.max(0,piece.height-(.3+piece.level*.3))*fall;
        // reveal() owns shell/roof visibility and runs before damage each frame.
        // Collapse may hide those pieces, but must never reveal a cutaway panel.
        piece.mesh.visible = fall < .995 && (!visibilityControlled.has(piece.mesh) || piece.mesh.visible);
      });
      rubble.visible = collapse > .01;
      if (!rubble.visible) return collapse;
      for (let i=0; i<180; i++) {
        const seed = i*2.399;
        const x = Math.sin(seed)*5, z = -4+Math.cos(seed*1.7)*12;
        const fall = bayFall(time,i%3,collapseBay(z));
        const height = .15 + (i%7)*.13;
        pose.position.set(x+Math.sin(seed*3)*fall*1.5, THREE.MathUtils.lerp(1+(i%3)*3.6,height,fall), z+Math.cos(seed*3)*fall);
        pose.rotation.set(seed*fall,seed*.7*fall,seed*.3*fall);
        pose.scale.set((.45+(i%5)*.3)*fall, .2*fall, (.5+(i%4)*.35)*fall);
        pose.updateMatrix(); rubble.setMatrixAt(i,pose.matrix);
      }
      rubble.instanceMatrix.needsUpdate = true;
      return collapse;
    },
    dispose() { rubble.dispose(); geometry.dispose(); material.dispose(); parent.remove(rubble); },
  };
}
