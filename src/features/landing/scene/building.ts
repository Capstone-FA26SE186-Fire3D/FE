import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAYS, BAY_SPAN, COLLAPSE, PLAN, arcPoint, bayCentre, bayFall, routeAngle, smoothstep } from "./layout";

/*
 * Circular three-storey glass building.
 *
 * The ring is built as 8 bays x 3 tiers of shared geometry. Two representations are drawn from it:
 *  - "whole": every bay merged into four meshes (glass, concrete, frames, walls): about a dozen draw calls, used for
 *    the walk-through and the overview;
 *  - "bays": one group per bay/tier that can be moved, used only once the demonstration collapse starts.
 * Glass is alpha-blended and lit by the shared environment map (a cheap reflection, no per-pane refraction).
 * Collapse is authored animation plus instanced debris; there is no physics engine.
 */
const TIER_H = PLAN.tierHeight - PLAN.slab;
const door = (a: number) => Math.abs(Math.atan2(Math.sin(a - PLAN.doorAngle), Math.cos(a - PLAN.doorAngle)));
const DOOR_HALF = PLAN.doorWidth / 2 / PLAN.outerRadius;

/** Cylinder-like geometry for a bay: three.js sweeps with x = r sin t, z = r cos t, so t = pi/2 - phi. */
const sweep = (centre: number) => ({ thetaStart: Math.PI / 2 - centre - BAY_SPAN / 2, thetaLength: BAY_SPAN });

function bayGeometries(bay: number, tier: number) {
  const centre = bayCentre(bay), { thetaStart, thetaLength } = sweep(centre);
  const base = tier * PLAN.tierHeight;
  const hasDoor = tier === 0 && bay === 0;

  // Outer glass (the ground-floor door leaves a gap, so build two arcs around it).
  const glassParts: THREE.BufferGeometry[] = [];
  const arc = (from: number, length: number) => { const g = new THREE.CylinderGeometry(PLAN.outerRadius, PLAN.outerRadius, TIER_H, Math.max(3, Math.round(length / 0.06)), 1, true, from, length); g.translate(0, base + TIER_H / 2, 0); glassParts.push(g); };
  if (hasDoor) { arc(thetaStart, BAY_SPAN / 2 - DOOR_HALF); arc(DOOR_HALF, BAY_SPAN / 2 - DOOR_HALF); }
  else arc(thetaStart, thetaLength);

  // Floor slab (and roof on the top tier).
  const slabParts: THREE.BufferGeometry[] = [];
  const ring = (inner: number, outer: number, y: number) => {
    const profile = [new THREE.Vector2(inner, 0), new THREE.Vector2(outer, 0), new THREE.Vector2(outer, -PLAN.slab), new THREE.Vector2(inner, -PLAN.slab), new THREE.Vector2(inner, 0)];
    const g = new THREE.LatheGeometry(profile, 12, thetaStart, thetaLength); g.translate(0, y, 0); slabParts.push(g);
  };
  ring(PLAN.atriumRadius, PLAN.outerRadius + 0.3, base);
  if (tier === PLAN.tiers - 1) ring(PLAN.atriumRadius + 3, PLAN.outerRadius + 0.6, PLAN.tiers * PLAN.tierHeight);

  // Mullions and transoms (thin boxes along the arc).
  const frameParts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number) => { m.compose(p.set(x, y, z), q.setFromAxisAngle(up, yaw), one); g.applyMatrix4(m); frameParts.push(g); };
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const a = centre - BAY_SPAN / 2 + (i / steps) * BAY_SPAN;
    if (i === steps && bay !== BAYS - 1) continue; // shared edge belongs to the next bay
    if (tier === 0 && door(a) < DOOR_HALF * 1.3) continue;
    place(new THREE.BoxGeometry(0.08, TIER_H, 0.14), Math.cos(a) * PLAN.outerRadius, base + TIER_H / 2, Math.sin(a) * PLAN.outerRadius, -a + Math.PI / 2);
  }
  for (let i = 0; i < steps; i++) {
    const a = centre - BAY_SPAN / 2 + ((i + 0.5) / steps) * BAY_SPAN;
    if (tier === 0 && door(a) < DOOR_HALF * 1.3) continue;
    const chord = (BAY_SPAN / steps) * PLAN.outerRadius * 1.02;
    place(new THREE.BoxGeometry(chord, 0.07, 0.1), Math.cos(a) * PLAN.outerRadius, base + TIER_H, Math.sin(a) * PLAN.outerRadius, -a + Math.PI / 2 + Math.PI);
  }

  // Inner room wall and atrium wall (opaque, double-sided so the corridor and void read from both sides).
  const wallParts: THREE.BufferGeometry[] = [];
  for (const r of [PLAN.roomWallRadius, PLAN.atriumRadius]) { const g = new THREE.CylinderGeometry(r, r, TIER_H, 14, 1, true, thetaStart, thetaLength); g.translate(0, base + TIER_H / 2, 0); wallParts.push(g); }

  const merge = (parts: THREE.BufferGeometry[]) => { const merged = mergeGeometries(parts.map(g => g.toNonIndexed()), false); parts.forEach(g => g.dispose()); return merged; };
  return { glass: merge(glassParts), concrete: merge(slabParts), frames: merge(frameParts), walls: merge(wallParts) };
}

