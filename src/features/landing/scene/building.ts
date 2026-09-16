import * as THREE from "three";
import { createMaterials, labelTexture } from "./materials";
import { batchStatic } from "./batch-static";
import { stairs } from "./building-layout";
import { roomFireTimeline } from "./fire-timeline";
import { createBuildingDamage } from "./building-damage";

export type FireSource = { position: THREE.Vector3; intensity: number; color: THREE.Color; ignition?: number; exterior?: boolean; drift?: [number, number]; size?: [number, number]; activity?: number; softFloor?: boolean; cameraFacing?: boolean };

export function createBuilding() {
  const group = new THREE.Group(); group.name = "fire3d-building";
  const mat = createMaterials();
  const geometries = new Set<THREE.BufferGeometry>();
  const signMaterials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  const levels: THREE.Group[] = [], roofs: THREE.Object3D[] = [];
  const cutawayShell = new Set<THREE.Object3D>();
  const annotations = new THREE.Group(); annotations.name = "scenario-and-spawn-markers"; group.add(annotations);
  const exterior = new THREE.Group(); exterior.name = "exterior-plaza"; group.add(exterior);
  function box(parent: THREE.Object3D, name: string, size: [number, number, number], at: [number, number, number], material: THREE.Material): THREE.Object3D {
    if (size[2] > 6.5) {
      const section = new THREE.Group(); section.name = name; section.position.set(...at); parent.add(section);
      const count = Math.ceil(size[2] / 6.5), length = size[2] / count;
      for (let part = 0; part < count; part++) box(section, `${name}-section`, [size[0],size[1],length], [0,0,-size[2]/2+length*(part+.5)], material);
      if (["east-spandrel", "east-header", "front-right", "west-stair-wall"].includes(name)) cutawayShell.add(section);
      return section;
    }
    const geometry = new THREE.BoxGeometry(...size); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...at);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    if (["east-spandrel", "east-header", "facade-mullion", "facade-glazing", "front-right", "west-stair-wall"].includes(name)) cutawayShell.add(mesh);
    return mesh;
  }
  function sign(parent: THREE.Object3D, text: string, at: [number, number, number], width: number, background?: string) {
    const texture = labelTexture(text, background); textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture }); signMaterials.push(material);
    return box(parent, `sign-${text}`, [width, width / 4, .035], at, material);
  }
  function rail(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
    const geometry = new THREE.CylinderGeometry(.025, .025, a.distanceTo(b), 8); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat.metal); mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); parent.add(mesh);
  }
  for (let level = 0; level < 3; level++) {
    const floor = new THREE.Group(); floor.name = `floor-${level}`; floor.position.y = level * 3.6; group.add(floor); levels.push(floor);
    box(floor, "floor-slab", [10.4, .22, 19.3], [0, -.11, -.65], mat.floor);
    // Leave the stairwell open through every upper slab.
    box(floor, "rear-floor-east", [7.55, .22, 6.7], [1.425, -.11, -13.65], mat.floor);
    box(floor, "rear-floor-west", [.95, .22, 6.7], [-4.725, -.11, -13.65], mat.floor);
    box(floor, "rear-cross-landing", [1.9, .22, .65], [-3.3, -.11, stairs.landingZ], mat.floor);
    box(floor, "stair-exit-landing", [1.9, .22, .75], [-3.3, -.11, -10.675], mat.floor);
    if (level === 0) box(floor, "ground-stair-base", [1.9, .22, 5.65], [-3.3, -.11, -13.125], mat.floor);
    box(floor, "rear-wall", [10.4, 3.4, .18], [0, 1.7, -17], mat.wall);
    box(floor, "west-spandrel", [.18, .9, 26], [-5.2, .45, -4], mat.wall);
    box(floor, "west-header", [.18, .6, 26], [-5.2, 3.1, -4], mat.wall);
    for (const z of [5, -1, -7]) {
      const pierRear = z + 1.3, pierFront = Math.min(9, z + 4.7);
      box(floor, "west-window-pier", [.18, 1.9, pierFront - pierRear], [-5.2, 1.85, (pierFront + pierRear) / 2], mat.wall);
      box(floor, "west-window-sill", [.3, .1, 2.6], [-5.2, .95, z], mat.metal);
    }
    box(floor, "west-stair-wall", [.18, 1.9, 8.7], [-5.2, 1.85, -12.65], mat.wall);
    box(floor, "east-spandrel", [.18, .9, 26], [5.2, .45, -4], mat.wall);
    box(floor, "east-header", [.18, .6, 26], [5.2, 3.1, -4], mat.wall);
    for (let bay = 0; bay < 9; bay++) {
      const z = 8.5 - bay * 3;
      box(floor, "facade-mullion", [.23, 2.1, .24], [5.2, 1.85, z], mat.metal);
      if (bay < 3 || bay > 5) {
        const front = Math.min(8.84, z - .15), rear = Math.max(-16.84, z - 2.85);
        if (front > rear) box(floor, "facade-glazing", [.06, 1.85, front - rear], [5.2, 1.85, (front + rear) / 2], mat.glass);
      }
    }
    roofs.push(box(floor, "ceiling", [10.4, .14, 26], [0, 3.27, -4], mat.wall));
    for (const side of [-1, 1]) {
      for (const z of [5, -1, -7]) {
        const wall = new THREE.Group(); wall.position.set(side * 1.5, 0, z); floor.add(wall);
        if (side === 1) cutawayShell.add(wall);
        if (z === 5) box(wall, "entry-room-wall", [.16, 3.4, 1], [0, 1.7, 3.5], mat.wall);
        // Jambs and lintel surround an actual open doorway, not a door pasted on a wall.
        box(wall, "room-wall-a", [.16, 3.4, 2.1], [0, 1.7, 1.95], mat.wall);
        box(wall, "room-wall-b", [.16, 3.4, 2.7], [0, 1.7, -1.65], mat.wall);
        box(wall, "door-lintel", [.16, 1.1, 1.2], [0, 2.85, .3], mat.wall);
        box(wall, "lower-wall-a", [.19, 1.03, 2.1], [0, .52, 1.95], mat.lower);
        box(wall, "lower-wall-b", [.19, 1.03, 2.7], [0, .52, -1.65], mat.lower);
        for (const jamb of [-.3, .9]) box(wall, "door-jamb", [.23, 2.35, .07], [0, 1.175, jamb], mat.metal);
        box(wall, "door-head", [.23, .07, 1.27], [0, 2.35, .3], mat.metal);
        const door = new THREE.Group(); door.position.set(side * .1, 0, -.25); door.rotation.y = side * 1.45; wall.add(door);
        box(door, "door-leaf", [.075, 2.25, 1.1], [0, 1.125, .55], mat.door);
        box(door, "door-glazing", [.081, .7, .32], [0, 1.6, .55], mat.glass);
        box(door, "door-handle", [.14, .04, .16], [-side * .08, 1.05, .94], mat.metal);
        const number = sign(wall, `${level + 1}0${Math.abs(z) + 1}`, [-side * .12, 2.62, .3], .5, "#263635"); number.rotation.y = -side * Math.PI / 2;
        box(floor, "room-partition", [3.6, 3.4, .15], [side * 3.35, 1.7, z - 3], mat.wall);
        box(floor, "desk-top", [1.4, .06, .7], [side * 3.2, .76, z], mat.door);
        for (const dx of [-.6, .6]) box(floor, "desk-leg", [.05, .75, .6], [side * 3.2 + dx, .375, z], mat.metal);
      }
    }
    for (const z of [7.8, 2, -4, -10]) {
      for (const x of [-1.32, 1.32]) {
        box(floor, "column", [.22, 3.2, .3], [x, 1.6, z], mat.lower);
        box(floor, "skirting", [.05, .12, 5.5], [x * 1.075, .06, z - 2.8], mat.dark);
      }
      box(floor, "ceiling-beam", [2.8, .17, .32], [0, 3.1, z], mat.lower);
      box(floor, "light-housing", [.25, .08, 1.2], [0, 3.12, z - 1.7], mat.metal);
      box(floor, "fluorescent", [.16, .025, 1.1], [0, 3.065, z - 1.7], mat.lamp);
      if (level === 0) { const light = new THREE.PointLight(0xd0e6dd, 4, 7, 2); light.position.set(0, 2.85, z - 1.7); floor.add(light); }
    }
    if (level < 2) {
    for (let i = 0; i < stairs.count; i++) box(floor, "stair-tread", [1.35, stairs.rise, stairs.run], [stairs.x, (i + 1) * stairs.rise - .09, stairs.bottomZ - i * stairs.run], mat.lower);
    box(floor, "stair-landing", [2.1, .18, .65], [stairs.x, 3.51, stairs.landingZ], mat.floor);
    for (const x of [-4.23, -2.87]) {
      rail(floor, new THREE.Vector3(x, .95, stairs.bottomZ), new THREE.Vector3(x, 4.37, stairs.bottomZ - 19 * stairs.run));
      for (let i = 0; i < stairs.count; i += 3) rail(floor, new THREE.Vector3(x, (i + 1) * stairs.rise, stairs.bottomZ - i * stairs.run), new THREE.Vector3(x, (i + 1) * stairs.rise + .9, stairs.bottomZ - i * stairs.run));
    }
    }
    sign(floor, "EXIT  ←", [0, 2.68, -10.3], .92);
    sign(floor, `LEVEL 0${level + 1}`, [-4.1, 2.6, -16.86], 1.3, "#273c3b");
    for (const x of [-1.32, 1.32]) box(floor, "threshold-jamb", [.18, 2.7, .2], [x, 1.35, -11.2], mat.metal);
    box(floor, "threshold-header", [2.8, .25, .2], [0, 2.77, -11.2], mat.metal);
    box(annotations, `scenario-zone-${level}`, [2.6, .04, 3], [2.8, level * 3.6 + .1, -5], mat.ember);
    // Continuous structure between slabs: no floating, exploded floors.
    for (const x of [-5.2, 5.2]) for (const z of [-17, -4, 9]) box(floor, "structural-pier", [.32, 3.6, .32], [x, 1.8, z], mat.lower);
    box(floor, "front-left", [3.8, 3.6, .18], [-3.3, 1.8, 9], mat.wall);
    box(floor, "front-right", [3.8, 3.6, .18], [3.3, 1.8, 9], mat.wall);
    box(floor, "front-lintel", [2.8, .8, .18], [0, 3.2, 9], mat.lower);
  }
  box(levels[0], "burning-storage", [.52, .7, .65], [1.08, .35, 1.3], mat.soot);
  box(levels[0], "burning-chair", [.55, .45, .55], [-1.05, .22, -7.2], mat.soot);
  const plazaMaterial = mat.floor.clone(), pathMaterial = mat.lower.clone();
  signMaterials.push(plazaMaterial, pathMaterial);
  box(exterior, "plaza", [38, .15, 52], [0, -.3, -1], plazaMaterial);
  box(exterior, "entry-path", [3.3, .08, 15], [0, -.16, 16], pathMaterial);
  const spreadSources: FireSource[] = [];
  // Burning debris along stair edges, leaving the authored walking centre clear.
  for (let floor = 0; floor < 2; floor++) {
    for (const [index, tread] of [3, 10, 17].entries()) {
      spreadSources.push({
        position: new THREE.Vector3(stairs.x - .52, floor * 3.6 + (tread + 1) * stairs.rise + .02, stairs.bottomZ - tread * stairs.run),
        intensity: .35, color: new THREE.Color(0xff802c), exterior: true,
        ignition: 8 + floor * 4 + index * 3, size: [.5, .75], drift: [-.1, -.25],
      });
    }
    spreadSources.push({
      position: new THREE.Vector3(stairs.x - .8, (floor + 1) * 3.6 + .02, stairs.landingZ),
      intensity: .4, color: new THREE.Color(0xff802c), exterior: true,
      ignition: 15 + floor * 4, size: [.7, .8], drift: [-.1, -.2],
    });
  }
  for (const [i, z] of [4.1, -2.8, -8.5].entries()) {
    // Low charred debris at the floor edge, not a row of storage bins.
    box(levels[2], "scorched-corridor-floor", [.28, .012, 1.1], [1.18, .006, z], mat.soot);
    spreadSources.push({ position: new THREE.Vector3(1.18, 7.23, z), intensity: .7,
      color: new THREE.Color(0xff7826), ignition: 2 + i * 4, exterior: true,
      size: [.65, .55 + i * .12] });
  }
  for (let i = 0; i < 6; i++) {
    const z = 1.3 - i * .65;
    box(levels[0], "burning-skirting", [.23, .22, .6], [1.25, .11, z], mat.soot);
    spreadSources.push({ position: new THREE.Vector3(1.23, .18, z), intensity: .38, color: new THREE.Color(0xff762e), ignition: 2 + i * 2 });
  }
  // Each storey has different ignition rooms. Spread travels from furniture toward
  // the opening, not up an identical vertical stack of facade flame sprites.
  for (let level = 0; level < 3; level++) for (const side of [-1, 1]) {
    for (let roomIndex = 0; roomIndex < 3; roomIndex++) {
      const seed = level * 11 + roomIndex * 3 + side;
      const z = [5, -1, -7][roomIndex] + Math.sin(seed) * .55;
      const timeline = roomFireTimeline(level, side, roomIndex);
      box(levels[level], "charred-room-furniture", [1.1, .48, .75], [side * 3.5, .24, z], mat.soot);
      // Exterior fire uses the wall-bound volume, not floating crossed cards.
      spreadSources.push({
        position: new THREE.Vector3(side * 3.35, level * 3.6 + .48, z),
        intensity: .65, color: new THREE.Color(0xff802c),
        ignition: timeline.ignition, exterior: level > 0,
        drift: [side * .25, Math.sin(seed * 1.7) * .55],
        size: [1.8 + .45 * Math.sin(seed * 2.4), .9 + .2 * Math.cos(seed)],
      });
    }
  }
  const routePoints = [new THREE.Vector3(-3.5, .15, -12), new THREE.Vector3(0, .15, -12), new THREE.Vector3(0, .15, -5), new THREE.Vector3(2.8, .15, -5), new THREE.Vector3(2.8, 3.75, -5), new THREE.Vector3(2.8, 7.35, -5)];
  const routeGeometry = new THREE.BufferGeometry().setFromPoints(routePoints); geometries.add(routeGeometry);
  const routeMaterial = new THREE.LineBasicMaterial({ color: 0xee8654 }); signMaterials.push(routeMaterial);
  annotations.add(new THREE.Line(routeGeometry, routeMaterial));
  sign(annotations, "START", [-2.8, .8, -11], 1.1).rotation.y = .45;
  annotations.visible = false;
  const excluded = new Set([...roofs, ...cutawayShell]);
  [...roofs, ...cutawayShell].forEach(root => root.traverse(child => excluded.add(child)));
  levels.forEach(floor => batchStatic(floor, excluded).forEach(geometry => geometries.add(geometry)));
  const damage = createBuildingDamage(levels, group, new Set([...roofs, ...cutawayShell]));
  return {
    group,
    updateDamage(time: number) {
      annotations.visible = annotations.visible && time < 110;
      return damage.update(time);
    },
    fireSources: [
      { position: new THREE.Vector3(1.08, .45, 1.3), intensity: 1, color: new THREE.Color(0xff762e) },
      { position: new THREE.Vector3(-1.05, .3, -7.2), intensity: .7, color: new THREE.Color(0xff984c) },
      ...spreadSources,
    ],
    reveal(amount: number) {
      levels.forEach((floor, i) => { floor.position.y = i * 3.6; floor.visible = i === 0 || amount > .01; });
      roofs.forEach((roof, i) => { roof.visible = i === 2 || amount < .08; });
      cutawayShell.forEach(part => { part.visible = amount < .5; });
      exterior.visible = amount > .05;
      annotations.visible = amount > .6;
      routeGeometry.setDrawRange(0, Math.floor(THREE.MathUtils.clamp((amount - .6) / .4, 0, 1) * routePoints.length));
    },
    dispose() { damage.dispose(); geometries.forEach(g => g.dispose()); signMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); mat.dispose(); group.clear(); },
  };
}
