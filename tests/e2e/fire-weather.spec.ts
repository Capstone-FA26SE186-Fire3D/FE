import { expect, test } from "@playwright/test";
import { sampleFireWeather } from "../../src/features/landing/scene/fire-weather";

test("gusts are bounded, intermittent, continuous and change direction between events", () => {
  let calm = 0, active = 0, previous = sampleFireWeather(0);
  let minimum = 1, maximum = 0, maxJump = 0, maxVectorError = 0;
  const directions = new Set<number>();
  for (let time = 0; time < 180; time += .02) {
    const weather = sampleFireWeather(time);
    minimum = Math.min(minimum, weather.gust);
    maximum = Math.max(maximum, weather.gust);
    maxJump = Math.max(maxJump, Math.abs(weather.gust - previous.gust));
    maxVectorError = Math.max(maxVectorError, Math.abs(Math.hypot(weather.windX,weather.windZ) - weather.gust));
    if (weather.gust === 0) calm++;
    if (weather.gust > .8) {
      active++;
      directions.add(Math.round(Math.atan2(weather.windZ, weather.windX) * 10));
    }
    previous = weather;
  }
  expect(calm).toBeGreaterThan(active * 3);
  expect(minimum).toBeGreaterThanOrEqual(0);
  expect(maximum).toBeLessThanOrEqual(1);
  expect(maxJump).toBeLessThan(.15);
  expect(maxVectorError).toBeLessThan(.00001);
  expect(active).toBeGreaterThan(0);
  expect(directions.size).toBeGreaterThan(3);
});

test("localized bursts vary by source and replay from time without frame-state", () => {
  let different = 0;
  for (let time = 0; time < 100; time += .25) {
    const a = sampleFireWeather(time,3), b = sampleFireWeather(time,11);
    expect(a).toEqual(sampleFireWeather(time,3));
    expect(a.flare).toBeGreaterThanOrEqual(0);
    expect(a.flare).toBeLessThanOrEqual(1);
    expect(a.gust).toBe(b.gust);
    if (Math.abs(a.flare-b.flare) > .3) different++;
  }
  expect(different).toBeGreaterThan(5);
});
