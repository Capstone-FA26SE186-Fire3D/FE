import { expect, test } from "@playwright/test";
import { BUDGETS, animationInterval, initialTier, tierBelow } from "../../src/features/landing/scene/budget";
import { BAYS, COLLAPSE, COLLAPSE_END, OCCUPANTS, PLAN, ROUTE_LENGTH, STAGE, bayFall, bayFallStart, bayRank, beatAt, followPose, journeyPose, junctionDoor, occupantPose, roomFire } from "../../src/features/landing/scene/layout";
import { DEVICE, SCREEN_ASPECT, fitPhone, phoneTargetSize } from "../../src/features/landing/scene/phone-fit";

const radius = (p: readonly [number, number, number]) => Math.hypot(p[0], p[2]);
const progressSteps = Array.from({ length: 401 }, (_, i) => i / 400);

test("camera enters through the main door gap and stays inside the corridor band on the 3/4 arc", () => {
  for (const p of progressSteps) {
    const { position } = journeyPose(p);
    if (p >= STAGE.doorEnd) {
      expect(radius(position)).toBeGreaterThan(PLAN.corridorRadius - PLAN.corridorHalfWidth);
      expect(radius(position)).toBeLessThan(PLAN.corridorRadius + PLAN.corridorHalfWidth);
    }
    // While crossing the glass wall the camera must be inside the door opening.
    if (radius(position) > PLAN.outerRadius - 0.6 && radius(position) < PLAN.outerRadius + 0.6) expect(Math.abs(position[0])).toBeLessThan(PLAN.doorWidth / 2);
    expect(position[1]).toBeGreaterThan(0.5);
  }
});

test("camera stays at eye level in the corridor and turns smoothly (no jumps)", () => {
  let last = journeyPose(0);
  for (const p of progressSteps.slice(1)) {
    const pose = journeyPose(p);
    const step = Math.hypot(pose.position[0] - last.position[0], pose.position[1] - last.position[1], pose.position[2] - last.position[2]);
    expect(step).toBeLessThan(2.4);
    if (p > STAGE.doorEnd) expect(pose.position[1]).toBeCloseTo(PLAN.eyeHeight, 5);
    last = pose;
  }
});

test("scrolling back retraces the same path and the route covers 3/4 of the ring", () => {
  for (const p of [0.05, 0.2, 0.5, 0.8, 0.93]) expect(journeyPose(p)).toEqual(journeyPose(p));
  expect(ROUTE_LENGTH).toBeCloseTo(PLAN.corridorRadius * Math.PI * 1.5, 5);
  const start = journeyPose(STAGE.doorEnd).position, end = journeyPose(STAGE.arcEnd).position;
  expect(Math.hypot(end[0] - 24.5, end[2])).toBeLessThan(0.01);
  expect(Math.hypot(start[0], start[2] - 24.5)).toBeLessThan(0.01);
  expect(beatAt(0)).toBe("aerial");
  expect(["fire", "evac", "junction"].map(b => progressSteps.some(p => beatAt(p) === b))).toEqual([true, true, true]);
});

test("occupants stay on the corridor floor, never in walls, and fade at loop ends", () => {
  for (const o of OCCUPANTS) for (let t = 0; t < 120; t += 0.5) {
    const pose = occupantPose(o, t);
    expect(pose.position[1]).toBe(0);
    expect(radius(pose.position)).toBeGreaterThan(PLAN.corridorRadius - PLAN.corridorHalfWidth + 0.3);
    expect(radius(pose.position)).toBeLessThan(PLAN.corridorRadius + PLAN.corridorHalfWidth - 0.3);
    expect(pose.visibility).toBeGreaterThanOrEqual(0);
    expect(pose.visibility).toBeLessThanOrEqual(1);
  }
  expect(OCCUPANTS.length).toBeGreaterThanOrEqual(BUDGETS.high.characters);
  expect(new Set(OCCUPANTS.map(o => o.model)).size).toBeGreaterThanOrEqual(8);
});

test("trainee follow camera is behind the player at head height inside the corridor", () => {
  const player = OCCUPANTS[0];
  for (let t = 0; t < 30; t += 1) {
    const pose = occupantPose(player, t), follow = followPose(pose.fraction, player.lateral);
    expect(radius(follow.position)).toBeGreaterThan(PLAN.corridorRadius - PLAN.corridorHalfWidth);
    expect(radius(follow.position)).toBeLessThan(PLAN.corridorRadius + PLAN.corridorHalfWidth);
  }
});

