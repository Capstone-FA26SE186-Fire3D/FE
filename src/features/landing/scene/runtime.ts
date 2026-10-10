import * as THREE from "three";
import { createBuilding } from "./building";
import { createFireEffects } from "./fire-effects";
import { createJourneyCamera } from "./journey-camera";
import { createPhone } from "./phone";
import { createOccupants } from "./occupants";
import { createJunction } from "./junction";
import { createRoomAtmosphere } from "./room-atmosphere";
import { createAtmosphereCompositor } from "./atmosphere-compositor";
import { createAtmosphereView } from "./atmosphere-view";
import { createQualityController } from "./quality";
import { roomFireTimeline } from "./fire-timeline";
import type { LandingBranch } from "../types";

export type SceneReport = { organization: number; phone: number; settled: boolean; position: THREE.Vector3; hitAreas: ReturnType<ReturnType<typeof createJunction>["hitAreas"]> };
export type LandingRuntime = ReturnType<typeof createLandingRuntime>;

const FOG_DENSITY = .026;

export function createLandingRuntime(canvas: HTMLCanvasElement, mobile: boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    throw new Error(`WebGL shader: ${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(vertex)} ${gl.getShaderInfoLog(fragment)}`);
  };
  // Frame cost is dominated by shaded pixels, so the pixel ratio is adaptive:
  // it starts at a tier cap and steps down (with hysteresis) when frames are slow.
  const quality = createQualityController({ mobile, devicePixelRatio: window.devicePixelRatio });
  renderer.setPixelRatio(quality.ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The one shadow-casting light is a point light: a cube map, i.e. six extra
  // passes over the whole scene (measured ~300 draw calls, ~150k triangles).
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x141719);
  // Fog stays attached and only its density changes: swapping scene.fog in and
  // out changes the shader program key of every lit material.
  const fog = new THREE.FogExp2(0x222a29, FOG_DENSITY); scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(mobile ? 62 : 60, 1, .06, 140);
  const building = createBuilding();
  const junction = createJunction(); building.group.add(junction.group); junction.layout(mobile);
  // Reuse the same flame material, motion and ignition as all other sources.
  // Irregular near/far positions keep the junction floor from becoming a row.
  const junctionSources = [
    [-3.1,-16.2],[-1.9,-15.9],[-.7,-16.3],[.45,-16.1],[1.6,-15.8],[2.9,-16.25],
    [-2.6,-14.8],[-1.1,-15.1],[.8,-15.25],[2.1,-14.6],
    [-3.7,-13.6],[-1.65,-13.9],[1.4,-13.7],[3.3,-14.1],
  ].map(([x,z],i) => ({
    position: new THREE.Vector3(x,.015,z), intensity: 0,
    softFloor: true,
    color: new THREE.Color(0xff802c),
    ignition: roomFireTimeline(0,1,2).wall+10+(i*7%19),
    size: [.65+(i%3)*.13,.27+(i%4)*.045] as [number,number],
  }));
  const edgeSources = [-1,1].map((side,i) => ({
    position: new THREE.Vector3(side*3,.015,-16.35), intensity: 0,
    cameraFacing: true, color: new THREE.Color(0xff802c),
    ignition: roomFireTimeline(0,1,2).wall+12+i*5,
    size: [.9,.9] as [number,number],
  }));
  // Flames, smoke and embers are drawn with the volumes (half resolution, depth
  // aware, one draw call per kind); only the real fire lights live in the scene.
  const view = createAtmosphereView();
  const effects = createFireEffects([...building.fireSources,...junctionSources,...edgeSources], mobile, view);
  const atmosphere = createRoomAtmosphere(mobile, view);
  const compositor = createAtmosphereCompositor(renderer, atmosphere, mobile);
  compositor.volumeScene.add(effects.sprites);
  const occupants = createOccupants(mobile, view); scene.add(occupants.group, occupants.renderGroup);
  compositor.volumeScene.add(occupants.effectsSprites);
  const gameCamera = new THREE.PerspectiveCamera(58, .492, .06, 100);
  scene.add(building.group, effects.lights, new THREE.HemisphereLight(0xb3c7c8, 0x24251f, .75));
  const exteriorLight = new THREE.DirectionalLight(0xd7e9e7, 2); exteriorLight.position.set(5, 20, 15); scene.add(exteriorLight);
  const cameraController = createJourneyCamera(camera);
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, type: THREE.HalfFloatType });
  const phone = createPhone(target.texture);
  const backdropGeometry = new THREE.PlaneGeometry(100, 100);
  const backdropMaterial = new THREE.MeshBasicMaterial({ color: 0x141719, transparent: true, depthWrite: false });
  const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial); backdrop.position.z = -1; phone.scene.add(backdrop);
  let width = 1, height = 1, time = 0, frameCount = 0;
  renderer.info.autoReset = false;
  let lastPhoneAmount = 0;
  let phoneReveal = 0;
  let damageTime = 0;
  let disposed = false;
  const hitAreas = junction.hitAreas(camera);
  const report: SceneReport = { organization: 0, phone: 0, settled: false, position: camera.position, hitAreas };
  const diagnostics = { collapse: "", damageTime: "" };

  function draw(phoneAmount: number) {
    renderer.info.reset();
    renderer.setRenderTarget(null);
    if (phoneAmount < .999) compositor.draw(scene, camera, null);
    else renderer.clear();
    if (phoneAmount > .001) {
      const playerPosition = occupants.player.position;
      gameCamera.position.set(playerPosition.x, 2.3, playerPosition.z - 3.4);
      gameCamera.lookAt(playerPosition.x, 1.15, playerPosition.z + 1.8);
      compositor.draw(scene, gameCamera, target);
      // When interrupted by the organization branch, fade the current device pose
      // instead of reversing its reveal into an enormous screen covering the building.
      phone.update(phoneReveal, width, height, THREE.MathUtils.smoothstep(phoneAmount, 0, .4));
      backdropMaterial.opacity = phoneAmount;
      renderer.autoClear = false; renderer.clearDepth(); renderer.render(phone.scene, phone.camera); renderer.autoClear = true;
    }
  }
  function applySize() {
    renderer.setSize(width, height, false);
    canvas.dataset.pixelRatio = renderer.getPixelRatio().toFixed(2);
  }
  return {
    renderer,
    resize(w: number, h: number) {
      if (disposed) return;
      width = Math.max(1, w); height = Math.max(1, h);
      camera.aspect = width / height; camera.updateProjectionMatrix(); applySize();
      // At the settled junction, left sits just inside the frame while right
      // straddles the edge. Both roots stay on the floor, including on mobile.
      const edgeHalfWidth=3.45*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect;
      edgeSources[0].position.x=-edgeHalfWidth*.94;
      edgeSources[1].position.x=edgeHalfWidth;
      target.setSize(mobile ? 384 : 512, mobile ? 780 : 1040);
    },
    /** `delta` is the time since the previous rendered frame, in seconds. */
    update(delta: number, progress: number, branch: LandingBranch, orbit?: { yaw: number; pitch: number }): SceneReport {
      time += delta;
      const next = quality.update(delta * 1000);
      if (next !== null) { renderer.setPixelRatio(next); applySize(); }
      const camReport = cameraController.update(progress, branch, delta, mobile, orbit);
      building.reveal(camReport.organization);
      occupants.update(time, camReport.phone > .01);
      if (branch === "organization" && camReport.organization > .995) damageTime += delta;
      else if (branch !== "organization") damageTime = 0;
      const collapse = building.updateDamage(damageTime);
      effects.update(time, camReport.organization, damageTime);
      atmosphere.update(time, camReport.organization, damageTime);
      const people = collapse < .01;
      occupants.renderGroup.visible = people;
      occupants.effectsSprites.visible = people;
      fog.density = camReport.organization > .1 ? 0 : FOG_DENSITY;
      phoneReveal = camReport.phone < .001 ? 0 : Math.max(phoneReveal, camReport.phone);
      // Refreshing a cube shadow every Nth frame makes a visible stutter, so it is
      // all or nothing: every frame in the walk-through, none in the far cutaway
      // overview where the one shadowed light is a small room fire.
      if (camReport.organization < .05 || frameCount < 3) renderer.shadowMap.needsUpdate = true;
      lastPhoneAmount = camReport.phone; draw(camReport.phone); frameCount++;
      report.organization = camReport.organization; report.phone = camReport.phone; report.settled = camReport.settled;
      junction.hitAreas(camera);
      // Read-only diagnostics report rendered state, not just the requested scroll target.
      // Written every few frames (and the frame counter on every one): attribute
      // writes are cheap but not free and nothing needs them at 60 Hz.
      const data = canvas.dataset;
      data.frames = String(frameCount); data.ambientTime = time.toFixed(3);
      if (frameCount % 3 === 1 || camReport.settled) {
        const collapseText = collapse.toFixed(3), damageText = damageTime.toFixed(2);
        if (diagnostics.collapse !== collapseText) { diagnostics.collapse = collapseText; data.collapse = collapseText; }
        if (diagnostics.damageTime !== damageText) { diagnostics.damageTime = damageText; data.damageTime = damageText; }
        data.npcs = String(occupants.group.children.length);
        data.camera = report.position.x.toFixed(3) + "," + report.position.y.toFixed(3) + "," + report.position.z.toFixed(3);
        data.phone = camReport.phone.toFixed(3); data.cutaway = camReport.organization.toFixed(3);
        data.drawCalls = String(renderer.info.render.calls);
      }
      return report;
    },
    snapshot() {
      if (disposed) return "";
      draw(lastPhoneAmount);
      return canvas.toDataURL("image/webp", .88);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      compositor.dispose(); atmosphere.dispose(); effects.dispose(); occupants.dispose(); junction.dispose(); building.dispose(); phone.dispose(); target.dispose(); backdropGeometry.dispose(); backdropMaterial.dispose();
      scene.clear(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
