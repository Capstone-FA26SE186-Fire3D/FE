import { expect, test } from "@playwright/test";
import { sampleReaction } from "../../src/features/landing/scene/occupant-reactions";
import { createOccupants } from "../../src/features/landing/scene/occupants";

test("reaction pauses path travel without teleporting and releases smoothly", () => {
  let lastTravel = 0;
  let lastWeight = 0;
  for (let elapsed = 0; elapsed < 16; elapsed += .02) {
    const state = sampleReaction(elapsed, 3, "panic");
    expect(state.travelTime).toBeGreaterThanOrEqual(lastTravel - 1e-8);
    expect(state.travelTime - lastTravel).toBeLessThanOrEqual(.020001);
    expect(Math.abs(state.weight - lastWeight)).toBeLessThan(.05);
    lastTravel = state.travelTime; lastWeight = state.weight;
  }
  expect(sampleReaction(5, 3, "panic").travelTime).toBe(3);
  expect(sampleReaction(12, 3, "panic").travelTime).toBe(6);
  expect(sampleReaction(5, 3, null)).toMatchObject({ travelTime: 5, weight: 0 });
});

for (const mobile of [false, true]) test(`three panic and three smoke reactions, attached flames and reset (${mobile ? "mobile" : "desktop"})`, () => {
  const occupants = createOccupants(mobile);
  const panic = new Set<number>(), cough = new Set<number>();
  try {
    for (let time = 0; time < 30; time += .1) {
      occupants.update(time, false);
      occupants.group.children.forEach((actor, index) => {
        if (!actor.visible) return;
        if (actor.userData.reaction === "panic") panic.add(index);
        if (actor.userData.reaction === "cough") {
          cough.add(index);
          if (actor.userData.reactionWeight > .9) expect(actor.getObjectByName("upper-body")!.rotation.x).toBeGreaterThan(.35);
        }
      });
      [1, 4, 7].forEach((actorIndex, index) => {
        const flame = occupants.effectsGroup.children[index];
        const actor = occupants.group.children[actorIndex];
        if (flame.visible) {
          expect(actor.visible).toBeTruthy();
          expect(actor.userData.reaction).toBe("panic");
          expect(flame.position.x).toBeCloseTo(actor.position.x);
          expect(flame.position.y).toBeCloseTo(actor.position.y + .65);
        }
      });
    }
    expect(panic.size).toBe(3); expect(cough.size).toBe(3);
    occupants.update(0, false);
    expect(occupants.effectsGroup.children.every(flame => !flame.visible)).toBeTruthy();
  } finally { occupants.dispose(); }
  expect(occupants.effectsGroup.children).toHaveLength(0);
});