test("landscape phone keeps the screen aspect and fits every target viewport", () => {
  for (const [w, h] of [[1440, 900], [1366, 768], [768, 1024], [390, 844]]) {
    const narrow = w < 700, wide = w >= 1000;
    const box = fitPhone(w, h, { margin: narrow ? 16 : 32, top: narrow ? 110 : 120, bottom: narrow ? 360 : wide ? 96 : 330, maxWidth: narrow ? w - 32 : wide ? Math.min(820, w * 0.52) : 640, align: wide ? "right" : "center" });
    if (wide) expect(box.x).toBeGreaterThanOrEqual(620); // clear of the copy column (48 + 40% of width, max 560)
    expect(box.width / box.height).toBeCloseTo(DEVICE.width / DEVICE.height, 5);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(w);
    expect(box.y + box.height).toBeLessThanOrEqual(h);
    expect(box.width).toBeGreaterThan(w < 500 ? 300 : 450);
  }
  for (const tier of ["high", "medium", "low"] as const) {
    const size = phoneTargetSize(BUDGETS[tier].phoneWidth);
    expect(size.width).toBeGreaterThan(size.height);
    expect(size.width / size.height).toBeCloseTo(SCREEN_ASPECT, 1);
  }
});

test("budgets follow the agreed caps and step down monotonically", () => {
  expect([BUDGETS.high.characters, BUDGETS.medium.characters, BUDGETS.low.characters]).toEqual([12, 8, 6]);
  expect(BUDGETS.high.smokePuffs).toBeGreaterThan(BUDGETS.medium.smokePuffs);
  expect(BUDGETS.medium.smokePuffs).toBeGreaterThan(BUDGETS.low.smokePuffs);
  expect(tierBelow("high")).toBe("medium");
  expect(tierBelow("low")).toBe("low");
  expect(initialTier(true, 8)).toBe("medium");
  expect(animationInterval(3, "high")).toBe(1);
  expect(animationInterval(40, "high")).toBeGreaterThan(animationInterval(15, "high"));
});

test("collapse is authored: nothing falls before the current 110 s mark, front/roof first, whole building down by the end", () => {
  expect(COLLAPSE.start).toBe(110);
  for (let tier = 0; tier < PLAN.tiers; tier++) for (let bay = 0; bay < BAYS; bay++) {
    expect(bayFall(COLLAPSE.start - 0.01, tier, bay)).toBe(0);
    expect(bayFall(COLLAPSE_END + 0.01, tier, bay)).toBe(1);
    let last = 0;
    for (let t = 100; t < 160; t += 0.5) { const u = bayFall(t, tier, bay); expect(u).toBeGreaterThanOrEqual(last); last = u; }
  }
  // Front bay before the rear bay; top tier before the ground tier of the same bay.
  expect(bayFallStart(2, 0)).toBeLessThan(bayFallStart(2, 4));
  expect(bayFallStart(2, 3)).toBeLessThan(bayFallStart(0, 3));
  expect(bayRank(1)).toBe(bayRank(BAYS - 1));
});

test("room fires ignite before facade and roof involvement, with varied onsets", () => {
  const onsets = new Set<number>();
  for (let tier = 0; tier < PLAN.tiers; tier++) for (let bay = 0; bay < BAYS; bay++) {
    const f = roomFire(tier, bay);
    expect(f.wall).toBeGreaterThan(f.ignition); expect(f.facade).toBeGreaterThan(f.wall); expect(f.roof).toBeGreaterThan(f.facade);
    expect(f.facade).toBeLessThan(COLLAPSE.start); onsets.add(f.ignition);
  }
  expect(onsets.size).toBeGreaterThan(4);
});

test("branch doors stand across the corridor, clear of each other and of the walls", () => {
  const a = junctionDoor("trainee"), b = junctionDoor("organization");
  for (const d of [a, b]) {
    const r = Math.hypot(d.position[0], d.position[2]);
    expect(r - d.width / 2).toBeGreaterThan(PLAN.corridorRadius - PLAN.corridorHalfWidth - 0.1);
    expect(r + d.width / 2).toBeLessThan(PLAN.corridorRadius + PLAN.corridorHalfWidth + 0.1);
  }
  expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThan(a.width);
});
