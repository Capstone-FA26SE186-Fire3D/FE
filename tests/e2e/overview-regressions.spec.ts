import { expect, test } from "@playwright/test";
import * as THREE from "three";
import { BAYS, FRAME_SHIFT, ORG_FRAME, PLAN, bayCentre, isWideFrame, orgOverview } from "../../src/features/landing/scene/layout";

test("overview keeps every bay of the circular building in frame through a full orbit, with room left for the copy", () => {
  for (const [w, h] of [[390, 844], [768, 1024], [1366, 768], [1440, 900], [1643, 807]]) {
    const aspect = w / h, mobile = w < 768, wide = isWideFrame(mobile, aspect);
    const camera = new THREE.PerspectiveCamera(mobile ? 62 : 58, aspect, 0.1, 400);
    for (let yaw = -Math.PI; yaw <= Math.PI; yaw += Math.PI / 8) for (const pitch of [-0.6, 0, 0.7]) {
      const pose = orgOverview(camera.fov, aspect, mobile, { yaw, pitch });
      camera.position.set(...pose.position); camera.lookAt(...pose.target); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
      for (let bay = 0; bay < BAYS * 2; bay++) for (const y of [0, PLAN.tiers * PLAN.tierHeight]) {
        const a = bayCentre(bay / 2), p = new THREE.Vector3(Math.cos(a) * PLAN.outerRadius, y, Math.sin(a) * PLAN.outerRadius).project(camera);
        // The runtime shifts the view window by FRAME_SHIFT * ORG_FRAME of the viewport (content moves right / up).
        const x = p.x + (wide ? 2 * FRAME_SHIFT * ORG_FRAME : 0), yy = p.y + (!wide ? 2 * FRAME_SHIFT * ORG_FRAME : 0);
        expect(Math.abs(x), `${w}x${h} yaw ${yaw.toFixed(2)} pitch ${pitch}`).toBeLessThan(1);
        expect(Math.abs(yy), `${w}x${h} yaw ${yaw.toFixed(2)} pitch ${pitch}`).toBeLessThan(1);
        expect(p.z).toBeLessThan(1);
      }
    }
  }
});
