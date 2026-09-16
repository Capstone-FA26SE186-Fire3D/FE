import { test, expect } from "@playwright/test";
import * as THREE from "three";
import { createBuildingDamage } from "../../src/features/landing/scene/building-damage";
import { bayFall } from "../../src/features/landing/scene/collapse-timeline";

test("damage preserves cutaway visibility before, during and after collapse", () => {
  const parent = new THREE.Group(), floor = new THREE.Group(); parent.add(floor);
  const geometry = new THREE.BoxGeometry(1,1,1), material = new THREE.MeshStandardMaterial();
  const shell = new THREE.Mesh(geometry,material); floor.add(shell);
  const damage = createBuildingDamage([floor],parent,new Set([shell]));
  try {
    for (const time of [0,105,115,144,0]) {
      shell.visible = false; // authored cutaway visibility, refreshed each frame
      damage.update(time);
      expect(shell.visible).toBeFalsy();
    }
    shell.visible = true; // return to POV
    damage.update(0);
    expect(shell.visible).toBeTruthy();
  } finally { damage.dispose(); geometry.dispose(); material.dispose(); }
});

test("damage darkens, collapses, and restores original floor transforms and materials", () => {
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const geometry = new THREE.BoxGeometry(1,1,1);
  const original = material.color.clone();
  const levels = [0,1,2].map(level => {
    const floor = new THREE.Group(); floor.position.y=level*3.6;
    for (const z of [5,-14]) { const mesh = new THREE.Mesh(geometry,material); mesh.position.z=z; floor.add(mesh); }
    parent.add(floor); return floor;
  });
  const damage = createBuildingDamage(levels,parent);
  try {
    expect(damage.update(0)).toBe(0);
    expect(levels[2].position.y).toBe(7.2);
    damage.update(105);
    expect(material.color.r).toBeLessThan(original.r*.2);
    expect(damage.update(115)).toBeGreaterThan(0);
    expect(levels[2].children[0].position.y).toBeLessThan(0);
    expect(levels[2].children[1].position.y).toBe(0);
    expect(bayFall(115,2,0)).toBeGreaterThan(bayFall(115,0,0));
    expect(damage.update(144)).toBe(1);
    expect(levels.every(floor => floor.children.every(piece => !piece.visible))).toBeTruthy();
    expect(parent.getObjectByName("collapsed-building-debris")!.visible).toBeTruthy();
    levels.forEach(floor => { floor.visible = true; });
    damage.update(0);
    expect(levels[2].position.y).toBe(7.2);
    expect(levels[2].scale.y).toBe(1);
    expect(levels[2].children.every(piece => piece.visible && piece.position.y===0)).toBeTruthy();
    expect(material.color.equals(original)).toBeTruthy();
    expect(parent.getObjectByName("collapsed-building-debris")!.visible).toBeFalsy();
  } finally { damage.dispose(); geometry.dispose(); material.dispose(); }
  expect(parent.getObjectByName("collapsed-building-debris")).toBeUndefined();
});
