import * as THREE from "three";
import { createBuilding } from "./building";
import { createFireEffects } from "./fire-effects";
import { createJourneyCamera } from "./journey-camera";
import { createPhone } from "./phone";
import { createOccupants } from "./occupants";
import { createJunction } from "./junction";
import { createRoomAtmosphere } from "./room-atmosphere";
import { createAtmosphereCompositor } from "./atmosphere-compositor";
import { roomFireTimeline } from "./fire-timeline";
import type { LandingBranch } from "../types";

export type SceneReport = { organization: number; phone: number; settled: boolean; position: THREE.Vector3; hitAreas: ReturnType<ReturnType<typeof createJunction>["hitAreas"]> };
export type LandingRuntime = ReturnType<typeof createLandingRuntime>;

export function createLandingRuntime(canvas: HTMLCanvasElement, mobile: boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    throw new Error(`WebGL shader: ${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(vertex)} ${gl.getShaderInfoLog(fragment)}`);
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x141719);
  scene.fog = new THREE.FogExp2(0x222a29, .026);
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
  const effects = createFireEffects([...building.fireSources,...junctionSources,...edgeSources], mobile);
  const atmosphere = createRoomAtmosphere(mobile);
  const compositor = createAtmosphereCompositor(renderer, atmosphere, mobile);
  const occupants = createOccupants(mobile); scene.add(occupants.group, occupants.renderGroup, occupants.effectsGroup);
  const gameCamera = new THREE.PerspectiveCamera(58, .492, .06, 100);
  scene.add(building.group, effects.group, new THREE.HemisphereLight(0xb3c7c8, 0x24251f, .75));
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
  return {
    renderer,
    resize(w: number, h: number) {
      width = Math.max(1, w); height = Math.max(1, h);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
      // At the settled junction, left sits just inside the frame while right
      // straddles the edge. Both roots stay on the floor, including on mobile.
      const edgeHalfWidth=3.45*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect;
      edgeSources[0].position.x=-edgeHalfWidth*.94;
      edgeSources[1].position.x=edgeHalfWidth;
      target.setSize(mobile ? 384 : 512, mobile ? 780 : 1040);
    },
    update(delta: number, progress: number, branch: LandingBranch, orbit?: { yaw: number; pitch: number }): SceneReport {
      time += delta;
      const report = cameraController.update(progress, branch, delta, mobile, orbit);
      building.reveal(report.organization);
      occupants.update(time, report.phone > .01);
      if (branch === "organization" && report.organization > .995) damageTime += delta;
      else if (branch !== "organization") damageTime = 0;
      const collapse = building.updateDamage(damageTime);
      effects.update(time, report.organization, damageTime);
      atmosphere.update(time, report.organization, damageTime);
      occupants.renderGroup.visible = collapse < .01;
      occupants.effectsGroup.visible = collapse < .01;
      canvas.dataset.collapse = collapse.toFixed(3);
      canvas.dataset.damageTime = damageTime.toFixed(2);
      canvas.dataset.npcs = String(occupants.group.children.length);
      scene.fog = report.organization > .1 ? null : scene.fog ?? new THREE.FogExp2(0x222a29, .026);
      phoneReveal = report.phone < .001 ? 0 : Math.max(phoneReveal, report.phone);
      lastPhoneAmount = report.phone; draw(report.phone); frameCount++;
      // Read-only diagnostics report rendered state, not just the requested scroll target.
      canvas.dataset.frames = String(frameCount); canvas.dataset.ambientTime = time.toFixed(3);
      canvas.dataset.camera = report.position.toArray().map(n => n.toFixed(3)).join(",");
      canvas.dataset.phone = report.phone.toFixed(3); canvas.dataset.cutaway = report.organization.toFixed(3);
      canvas.dataset.drawCalls = String(renderer.info.render.calls);
      return { ...report, hitAreas: junction.hitAreas(camera) };
    },
    snapshot() { draw(lastPhoneAmount); return canvas.toDataURL("image/webp", .88); },
    dispose() {
      compositor.dispose(); atmosphere.dispose(); effects.dispose(); occupants.dispose(); junction.dispose(); building.dispose(); phone.dispose(); target.dispose(); backdropGeometry.dispose(); backdropMaterial.dispose();
      scene.clear(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
