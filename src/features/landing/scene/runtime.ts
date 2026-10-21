import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { LandingBranch } from "../types";
import { BUDGETS, TIER_DWELL_MS, initialTier, tierBelow, type Tier } from "./budget";
import { createCircularBuilding } from "./building";
import { createCharacters, loadCharacterAssets } from "./characters";
import { BAYS, FRAME_SHIFT, ORG_FRAME, OCCUPANTS, isWideFrame, PLAN, STAGE, bayCentre, bayFallStart, firePosition, followPose, journeyPose, occupantPose, orgOverview, roomFire, smokeDrift, smoothstep, type Orbit, type Pose } from "./layout";
import { createJunction } from "./junction";
import { createLandscapePhone } from "./phone";
import { phoneTargetSize } from "./phone-fit";
import { createQualityController } from "./quality";
import { fireFlicker } from "./fire-flicker";
import { createSmoke, type Emitter } from "./smoke";

export type SceneReport = { organization: number; phone: number; settled: boolean; position: THREE.Vector3; hitAreas: ReturnType<ReturnType<typeof createJunction>["hitAreas"]> };
export type LandingRuntime = Awaited<ReturnType<typeof createLandingRuntime>>;
export type Features = { glass: boolean; smoke: boolean; characters: boolean };
export type LabStats = {
  fps: number; frameMs: number; p95Ms: number; drawCalls: number; triangles: number; dpr: number; tier: Tier; auto: boolean;
  characters: number; animated: number; geometries: number; textures: number; renderers: number; phoneAmount: number; progress: number; collapse: number; damageTime: number;
};

let liveRenderers = 0;
export const getRendererCount = () => liveRenderers;

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const FOG = 0.006;
const TIER_H = PLAN.tierHeight - PLAN.slab;

function corridorEmitters(): Emitter[] { return [{ position: [...firePosition()] as [number, number, number], start: 0, ceiling: TIER_H, drift: [...smokeDrift()] as [number, number] }]; }

/** Building-wide fire for the Organization demonstration: authored timing, not a propagation model. */
function organizationEmitters(): Emitter[] {
  const list: Emitter[] = [];
  for (let tier = 0; tier < PLAN.tiers; tier++) for (let bay = 0; bay < BAYS; bay++) {
    const fire = roomFire(tier, bay), a = bayCentre(bay), base = tier * PLAN.tierHeight;
    // Room fire seen through the glass, smoke spreading along the corridor ceiling.
    list.push({ position: [Math.cos(a) * 25.5, base + 0.05, Math.sin(a) * 25.5], start: fire.wall, ceiling: base + TIER_H, drift: [-Math.sin(a), Math.cos(a)], scale: 0.8 + fire.strength * 0.5 });
    // Flames and smoke breaking through the facade.
    list.push({ position: [Math.cos(a) * 29.6, base + 1.2, Math.sin(a) * 29.6], start: fire.facade, scale: 1 + fire.strength * 0.8 });
  }
  for (let bay = 0; bay < BAYS; bay++) { const a = bayCentre(bay); list.push({ position: [Math.cos(a) * 20, PLAN.tiers * PLAN.tierHeight, Math.sin(a) * 20], start: roomFire(PLAN.tiers - 1, bay).roof, scale: 1.6 }); }
  for (let tier = 0; tier < PLAN.tiers; tier++) for (let bay = 0; bay < BAYS; bay++) { const a = bayCentre(bay); list.push({ position: [Math.cos(a) * 25, 1, Math.sin(a) * 25], start: bayFallStart(tier, bay) + 2.4, scale: 1.4, kind: 1 }); }
  return list;
}

