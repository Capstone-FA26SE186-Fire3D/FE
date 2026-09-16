// Authored gusts, not weather/fire physics. Time-derived so pauses and replay
// retain the same state without timers or frame-dependent random numbers.
const hash = (n: number) => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const pulse = (age: number, duration: number) => smooth(age / .22) * (1 - smooth((age - .45) / (duration - .45)));

export function sampleFireWeather(time: number, seed = 0) {
  const cycle = Math.floor(Math.max(0, time) / 22);
  const age = time - cycle * 22 - 7 - hash(cycle + 1) * 7;
  const gust = pulse(age, 3.5 + hash(cycle + 9) * 2);
  const angle = hash(cycle + 31) * Math.PI * 2;
  const localCycle = Math.floor(Math.max(0, time) / 13);
  const localAge = time - localCycle * 13 - 2 - hash(seed * 3 + localCycle * 17) * 8;
  const flare = hash(seed + localCycle * 7) > .58 ? pulse(localAge, 2.6) : 0;
  return { gust, windX: Math.cos(angle) * gust, windZ: Math.sin(angle) * gust, flare };
}
