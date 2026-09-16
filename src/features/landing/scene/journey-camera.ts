import * as THREE from "three";
import type { LandingBranch } from "../types";

const marks = [
  { at: 0, z: 7.4, x: -.22, lookX: .12 },
  { at: .13, z: 5.5, x: -.18, lookX: .15 },
  { at: .3, z: 1.9, x: -.15, lookX: -.05 },
  { at: .46, z: -3.1, x: .1, lookX: -.2 },
  { at: .62, z: -7.8, x: .12, lookX: -.1 },
  { at: .78, z: -11.5, x: .05, lookX: -.35 },
  { at: 1, z: -12.9, x: 0, lookX: 0 },
];

export function createJourneyCamera(camera: THREE.PerspectiveCamera) {
  const targetPosition = new THREE.Vector3(), targetLook = new THREE.Vector3(), look = new THREE.Vector3(0, 1.65, 0);
  const exterior = new THREE.Vector3(), exteriorLook = new THREE.Vector3();
  let initialized = false, organization = 0, phone = 0;
  return {
    update(progress: number, branch: LandingBranch, delta: number, mobile: boolean, orbit = { yaw: 0, pitch: 0 }) {
      const p = THREE.MathUtils.clamp(progress / .86, 0, 1);
      const index = Math.max(0, marks.findIndex((m, i) => i < marks.length - 1 && p >= m.at && p <= marks[i + 1].at));
      const a = marks[index], b = marks[index + 1];
      const local = THREE.MathUtils.smoothstep(p, a.at, b.at);
      const z = THREE.MathUtils.lerp(a.z, b.z, local);
      targetPosition.set(THREE.MathUtils.lerp(a.x, b.x, local), 1.65, z);
      targetLook.set(THREE.MathUtils.lerp(a.lookX, b.lookX, local), 1.58, z - 5);
      const blend = 1 - Math.exp(-delta * 3.5);
      organization = THREE.MathUtils.lerp(organization, branch === "organization" ? 1 : 0, blend);
      phone = THREE.MathUtils.lerp(phone, branch === "trainee" ? 1 : 0, blend);
      exterior.set(mobile ? 31 : 22, mobile ? 25 : 18, mobile ? 32 : 23);
      exterior.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit.yaw);
      exterior.y += orbit.pitch * 18;
      exteriorLook.set(mobile ? 0 : -8, 4.1, mobile ? -4 : 1);
      targetLook.lerp(new THREE.Vector3(0, 1.65, 3), phone);
      targetPosition.lerp(exterior, organization); targetLook.lerp(exteriorLook, organization);
      const settle = initialized ? 1 - Math.exp(-delta * 10) : 1;
      camera.position.lerp(targetPosition, settle); look.lerp(targetLook, settle); camera.lookAt(look); initialized = true;
      const targetAmount = branch === "organization" ? organization : branch === "trainee" ? phone : 1 - Math.max(organization, phone);
      return { organization, phone, settled: targetAmount > .995 && camera.position.distanceTo(targetPosition) < .045, position: camera.position };
    },
  };
}
