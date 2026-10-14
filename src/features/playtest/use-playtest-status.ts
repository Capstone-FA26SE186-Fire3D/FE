"use client";

import { useCallback, useState } from "react";

import { ApiError } from "@/api/types/common";
import { usePolling } from "@/api/use-polling";

import { playtestApi } from "./api";
import { acceptStatus, isPlaytestTerminal } from "./status";
import type { PlaytestStatus } from "./types";

/** What one poll produced: a status, or a definitive refusal (401/403/404) that polling cannot fix. */
type Polled = { kind: "ok"; status: PlaytestStatus } | { kind: "fatal"; error: ApiError };

export type PlaytestWatch = {
  /** Newest status known; never moves backwards (see `acceptStatus`). */
  status: PlaytestStatus | undefined;
  /** Last read error. Transient errors keep `status` (stale) and polling backs off; fatal ones stop polling. */
  error: unknown;
  fatal: boolean;
  /** True until the first status or error arrives. */
  loading: boolean;
  /** True while the poller is scheduled (visible tab, not terminal, not fatal). */
  watching: boolean;
  /** Re-read now (also restarts polling after a fatal error or a final state). */
  refresh: () => void;
  /** Feed a status returned by a command (cancel) so the view updates before the next poll, with the same ordering guard. */
  apply: (status: PlaytestStatus) => void;
};

/**
 * Watches one playtest by id. The state always comes from `GET /api/playtests/{id}`, so a reload or another tab sees the
 * same thing. Built on `usePolling`: 3s cadence (background tabs paused), exponential backoff, Retry-After honoured and
 * polling stops on Completed/Cancelled. Mount it keyed by playtest id so a late response of another playtest cannot land.
 */
export function usePlaytestStatus({ accessToken, playtestId, intervalMs = 3000 }: { accessToken: string; playtestId: string; intervalMs?: number }): PlaytestWatch {
  const [latest, setLatest] = useState<PlaytestStatus | undefined>();
  const [seen, setSeen] = useState<Polled | undefined>();

  const terminal = isPlaytestTerminal(latest?.status);
  const polling = usePolling<Polled>({
    enabled: !terminal,
    intervalMs,
    resetKey: playtestId,
    fetcher: async (signal) => {
      try {
        return { kind: "ok", status: await playtestApi.get(accessToken, playtestId, signal) };
      } catch (cause) {
        if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) return { kind: "fatal", error: cause };
        throw cause;
      }
    },
    isDone: (value) => value.kind === "fatal" || isPlaytestTerminal(value.status.status),
  });

  // Derive state from the newest poll during render (no effect): only a poll we have not seen yet is merged.
  if (polling.data !== seen) {
    setSeen(polling.data);
    if (polling.data?.kind === "ok") setLatest((current) => acceptStatus(current, (polling.data as { status: PlaytestStatus }).status));
  }

  const apply = useCallback((status: PlaytestStatus) => setLatest((current) => acceptStatus(current, status)), []);
  const { refresh: restart } = polling;
  const refresh = useCallback(() => {
    setSeen(undefined);
    restart();
  }, [restart]);

  const fatalError = seen?.kind === "fatal" ? seen.error : undefined;
  const error = fatalError ?? polling.error;
  return {
    status: latest,
    error,
    fatal: Boolean(fatalError),
    loading: !latest && error === undefined,
    watching: !terminal && !fatalError && polling.polling,
    refresh,
    apply,
  };
}
