/**
 * Adaptive render scale for the landing scene.
 *
 * The scene is fill-rate bound (measured: frame cost scales with the number of
 * shaded pixels), so the one knob that reliably recovers frame rate is the
 * pixel ratio. Levels are discrete so render targets are reallocated rarely,
 * and the controller has hysteresis: it steps down quickly when frames are
 * slow, steps up only after a long calm period, and never climbs back above a
 * level that already failed once.
 */
export type QualityOptions = {
  mobile: boolean;
  devicePixelRatio: number;
  /** Smoothed frame interval (ms) above which the scene is considered slow. */
  slowMs?: number;
  /** Smoothed frame interval (ms) below which the scene has headroom. */
  fastMs?: number;
};

export type QualityController = {
  readonly ratio: number;
  readonly levels: readonly number[];
  /** Feed the interval between two rendered frames; returns a ratio when it changed. */
  update(intervalMs: number): number | null;
  /** Ignore the next frames, e.g. while shaders compile. */
  hold(frames?: number): void;
};

const stepDownAfterMs = 900;
const stepUpAfterMs = 6000;
const minBetweenChangesMs = 2500;
const failedLevelMemoryMs = 20000;

export function qualityLevels(devicePixelRatio: number, mobile: boolean) {
  const cap = Math.max(.5, Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  const floor = Math.min(cap, mobile ? .7 : .75);
  const levels = [Number(cap.toFixed(3))];
  // Geometric steps: each level shades roughly a third fewer pixels than the last.
  while (levels[levels.length - 1] * .82 > floor + .001) levels.push(Number((levels[levels.length - 1] * .82).toFixed(3)));
  if (levels[levels.length - 1] > floor + .001) levels.push(Number(floor.toFixed(3)));
  return levels;
}

export function createQualityController({ mobile, devicePixelRatio, slowMs = 24, fastMs = 18.5 }: QualityOptions): QualityController {
  const levels = qualityLevels(devicePixelRatio, mobile);
  let index = 0;
  let best = 0; // lowest index allowed; raised when a step up turns out too heavy
  let slowFor = 0, fastFor = 0, sinceChange = 0, lastUpAt = -Infinity, clock = 0, held = 8;
  let smoothed = 16.7;
  function settle() {
    sinceChange = 0; slowFor = 0; fastFor = 0; held = 10; smoothed = 16.7;
    return levels[index];
  }
  return {
    get ratio() { return levels[index]; },
    levels,
    hold(frames = 8) { held = Math.max(held, frames); slowFor = 0; fastFor = 0; },
    update(intervalMs) {
      // Tab switches and long stalls are not evidence about GPU load.
      if (!(intervalMs > 0) || intervalMs > 250) { slowFor = 0; fastFor = 0; return null; }
      clock += intervalMs; sinceChange += intervalMs;
      if (held > 0) { held--; return null; }
      smoothed += (intervalMs - smoothed) * .12;
      if (smoothed > slowMs) { slowFor += intervalMs; fastFor = 0; }
      else if (smoothed < fastMs) { fastFor += intervalMs; slowFor = Math.max(0, slowFor - intervalMs); }
      else { slowFor = Math.max(0, slowFor - intervalMs); fastFor = Math.max(0, fastFor - intervalMs * .5); }
      if (sinceChange < minBetweenChangesMs) return null;
      if (slowFor >= stepDownAfterMs && index < levels.length - 1) {
        // Failing soon after a step up means the level above is too heavy: forbid it.
        if (clock - lastUpAt < failedLevelMemoryMs) best = Math.max(best, index + 1);
        index++; return settle();
      }
      if (fastFor >= stepUpAfterMs && index > best) {
        index--; lastUpAt = clock; return settle();
      }
      return null;
    },
  };
}
