import * as THREE from "three";
import type { FireSource } from "./building";
import { bayFall, collapseBay } from "./collapse-timeline";

const noise = `
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y); }
float fbm(vec2 p) { return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.07); }
`;
const vertex = `
uniform float uTime; uniform float uSeed; uniform vec2 uDrift;
varying vec2 vUv;
void main(){
  vUv=uv; vec3 p=position;
  float tip=uv.y*uv.y;
  p.x += tip*sin(uTime*2.1+uv.y*5.+uSeed)*.035;
  p.z += tip*cos(uTime*1.7+uv.y*4.+uSeed)*.03;
  p.y += tip*sin(uTime*3.2+uSeed+uv.x*8.)*.12;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const flame = `
uniform float uTime; uniform float uSeed; varying vec2 vUv;
${noise}
void main() {
  vec2 p=vUv;
  float n=fbm(vec2(p.x*5.+uSeed,p.y*4.-uTime*2.4));
  float curl=fbm(vec2(p.x*7.+uSeed+uTime*.25,p.y*5.-uTime*1.8));
  float width=pow(1.-p.y,.48)*(.28+n*.35);
  float edge=abs(p.x-.5+(curl-.5)*.5*p.y);
  float shape=1.-smoothstep(width*.35,width+.03,edge);
  float top=1.-smoothstep(.5+n*.34,1.,p.y);
  float alpha=shape*top*smoothstep(0.,.06,p.y)*smoothstep(.2,.52,n+curl*.2);
  vec3 col=mix(vec3(1.,.12,.015),vec3(1.,.68,.16),clamp((1.-p.y)*shape,0.,1.));
  col=mix(col,vec3(1.,.91,.59),pow(shape,5.)*(1.-p.y)*.2);
  gl_FragColor=vec4(pow(col,vec3(2.2)),alpha*.9);
}`;
const smokeVertex = `
uniform float uTime; uniform vec2 uDrift; attribute float aSeed; varying vec2 vUv; varying float vLife; varying float vSeed;
void main(){
  vUv=uv; vSeed=aSeed; float life=fract(aSeed+uTime*(.065+.025*fract(aSeed*17.))); vLife=life;
  vec3 centre=vec3(sin(aSeed*73.+life*3.)*(.15+life*.65),life*2.65,cos(aSeed*47.)*(.15+life*.7));
  centre.xz += uDrift*life*life*2.;
  vec4 mv=modelViewMatrix*vec4(centre,1.);
  float angle=aSeed*39.+life*.6;
  mat2 turn=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
  vec2 shape=vec2(.8+.4*fract(aSeed*31.),1.+.5*fract(aSeed*13.));
  mv.xy+=turn*(position.xy*shape)*(.38+life*1.6);
  gl_Position=projectionMatrix*mv;
}`;
const smokeFragment = `
uniform float uTime; varying vec2 vUv; varying float vLife; varying float vSeed;
${noise}
void main(){
  vec2 flow=vUv*4.+vec2(vSeed*37.,-uTime*.12);
  vec2 warp=vec2(fbm(flow),fbm(flow+vec2(7.3,3.1)))-.5;
  float cloud=fbm(flow+warp*2.);
  float radial=1.-smoothstep(.08,.48,length(vUv-.5+warp*.3));
  // Irregular wispy edges, with an independent fade at the sprite boundary.
  vec2 edge=min(vUv,1.-vUv);
  float boundary=smoothstep(0.,.14,edge.x)*smoothstep(0.,.14,edge.y);
  float life=smoothstep(0.,.15,vLife)*(1.-smoothstep(.72,1.,vLife));
  float alpha=boundary*radial*life*smoothstep(.18,.75,cloud)*.65;
  vec3 color=mix(vec3(.018,.021,.023),vec3(.10,.095,.09),cloud*.5+(1.-vLife)*.15);
  gl_FragColor=vec4(pow(color,vec3(2.2)),alpha);
}`;

export function createFireEffects(sources: FireSource[], mobile: boolean) {
  const group = new THREE.Group(); group.name = "source-bound-fire-smoke";
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.ShaderMaterial[] = [];
  const lights: Array<THREE.PointLight | null> = [];
  const roots: THREE.Group[] = [];
  for (const [index, source] of sources.entries()) {
    const root = new THREE.Group(); root.position.copy(source.position); group.add(root);
    roots.push(root);
    const drift = new THREE.Vector2(...(source.drift ?? [.2 * Math.sin(index), .2 * Math.cos(index)]));
    const geometry = new THREE.PlaneGeometry(.85, 1.75, 6, 12); geometry.translate(0, .875, 0); geometries.push(geometry);
    for (let sheet = 0; sheet < 3; sheet++) {
      const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uSeed: { value: index * 4 + sheet * 9 }, uDrift: { value: drift } }, vertexShader: vertex, fragmentShader: flame, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending });
      const mesh = new THREE.Mesh(geometry, material); mesh.rotation.y = sheet * Math.PI / 3; mesh.frustumCulled = false;
      mesh.position.set(Math.sin(index * 2.7 + sheet) * .17, 0, Math.cos(index * 1.9 + sheet) * .16);
      mesh.scale.y = .78 + .25 * Math.sin(index * 2.3 + sheet * 2.1); root.add(mesh); materials.push(material);
    }
    const smokeGeometry = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    smokeGeometry.index = plane.index;
    smokeGeometry.attributes.position = plane.attributes.position;
    smokeGeometry.attributes.uv = plane.attributes.uv;
    const count = index < 2 ? (mobile ? 14 : 26) : (mobile ? 5 : 9);
    smokeGeometry.instanceCount = count;
    smokeGeometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i / count), 1));
    geometries.push(smokeGeometry);
    const smokeMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uDrift: { value: drift } }, vertexShader: smokeVertex, fragmentShader: smokeFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial); smoke.frustumCulled = false; smoke.position.y = .35;
    smoke.name = "depth-tested-smoke"; root.add(smoke); materials.push(smokeMaterial);
    const light = source.intensity > 0 && (index < 2 || index === 8) ? new THREE.PointLight(source.color, 26 * source.intensity, 9, 2) : null;
    if (light) {
    light.position.copy(source.position).add(new THREE.Vector3(0, .5, 0));
    light.castShadow = !mobile && index === 0;
    light.shadow.mapSize.set(512, 512); light.shadow.bias = -.001; light.shadow.normalBias = .035;
      group.add(light);
    }
    lights.push(light);
  }
  return {
    group,
    update(time: number, exterior = 0, damageTime = 0) {
      materials.forEach(m => { m.uniforms.uTime.value = time; });
      lights.forEach((light, i) => {
        const source = sources[i];
        const fall = bayFall(damageTime,THREE.MathUtils.clamp(Math.floor(source.position.y/3.6),0,2),collapseBay(source.position.z));
        const growth = source.ignition === undefined ? 1 : THREE.MathUtils.smoothstep(time, source.ignition, source.ignition + 5);
        const visible = growth * (source.exterior ? exterior : 1) * (source.activity ?? 1);
        roots[i].position.copy(source.position);
        roots[i].position.y = THREE.MathUtils.lerp(source.position.y,.25,fall);
        roots[i].visible = visible > .01;
        const breadth = source.size?.[0] ?? 1.15;
        const height = (source.size?.[1] ?? 1) * (source.size ? .65 : 1);
        roots[i].scale.set((.5 + growth * .5) * breadth, Math.max(.01, visible) * height, (.5 + growth * .5) * breadth);
        if (light) {
          light.position.copy(roots[i].position).y += .5;
          light.intensity = visible * source.intensity * (40 + Math.sin(time * 6.1 + i) * 3 + Math.sin(time * 9.7) * 1.8);
          light.visible = visible > .01;
        }
      });
    },
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); lights.forEach(l => l?.dispose()); group.clear(); },
  };
}
