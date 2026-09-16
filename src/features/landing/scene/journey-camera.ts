import * as THREE from "three";
import type { LandingBranch } from "../types";

const marks = [
  { at: 0, z: 7.4, x: -0.22, lookX: 0.12 },
  { at: 0.13, z: 5.5, x: -0.18, lookX: 0.15 },
  { at: 0.3, z: 1.9, x: -0.15, lookX: -0.05 },
  { at: 0.46, z: -3.1, x: 0.1, lookX: -0.2 },
  { at: 0.62, z: -7.8, x: 0.12, lookX: -0.1 },
  { at: 0.78, z: -11.5, x: 0.05, lookX: -0.35 },
  { at: 1, z: -12.9, x: 0, lookX: 0 },
];

export function createJourneyCamera(camera: THREE.PerspectiveCamera) {
  const targetPosition = new THREE.Vector3(),
    targetLook = new THREE.Vector3(),
    look = new THREE.Vector3(0, 1.65, 0);
  const exterior = new THREE.Vector3(),
    exteriorLook = new THREE.Vector3();
  let initialized = false,
    organization = 0,
    phone = 0;
  return {
    update(
      progress: number,
      branch: LandingBranch,
      delta: number,
      mobile: boolean,
      orbit = { yaw: 0, pitch: 0 },
    ) {
      const p = THREE.MathUtils.clamp(progress / 0.86, 0, 1);
      const index = Math.max(
        0,
        marks.findIndex(
          (m, i) => i < marks.length - 1 && p >= m.at && p <= marks[i + 1].at,
        ),
      );
      const a = marks[index],
        b = marks[index + 1];
      const local = THREE.MathUtils.smoothstep(p, a.at, b.at);
      const z = THREE.MathUtils.lerp(a.z, b.z, local);
      targetPosition.set(THREE.MathUtils.lerp(a.x, b.x, local), 1.65, z);
      targetLook.set(
        THREE.MathUtils.lerp(a.lookX, b.lookX, local),
        1.58,
        z - 5,
      );
      const blend = 1 - Math.exp(-delta * 3.5);
      organization = THREE.MathUtils.lerp(
        organization,
        branch === "organization" ? 1 : 0,
        blend,
      );
      phone = THREE.MathUtils.lerp(phone, branch === "trainee" ? 1 : 0, blend);
      // Orbit the building centre, not the front doorway. Fit a bounding sphere
      // against both viewport axes so side-on views cannot crop the rear bay.
      exteriorLook.set(0, 6.6, -4);
      const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
      const limitingFov = Math.min(
        halfFov,
        Math.atan(Math.tan(halfFov) * camera.aspect),
      );
      const distance = (16.5 / Math.sin(limitingFov)) * (mobile ? 1.08 : 1.02);
      exterior
        .set(1, 0.5 + orbit.pitch * 0.55, 1.15)
        .normalize()
        .multiplyScalar(distance);
      exterior.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit.yaw);
      exterior.add(exteriorLook);
      targetLook.lerp(new THREE.Vector3(0, 1.65, 3), phone);
      targetPosition.lerp(exterior, organization);
      targetLook.lerp(exteriorLook, organization);
      const settle = initialized ? 1 - Math.exp(-delta * 10) : 1;
      camera.position.lerp(targetPosition, settle);
      look.lerp(targetLook, settle);
      camera.lookAt(look);
      initialized = true;
      const targetAmount =
        branch === "organization"
          ? organization
          : branch === "trainee"
            ? phone
            : 1 - Math.max(organization, phone);
      return {
        organization,
        phone,
        settled:
          targetAmount > 0.995 &&
          camera.position.distanceTo(targetPosition) < 0.045,
        position: camera.position,
      };
    },
  };
}
