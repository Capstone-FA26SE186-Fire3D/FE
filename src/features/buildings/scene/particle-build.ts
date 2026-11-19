import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * "Build from particles" intro for the IFC preview: points sampled on the model surface rise from the ground plane
 * (lower storeys first), then a horizontal clipping plane sweeps upward and swaps the particles for the solid model.
 * Everything runs on the GPU from per-point attributes; the CPU only advances a few uniforms per frame.
 */

export type ParticleTheme = "dark" | "light";

export type SampledPoints = {
  /** World-space target positions (xyz per point). */
  positions: Float32Array;
  /** Linear RGB of the source material per point. */
  colors: Float32Array;
  count: number;
  /** Average spacing between points, used to size them on screen. */
  spacing: number;
  bounds: THREE.Box3;
};

const triA = new THREE.Vector3();
const triB = new THREE.Vector3();
const triC = new THREE.Vector3();
const edge1 = new THREE.Vector3();
const edge2 = new THREE.Vector3();

function forEachTriangle(root: THREE.Object3D, visit: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, area: number, color: THREE.Color) => void) {
  root.updateMatrixWorld(true);
  const color = new THREE.Color();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (material && "color" in material && material.color instanceof THREE.Color) color.copy(material.color);
    else color.setRGB(0.7, 0.7, 0.7);
    const index = geometry.getIndex();
    const total = index ? index.count : position.count;
    for (let i = 0; i + 2 < total; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      triA.fromBufferAttribute(position, ia).applyMatrix4(object.matrixWorld);
      triB.fromBufferAttribute(position, ib).applyMatrix4(object.matrixWorld);
      triC.fromBufferAttribute(position, ic).applyMatrix4(object.matrixWorld);
      const area = edge1.subVectors(triB, triA).cross(edge2.subVectors(triC, triA)).length() / 2;
      if (area > 0) visit(triA, triB, triC, area, color);
    }
  });
}

/** Area-weighted random points on every visible mesh surface, at most about `target` points. */
export function sampleSurface(root: THREE.Object3D, target: number, random: () => number = Math.random): SampledPoints {
  let totalArea = 0;
  forEachTriangle(root, (_a, _b, _c, area) => { totalArea += area; });
  const bounds = new THREE.Box3().setFromObject(root);
  if (totalArea <= 0 || target <= 0) return { positions: new Float32Array(0), colors: new Float32Array(0), count: 0, spacing: 0, bounds };

  const density = target / totalArea;
  const positions: number[] = [];
  const colors: number[] = [];
  forEachTriangle(root, (a, b, c, area, color) => {
    const expected = area * density;
    const n = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      let u = random();
      let v = random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      positions.push(
        a.x + (b.x - a.x) * u + (c.x - a.x) * v,
        a.y + (b.y - a.y) * u + (c.y - a.y) * v,
        a.z + (b.z - a.z) * u + (c.z - a.z) * v,
      );
      colors.push(color.r, color.g, color.b);
    }
  });
  const count = positions.length / 3;
  return { positions: Float32Array.from(positions), colors: Float32Array.from(colors), count, spacing: Math.sqrt(totalArea / Math.max(count, 1)), bounds };
}

/**
 * Bounds of where most of the surface is: the 1st–99th percentile of area-weighted surface points per axis.
 * IFC exports often carry a stray site object far from the building, which would otherwise shrink the framed model.
 */
export function coreBounds(root: THREE.Object3D, samples = 20_000, random: () => number = Math.random): THREE.Box3 {
  const sample = sampleSurface(root, samples, random);
  if (sample.count < 20) return sample.bounds;
  const box = new THREE.Box3();
  const axis = new Float32Array(sample.count);
  for (let a = 0; a < 3; a++) {
    for (let i = 0; i < sample.count; i++) axis[i] = sample.positions[i * 3 + a];
    axis.sort();
    const low = axis[Math.floor(sample.count * 0.01)];
    const high = axis[Math.ceil(sample.count * 0.99) - 1];
    box.min.setComponent(a, low);
    box.max.setComponent(a, high);
  }
  return box;
}

/** Seconds: ground fill, per-point flight, the rise of the build front and the solid reveal sweep. */
export const BUILD_TIMING = { lead: 0.35, span: 3.2, flight: 1.25, reveal: 1.9 } as const;
export const BUILD_DURATION = BUILD_TIMING.lead + BUILD_TIMING.span + BUILD_TIMING.flight + 0.6;

