/** Opt-in slowdown for a poll whose answer stopped changing (a job that is simply waiting). */
export type IdleBackoff = {
  /** Consecutive unchanged results before the interval starts growing. */
  after: number;
  /** Multiplier applied once per further unchanged result (> 1). */
  factor: number;
  /** Upper bound of the grown interval. */
  maxMs: number;
};

/**
 * Delay before the next poll after `unchanged` consecutive results equal to the previous one: `baseMs` until `after`
 * is reached, then `baseMs * factor^n` capped at `maxMs` (never below `baseMs`). Without a backoff it is always `baseMs`.
 */
export function idlePollDelay(baseMs: number, unchanged: number, backoff?: IdleBackoff) {
  if (!backoff || !(backoff.factor > 1) || unchanged < backoff.after) return baseMs;
  const steps = unchanged - Math.max(backoff.after, 0) + 1;
  return Math.max(baseMs, Math.min(Math.round(baseMs * backoff.factor ** steps), backoff.maxMs));
}

/** Cheap identity of a polled value: the caller's `signature`, else its JSON. `undefined` = cannot compare (counts as changed). */
export function pollSignature<T>(value: T, signature?: (value: T) => string): string | undefined {
  try {
    return signature ? signature(value) : JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/** Consecutive-unchanged counter after a new result: 0 when it differs from the previous one (or cannot be compared). */
export function nextUnchangedCount(previous: string | undefined, current: string | undefined, unchanged: number) {
  return previous !== undefined && current !== undefined && previous === current ? unchanged + 1 : 0;
}
