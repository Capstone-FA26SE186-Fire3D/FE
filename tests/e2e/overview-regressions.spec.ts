import { expect, test } from "@playwright/test";
import * as THREE from "three";
import { createJourneyCamera } from "../../src/features/landing/scene/journey-camera";
import { createOccupants } from "../../src/features/landing/scene/occupants";
import { createRoomAtmosphere } from "../../src/features/landing/scene/room-atmosphere";

test("overview keeps every building corner in frame through a full orbit", () => {
  for (const aspect of [390 / 844, 895 / 686, 1643 / 807]) {
    const camera = new THREE.PerspectiveCamera(60, aspect, .06, 140);
    const controller = createJourneyCamera(camera);
    for (let yaw = -Math.PI; yaw <= Math.PI; yaw += Math.PI / 8) {
      for (const pitch of [-.7, 0, .7]) {
        controller.update(1, "organization", 10, aspect < 1, { yaw, pitch });
        camera.updateMatrixWorld(true);
        for (const x of [-5.5, 5.5]) for (const y of [0, 13.2]) for (const z of [-17.4, 9.4]) {
          const screen = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(screen.x)).toBeLessThan(.98);
          expect(Math.abs(screen.y)).toBeLessThan(.98);
          expect(screen.z).toBeLessThan(1);
        }
      }
    }
  }
});

test("evacuees keep travelling beyond the entrance instead of running at an endpoint", () => {
  const occupants = createOccupants(false);
  let exteriorSamples = 0;
  try {
    for (let t = 12; t < 160; t += .5) {
      occupants.update(t, false);
      const previous = occupants.group.children.map(actor => ({ visible: actor.visible, p: actor.position.clone() }));
      occupants.update(t + .2, false);
      occupants.group.children.forEach((actor, i) => {
        if (!actor.visible || !previous[i].visible || previous[i].p.z < 10 || actor.position.z < 10) return;
        exteriorSamples++;
        expect(Math.hypot(actor.position.x - previous[i].p.x, actor.position.z - previous[i].p.z)).toBeGreaterThan(.2);
      });
    }
    expect(exteriorSamples).toBeGreaterThan(100);
  } finally { occupants.dispose(); }
});

test("facade volumes contact each floor and cover adjoining bays without gaps", () => {
  const atmosphere = createRoomAtmosphere(false);
  try {
    const spans: [number, number][] = [];
    atmosphere.group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.position.x < 5.2 || object.position.y > 3.6) return;
      const material = object.material as THREE.ShaderMaterial;
      const min = material.uniforms.uMin.value as THREE.Vector3;
      const max = material.uniforms.uMax.value as THREE.Vector3;
      expect(min.y).toBeCloseTo(0);
      expect(min.x).toBeLessThanOrEqual(5.29);
      expect(max.x).toBeLessThan(5.6);
      spans.push([min.z, max.z]);
    });
    spans.sort((a, b) => a[0] - b[0]);
    expect(spans).toHaveLength(4);
    expect(spans[0][0]).toBeCloseTo(-17);
    expect(spans.at(-1)![1]).toBeCloseTo(9);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeLessThanOrEqual(spans[i - 1][1] + .001);
  } finally { atmosphere.dispose(); }
});

test("roof and solid rear wall have no permanently unassigned central or stair strip", () => {
  const atmosphere = createRoomAtmosphere(false);
  const roof: THREE.Box3[] = [], rear: THREE.Box3[] = [];
  try {
    atmosphere.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const uniforms = (object.material as THREE.ShaderMaterial).uniforms;
      const bounds = new THREE.Box3(uniforms.uMin.value, uniforms.uMax.value);
      if (uniforms.uRoof.value === 1 && bounds.min.y > 10) roof.push(bounds);
      if (bounds.max.z < -17) rear.push(bounds);
    });
    for (let x = -5; x <= 5; x += .25) {
      for (let z = -16.9; z < 9; z += .25) {
        expect(roof.some(box => box.containsPoint(new THREE.Vector3(x,10.56,z)))).toBeTruthy();
      }
      for (let y = .1; y < 10.7; y += .25) {
        expect(rear.some(box => box.containsPoint(new THREE.Vector3(x,y,-17.15)))).toBeTruthy();
      }
    }
  } finally { atmosphere.dispose(); }
});
