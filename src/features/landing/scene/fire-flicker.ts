const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const smooth = (t: number) => t * t * (3 - 2 * t);
const valueNoise = (x: number) => { const i = Math.floor(x); return hash(i) + (hash(i + 1) - hash(i)) * smooth(x - i); };

/**
 * Shared brightness driver for flames, embers and the few fire lights.
 * Deterministic in time, so lights and sprites flicker together and replay
 * identically after a pause. Different seeds are out of phase. Range ~[.62, 1.2].
 */
export function fireFlicker(time: number, seed = 0) {
  const slow = valueNoise(time * 2.1 + seed * 5.17);
  const fast = valueNoise(time * 8.7 + seed * 11.3 + 40);
  const shimmer = Math.sin(time * 6.1 + seed * 1.7) * .5 + Math.sin(time * 10.3 + seed * 2.9) * .5;
  return .9 + (slow - .5) * .4 + (fast - .5) * .24 + shimmer * .04;
}
