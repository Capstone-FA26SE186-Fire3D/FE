import * as THREE from "three";

/**
 * Smoke, flames and dust as instanced billboards animated entirely in the vertex shader: no per-frame CPU work and
 * one draw call per kind. Each puff belongs to an emitter (position, start time, ceiling, drift). Emitters that have
 * not started yet draw nothing, so the same system serves the corridor fire and the building-wide Organization fire.
 */
export type Emitter = {
  position: [number, number, number];
  /** Seconds on the system clock at which this emitter starts. */
  start: number;
  /** Height of a ceiling that smoke spreads along; 0 = open air (smoke keeps rising). */
  ceiling?: number;
  drift?: [number, number];
  /** Billboard size multiplier. */
  scale?: number;
  /** 0 = smoke, 1 = dust (grey, one short burst, fast expansion). */
  kind?: 0 | 1;
};

function softTexture() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
    const r = Math.hypot(dx, dy);
    const noise = 0.88 + 0.12 * Math.sin(x * 0.33 + Math.sin(y * 0.21) * 2) * Math.cos(y * 0.29 + Math.sin(x * 0.17) * 2);
    const a = Math.max(0, 1 - r) ** 1.9 * noise;
    const i = (y * size + x) * 4; data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(a * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); texture.needsUpdate = true;
  texture.minFilter = texture.magFilter = THREE.LinearFilter; return texture;
}

function instanced(maxCount: number, material: THREE.ShaderMaterial, emitters: Emitter[]) {
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geometry.index = quad.index; geometry.setAttribute("position", quad.getAttribute("position")); geometry.setAttribute("uv", quad.getAttribute("uv"));
  let s = 12345; const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const seeds = new Float32Array(maxCount * 4), origin = new Float32Array(maxCount * 4), extra = new Float32Array(maxCount * 4);
  for (let i = 0; i < maxCount; i++) {
    const e = emitters[i % emitters.length];
    seeds.set([rand(), rand(), rand(), rand()], i * 4);
    origin.set([...e.position, e.start], i * 4);
    extra.set([e.ceiling ?? 0, e.drift?.[0] ?? 0, e.drift?.[1] ?? 0, (e.scale ?? 1) * (e.kind === 1 ? -1 : 1)], i * 4);
  }
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(origin, 4));
  geometry.setAttribute("aExtra", new THREE.InstancedBufferAttribute(extra, 4));
  geometry.instanceCount = maxCount;
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
  return { mesh, geometry, quad };
}

const COMMON = `
  attribute vec4 aSeed; attribute vec4 aOrigin; attribute vec4 aExtra; uniform float uTime;
  varying vec2 vUv; varying float vLife; varying float vAlpha; varying float vKind;
`;

export function createSmoke(maxPuffs: number, maxFlames: number, emitters: Emitter[]) {
  const texture = softTexture();
  const time = { value: 0 };
  const smokeMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uMap: { value: texture } },
    transparent: true, depthWrite: false,
    vertexShader: `${COMMON}
      void main(){
        float kind = aExtra.w < 0. ? 1. : 0.;
        float scale = abs(aExtra.w);
        float age = uTime - aOrigin.w;
        float rate = kind > .5 ? .22 : (0.045 + aSeed.y * 0.035);
        float life = kind > .5 ? clamp(age * rate, 0., 1.) : fract(aSeed.x + age * rate);
        float started = step(0., age);
        float climb = kind > .5 ? life * 4.0 : life * 7.0;
        float ceiling = aExtra.x;
        float rise = ceiling > 0. ? min(climb, ceiling - aOrigin.y - 0.25) : climb * 3.2;
        float along = ceiling > 0. ? max(0.0, climb - (ceiling - aOrigin.y - 0.25)) * (1.6 + aSeed.w) : 0.;
        vec3 p = aOrigin.xyz + vec3((aSeed.z - .5) * 1.6 * scale, rise, (aSeed.w - .5) * 1.6 * scale);
        p.xz += aExtra.yz * along * 2.2;
        if (kind > .5) { p.xz += (vec2(aSeed.z, aSeed.w) - .5) * life * 26.; p.y += life * 3.;}
        p.y += sin(uTime * .6 + aSeed.x * 20.) * .08;
        float size = (kind > .5 ? mix(2.5, 11., life) : mix(.9, 4.2, life)) * (.7 + aSeed.y * .6) * scale;
        vec4 mv = viewMatrix * vec4(p, 1.);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
        vUv = uv; vLife = life; vKind = kind;
        float a = kind > .5 ? smoothstep(0., .1, life) * (1. - smoothstep(.45, 1., life)) * .55 : smoothstep(0., .08, life) * (1. - smoothstep(.7, 1., life)) * .5;
        vAlpha = a * started;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying float vAlpha; varying float vLife; varying float vKind;
      void main(){
        float a = texture2D(uMap, vUv).a * vAlpha;
        vec3 col = mix(vec3(.30,.20,.14), vec3(.13,.14,.15), smoothstep(0., .35, vLife));
        col = mix(col, vec3(.42,.43,.42), vKind);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const smoke = instanced(maxPuffs, smokeMaterial, emitters);
  smoke.mesh.renderOrder = 10; smoke.mesh.name = "smoke";

  const flameMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uMap: { value: texture } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${COMMON}
      void main(){
        float age = uTime - aOrigin.w;
        float life = fract(aSeed.x + age * (0.9 + aSeed.y * 0.8));
        float grow = smoothstep(0., 3., age);
        float scale = abs(aExtra.w);
        vec3 p = aOrigin.xyz + vec3((aSeed.z - .5) * 1.1 * (1. - life) * scale, life * 1.7 * scale, (aSeed.w - .5) * 1.1 * (1. - life) * scale);
        float size = mix(2.4, .55, life) * (.7 + aSeed.y * .6) * scale * grow;
        vec4 mv = viewMatrix * vec4(p, 1.);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv; vUv = uv; vLife = life; vAlpha = step(0., age); vKind = aExtra.w < 0. ? 1. : 0.;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying float vLife; varying float vAlpha; varying float vKind;
      void main(){
        float a = texture2D(uMap, vUv).a * (1. - vLife) * vAlpha * (1. - vKind);
        vec3 col = mix(vec3(1., .5, .14), vec3(.85, .16, .02), vLife);
        gl_FragColor = vec4(col * a * .8, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const flames = instanced(maxFlames, flameMaterial, emitters.filter(e => e.kind !== 1).length ? emitters.filter(e => e.kind !== 1) : emitters);
  flames.mesh.renderOrder = 11; flames.mesh.name = "flames";

  return {
    smoke: smoke.mesh, flames: flames.mesh,
    update(seconds: number) { time.value = seconds; },
    setCounts(puffs: number, flameCount: number) { smoke.geometry.instanceCount = Math.min(maxPuffs, puffs); flames.geometry.instanceCount = Math.min(maxFlames, flameCount); },
    dispose() { smoke.geometry.dispose(); flames.geometry.dispose(); smoke.quad.dispose(); flames.quad.dispose(); smokeMaterial.dispose(); flameMaterial.dispose(); texture.dispose(); },
  };
}
