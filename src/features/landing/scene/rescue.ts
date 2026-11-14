import * as THREE from "three";
import { heldPose, spawnBody, type Body, type CharacterAssets } from "./characters";
import { ASSEMBLY, ENGINE, ESCAPE_PATHS, GARDEN, GARDEN_RADIUS, JET_TARGET, MODEL_HEIGHT, PLAN, RESCUE_CAST, STAIR, arcPoint, facadeFires, rescuePose, type RescueActor } from "./layout";
import { animationInterval, type Tier } from "./budget";
import { createSmoke, type Emitter } from "./smoke";

/*
 * The rescue stage in front of the main door, seen in the opening aerial view and on the approach: the whole building
 * on fire, a fire engine, four firefighters at work (hose, door, half-way guide, carrying a child out) and everybody
 * else running for the assembly point. Props are built in code; bodies and clips come from the shared character assets.
 */

/** Flames and smoke along the facade and the roof; already burning when the page opens (start times in the past). */
export function facadeEmitters(): Emitter[] {
  return facadeFires().map((f, i) => ({ position: [...f.position] as [number, number, number], start: -30 - (i % 7), scale: f.scale * 1.5 }));
}

function engine() {
  const group = new THREE.Group(); group.name = "fire-engine";
  const red = new THREE.MeshStandardMaterial({ color: 0xc8201a, roughness: 0.45, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c4, roughness: 0.35, metalness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2c36, roughness: 0.15, metalness: 0.6 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  // Length along +Z (cab at the front), 8.4 m long, 2.5 m wide.
  box(2.5, 0.5, 8.4, 0, 0.75, 0, dark);                // chassis
  box(2.5, 2.0, 5.2, 0, 2.0, -1.5, red);               // body
  box(2.52, 0.28, 5.2, 0, 1.75, -1.5, stripe);         // reflective band
  box(2.5, 1.9, 2.3, 0, 1.95, 2.9, red);               // cab
  box(2.3, 0.85, 0.06, 0, 2.35, 4.06, glass);          // windscreen
  box(0.06, 0.7, 1.3, 1.26, 2.35, 3.0, glass); box(0.06, 0.7, 1.3, -1.26, 2.35, 3.0, glass);
  box(2.5, 0.35, 0.25, 0, 0.8, 4.15, steel);           // bumper
  box(0.7, 0.12, 5.6, 0, 3.12, -1.3, steel);           // ladder
  for (let i = 0; i < 9; i++) box(0.9, 0.06, 0.08, 0, 3.2, -3.9 + i * 0.65, steel);
  for (const x of [-1.2, 1.2]) for (const z of [-3.2, -1.6, 2.7]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 16), dark); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.55, z); group.add(wheel);
  }
  // Beacons: red and blue, flashing in turn. Emissive only, no extra lights for the materials around to pay for.
  const beacon = (color: number, x: number) => { const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 3 }); box(0.5, 0.2, 0.34, x, 3.03, 2.9, m); return m; };
  const beacons = [beacon(0xff2a1f, -0.62), beacon(0x2a66ff, 0.62)];
  const head = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2c8, emissiveIntensity: 2.5 });
  box(0.4, 0.22, 0.05, -0.85, 1.25, 4.06, head); box(0.4, 0.22, 0.05, 0.85, 1.25, 4.06, head);
  return { group, beacons, materials: [red, dark, steel, glass, stripe, head, ...beacons] };
}

/**
 * The two stairs beside the door: on each side one flight from the top floor to the first floor and one from there to
 * the ground, following the inner wall of the corridor. One instanced draw; they stay for the walk inside too.
 */
function stairs() {
  const flights = 4, depth = (STAIR.radius * (STAIR.top - STAIR.middle)) / STAIR.steps + 0.03;
  const geometry = new THREE.BoxGeometry(STAIR.width, 0.42, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x8d949a, roughness: 0.85 });
  const mesh = new THREE.InstancedMesh(geometry, material, flights * STAIR.steps);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
  let n = 0;
  for (const side of [1, -1]) for (const [from, to, top] of [[STAIR.top, STAIR.middle, 2], [STAIR.middle, STAIR.foot, 1]] as const) {
    for (let i = 0; i < STAIR.steps; i++) {
      const t = (i + 0.5) / STAIR.steps, angle = PLAN.doorAngle + side * (from + (to - from) * t);
      const p = arcPoint(angle, STAIR.radius, top * PLAN.tierHeight - ((i + 1) * PLAN.tierHeight) / STAIR.steps - 0.21);
      q.setFromAxisAngle(up, -angle); m.compose(at.set(p[0], p[1], p[2]), q, one); mesh.setMatrixAt(n++, m);
    }
  }
  mesh.name = "stairs";
  return { mesh, dispose() { geometry.dispose(); material.dispose(); } };
}

