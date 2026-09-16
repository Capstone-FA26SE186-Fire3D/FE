import { expect, test } from "@playwright/test";
import * as THREE from "three";
import { createOccupants } from "../../src/features/landing/scene/occupants";
import { roundWalkingPath } from "../../src/features/landing/scene/walking-path";

test("corner rounding adds a curve within the authored clearance envelope", () => {
  const points = roundWalkingPath([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0), new THREE.Vector3(2, 0, 2),
  ]);
  expect(points.some(p => p.x > 1.8 && p.x < 2 && p.z > 0 && p.z < .2)).toBeTruthy();
  expect(points.every(p => p.x >= 0 && p.x <= 2 && p.z >= 0 && p.z <= 2)).toBeTruthy();
  for (let i = 1; i < points.length; i++) expect(points[i].distanceTo(points[i - 1])).toBeGreaterThan(0);
});

test("demonstration routes keep body clearance from room walls and partitions", () => {
  const occupants = createOccupants(false);
  const walls: { x1: number; x2: number; z1: number; z2: number }[] = [];
  for (const side of [-1, 1]) for (const z of [5, -1, -7]) {
    walls.push({ x1: side * 1.5 - .095, x2: side * 1.5 + .095, z1: z + .9, z2: z + 3 });
    walls.push({ x1: side * 1.5 - .095, x2: side * 1.5 + .095, z1: z - 3, z2: z - .3 });
    walls.push({ x1: Math.min(side * 1.55, side * 5.15), x2: Math.max(side * 1.55, side * 5.15), z1: z - 3.075, z2: z - 2.925 });
  }
  try {
    for (let time = 0; time < 100; time += .15) {
      occupants.update(time, false);
      for (const actor of occupants.group.children) {
        if (!actor.visible) continue;
        const { x, z } = actor.position;
        for (const wall of walls) {
          const dx = x - THREE.MathUtils.clamp(x, wall.x1, wall.x2);
          const dz = z - THREE.MathUtils.clamp(z, wall.z1, wall.z2);
          // Horizontal clearance test only; not a full skeletal collision solver.
          if (dx * dx + dz * dz < .22 * .22) {
            throw new Error(`Body overlaps room wall at t=${time.toFixed(2)}, x=${x.toFixed(3)}, z=${z.toFixed(3)}`);
          }
        }
      }
    }
  } finally { occupants.dispose(); }
});

test("corridor trajectories cross laterally instead of remaining in two fixed lanes", () => {
  const occupants = createOccupants(false);
  const positions = new Map<number, number[]>();
  try {
    for (let time = 0; time < 50; time += .2) {
      occupants.update(time, false);
      occupants.group.children.forEach((actor, index) => {
        if (!actor.visible || Math.abs(actor.position.x) > .65 || actor.position.z < -9 || actor.position.z > 7) return;
        const samples = positions.get(index) ?? [];
        samples.push(actor.position.x); positions.set(index, samples);
      });
    }
    const crossingActors = [...positions.values()].filter(samples => Math.max(...samples) - Math.min(...samples) > .6);
    expect(crossingActors.length).toBeGreaterThanOrEqual(12);
    expect(occupants.renderGroup.children.length).toBeLessThan(20);
  } finally { occupants.dispose(); }
});

test("running limbs articulate and preview turns without an instantaneous half-turn", () => {
  const occupants = createOccupants(false);
  const bounds = new THREE.Box3();
  let previousHeading: number | undefined;
  const kneeAngles: number[] = [];
  try {
    for (let time = 0; time < 33; time += .02) {
      occupants.update(time, true);
      const player = occupants.player;
      kneeAngles.push(player.getObjectByName('knee-joint')!.rotation.x);
      expect(player.getObjectByName('elbow-joint')!.rotation.x).toBeLessThan(-.8);
      if (previousHeading !== undefined) {
        const delta = Math.atan2(Math.sin(player.rotation.y - previousHeading), Math.cos(player.rotation.y - previousHeading));
        expect(Math.abs(delta)).toBeLessThan(.05);
      }
      previousHeading = player.rotation.y;
      player.traverse(part => {
        if (part.name !== 'shoe' || !(part instanceof THREE.Mesh)) return;
        part.geometry.computeBoundingBox();
        bounds.copy(part.geometry.boundingBox!).applyMatrix4(part.matrixWorld);
        expect(bounds.min.y).toBeGreaterThanOrEqual(-.0001);
      });
    }
    expect(Math.max(...kneeAngles) - Math.min(...kneeAngles)).toBeGreaterThan(.7);
  } finally { occupants.dispose(); }
});
