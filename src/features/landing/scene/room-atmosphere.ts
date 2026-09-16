import * as THREE from "three";
import { atmosphereFragment, atmosphereVertex } from "./room-atmosphere-shader";
import { roomFireTimeline } from "./fire-timeline";
import { bayFall, collapseBay } from "./collapse-timeline";
import { sampleFireWeather } from "./fire-weather";

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
          uWind: { value: new THREE.Vector2() }, uGust: { value: 0 }, uFlare: { value: 0 },
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
    addVolume(new THREE.Vector3(3.4, 3.38, .3), new THREE.Vector3(side * 3.35, y + 1.69, z - 2.76), false);
    // Opposite partition: reverse depth so flames grow into this room from
    // the other wall too, with a later onset rather than a mirrored loop.
    const frontWallZ = z + (room === 0 ? 3.91 : 2.91);
    const oppositeField = new THREE.Matrix4().set(
      1,0,0,-origin.x, 0,1,0,-y, 0,0,-1,frontWallZ, 0,0,0,1,
    );
    addVolume(new THREE.Vector3(3.4,3.38,.3), new THREE.Vector3(side*3.35,y+1.69,frontWallZ-.15), false,
      oppositeField, false, timeline.wall+14);
    addVolume(new THREE.Vector3(3.4, 1.15, 5.7), new THREE.Vector3(side * 3.35, y + 2.625, z - .06), true);
    if (room === 2) {
      // Rear stair bay spans z=-17..-11. Continue the same surface-bound
      // effect onto its rear wall and ceiling on every storey.
      const stairOrigin = new THREE.Vector3(origin.x,y,-16.89);
      const stairField = new THREE.Matrix4().makeTranslation(-stairOrigin.x,-y,-stairOrigin.z);
      addVolume(new THREE.Vector3(3.4,3.38,.3), new THREE.Vector3(side*3.35,y+1.69,-16.74), false,
        stairField, false, timeline.wall+10);
      addVolume(new THREE.Vector3(3.4,1.15,5.7), new THREE.Vector3(side*3.35,y+2.625,-14.04), true,
        stairField, false, timeline.wall+18);
      // Outside flank of the bay, continuing the facade behind the last room.
      const stairSideField = new THREE.Matrix4().set(
        0,0,3.4/7,17*3.4/7, 0,1,0,-y, side,0,0,-5.28, 0,0,0,1,
      );
      addVolume(new THREE.Vector3(.3,3.6,7), new THREE.Vector3(side*5.43,y+1.8,-13.5), false,
        stairSideField, false, timeline.facade+12);
    }
    if (side === 1) {
      // Corridor-side coordinates: length follows z, depth points away from the
      // wall into the corridor. Fire stays at the floor edge and under the ceiling.
      const corridorLength = room === 0 ? 7 : 6;
      const corridorZ = z + (room === 0 ? .5 : 0);
      const corridorField = new THREE.Matrix4().set(
        0,0,3.4/corridorLength,-(z-3)*3.4/corridorLength, 0,1,0,-y, -1,0,0,1.41, 0,0,0,1,
      );
      addVolume(new THREE.Vector3(.3,3.38,corridorLength), new THREE.Vector3(1.26,y+1.69,corridorZ), false, corridorField);
      const leftField = new THREE.Matrix4().set(
        0,0,3.4/corridorLength,-(z-3)*3.4/corridorLength, 0,1,0,-y, 1,0,0,1.41, 0,0,0,1,
      );
      addVolume(new THREE.Vector3(.3,3.38,corridorLength), new THREE.Vector3(-1.26,y+1.69,corridorZ), false, leftField, false, timeline.wall+8);
      addVolume(new THREE.Vector3(2.7,1.15,corridorLength), new THREE.Vector3(0,y+2.625,corridorZ), true, corridorField);
      addVolume(new THREE.Vector3(2.7,.65,corridorLength), new THREE.Vector3(0,y+.325,corridorZ), false, corridorField, true, timeline.ignition+12);
    }
    // Exterior flames share the room ignition and rise immediately outside the
    // facade. Each field is expressed in metres along its supporting surface.
    // Each bay is six metres long; the old 3.4m volume left a 2.6m gap.
    const facadeLength = room === 0 ? 7 : 6;
    const facadeCenter = z + (room === 0 ? .5 : 0);
    const outerOrigin = new THREE.Vector3(side * 5.28, y, z - 3);
    const field = new THREE.Matrix4().set(
      0,0,3.4/facadeLength,-outerOrigin.z*3.4/facadeLength,
      0,1,0,-outerOrigin.y,
      side,0,0,-side*outerOrigin.x,
      0,0,0,1,
    );
    addVolume(new THREE.Vector3(.3,3.6,facadeLength), new THREE.Vector3(side*5.43,y+1.8,facadeCenter), false, field, false, timeline.facade);
    if (room === 0 || room === 2) {
      // Continue around the front/rear corners without covering the central exit.
      const outward = room === 0 ? 1 : -1;
      const facadeZ = room === 0 ? 9.08 : -17.08;
      const facadeField = new THREE.Matrix4().set(
        3.4/3.8,0,0,-(side*3.3-1.9)*3.4/3.8,
        0,1,0,-y,
        0,0,outward,-outward*facadeZ,
        0,0,0,1,
      );
      addVolume(new THREE.Vector3(3.8,3.6,.3), new THREE.Vector3(side*3.3,y+1.8,facadeZ+outward*.15), false, facadeField, false, timeline.facade);
      // The rear is a solid wall, unlike the front entrance. Continue across
      // its central strip and slab edges rather than leaving a false doorway.
      if (room === 2 && side === 1) {
        const rearCenterField = new THREE.Matrix4().set(
          3.4/2.8,0,0,1.7, 0,1,0,-y, 0,0,-1,-17.08, 0,0,0,1,
        );
        addVolume(new THREE.Vector3(2.8,3.6,.3), new THREE.Vector3(0,y+1.8,-17.23), false,
          rearCenterField, false, timeline.facade+6);
      }
    }
    if (level === 2) {
      // Tile the complete roof, including the corridor and rear stair bay.
      // Each tile keeps its own onset but shares exact adjoining bounds.
      const roofTile = (startZ: number, length: number, ignition: number) => {
        const roofField = new THREE.Matrix4().set(
          3.4/5.2,0,0,side === 1 ? 0 : 3.4,
          0,1,0,-10.54, 0,0,5.7/length,-startZ*5.7/length, 0,0,0,1,
        );
        addVolume(new THREE.Vector3(5.2,3.2,length), new THREE.Vector3(side*2.6,12.14,startZ+length/2), false,
          roofField, true, ignition);
      };
      roofTile(z-3,facadeLength,timeline.roof);
      if (room === 2) roofTile(-17,7,timeline.roof+8);
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
        const weather = sampleFireWeather(time, material.uniforms.uSeed.value);
        material.uniforms.uWind.value.set(weather.windX, weather.windZ);
        material.uniforms.uGust.value = weather.gust;
        material.uniforms.uFlare.value = weather.flare;
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