/**
 * The courtyard garden: a lawn, trunks and leafy crowns, three instanced draws. `burn(seconds)` takes the clock of the
 * Organization fire: a plant glows as it catches, then stands charred and thinner; the lawn scorches with them.
 */
function garden() {
  const group = new THREE.Group(); group.name = "garden";
  const lawnMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.95 });
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(GARDEN_RADIUS, 48), lawnMaterial); lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.02; group.add(lawn);
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.2, 1, 7), crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5a4130, roughness: 0.9 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, GARDEN.length);
  // Two overlapping blobs per plant read as foliage rather than a ball on a stick.
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, GARDEN.length * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), colour = new THREE.Color(), tinted = new THREE.Color();
  const leaf = new THREE.Color(0x3f8f45), ember = new THREE.Color(0xff7a1e), char = new THREE.Color(0x15110e), lawnGreen = new THREE.Color(0x2f6b34), scorched = new THREE.Color(0x14120f);
  GARDEN.forEach((plant, i) => { m.compose(p.set(plant.x, plant.height * 0.35, plant.z), q, s.set(1, plant.height * 0.7, 1)); trunks.setMatrixAt(i, m); });
  let last = -1;
  function burn(seconds: number) {
    if (Math.abs(seconds - last) < 0.05) return;
    last = seconds;
    let total = 0;
    GARDEN.forEach((plant, i) => {
      const b = THREE.MathUtils.clamp((seconds - plant.ignite) / 10, 0, 1); total += b;
      // green -> glowing -> charred; the crown shrinks as the leaves go
      if (b < 0.35) colour.copy(leaf).lerp(ember, b / 0.35); else colour.copy(ember).lerp(char, (b - 0.35) / 0.65);
      const size = plant.crown * (1 - 0.45 * b);
      for (let k = 0; k < 2; k++) {
        const tint = k === 0 ? 1 : 0.86;
        m.compose(p.set(plant.x + (k ? plant.crown * 0.35 : 0), plant.height * (k ? 0.72 : 0.9), plant.z + (k ? -plant.crown * 0.25 : 0)), q, s.set(size * (k ? 0.8 : 1), size * (k ? 0.7 : 0.95), size * (k ? 0.8 : 1)));
        crowns.setMatrixAt(i * 2 + k, m); crowns.setColorAt(i * 2 + k, tinted.copy(colour).multiplyScalar(tint));
      }
    });
    crowns.instanceMatrix.needsUpdate = true; if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    lawnMaterial.color.copy(lawnGreen).lerp(scorched, total / GARDEN.length);
  }
  burn(0);
  group.add(trunks, crowns);
  return { group, burn, dispose() { lawn.geometry.dispose(); lawnMaterial.dispose(); trunkGeometry.dispose(); crownGeometry.dispose(); trunkMaterial.dispose(); crownMaterial.dispose(); } };
}

/** A canvas-drawn muster sign, the same green board as in the training app. */
function assemblySign() {
  const group = new THREE.Group(); group.name = "assembly-point";
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#0f7a43"; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "#ffffff"; g.lineWidth = 10; g.strokeRect(12, 12, 488, 232);
  g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "700 62px system-ui, sans-serif"; g.fillText("ĐIỂM TẬP KẾT", 256, 96);
  g.font = "600 40px system-ui, sans-serif"; g.fillText("ASSEMBLY POINT", 256, 178);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const post = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.4, metalness: 0.8 });
  const pad = new THREE.MeshBasicMaterial({ color: 0x1fa35c, transparent: true, opacity: 0.32, depthWrite: false });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 10), post); pole.position.y = 1.6; group.add(pole);
  // The board hangs in front of the post, so the post never crosses the words.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), face); board.position.set(0, 2.75, 0.08); group.add(board);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), post); back.position.set(0, 2.75, 0.06); back.rotation.y = Math.PI; group.add(back);
  const square = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), pad); square.rotation.x = -Math.PI / 2; square.position.y = 0.03; group.add(square);
  return { group, dispose() { texture.dispose(); face.dispose(); post.dispose(); pad.dispose(); group.traverse(o => (o as THREE.Mesh).geometry?.dispose()); } };
}

