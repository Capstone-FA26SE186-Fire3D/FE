"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
};

/** Delay before the next attempt: base interval, doubled per consecutive failure, or server Retry-After. */
export function nextPollDelay(baseMs: number, failures: number, maxBackoffMs: number, retryAfterSeconds?: number) {
  if (retryAfterSeconds !== undefined) return Math.min(Math.max(retryAfterSeconds * 1000, baseMs), 10 * 60_000);
  if (failures === 0) return baseMs;
  return Math.min(baseMs * 2 ** failures, maxBackoffMs);
}

/**
 * Polls while the page is visible and the component is mounted. Starts at `intervalMs` (3s), backs off on
 * errors, honors Retry-After, pauses in background tabs and stops on a final state.
 */
export function usePolling<T>({ fetcher, isDone, enabled = true, intervalMs = 3000, maxBackoffMs = 30_000, resetKey = "" }: PollingOptions<T>) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>();
  const [finishedFor, setFinishedFor] = useState<string | null>(null);
  const finished = finishedFor === resetKey;
  const [reloadToken, setReloadToken] = useState(0);
  const fetcherRef = useRef(fetcher);
  const isDoneRef = useRef(isDone);

  useEffect(() => {
    fetcherRef.current = fetcher;
    isDoneRef.current = isDone;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let failures = 0;
    let stopped = false;

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
        schedule(intervalMs);
      } catch (cause) {
        if (stopped || controller.signal.aborted) return;
        failures += 1;
        setError(cause);
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
    setReloadToken((token) => token + 1);
  }, []);

  return { data, error, finished, polling: enabled && !finished, refresh };
}