/** Height of the reveal plane at time `t` (seconds) between the model floor and roof; below it the solid model shows. */
export function revealHeight(t: number, minY: number, maxY: number) {
  const start = BUILD_DURATION - BUILD_TIMING.reveal;
  const k = THREE.MathUtils.clamp((t - start) / BUILD_TIMING.reveal, 0, 1);
  const margin = (maxY - minY) * 0.02 + 0.01;
  return k <= 0 ? minY - margin : minY - margin + (maxY - minY + 2 * margin) * k;
}

/** Particle look per operations theme: glowing cyan on dark, ember on light (additive glow vanishes on a light page). */
const LOOK: Record<ParticleTheme, { tint: THREE.Color; mix: number; alpha: number; size: number; blending: THREE.Blending }> = {
  dark: { tint: new THREE.Color(0.45, 0.88, 1), mix: 0.62, alpha: 0.4, size: 0.6, blending: THREE.AdditiveBlending },
  light: { tint: new THREE.Color(0.92, 0.42, 0.12), mix: 0.8, alpha: 0.55, size: 0.5, blending: THREE.NormalBlending },
};

const vertexShader = /* glsl */ `
attribute vec3 aStart;
attribute float aDelay;
attribute float aRnd;
attribute vec3 aCol;
uniform float uT, uFlight, uScan, uSize, uProj, uSway, uAsp, uMix, uAlpha;
uniform vec2 uMouse;
uniform vec3 uTint;
varying vec3 vC;
varying float vA;
void main() {
  float t = clamp((uT - aDelay) / uFlight, 0.0, 1.0);
  float e = t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  vec3 p = mix(aStart, position, e);
  float sw = (1.0 - e) * e * 4.0;
  p.x += sin(aRnd * 40.0 + uT * 2.3) * uSway * sw;
  p.z += cos(aRnd * 31.0 + uT * 1.9) * uSway * sw;
  p.y += sw * uSway * 1.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 cp = projectionMatrix * mv;
  // magnifier: particles near the pointer are pushed aside, enlarged and turn warm
  vec2 dd = (cp.xy / cp.w - uMouse) * vec2(uAsp, 1.0);
  float lens = smoothstep(0.2, 0.0, length(dd));
  cp.xy += normalize(dd + 1e-5) / vec2(uAsp, 1.0) * lens * 0.045 * cp.w;
  gl_Position = cp;
  gl_PointSize = clamp(uSize * uProj / -mv.z * (1.0 + 0.5 * e) * (1.0 + lens * 2.5), 1.0, 6.0);
  vC = mix(mix(aCol, uTint, uMix), vec3(1.0, 0.72, 0.3), lens * 0.85) * (0.45 + 0.85 * e);
  float hidden = position.y < uScan ? 0.0 : 1.0;
  vA = uAlpha * (hidden * (t > 0.0 ? 1.0 : 0.3) * (0.3 + 0.7 * e) + lens * 0.3 * hidden);
}`;

const fragmentShader = /* glsl */ `
varying vec3 vC;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vC * a * 1.2, a * vA);
}`;

export type ParticleBuild = {
  /** Advances to `nowMs`; returns true while the effect still needs frames. */
  update: (nowMs: number) => boolean;
  /** Jump to the finished state (solid model, no particles). */
  finish: () => void;
  setPointer: (ndc: THREE.Vector2 | null) => void;
  setViewport: (heightPx: number, aspect: number) => void;
  setTheme: (theme: ParticleTheme) => void;
  dispose: () => void;
};

/**
 * Adds the particle cloud for `model` to `scene` and clips the model's materials until the reveal sweep passes.
 * `renderer.localClippingEnabled` must be true. Call `finish`/`dispose` before the model's materials are disposed.
 */