/** The marked evacuation route: green chevrons on the ground from the door to the assembly point. */
function routeMarks() {
  const path = ESCAPE_PATHS[0], shape = new THREE.Shape();
  shape.moveTo(0, 0.55); shape.lineTo(0.5, 0); shape.lineTo(0.5, -0.3); shape.lineTo(0, 0.25); shape.lineTo(-0.5, -0.3); shape.lineTo(-0.5, 0); shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x35e08a, transparent: true, opacity: 0.55, depthWrite: false });
  const points: { x: number; z: number; yaw: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (let d = 1.2; d < length; d += 2.2) points.push({ x: a[0] + ((b[0] - a[0]) * d) / length, z: a[1] + ((b[1] - a[1]) * d) / length, yaw });
  }
  const mesh = new THREE.InstancedMesh(geometry, material, points.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  // ShapeGeometry rotated flat points its tip to -Z; turn it to the walking direction.
  points.forEach((p, i) => { q.setFromAxisAngle(up, p.yaw + Math.PI); m.compose(new THREE.Vector3(p.x, 0.04, p.z), q, one); mesh.setMatrixAt(i, m); });
  mesh.name = "route-marks";
  return { mesh, material, dispose() { geometry.dispose(); material.dispose(); } };
}

/** Water from the nozzle to the facade: instanced droplets flowing along a ballistic arc, all in the vertex shader. */
function waterJet(count: number) {
  const geometry = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
  geometry.index = quad.index; geometry.setAttribute("position", quad.getAttribute("position")); geometry.setAttribute("uv", quad.getAttribute("uv"));
  const seeds = new Float32Array(count * 4);
  let s = 987654; const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < count * 4; i++) seeds[i] = rand();
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4)); geometry.instanceCount = count;
  const uniforms = { uTime: { value: 0 }, uFrom: { value: new THREE.Vector3() }, uTo: { value: new THREE.Vector3() }, uAmount: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec4 aSeed; uniform float uTime; uniform vec3 uFrom; uniform vec3 uTo; varying vec2 vUv; varying float vA;
      void main(){
        float t = fract(aSeed.x + uTime * (0.75 + aSeed.y * 0.2));
        // 70 % of the drops are the jet; the rest are the splash where it lands.
        float splash = step(0.7, aSeed.w);
        float along = splash > .5 ? 1.0 : t;
        vec3 p = mix(uFrom, uTo, along);
        p.y += 2.6 * 4.0 * along * (1.0 - along);
        float spread = mix(0.03, 0.55, along);
        p += (aSeed.yzw - 0.5) * spread;
        if (splash > .5) { p += vec3(aSeed.y - .5, aSeed.z * 0.2 - t * 1.6, aSeed.x - .5) * (0.6 + t * 2.4); }
        float size = splash > .5 ? mix(0.5, 1.5, t) : mix(0.2, 0.55, along);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv; vUv = uv;
        vA = (splash > .5 ? (1.0 - t) * 0.35 : 0.8) * smoothstep(0.0, 0.04, along);
      }`,
    fragmentShader: `
      uniform float uAmount; varying vec2 vUv; varying float vA;
      void main(){
        float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA * uAmount;
        gl_FragColor = vec4(vec3(0.72, 0.86, 1.0) * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 12; mesh.name = "water-jet";
  return { mesh, uniforms, dispose() { geometry.dispose(); quad.dispose(); material.dispose(); } };
}

/** While carrying, the hips and waist keep their rest rotation (the legs still walk), so the load stays in the arms. */
const STEADY: Record<string, number[]> = { CC_Base_Hip: [0, 0, 0, 1], CC_Base_Waist: [0, 0, 0, 1] };

type Actor = Body & { actor: RescueActor; accumulated: number; frame: number; child?: Body };

export function createRescue(parent: THREE.Object3D, puffs: number, flames: number) {
  const group = new THREE.Group(); group.name = "rescue"; parent.add(group);
  const fire = createSmoke(puffs, flames, facadeEmitters());
  group.add(fire.smoke, fire.flames);
  const truck = engine(); truck.group.position.set(...ENGINE.position); truck.group.rotation.y = ENGINE.yaw; group.add(truck.group);
  const sign = assemblySign(); sign.group.position.set(ASSEMBLY[0], 0, ASSEMBLY[1]); sign.group.rotation.y = Math.atan2(-ASSEMBLY[0] * 0.2, 1); group.add(sign.group);
  const marks = routeMarks(); group.add(marks.mesh);
  const steps = stairs(); parent.add(steps.mesh);
  const plants = garden(); parent.add(plants.group);
  const jet = waterJet(260); group.add(jet.mesh);
  jet.uniforms.uTo.value.set(...JET_TARGET);

  // Fire glow on the forecourt and the people: two warm lights, always present so the lit shaders never recompile.
  const glowA = new THREE.PointLight(0xff6a22, 0, 70, 1.5); glowA.position.set(-9, 7, 36);
  const glowB = new THREE.PointLight(0xff8a3a, 0, 70, 1.5); glowB.position.set(11, 9, 35);
  group.add(glowA, glowB);

  // The hose: from the pump panel on the engine, along the ground, up to the firefighter's hands.
  const hoseHolder = RESCUE_CAST[0].at ?? [0, 0, 0];
  const pump = new THREE.Vector3(1.3, 0.9, -2.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), ENGINE.yaw).add(new THREE.Vector3(...ENGINE.position));
  const hoseCurve = new THREE.CatmullRomCurve3([
    pump, new THREE.Vector3(pump.x + 1.2, 0.08, pump.z - 0.6), new THREE.Vector3((pump.x + hoseHolder[0]) / 2 + 1.5, 0.06, (pump.z + hoseHolder[2]) / 2 + 2.2),
    new THREE.Vector3(hoseHolder[0] + 0.9, 0.06, hoseHolder[2] + 1.3), new THREE.Vector3(hoseHolder[0] + 0.25, 0.5, hoseHolder[2] + 0.35), new THREE.Vector3(hoseHolder[0], 1.05, hoseHolder[2]),
  ]);
  const hoseMaterial = new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.8 });
  const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 60, 0.055, 6), hoseMaterial); hose.name = "hose"; group.add(hose);
  const nozzleMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.35, metalness: 0.8 });
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.045, 0.42, 10), nozzleMaterial); nozzle.name = "nozzle"; group.add(nozzle);

  const cast = new THREE.Group(); cast.name = "rescue-cast"; group.add(cast);
  let actors: Actor[] = [], active = 0, tier: Tier = "high", hand: THREE.Object3D | null = null;
  const world = new THREE.Vector3(), nozzleTip = new THREE.Vector3(), aim = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);

  return {
    group, fire,
    get actors() { return actors; },
    /** Bodies arrive later than the building (they are a few megabytes); until then the stage plays without people. */
    attach(assets: CharacterAssets) {
      actors = RESCUE_CAST.map(actor => {
        // The carrier walks on his legs while his arms and trunk hold the pose authored in Blender.
        const carry = actor.carries && assets.carry && assets.carry.carrier === actor.model && assets.carry.child === actor.carries ? assets.carry : null;
        const speed = actor.path !== undefined ? actor.speed ?? 0 : 0;
        const body = spawnBody(assets, actor.id, actor.model, actor.clip, speed, undefined, carry ? heldPose(assets, actor.model, "Carry", { ...carry.carrierBones, ...STEADY }, actor.clip) : undefined);
        cast.add(body.holder);
        const entry: Actor = { ...body, actor, accumulated: 0, frame: 0 };
        if (carry) {
          // The child lies in his arms exactly where it was placed in Blender (the carrier's model space).
          const child = spawnBody(assets, actor.id + "-child", carry.child, "Idle", 0, MODEL_HEIGHT[carry.child] * carry.childScale, heldPose(assets, carry.child, "Carried", carry.childBones));
          child.holder.position.fromArray(carry.childPosition); child.holder.quaternion.fromArray(carry.childRotation);
          body.holder.add(child.holder); entry.child = child;
        }
        return entry;
      });
      hand = null;
      actors[0]?.root.traverse(o => { if (o.name === "CC_Base_R_Hand") hand = o; });
      this.setBudget(active || actors.length, tier);
    },
    /** Diagnostic: where the named joints of an actor (or of the child it carries) are, in the actor's own space (metres). */
    probe(id: string, joints: string[], child = false) {
      const actor = actors.find(a => a.actor.id === id), body = child ? actor?.child : actor;
      if (!actor || !body) return null;
      actor.holder.updateWorldMatrix(true, true);
      const out: Record<string, number[]> = {}, p = new THREE.Vector3();
      body.root.traverse(o => { if (joints.includes(o.name)) { o.getWorldPosition(p); actor.holder.worldToLocal(p); out[o.name] = [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]; } });
      return out;
    },
    setBudget(count: number, next: Tier) { active = Math.min(actors.length, count); tier = next; actors.forEach((a, i) => { if (i >= active) a.holder.visible = false; }); },
    setFire(puffCount: number, flameCount: number) { fire.setCounts(puffCount, flameCount); },
    /**
     * `amount` is 1 when the stage shows, 0 once the camera is in the building. `ownFire` is false where another fire
     * system burns the building (Organization); `evacuating` is false once the building comes down: nobody is left on
     * the stairs or in the doorway then; `collapse` (0..1) is how much of it is down and `burning` the clock of that fire (the garden burns with it). Returns how many bodies were animated.
     */
    update(delta: number, time: number, camera: THREE.Camera, amount: number, ownFire = true, evacuating = true, collapse = 0, burning = 0) {
      plants.burn(burning);
      // The stairs come down with the building: they sink into the rubble and are gone by the time half of it is down.
      const fallen = THREE.MathUtils.smoothstep(collapse, 0.02, 0.45);
      steps.mesh.visible = fallen < 0.999; steps.mesh.position.y = -fallen * (PLAN.tiers * PLAN.tierHeight + 1); steps.mesh.rotation.x = fallen * 0.12;
      group.visible = amount > 0.01;
      if (!group.visible) return 0;
      fire.update(time); fire.smoke.visible = fire.flames.visible = ownFire;
      const flicker = 0.8 + 0.2 * Math.sin(time * 9.1) * Math.sin(time * 5.3 + 1.7);
      glowA.intensity = 900 * flicker * amount; glowB.intensity = 700 * (1.6 - flicker) * amount;
      const phase = Math.floor(time * 3.2) % 2;
      truck.beacons[0].emissiveIntensity = phase === 0 ? 5 : 0.3; truck.beacons[1].emissiveIntensity = phase === 1 ? 5 : 0.3;
      marks.material.opacity = 0.35 + 0.25 * Math.sin(time * 2.4);
      let animated = 0;
      for (let i = 0; i < active; i++) {
        const a = actors[i], pose = rescuePose(a.actor, time);
        a.holder.position.set(pose.position[0], pose.position[1], pose.position[2]); a.holder.rotation.y = pose.yaw;
        const present = evacuating || (a.actor.path === undefined && a.actor.id !== "trapped") ? pose.visibility : 0;
        a.setOpacity(present); a.child?.setOpacity(present);
        a.holder.getWorldPosition(world);
        const interval = animationInterval(world.distanceTo(camera.position) * 0.5, tier);
        a.accumulated += delta;
        if (++a.frame % interval === 0) { a.mixer.update(a.accumulated); a.child?.mixer.update(a.accumulated); a.accumulated = 0; animated++; }
      }
      // The nozzle sits in the hose firefighter's hands and points at the window the jet lands on.
      const holder = actors[0];
      if (holder && hand && holder.holder.visible) { holder.root.updateWorldMatrix(true, true); (hand as THREE.Object3D).getWorldPosition(nozzleTip); }
      else nozzleTip.set(hoseHolder[0], 1.25, hoseHolder[2] - 0.3);
      aim.set(...JET_TARGET).sub(nozzleTip); aim.y += 9; aim.normalize();
      nozzle.position.copy(nozzleTip).addScaledVector(aim, 0.16); nozzle.quaternion.setFromUnitVectors(yAxis, aim);
      jet.uniforms.uFrom.value.copy(nozzleTip).addScaledVector(aim, 0.38);
      jet.uniforms.uTime.value = time; jet.uniforms.uAmount.value = amount;
      return animated;
    },
    dispose() {
      for (const a of actors) { a.dispose(); a.child?.dispose(); }
      fire.dispose(); sign.dispose(); marks.dispose(); jet.dispose(); steps.dispose(); parent.remove(steps.mesh); plants.dispose(); parent.remove(plants.group);
      truck.group.traverse(o => (o as THREE.Mesh).geometry?.dispose()); truck.materials.forEach(m => m.dispose());
      hose.geometry.dispose(); hoseMaterial.dispose(); nozzle.geometry.dispose(); nozzleMaterial.dispose(); glowA.dispose(); glowB.dispose();
      parent.remove(group);
    },
  };
}