export function createCircularBuilding() {
  const group = new THREE.Group(); group.name = "circular-glass-building";
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };

  const concrete = own(new THREE.MeshStandardMaterial({ color: 0x2b3236, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }));
  const floorMaterial = own(new THREE.MeshStandardMaterial({ color: 0x1d2528, roughness: 0.32, metalness: 0.15 }));
  const wallMaterial = own(new THREE.MeshStandardMaterial({ color: 0x3a4348, roughness: 0.9, side: THREE.DoubleSide }));
  const frameMaterial = own(new THREE.MeshStandardMaterial({ color: 0x9aa7ab, roughness: 0.35, metalness: 0.85 }));
  const glassMaterial = own(new THREE.MeshStandardMaterial({ color: 0x9cc9d1, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }));

  const ground = new THREE.Mesh(own(new THREE.CircleGeometry(140, 72)), own(new THREE.MeshStandardMaterial({ color: 0x050708, roughness: 0.98, envMapIntensity: 0.2 })));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; group.add(ground);
  const plaza = new THREE.Mesh(own(new THREE.RingGeometry(PLAN.outerRadius + 0.4, PLAN.outerRadius + 16, 96)), own(new THREE.MeshStandardMaterial({ color: 0x0e1316, roughness: 0.6, metalness: 0.1, envMapIntensity: 0.4 })));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.01; group.add(plaza);
  // Ground-floor slab is polished; it is not a collapse piece (it is the foundation).
  const foundation = new THREE.Mesh(own(new THREE.CircleGeometry(PLAN.outerRadius + 0.3, 96)), floorMaterial);
  foundation.rotation.x = -Math.PI / 2; foundation.position.y = -0.005; group.add(foundation);
  const skylight = new THREE.Mesh(own(new THREE.CircleGeometry(PLAN.atriumRadius + 3, 72)), own(new THREE.MeshBasicMaterial({ color: 0xcfe6ea })));
  skylight.rotation.x = Math.PI / 2; skylight.position.y = PLAN.tiers * PLAN.tierHeight - 0.05; group.add(skylight);

  // Shared geometry for all 24 bay pieces.
  const pieces: { bay: number; tier: number; geo: ReturnType<typeof bayGeometries> }[] = [];
  for (let tier = 0; tier < PLAN.tiers; tier++) for (let bay = 0; bay < BAYS; bay++) pieces.push({ bay, tier, geo: bayGeometries(bay, tier) });

  // "Whole" representation: merge by material.
  const whole = new THREE.Group(); whole.name = "whole"; group.add(whole);
  const mergeAll = (key: "glass" | "concrete" | "frames" | "walls", material: THREE.Material, order = 0) => {
    const geometry = own(mergeGeometries(pieces.map(piece => piece.geo[key].clone()), false));
    const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = order; mesh.name = `whole-${key}`; whole.add(mesh); return mesh;
  };
  const wholeGlass = mergeAll("glass", glassMaterial, 20); mergeAll("concrete", concrete); mergeAll("frames", frameMaterial); mergeAll("walls", wallMaterial);

  // "Bays" representation: pivoted groups, built once, hidden until collapse starts.
  const bays = new THREE.Group(); bays.name = "bays"; bays.visible = false; group.add(bays);
  const bayGroups = pieces.map(({ bay, tier, geo }) => {
    const centre = bayCentre(bay), pivot = new THREE.Vector3(Math.cos(centre) * 25, tier * PLAN.tierHeight + PLAN.tierHeight / 2, Math.sin(centre) * 25);
    const holder = new THREE.Group(); holder.position.copy(pivot); holder.name = `bay-${bay}-tier-${tier}`;
    const add = (g: THREE.BufferGeometry, material: THREE.Material, order = 0) => { const clone = own(g.clone()); clone.translate(-pivot.x, -pivot.y, -pivot.z); const mesh = new THREE.Mesh(clone, material); mesh.renderOrder = order; holder.add(mesh); };
    add(geo.glass, glassMaterial, 20); add(geo.concrete, concrete); add(geo.frames, frameMaterial); add(geo.walls, wallMaterial);
    bays.add(holder);
    return { holder, bay, tier, pivot, outward: new THREE.Vector3(Math.cos(centre), 0, Math.sin(centre)), axis: new THREE.Vector3(-Math.sin(centre), 0, Math.cos(centre)) };
  });
  for (const piece of pieces) Object.values(piece.geo).forEach(g => g.dispose());

  // Door frame + glow at the main entrance.
  const doorGroup = new THREE.Group(); group.add(doorGroup);
  const doorPost = own(new THREE.BoxGeometry(0.16, 3.1, 0.3));
  for (const side of [-1, 1]) { const post = new THREE.Mesh(doorPost, frameMaterial); post.position.set(side * (PLAN.doorWidth / 2 + 0.08), 1.55, PLAN.outerRadius); doorGroup.add(post); }
  const lintel = new THREE.Mesh(own(new THREE.BoxGeometry(PLAN.doorWidth + 0.4, 0.18, 0.3)), frameMaterial); lintel.position.set(0, 3.1, PLAN.outerRadius); doorGroup.add(lintel);
  const doorGlow = new THREE.Mesh(own(new THREE.PlaneGeometry(PLAN.doorWidth * 1.4, 3)), own(new THREE.MeshBasicMaterial({ color: 0xffc38a, transparent: true, opacity: 0.18, depthWrite: false })));
  doorGlow.position.set(0, 1.5, PLAN.outerRadius + 0.6); doorGroup.add(doorGlow);

  // Interior dressing (instanced): ceiling lights, floor guidance, room doors.
  const interior = new THREE.Group(); interior.name = "interior"; group.add(interior);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, at: (i: number) => { angle: number; radius: number; y: number; yaw?: number }, name: string) => {
    const mesh = new THREE.InstancedMesh(own(geometry), material, count); mesh.name = name;
    for (let i = 0; i < count; i++) { const { angle, radius, y, yaw } = at(i); const [x, , z] = arcPoint(angle, radius, y); q.setFromAxisAngle(up, yaw ?? -angle); m.compose(p.set(x, y, z), q, s); mesh.setMatrixAt(i, m); }
    interior.add(mesh); return mesh;
  };
  const lightCount = 40;
  instanced(new THREE.BoxGeometry(0.4, 0.05, 1.2), own(new THREE.MeshBasicMaterial({ color: 0xeaf6f8 })), lightCount, i => ({ angle: routeAngle(i / (lightCount - 1)) - 0.02, radius: PLAN.corridorRadius, y: TIER_H - 0.06 }), "ceiling-lights");
  const dashCount = 200;
  instanced(new THREE.BoxGeometry(0.18, 0.02, 0.7), own(new THREE.MeshBasicMaterial({ color: 0x5ed3a0 })), dashCount, i => ({ angle: routeAngle(i / (dashCount - 1)), radius: PLAN.corridorRadius - 0.1, y: 0.03 }), "floor-guidance");
  instanced(new THREE.BoxGeometry(1.1, 2.3, 0.1), own(new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.6 })), 28, i => ({ angle: routeAngle((i + 0.5) / 28), radius: PLAN.roomWallRadius - 0.04, y: 1.15, yaw: -routeAngle((i + 0.5) / 28) + Math.PI / 2 }), "room-doors");
  const exitSign = new THREE.Mesh(own(new THREE.BoxGeometry(0.9, 0.25, 0.06)), own(new THREE.MeshBasicMaterial({ color: 0x5ed3a0 })));
  { const a = routeAngle(0.3); const [x, , z] = arcPoint(a, PLAN.roomWallRadius - 0.1, 2.75); exitSign.position.set(x, 2.75, z); exitSign.rotation.y = -a + Math.PI / 2; interior.add(exitSign); }

  // Debris: 6 pieces per bay, instanced; positions are authored parabolas, not simulated.
  const PER_BAY = 6, debrisCount = BAYS * PLAN.tiers * PER_BAY;
  const debris = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)), own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1 })), debrisCount);
  debris.name = "debris"; debris.visible = false; debris.frustumCulled = false; group.add(debris);
  const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const color = new THREE.Color();
  const debrisSpec = Array.from({ length: debrisCount }, (_, i) => {
    const holder = bayGroups[Math.floor(i / PER_BAY)];
    const a = hash(i * 3.1) * Math.PI * 2, r = 3 + hash(i * 5.7) * 9;
    debris.setColorAt(i, color.setHex(hash(i) > 0.5 ? 0x9cc9d1 : 0x59666a));
    return { holder, land: new THREE.Vector3(holder.pivot.x + holder.outward.x * (6 + r * 0.5) + Math.cos(a) * r * 0.6, 0.2 + hash(i * 2.3) * 0.25, holder.pivot.z + holder.outward.z * (6 + r * 0.5) + Math.sin(a) * r * 0.6), size: 0.25 + hash(i * 9.1) * 0.7, spin: (hash(i * 4.4) - 0.5) * 8 };
  });
  if (debris.instanceColor) debris.instanceColor.needsUpdate = true;

  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), euler = new THREE.Euler();
  let collapsing = false;
  function setCollapsing(on: boolean) {
    if (on === collapsing) return; collapsing = on;
    whole.visible = !on; bays.visible = on; interior.visible = !on; debris.visible = on;
    if (!on) for (const g of bayGroups) { g.holder.position.copy(g.pivot); g.holder.quaternion.identity(); g.holder.scale.set(1, 1, 1); }
  }

  return {
    group, glass: glassMaterial,
    /** Glass + mullions toggle for the lab (the whole-building meshes are named whole-*). */
    setGlassVisible(visible: boolean) { wholeGlass.visible = visible; },
    /**
     * Apply the Organization demonstration at `time` seconds (0 resets the building completely). Returns the
     * collapsed fraction (0 standing .. 1 down).
     */
    setDamage(time: number) {
      setCollapsing(time >= COLLAPSE.start);
      if (!collapsing) return 0;
      let total = 0;
      for (const g of bayGroups) {
        const u = bayFall(time, g.tier, g.bay); total += u;
        const drop = u * u * (g.pivot.y - 0.35);
        const lean = (0.28 + 0.1 * (g.bay % 3)) * u * (1 + g.tier * 0.2);
        g.holder.position.set(g.pivot.x + g.outward.x * 4.5 * Math.pow(u, 1.5), g.pivot.y - drop, g.pivot.z + g.outward.z * 4.5 * Math.pow(u, 1.5));
        g.holder.quaternion.setFromAxisAngle(g.axis, lean);
        const squash = 1 - 0.78 * smoothstep(0.72, 1, u);
        g.holder.scale.set(1 + 0.08 * u, squash, 1 + 0.08 * u);
        if (u > 0.999) g.holder.position.y = Math.min(g.holder.position.y, g.pivot.y - (g.pivot.y - 0.35 * squash) + 0.1);
      }
      debrisSpec.forEach((d, i) => {
        const u = bayFall(time, d.holder.tier, d.holder.bay), fly = smoothstep(0, 0.9, u);
        if (u <= 0.001) { debris.setMatrixAt(i, m.makeScale(0.0001, 0.0001, 0.0001)); return; }
        pos.set(THREE.MathUtils.lerp(d.holder.pivot.x, d.land.x, fly), THREE.MathUtils.lerp(d.holder.pivot.y, d.land.y, fly * fly) + Math.sin(fly * Math.PI) * 2.2, THREE.MathUtils.lerp(d.holder.pivot.z, d.land.z, fly));
        qa.setFromEuler(euler.set(u * d.spin, u * d.spin * 0.7, 0)); qb.identity(); qa.multiply(qb);
        m.compose(pos, qa, scl.set(d.size, d.size * 0.6, d.size)); debris.setMatrixAt(i, m);
      });
      debris.instanceMatrix.needsUpdate = true;
      return total / bayGroups.length;
    },
    dispose() { for (const item of disposables) item.dispose(); },
  };
}
