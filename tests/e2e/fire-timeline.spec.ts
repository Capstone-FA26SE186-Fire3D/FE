import { expect, test } from "@playwright/test";
import { roomFireTimeline } from "../../src/features/landing/scene/fire-timeline";

test("room sources ignite before wall, exterior and roof spread, with varied rooms", () => {
  const onsets = new Set<number>(), strengths = new Set<number>();
  for (let level = 0; level < 3; level++) for (const side of [-1, 1]) for (let room = 0; room < 3; room++) {
    const timeline = roomFireTimeline(level, side, room);
    expect(timeline.wall).toBeGreaterThan(timeline.ignition);
    expect(timeline.facade).toBeGreaterThan(timeline.wall);
    expect(timeline.roof).toBeGreaterThan(timeline.facade);
    onsets.add(timeline.ignition); strengths.add(timeline.strength);
  }
  expect(onsets.size).toBeGreaterThan(5);
  expect(strengths.size).toBeGreaterThan(10);
});
