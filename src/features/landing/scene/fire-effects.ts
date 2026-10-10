import * as THREE from "three";
import type { FireSource } from "./building";
import { bayFall, collapseBay } from "./collapse-timeline";
import { sampleFireWeather } from "./fire-weather";
import { fireFlicker } from "./fire-flicker";
import { createFireNoiseTexture } from "./fire-noise";
import { createAtmosphereView, type AtmosphereView } from "./atmosphere-view";
import { emberFragment, emberVertex, flameFragment, flameVertex, smokeFragment, smokeVertex } from "./fire-sprite-shaders";

/** Sources that own a real light. Everything else is lit by sprites and wall volumes. */
const LIGHT_SOURCES = 2;

type Layer = {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  material: THREE.ShaderMaterial;
  position: THREE.InstancedBufferAttribute;
  shape: THREE.InstancedBufferAttribute;
  drift: THREE.InstancedBufferAttribute | null;
  first: number[]; // first instance index per source
  count: number[]; // instances per source
};

const premultiplied = {
  transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;

/**
 * Source-bound fire: instanced flame tongues, smoke puffs and embers.
 *
 * `sprites` belongs in the compositor's half-resolution volume scene, where it
 * can read scene depth for soft contact and occlusion; the two real lights in
 * `lights` belong in the main scene. `group` only holds per-source anchor
 * objects (position/visibility), never drawn, so callers and tests can read
 * each source's state. All sources of a kind share one draw call, one material
 * and one noise tile.
 */
export function createFireEffects(sources: FireSource[], mobile: boolean, view: AtmosphereView = createAtmosphereView()) {
  const group = new THREE.Group(); group.name = "source-bound-fire-smoke";
  const sprites = new THREE.Group(); sprites.name = "fire-sprites";
  const lightGroup = new THREE.Group(); lightGroup.name = "fire-lights";
  const noise = createFireNoiseTexture();
  const shared = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uNoise: { value: noise }, ...view };
  const roots: THREE.Group[] = [];
  const lights: Array<THREE.PointLight | null> = [];
  const quad = new THREE.PlaneGeometry(1, 1);

  const drifts = sources.map((source, index) => new THREE.Vector2(...(source.drift ?? [.2 * Math.sin(index), .2 * Math.cos(index)])));
  for (const source of sources) {
    const root = new THREE.Group(); root.position.copy(source.position); group.add(root); roots.push(root);
  }

  // Per-source tongue layout; identical for every frame.
  const tongues = sources.map((source, index) => Array.from({ length: source.softFloor ? 2 : 3 }, (_, sheet) => ({
    x: Math.sin(index * 2.7 + sheet) * .17, z: Math.cos(index * 1.9 + sheet) * .16,
    width: [1, .78, .62][sheet], height: (.78 + .25 * Math.sin(index * 2.3 + sheet * 2.1)) * [1, .82, .94][sheet],
    seed: index * 4 + sheet * 9 + 1,
  })));
  const smokeCount = sources.map((_, index) => index < 2 ? (mobile ? 14 : 26) : (mobile ? 5 : 9));
  const emberCount = sources.map(source => source.activity !== undefined ? 0 : mobile ? 1 : 3);

  function layer(name: string, vertexShader: string, fragmentShader: string, counts: number[], seeds: (source: number, i: number) => number, order: number, withDrift: boolean): Layer {
    const total = counts.reduce((sum, n) => sum + n, 0);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    geometry.setAttribute("uv", quad.getAttribute("uv"));
    geometry.instanceCount = total;
    const position = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const shape = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aPos", position); geometry.setAttribute("aShape", shape);
    let drift: THREE.InstancedBufferAttribute | null = null;
    if (withDrift) { drift = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2).setUsage(THREE.DynamicDrawUsage); geometry.setAttribute("aDrift", drift); }
    const first: number[] = [];
    let cursor = 0;
    counts.forEach((n, source) => {
      first.push(cursor);
      for (let i = 0; i < n; i++) {
        shape.setX(cursor + i, seeds(source, i));
        if (drift) drift.setXY(cursor + i, drifts[source].x, drifts[source].y);
      }
      cursor += n;
    });
    const material = new THREE.ShaderMaterial({ uniforms: { ...shared }, vertexShader, fragmentShader, ...premultiplied });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; mesh.renderOrder = order; mesh.name = name;
    sprites.add(mesh);
    return { mesh, geometry, material, position, shape, drift, first, count: counts };
  }

  // Smoke first, flames over it, embers on top: a fixed order inside the pass.
  // The smoke seed spreads particles evenly through their life cycle.
  const smoke = layer("depth-aware-smoke", smokeVertex, smokeFragment, smokeCount, (s, i) => i / smokeCount[s] + (s % 7) * .013, 20, true);
  const flames = layer("flame-tongues", flameVertex, flameFragment, tongues.map(t => t.length), (s, i) => tongues[s][i].seed, 21, false);
  const embers = layer("embers", emberVertex, emberFragment, emberCount, (s, i) => ((s * 7 + i * 3) % 29 + 1) / 29 + i * .31, 22, true);
  smoke.shape.needsUpdate = flames.shape.needsUpdate = embers.shape.needsUpdate = true;
  if (smoke.drift) smoke.drift.needsUpdate = true;
  if (embers.drift) embers.drift.needsUpdate = true;

  sources.forEach((source, index) => {
    // Always created and never toggled: changing the light count recompiles every lit material.
    const light = source.intensity > 0 && index < LIGHT_SOURCES ? new THREE.PointLight(source.color, 0, 9, 2) : null;
    if (light) {
      light.castShadow = !mobile && index === 0;
      light.shadow.mapSize.set(512, 512); light.shadow.bias = -.001; light.shadow.normalBias = .035;
      lightGroup.add(light);
    }
    lights.push(light);
  });

  const hidden = sources.map(() => true);
  function clear(layerState: Layer, source: number) {
    const start = layerState.first[source];
    for (let i = 0; i < layerState.count[source]; i++) layerState.position.setW(start + i, 0);
    layerState.position.needsUpdate = true;
  }

  return {
    group, sprites, lights: lightGroup,
    update(time: number, exterior = 0, damageTime = 0) {
      const weather = sampleFireWeather(time);
      shared.uWind.value.set(weather.windX, weather.windZ);
      shared.uTime.value = time;
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i], root = roots[i], light = lights[i];
        const fall = bayFall(damageTime, THREE.MathUtils.clamp(Math.floor(source.position.y / 3.6), 0, 2), collapseBay(source.position.z));
        const growth = source.ignition === undefined ? 1 : THREE.MathUtils.smoothstep(time, source.ignition, source.ignition + 5);
        const visible = growth * (source.exterior ? exterior : 1) * (source.activity ?? 1);
        root.position.copy(source.position);
        root.position.y = THREE.MathUtils.lerp(source.position.y, .25, fall);
        root.visible = visible > .01;
        if (!root.visible) {
          if (!hidden[i]) { clear(smoke, i); clear(flames, i); clear(embers, i); hidden[i] = true; if (light) light.intensity = 0; }
          continue;
        }
        hidden[i] = false;
        // A room source may describe a spreading footprint, but the visible
        // flame stays a cluster so the surface behind it remains readable.
        const breadth = Math.min(source.size?.[0] ?? 1.15, 1.3);
        const height = (source.size?.[1] ?? 1) * (source.size ? .65 : 1);
        // Keep non-graphic character flames small; gusts enhance building sources.
        const burst = source.activity === undefined ? (sampleFireWeather(time, i + 3).flare * .85 + weather.gust * .5) * (1 - fall) : 0;
        const scaleX = (.5 + growth * .5) * breadth * (1 + burst * .2);
        const scaleY = Math.max(.01, visible) * height * (1 + burst);
        root.scale.set(scaleX, scaleY, scaleX);
        const flicker = fireFlicker(time, i * .73);
        const px = root.position.x, py = root.position.y, pz = root.position.z;

        const tongue = tongues[i], flameStart = flames.first[i];
        for (let j = 0; j < tongue.length; j++) {
          const t = tongue[j];
          // Each tongue has its own flicker phase so the cluster never pulses as one.
          const local = fireFlicker(time, i * .73 + (j + 1) * 1.9);
          const k = flameStart + j;
          flames.position.setXYZW(k, px + t.x * scaleX, py, pz + t.z * scaleX, Math.min(1.2, visible * 1.25) * (.55 + local * .5));
          flames.shape.setXYZW(k, t.seed, .78 * scaleX * t.width, 1.75 * scaleY * t.height, source.softFloor ? 1 : 0);
        }
        const smokeStart = smoke.first[i];
        const smokeAmount = visible * (.6 + .4 * Math.min(1, growth));
        for (let j = 0; j < smoke.count[i]; j++) {
          const k = smokeStart + j;
          smoke.position.setXYZW(k, px, py, pz, smokeAmount);
          smoke.shape.setY(k, scaleX); smoke.shape.setZ(k, scaleY);
        }
        const emberStart = embers.first[i];
        const sparks = THREE.MathUtils.smoothstep(visible, .35, .9) * (1 - fall);
        for (let j = 0; j < embers.count[i]; j++) {
          const k = emberStart + j;
          embers.position.setXYZW(k, px, py + .1 * scaleY, pz, sparks);
          embers.shape.setY(k, scaleX); embers.shape.setZ(k, scaleY);
        }

        if (light) {
          light.position.set(px, py + .5, pz);
          // Same driver as the flames, so light and sprites flicker together.
          light.intensity = visible * source.intensity * (1 + burst * .35) * 40 * (1 + (flicker - .9) * .75);
        }
      }
      smoke.position.needsUpdate = smoke.shape.needsUpdate = true;
      flames.position.needsUpdate = flames.shape.needsUpdate = true;
      embers.position.needsUpdate = embers.shape.needsUpdate = true;
    },
    dispose() {
      for (const l of [smoke, flames, embers]) { l.geometry.dispose(); l.material.dispose(); }
      quad.dispose(); noise.dispose();
      lights.forEach(l => l?.dispose());
      group.clear(); sprites.clear(); lightGroup.clear();
    },
  };
}
