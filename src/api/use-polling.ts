"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { idlePollDelay, nextUnchangedCount, pollSignature, type IdleBackoff } from "./poll-backoff";
import { ApiError } from "./types/common";

export type PollingOptions<T> = {
  /** Fetch the current state. Receives an AbortSignal that is aborted on unmount/stop. */
  fetcher: (signal: AbortSignal) => Promise<T>;
  /** True when the resource reached a final state; polling then stops. */
  isDone: (value: T) => boolean;
  enabled?: boolean;
  intervalMs?: number;
  maxBackoffMs?: number;
  /** Change to restart polling for a different resource (e.g. another revision). */
  resetKey?: string;
  /**
   * Opt-in: after `after` consecutive polls whose result did not change, the interval grows by `factor` per poll up to
   * `maxMs`; any change (or `refresh()`, or a new `resetKey`) brings it back to `intervalMs`. Omitted = fixed interval.
   */
  idleBackoff?: IdleBackoff;
  /** Cheap identity used by `idleBackoff` to tell "unchanged" (default: `JSON.stringify`). */
  signature?: (value: T) => string;
};

/** Delay before the next attempt: base interval, doubled per consecutive failure, or server Retry-After. */
export function nextPollDelay(baseMs: number, failures: number, maxBackoffMs: number, retryAfterSeconds?: number) {
  if (retryAfterSeconds !== undefined) return Math.min(Math.max(retryAfterSeconds * 1000, baseMs), 10 * 60_000);
  if (failures === 0) return baseMs;
  return Math.min(baseMs * 2 ** failures, maxBackoffMs);
}

/**
 * Polls while the page is visible and the component is mounted. Starts at `intervalMs` (3s), backs off on
 * errors, honors Retry-After, optionally slows down while the result stays unchanged (`idleBackoff`), pauses in background tabs, stops on a final state and halts on 401/403 (`halted`; `refresh()` resumes).
 */
export function usePolling<T>({ fetcher, isDone, enabled = true, intervalMs = 3000, maxBackoffMs = 30_000, resetKey = "", idleBackoff, signature }: PollingOptions<T>) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>();
  const [finishedFor, setFinishedFor] = useState<string | null>(null);
  const finished = finishedFor === resetKey;
  // 401/403 will not heal by waiting (the session or the permission is gone): polling halts until the user retries.
  const [haltedFor, setHaltedFor] = useState<string | null>(null);
  const halted = haltedFor === resetKey;
  const [reloadToken, setReloadToken] = useState(0);
  const fetcherRef = useRef(fetcher);
  const isDoneRef = useRef(isDone);
  const idleRef = useRef({ idleBackoff, signature });

  useEffect(() => {
    fetcherRef.current = fetcher;
    isDoneRef.current = isDone;
    idleRef.current = { idleBackoff, signature };
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let failures = 0;
    let stopped = false;
    // Idle backoff (opt-in): how many results in a row were equal to the one before.
    let unchanged = 0;
    let lastSignature: string | undefined;

    const schedule = (delay: number) => {
      if (stopped) return;
      timer = window.setTimeout(tick, delay);
    };

    async function tick() {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        schedule(intervalMs); // Re-check later; visibilitychange also triggers an immediate refresh.
        return;
      }
      try {
        const value = await fetcherRef.current(controller.signal);
        if (stopped) return;
        failures = 0;
        setData(value);
        setError(undefined);
        if (isDoneRef.current(value)) {
          setFinishedFor(resetKey);
          return;
        }
        const idle = idleRef.current;
        if (!idle.idleBackoff) { schedule(intervalMs); return; }
        const current = pollSignature(value, idle.signature);
        unchanged = nextUnchangedCount(lastSignature, current, unchanged);
        lastSignature = current;
        schedule(idlePollDelay(intervalMs, unchanged, idle.idleBackoff));
      } catch (cause) {
        if (stopped || controller.signal.aborted) return;
        failures += 1;
        setError(cause);
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) { setHaltedFor(resetKey); return; }
        schedule(nextPollDelay(intervalMs, failures, maxBackoffMs, cause instanceof ApiError ? cause.retryAfterSeconds : undefined));
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible" && !stopped) {
        window.clearTimeout(timer);
        void tick();
      }
    };

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, maxBackoffMs, reloadToken, resetKey]);

  const refresh = useCallback(() => {
    setFinishedFor(null);
    setHaltedFor(null);
    setReloadToken((token) => token + 1);
  }, []);

  return { data, error, finished, halted, polling: enabled && !finished && !halted, refresh };
}