export function createParticleBuild(scene: THREE.Scene, model: THREE.Object3D, camera: THREE.PerspectiveCamera, controls: OrbitControls, options: { maxPoints: number; theme: ParticleTheme }): ParticleBuild | null {
  const sample = sampleSurface(model, options.maxPoints);
  if (sample.count === 0) return null;
  const { bounds, count } = sample;
  const minY = bounds.min.y;
  const height = Math.max(bounds.max.y - minY, 1e-3);
  const size = bounds.getSize(new THREE.Vector3());
  const spread = Math.max(size.x, size.z) * 0.12;

  const start = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = sample.positions[i * 3];
    const y = sample.positions[i * 3 + 1];
    const z = sample.positions[i * 3 + 2];
    start[i * 3] = x + (Math.random() - 0.5) * spread;
    start[i * 3 + 1] = minY + Math.random() * height * 0.004;
    start[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
    delay[i] = BUILD_TIMING.lead + ((y - minY) / height) * BUILD_TIMING.span + Math.random() * 0.5;
    rnd[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(sample.positions, 3));
  geometry.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  geometry.setAttribute("aCol", new THREE.BufferAttribute(sample.colors, 3));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uT: { value: 0 },
      uFlight: { value: BUILD_TIMING.flight },
      uScan: { value: minY - 1 },
      uSize: { value: sample.spacing },
      uMix: { value: 0.62 },
      uAlpha: { value: 1 },
      uProj: { value: 600 },
      uSway: { value: Math.max(size.x, size.z) * 0.006 },
      uAsp: { value: camera.aspect },
      uMouse: { value: new THREE.Vector2(9, 9) },
      uTint: { value: new THREE.Color() },
    },
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);

  // The solid model is clipped from above: only the part under the plane is drawn (normal points down).
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), minY - 1);
  const clipped = new Set<THREE.Material>();
  const clipMaterials = () => model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const item of Array.isArray(object.material) ? object.material : [object.material]) {
      if (clipped.has(item)) continue;
      item.clippingPlanes = [plane];
      item.needsUpdate = true;
      clipped.add(item);
    }
  });
  clipMaterials();

  const applyTheme = (theme: ParticleTheme) => {
    const look = LOOK[theme];
    material.uniforms.uTint.value.copy(look.tint);
    material.uniforms.uMix.value = look.mix;
    material.uniforms.uAlpha.value = look.alpha;
    material.uniforms.uSize.value = sample.spacing * look.size;
    material.blending = look.blending;
    material.needsUpdate = true;
  };
  applyTheme(options.theme);

  // The clock starts on the first frame: uploading a large model can stall the first render for seconds.
  let t0: number | null = null;
  let done = false;
  // Camera eases in from further out and higher while the particles rise; any user orbit cancels it.
  const endPosition = camera.position.clone();
  const offset = endPosition.clone().sub(controls.target);
  const startPosition = controls.target.clone().add(offset.multiplyScalar(1.45)).add(new THREE.Vector3(0, height * 0.8, 0));
  let flying = true;
  const stopFlying = () => { flying = false; };
  controls.addEventListener("start", stopFlying);
  const placeCamera = (k: number) => {
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(startPosition, endPosition, e);
    camera.lookAt(controls.target);
  };
  placeCamera(0);
  const setScan = (y: number) => {
    plane.constant = y;
    material.uniforms.uScan.value = y;
  };
  const unclip = () => {
    // Highlight clones copy the clipping array, so clear every material the model uses now as well.
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const item of Array.isArray(object.material) ? object.material : [object.material]) clipped.add(item);
    });
    for (const item of clipped) { item.clippingPlanes = null; item.needsUpdate = true; }
    clipped.clear();
  };
  const finish = () => {
    if (done) return;
    done = true;
    if (flying) placeCamera(1);
    flying = false;
    controls.removeEventListener("start", stopFlying);
    controls.update();
    scene.remove(points);
    unclip();
  };

  return {
    update(nowMs) {
      if (done) return false;
      t0 ??= nowMs;
      const t = (nowMs - t0) / 1000;
      if (flying) placeCamera(THREE.MathUtils.clamp(t / (BUILD_DURATION - 0.6), 0, 1));
      if (t >= BUILD_DURATION + 0.3) { finish(); return false; }
      clipMaterials();
      material.uniforms.uT.value = t;
      setScan(revealHeight(t, minY, bounds.max.y));
      return true;
    },
    finish,
    setPointer(ndc) { material.uniforms.uMouse.value.copy(ndc ?? new THREE.Vector2(9, 9)); },
    setViewport(heightPx, aspect) {
      material.uniforms.uProj.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      material.uniforms.uAsp.value = aspect;
    },
    setTheme: applyTheme,
    dispose() {
      finish();
      geometry.dispose();
      material.dispose();
    },
  };
}
