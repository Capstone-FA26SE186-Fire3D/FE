import * as THREE from "three";
import { atmosphereFragment, atmosphereVertex } from "./room-atmosphere-shader";
import { roomFireTimeline } from "./fire-timeline";
import { bayFall, collapseBay } from "./collapse-timeline";

// Art-directed fire spread, not a fire-dynamics or evacuation simulation.

export function createRoomAtmosphere(mobile: boolean) {
  const group = new THREE.Group(); group.name = "wall-ceiling-fire-and-smoke-volume";
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // One shared 3D noise field. Hardware interpolation replaces hundreds of
  // procedural hashes per pixel, without flattening the volume into a sprite.
  const noiseData = new Uint8Array(32 * 32 * 32);
  let random = 173;
  for (let i = 0; i < noiseData.length; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    noiseData[i] = random >>> 24;
  }
  const noiseTexture = new THREE.Data3DTexture(noiseData, 32, 32, 32);
  noiseTexture.format = THREE.RedFormat;
  noiseTexture.minFilter = noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.wrapS = noiseTexture.wrapT = noiseTexture.wrapR = THREE.RepeatWrapping;
  noiseTexture.unpackAlignment = 1; noiseTexture.needsUpdate = true;
  const materials: THREE.ShaderMaterial[] = [];
  const view = {
    uDepth: { value: null as THREE.DepthTexture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uInverseProjection: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
  };
  const rooms: { root: THREE.Group; time: { value: number }; growth: { value: number }; smoke: { value: number }; onset: number; level: number }[] = [];
  for (let level = 0; level < 3; level++) for (const side of [-1, 1]) for (let room = 0; room < 3; room++) {
    const timeline = roomFireTimeline(level, side, room);
    const { seed, strength } = timeline;
    const onset = timeline.ignition;
    const root = new THREE.Group(); group.add(root);
    const y = level * 3.6, z = [5,-1,-7][room];
    const time = { value: 0 }, growth = { value: 0 }, smoke = { value: 0 };
    const origin = new THREE.Vector3(side * 3.35 - 1.7, y, z - 2.91);
    const addVolume = (size: THREE.Vector3, center: THREE.Vector3, ceiling: boolean, fieldMatrix = new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z), roof = false, ignition = timeline.wall) => {
      const half = size.clone().multiplyScalar(.5);
      const material = new THREE.ShaderMaterial({
        vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment,
        defines: { MARCH_STEPS: mobile ? 12 : 16 },
        uniforms: {
          ...view,
          uTime: time, uGrowth: growth, uSmoke: smoke,
          uOpacity: { value: 1 },
          uIgnition: { value: ignition },
          uNoise: { value: noiseTexture },
          uSeed: { value: seed }, uStrength: { value: strength },
          uOrigin: { value: origin }, uMin: { value: center.clone().sub(half) },
          uFieldMatrix: { value: fieldMatrix }, uRoof: { value: roof ? 1 : 0 },
          uMax: { value: center.clone().add(half) }, uCeiling: { value: ceiling ? 1 : 0 },
        },
        transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = ceiling ? "ceiling-rollover-smoke-volume" : "wall-fire-volume";
      mesh.position.copy(center); mesh.scale.copy(size);
      root.add(mesh); materials.push(material);
    };
    // Both regions share world-space turbulence, rather than two unrelated UV sheets.
    // Their bounds stay inside the room, on the visible side of the solid partition.
    addVolume(new THREE.Vector3(3.4, 2.35, .8), new THREE.Vector3(side * 3.35, y + 1.425, z - 2.51), false);
    // Opposite partition: reverse depth so flames grow into this room from
    // the other wall too, with a later onset rather than a mirrored loop.
    const oppositeField = new THREE.Matrix4().set(
      1,0,0,-origin.x, 0,1,0,-y, 0,0,-1,z+2.91, 0,0,0,1,
    );
    addVolume(new THREE.Vector3(3.4,2.35,.8), new THREE.Vector3(side*3.35,y+1.425,z+2.51), false,
      oppositeField, false, timeline.wall+14);
    addVolume(new THREE.Vector3(3.4, 1.15, 5.7), new THREE.Vector3(side * 3.35, y + 2.625, z - .06), true);
    if (room === 2) {
      // Rear stair bay spans z=-17..-11. Continue the same surface-bound
      // effect onto its rear wall and ceiling on every storey.
      const stairOrigin = new THREE.Vector3(origin.x,y,-16.89);
      const stairField = new THREE.Matrix4().makeTranslation(-stairOrigin.x,-y,-stairOrigin.z);
      addVolume(new THREE.Vector3(3.4,2.9,.8), new THREE.Vector3(side*3.35,y+1.65,-16.49), false,
        stairField, false, timeline.wall+10);
      addVolume(new THREE.Vector3(3.4,1.15,5.7), new THREE.Vector3(side*3.35,y+2.625,-14.04), true,
        stairField, false, timeline.wall+18);
      // Outside flank of the bay, continuing the facade behind the last room.
      const stairSideField = new THREE.Matrix4().set(
        0,0,3.4/5.7,16.89*3.4/5.7, 0,1,0,-y, side,0,0,-5.3, 0,0,0,1,
      );
      addVolume(new THREE.Vector3(.85,3.15,5.7), new THREE.Vector3(side*5.7,y+1.8,-14.04), false,
        stairSideField, false, timeline.facade+12);
    }
    if (side === 1) {
      // Corridor-side coordinates: length follows z, depth points away from the
      // wall into the corridor. Fire stays at the floor edge and under the ceiling.
      const corridorField = new THREE.Matrix4().set(
        0,0,3.4/6,-(z-3)*3.4/6, 0,1,0,-y, -1,0,0,1.39, 0,0,0,1,
      );
      addVolume(new THREE.Vector3(.45,2.65,6), new THREE.Vector3(1.165,y+1.575,z), false, corridorField);
      const leftField = new THREE.Matrix4().set(
        0,0,3.4/6,-(z-3)*3.4/6, 0,1,0,-y, 1,0,0,1.39, 0,0,0,1,
      );
      addVolume(new THREE.Vector3(.45,2.65,6), new THREE.Vector3(-1.165,y+1.575,z), false, leftField, false, timeline.wall+8);
      addVolume(new THREE.Vector3(2.7,1.15,6), new THREE.Vector3(0,y+2.625,z), true, corridorField);
      addVolume(new THREE.Vector3(2.7,.65,6), new THREE.Vector3(0,y+.325,z), false, corridorField, true, timeline.ignition+12);
    }
    // Exterior flames share the room ignition and rise immediately outside the
    // facade. Each field is expressed in metres along its supporting surface.
    // Each bay is six metres long; the old 3.4m volume left a 2.6m gap.
    const outerOrigin = new THREE.Vector3(side * 5.3, y, z - 3);
    const field = new THREE.Matrix4().set(
      0,0,3.4/6,-outerOrigin.z*3.4/6,
      0,1,0,-outerOrigin.y,
      side,0,0,-side*outerOrigin.x,
      0,0,0,1,
    );
    addVolume(new THREE.Vector3(.85,3.15,6), new THREE.Vector3(side*5.7,y+1.8,z), false, field, false, timeline.facade);
    if (room === 0 || room === 2) {
      // Continue around the front/rear corners without covering the central exit.
      const outward = room === 0 ? 1 : -1;
      const facadeZ = room === 0 ? 9.11 : -17.11;
      const facadeField = new THREE.Matrix4().set(
        1,0,0,-(side*3.35-1.7),
        0,1,0,-y,
        0,0,outward,-outward*facadeZ,
        0,0,0,1,
      );
      addVolume(new THREE.Vector3(3.4,3.15,.85), new THREE.Vector3(side*3.35,y+1.8,facadeZ+outward*.425), false, facadeField, false, timeline.facade);
    }
    if (level === 2) {
      const roofOrigin = new THREE.Vector3(side*3.35-1.7,10.55,z-2.85);
      addVolume(new THREE.Vector3(3.4,3.2,5.7), new THREE.Vector3(side*3.35,12.15,z), false,
        new THREE.Matrix4().makeTranslation(-roofOrigin.x,-roofOrigin.y,-roofOrigin.z), true, timeline.roof);
    }
    rooms.push({root,time,growth,smoke,onset,level});
  }
  return {
    group,
    configureView(depth: THREE.DepthTexture, camera: THREE.PerspectiveCamera, width: number, height: number) {
      view.uDepth.value = depth; view.uResolution.value.set(width, height);
      view.uInverseProjection.value.copy(camera.projectionMatrixInverse);
      view.uCameraWorld.value.copy(camera.matrixWorld);
    },
    update(time:number,cutaway:number,damageTime=0){
      for(const room of rooms){
        room.root.visible=room.level===0||cutaway>.01;
        const age=Math.max(0,time-room.onset);
        room.time.value=time;
        room.growth.value=THREE.MathUtils.smoothstep(age,0,32);
        // Accumulation saturates instead of looping back to clean air.
        room.smoke.value=1-Math.exp(-age/20);
      }
      materials.forEach(material => {
        const min = material.uniforms.uMin.value as THREE.Vector3;
        const max = material.uniforms.uMax.value as THREE.Vector3;
        const level = THREE.MathUtils.clamp(Math.floor(min.y/3.6),0,2);
        const fall = bayFall(damageTime,level,collapseBay((min.z+max.z)/2));
        material.uniforms.uOpacity.value = 1-THREE.MathUtils.smoothstep(fall,0,.85);
      });
    },
    dispose(){geometry.dispose();noiseTexture.dispose();materials.forEach(m=>m.dispose());group.clear();},
  };
}