export async function createLandingRuntime(canvas: HTMLCanvasElement, mobile: boolean, options: { tier?: Tier | "auto"; features?: Features } = {}) {
  // Characters are decoration: if the models cannot load, the landing still works without them.
  const assets = await loadCharacterAssets().catch(error => { console.warn("[Fire3D:characters]", error); return null; });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  liveRenderers++;
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    throw new Error(`WebGL shader: ${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(vertex)} ${gl.getShaderInfoLog(fragment)}`);
  };
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.info.autoReset = false;

  const auto = !options.tier || options.tier === "auto";
  let tier: Tier = auto ? initialTier(mobile, navigator.hardwareConcurrency) : (options.tier as Tier);
  let features: Features = options.features ?? { glass: true, smoke: true, characters: true };
  // Frame cost is dominated by shaded pixels, so the pixel ratio is adaptive (steps down fast, up slowly).
  const quality = createQualityController({ mobile, devicePixelRatio: Math.min(window.devicePixelRatio, BUDGETS[tier].dprCap) });
  renderer.setPixelRatio(quality.ratio);

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1114);
  // Fog stays attached and only its density changes (swapping scene.fog changes every lit shader's program key).
  const fog = new THREE.FogExp2(0x182125, FOG); scene.fog = fog;
  const pmrem = new THREE.PMREMGenerator(renderer), roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, 0.04); scene.environment = environment.texture; scene.environmentIntensity = 0.8;
  roomEnvironment.dispose(); pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(mobile ? 62 : 58, 1, 0.1, 400);
  const building = createCircularBuilding(); scene.add(building.group);
  const junction = createJunction(); scene.add(junction.group);
  scene.add(new THREE.HemisphereLight(0xb3c7c8, 0x1c1f1f, 0.9));
  const moon = new THREE.DirectionalLight(0xbcd6dc, 0.9); moon.position.set(-30, 60, 40); scene.add(moon);

  const fire = new THREE.Vector3(...firePosition());
  const fireLight = new THREE.PointLight(0xff7a2a, 55, 22, 1.6); fireLight.position.copy(fire).add(new THREE.Vector3(0, 1.2, 0)); scene.add(fireLight);
  const corridorSmoke = createSmoke(BUDGETS.high.smokePuffs, BUDGETS.high.flames, corridorEmitters());
  const orgSmoke = createSmoke(900, 420, organizationEmitters());
  orgSmoke.smoke.visible = orgSmoke.flames.visible = false;
  scene.add(corridorSmoke.smoke, corridorSmoke.flames, orgSmoke.smoke, orgSmoke.flames);
  const characters = assets ? createCharacters(assets, scene, tier) : null;

  const phoneTarget = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, type: THREE.HalfFloatType });
  const phone = createLandscapePhone(phoneTarget.texture);
  const gameCamera = new THREE.PerspectiveCamera(58, 2, 0.1, 200);
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0b1114, transparent: true, opacity: 0, depthWrite: false }));
  backdrop.scale.set(10000, 10000, 1); backdrop.position.z = -50; phone.scene.add(backdrop);

  let width = 1, height = 1, time = 0, frames = 0, animated = 0;
  let organization = 0, phoneAmount = 0, damageTime = 0, collapse = 0, lastProgress = 0;
  let phoneClock = 0, lastTierChange = -TIER_DWELL_MS, disposed = false, lineup = false, initialized = false;
  const passes = { main: { calls: 0, triangles: 0 }, screen: { calls: 0, triangles: 0 }, overlay: { calls: 0, triangles: 0 } };
  const samples: number[] = [];
  const pass = (kind: keyof typeof passes, draw: () => void) => { renderer.info.reset(); draw(); passes[kind] = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; };
  const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), desired = new THREE.Vector3(), desiredTarget = new THREE.Vector3(), orgPosition = new THREE.Vector3(), orgTarget = new THREE.Vector3();
  const hitAreas = junction.hitAreas(camera);
  const report: SceneReport = { organization: 0, phone: 0, settled: false, position: camera.position, hitAreas };
  const diagnostics = { collapse: "", damageTime: "" };

  function applyTier(next: Tier) {
    tier = next;
    const b = BUDGETS[tier];
    corridorSmoke.setCounts(features.smoke ? b.smokePuffs : 0, features.smoke ? b.flames : 0);
    const ratio = b.smokePuffs / BUDGETS.high.smokePuffs;
    orgSmoke.setCounts(features.smoke ? Math.round(900 * ratio) : 0, features.smoke ? Math.round(420 * ratio) : 0);
    characters?.setBudget(features.characters ? b.characters : 0, tier);
    const size = phoneTargetSize(b.phoneWidth); phoneTarget.setSize(size.width, size.height);
    const dpr = Math.min(window.devicePixelRatio, b.dprCap);
    if (renderer.getPixelRatio() > dpr) renderer.setPixelRatio(dpr);
    canvas.dataset.tier = tier;
  }
  function applyFeatures() { building.setGlassVisible(features.glass); applyTier(tier); }
  function applySize() { renderer.setSize(width, height, false); canvas.dataset.pixelRatio = renderer.getPixelRatio().toFixed(2); }
  function layoutPhone() {
    const narrow = width < 700, wide = width >= 1000;
    // Wide: the device sits to the right of the copy. Narrow: it sits on top and the copy and CTA stay below.
    phone.layout(width, height, { margin: narrow ? 16 : 32, top: narrow ? 110 : 120, bottom: narrow ? 360 : wide ? 96 : 330, maxWidth: narrow ? width - 32 : wide ? Math.min(820, width * 0.52) : 640, align: wide ? "right" : "center" });
  }
  applyFeatures();

  /** Shift the framing so the subject sits beside (wide) or above (narrow) the text instead of under it. */
  function frame(shift: number) {
    if (shift < 0.002) { camera.clearViewOffset(); return; }
    if (isWideFrame(mobile, width / height)) camera.setViewOffset(width, height, -width * FRAME_SHIFT * shift, 0, width, height);
    else camera.setViewOffset(width, height, 0, height * FRAME_SHIFT * shift, width, height);
  }

  function drawPhone(dt: number) {
    const budget = BUDGETS[tier];
    phoneClock += dt;
    if (phoneClock >= 1 / budget.phoneHz) {
      phoneClock = 0;
      const player = occupantPose(OCCUPANTS[0], time);
      const follow: Pose = followPose(player.fraction, OCCUPANTS[0].lateral);
      gameCamera.aspect = phoneTarget.width / phoneTarget.height; gameCamera.updateProjectionMatrix();
      gameCamera.position.set(...follow.position); gameCamera.lookAt(...follow.target);
      pass("screen", () => { renderer.setRenderTarget(phoneTarget); renderer.render(scene, gameCamera); renderer.setRenderTarget(null); });
    }
    backdrop.material.opacity = phoneAmount * 0.82;
    phone.setAmount(phoneAmount, time);
    pass("overlay", () => { renderer.autoClear = false; renderer.clearDepth(); renderer.render(phone.scene, phone.camera); renderer.autoClear = true; });
  }

  function draw(dt: number) {
    if (phoneAmount < 0.999) pass("main", () => renderer.render(scene, camera)); else { renderer.clear(); passes.main = { calls: 0, triangles: 0 }; }
    if (phoneAmount > 0.002) drawPhone(dt); else { phoneClock = 1; passes.screen = { calls: 0, triangles: 0 }; passes.overlay = { calls: 0, triangles: 0 }; }
  }

  const noOrbit: Orbit = { yaw: 0, pitch: 0 };
  applySize();
  return {
    renderer,
    resize(w: number, h: number) {
      if (disposed) return;
      width = Math.max(1, w); height = Math.max(1, h);
      applySize(); camera.aspect = width / height; camera.updateProjectionMatrix(); layoutPhone();
    },
    /** `delta` is the time since the previous rendered frame, in seconds. */
    update(delta: number, progress: number, branch: LandingBranch, orbit: Orbit = noOrbit): SceneReport {
      const dt = Math.min(delta, 0.25);
      time += dt; frames++; lastProgress = progress;
      if (delta > 0) { samples.push(delta * 1000); if (samples.length > 180) samples.shift(); }
      const nextRatio = quality.update(delta * 1000);
      if (nextRatio !== null) {
        renderer.setPixelRatio(Math.min(nextRatio, BUDGETS[tier].dprCap)); applySize();
        // At the lowest pixel ratio and still slow: step the whole tier down, with a dwell between changes.
        if (auto && nextRatio <= quality.levels[quality.levels.length - 1] + 1e-3 && time * 1000 - lastTierChange > TIER_DWELL_MS && tier !== "low") { lastTierChange = time * 1000; applyTier(tierBelow(tier)); }
      }
      const blend = 1 - Math.exp(-dt * 3.5);
      organization = THREE.MathUtils.lerp(organization, branch === "organization" ? 1 : 0, blend);
      phoneAmount = THREE.MathUtils.lerp(phoneAmount, branch === "trainee" ? 1 : 0, blend);

      // Camera: scroll journey, blended to the Organization overview (orbit-able) and framed beside the copy.
      const lens = { fov: camera.fov, aspect: camera.aspect };
      const base = journeyPose(progress, lens), over = orgOverview(camera.fov, camera.aspect, mobile, orbit);
      desired.set(...base.position); desiredTarget.set(...base.target);
      orgPosition.set(...over.position); orgTarget.set(...over.target);
      desired.lerp(orgPosition, organization); desiredTarget.lerp(orgTarget, organization);
      if (lineup) { desired.set(0, 1.25, 47.5); desiredTarget.set(0, 1, 40); }
      const settle = initialized ? damp(10, dt) : 1;
      camPos.lerp(desired, settle); camTarget.lerp(desiredTarget, settle);
      if (!initialized) { camPos.copy(desired); camTarget.copy(desiredTarget); initialized = true; }
      camera.position.copy(camPos); camera.lookAt(camTarget);
      const aerial = 1 - smoothstep(0, STAGE.aerialEnd, progress);
      frame(lineup ? 0 : Math.max(aerial * (1 - organization), organization * ORG_FRAME));

      // Organization demonstration clock: only runs while the overview is settled; leaving the branch resets it.
      if (branch === "organization" && organization > 0.995) damageTime += dt; else if (branch !== "organization") damageTime = 0;
      collapse = building.setDamage(damageTime);
      const orgActive = organization > 0.02 && features.smoke;
      orgSmoke.smoke.visible = orgSmoke.flames.visible = orgActive;
      orgSmoke.update(damageTime);
      corridorSmoke.update(time);
      corridorSmoke.smoke.visible = corridorSmoke.flames.visible = organization < 0.5;
      fireLight.intensity = 55 * fireFlicker(time, 1) * (organization < 0.5 ? 1 : 0.3);
      fog.density = organization > 0.1 ? FOG * 0.4 : FOG;
      if (characters) {
        characters.group.visible = organization < 0.05 && collapse < 0.01;
        animated = characters.group.visible ? characters.update(dt, time, camera) : 0;
      }
      draw(dt);

      report.organization = organization; report.phone = phoneAmount;
      const target = branch === "organization" ? organization : branch === "trainee" ? phoneAmount : 1 - Math.max(organization, phoneAmount);
      report.settled = target > 0.995 && camera.position.distanceTo(desired) < 0.045;
      junction.hitAreas(camera);

      // Read-only diagnostics report rendered state, not just the requested scroll target.
      const data = canvas.dataset;
      data.frames = String(frames); data.ambientTime = time.toFixed(3);
      if (frames % 3 === 1 || report.settled) {
        const collapseText = collapse.toFixed(3), damageText = damageTime.toFixed(2);
        if (diagnostics.collapse !== collapseText) { diagnostics.collapse = collapseText; data.collapse = collapseText; }
        if (diagnostics.damageTime !== damageText) { diagnostics.damageTime = damageText; data.damageTime = damageText; }
        data.npcs = String(characters ? characters.actors.length : 0);
        data.camera = camera.position.x.toFixed(3) + "," + camera.position.y.toFixed(3) + "," + camera.position.z.toFixed(3);
        data.phone = phoneAmount.toFixed(3); data.cutaway = organization.toFixed(3);
        data.drawCalls = String(passes.main.calls + passes.screen.calls + passes.overlay.calls);
      }
      return report;
    },
    snapshot() {
      if (disposed) return "";
      draw(0.016);
      return canvas.toDataURL("image/webp", 0.88);
    },
    // Lab / diagnostics -------------------------------------------------------------------------------------
    setFeatures(next: Features) { features = next; applyFeatures(); },
    setTier(next: Tier | "auto") { if (next === "auto") return; applyTier(next); },
    setLineup(on: boolean) { lineup = on; characters?.setLineup(on); initialized = false; },
    debugPlay(clip: string) { characters?.debugPlay(clip); },
    /** Diagnostic: jump the Organization demonstration clock (it only advances while the overview is settled). */
    seekDamage(seconds: number) { damageTime = Math.max(0, seconds); },
    stats(): LabStats {
      const sorted = [...samples].sort((a, b) => a - b);
      const mean = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      return {
        fps: mean ? 1000 / mean : 0, frameMs: mean, p95Ms: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        drawCalls: passes.main.calls + passes.screen.calls + passes.overlay.calls, triangles: passes.main.triangles + passes.screen.triangles + passes.overlay.triangles,
        dpr: renderer.getPixelRatio(), tier, auto, characters: characters && features.characters ? Math.min(characters.actors.length, BUDGETS[tier].characters) : 0, animated,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, renderers: liveRenderers, phoneAmount, progress: lastProgress, collapse, damageTime,
      };
    },
    dispose() {
      if (disposed) return; disposed = true; liveRenderers--;
      characters?.dispose(); corridorSmoke.dispose(); orgSmoke.dispose(); building.dispose(); junction.dispose(); phone.dispose(); phoneTarget.dispose(); environment.dispose();
      backdrop.geometry.dispose(); backdrop.material.dispose(); fireLight.dispose();
      scene.clear(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
