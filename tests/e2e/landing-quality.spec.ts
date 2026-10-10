import { expect, test } from "@playwright/test";
import { createQualityController, qualityLevels } from "../../src/features/landing/scene/quality";
import { fireFlicker } from "../../src/features/landing/scene/fire-flicker";

function run(controller: ReturnType<typeof createQualityController>, ms: number, interval: number) {
  const changes: number[] = [];
  for (let elapsed = 0; elapsed < ms; elapsed += interval) {
    const next = controller.update(interval);
    if (next !== null) changes.push(next);
  }
  return changes;
}

test("render scale is capped by tier and never drops below a legible floor", () => {
  expect(qualityLevels(3, false)[0]).toBe(1.5);
  expect(qualityLevels(3, true)[0]).toBe(1.25);
  expect(qualityLevels(1, false)[0]).toBe(1);
  for (const [dpr, mobile] of [[1, false], [2, false], [3, false], [2, true], [3, true]] as const) {
    const levels = qualityLevels(dpr, mobile);
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(mobile ? .69 : .74);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThan(levels[i - 1]);
  }
});

test("steady 60 Hz frames never change the render scale", () => {
  const controller = createQualityController({ mobile: false, devicePixelRatio: 2 });
  expect(run(controller, 60_000, 16.7)).toEqual([]);
  expect(controller.ratio).toBe(1.5);
});

test("sustained slow frames step down with hysteresis, one level at a time", () => {
  const controller = createQualityController({ mobile: false, devicePixelRatio: 2 });
  const changes = run(controller, 20_000, 45);
  expect(changes.length).toBeGreaterThanOrEqual(2);
  expect(changes[0]).toBeLessThan(1.5);
  for (let i = 1; i < changes.length; i++) expect(changes[i]).toBeLessThan(changes[i - 1]);
  expect(controller.ratio).toBe(Math.min(...qualityLevels(2, false)));
});

test("a single stall or a hidden tab does not lower quality", () => {
  const controller = createQualityController({ mobile: false, devicePixelRatio: 2 });
  run(controller, 5_000, 16.7);
  expect(controller.update(180)).toBeNull();
  expect(controller.update(4_000)).toBeNull();
  expect(run(controller, 10_000, 16.7)).toEqual([]);
});

test("recovery steps up slowly and does not oscillate around a level that failed", () => {
  const controller = createQualityController({ mobile: false, devicePixelRatio: 2 });
  const levels = qualityLevels(2, false);
  run(controller, 4_000, 40);
  expect(controller.ratio).toBeLessThan(levels[0]);
  // Headroom: climbs back, but only after a long calm period.
  expect(run(controller, 3_000, 14)).toEqual([]);
  const up = run(controller, 20_000, 14);
  expect(up.length).toBeGreaterThan(0);
  expect(up[0]).toBeGreaterThan(controller.levels.at(-1)!);
  // The level it climbed to is too heavy: 40 ms frames again, then calm forever.
  const failed = controller.ratio;
  const down = run(controller, 6_000, 40);
  expect(down.length).toBeGreaterThan(0);
  const settled = controller.ratio;
  expect(settled).toBeLessThan(failed);
  const later = run(controller, 120_000, 14);
  expect(later.every(ratio => ratio < failed)).toBeTruthy();
});

test("fire flicker is bounded, deterministic and out of phase between sources", () => {
  let min = Infinity, max = -Infinity, same = 0, samples = 0;
  for (let time = 0; time < 120; time += .016) {
    const a = fireFlicker(time, 0), b = fireFlicker(time, 1.9);
    expect(fireFlicker(time, 0)).toBe(a);
    min = Math.min(min, a, b); max = Math.max(max, a, b);
    if (Math.abs(a - b) < .01) same++;
    samples++;
  }
  expect(min).toBeGreaterThan(.45);
  expect(max).toBeLessThan(1.3);
  expect(max - min).toBeGreaterThan(.3);
  expect(same / samples).toBeLessThan(.2);
});
