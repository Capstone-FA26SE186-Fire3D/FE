"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/types/common";
import { useIdempotencyKey } from "@/api/idempotency";
import { billingApi } from "@/features/billing/api";
import type { AiQuotaUnitBalance } from "@/features/billing/types";

import { orgAiApi } from "./api";
import { isUnknownOutcome } from "./labels";
import type { AiOperation, AiRequest } from "./types";

/**
 * One AI command (ask / scenario draft) from click to a known request.
 *
 *  - Before any call the pooled quota is read (`GET /api/organizations/me/ai-quota`); with no unit left, NOTHING is sent.
 *    The FE only compares `available` with zero; the amount a request reserves is a BE policy it never computes.
 *  - The POST carries one Idempotency-Key per payload (`useIdempotencyKey`). A lost response, timeout or 5xx never mints a
 *    new request: the key is kept, and "retry" replays the same intent (the BE returns the original request).
 *  - When the outcome is unknown the user can look at "my recent requests" first; a request found there is tracked by id.
 *  - A late answer of an older attempt is dropped (`run` token), so it cannot overwrite what the user sees now.
 */

export type SubmitPhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "submitting"; replay: boolean }
  | { kind: "blocked"; units: AiQuotaUnitBalance[] }
  | { kind: "failed"; error: unknown; stage: "quota" | "submit" }
  | { kind: "unknown"; error: unknown; candidates: AiRequest[] | null; looking: boolean; lookError: unknown }
  | { kind: "tracking"; requestId: string; replayed: boolean };

type Pending = { payload: unknown; send: (key: string, signal: AbortSignal) => Promise<AiRequest>; startedAt: number };

export const SUBMIT_TIMEOUT_MS = 30_000;

export const quotaExhausted = (units: AiQuotaUnitBalance[]) => units.length === 0 || units.every((unit) => unit.available <= 0);

/** Some gateways put the id of a stored request in the error body; the BE contract does not promise it, so it is only a hint. */
function requestIdOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const id = error.payload?.requestId;
  return typeof id === "string" && id ? id : null;
}

export function useAiSubmit(accessToken: string, operation: AiOperation, onTracked: (requestId: string) => void) {
  const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });
  const { keyFor, done } = useIdempotencyKey();
  const run = useRef(0);
  const busy = useRef(false);
  const pending = useRef<Pending | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => { run.current += 1; controller.current?.abort(); }, []);

  const send = useCallback(async (item: Pending, replay: boolean, token: number) => {
    const abort = new AbortController();
    controller.current = abort;
    // The BE answers 202 quickly; a call that hangs is treated like a lost response (outcome unknown), never as a failure.
    const timer = window.setTimeout(() => abort.abort(), SUBMIT_TIMEOUT_MS);
    setPhase({ kind: "submitting", replay });
    try {
      const created = await item.send(keyFor(item.payload), abort.signal);
      if (run.current !== token) return;
      done();
      pending.current = null;
      setPhase({ kind: "tracking", requestId: created.requestId, replayed: replay });
      onTracked(created.requestId);
    } catch (error) {
      if (run.current !== token) return;
      if (isUnknownOutcome(error)) {
        const hinted = requestIdOf(error);
        if (hinted) {
          setPhase({ kind: "tracking", requestId: hinted, replayed: replay });
          onTracked(hinted);
          return;
        }
        setPhase({ kind: "unknown", error, candidates: null, looking: false, lookError: undefined });
      } else {
        setPhase({ kind: "failed", error, stage: "submit" });
      }
    } finally {
      window.clearTimeout(timer);
    }
  }, [done, keyFor, onTracked]);

  /** Starts a new intent: quota gate, then POST. Identical payloads reuse the key until a send succeeds. */
  const submit = useCallback(async (payload: unknown, call: Pending["send"]) => {
    if (busy.current) return;
    busy.current = true;
    const token = ++run.current;
    const item: Pending = { payload, send: call, startedAt: Date.now() };
    pending.current = item;
    try {
      setPhase({ kind: "checking" });
      let units: AiQuotaUnitBalance[];
      try {
        units = (await billingApi.getAiQuota(accessToken)).units;
      } catch (error) {
        if (run.current === token) setPhase({ kind: "failed", error, stage: "quota" });
        return;
      }
      if (run.current !== token) return;
      if (quotaExhausted(units)) {
        setPhase({ kind: "blocked", units });
        return;
      }
      await send(item, false, token);
    } finally {
      busy.current = false;
    }
  }, [accessToken, send]);

  /** Same key, same payload: a replay of the original intent. Skips the quota gate because the first try may already hold the reservation. */
  const retry = useCallback(async () => {
    const item = pending.current;
    if (!item || busy.current) return;
    busy.current = true;
    const token = ++run.current;
    try {
      await send(item, true, token);
    } finally {
      busy.current = false;
    }
  }, [send]);

  /** Looks at the caller's newest requests of this operation created since the attempt started. Never creates anything. */
  const lookRecent = useCallback(async () => {
    const item = pending.current;
    if (!item) return;
    setPhase((current) => (current.kind === "unknown" ? { ...current, looking: true, lookError: undefined } : current));
    try {
      const page = await orgAiApi.listRequests(accessToken, { operation, mine: true, page: 1, pageSize: 5 });
      // A minute of clock skew between browser and server; candidates are suggestions, the user decides.
      const since = item.startedAt - 60_000;
      const candidates = page.items.filter((entry) => new Date(entry.createdAt).getTime() >= since);
      setPhase((current) => (current.kind === "unknown" ? { ...current, candidates, looking: false } : current));
    } catch (error) {
      setPhase((current) => (current.kind === "unknown" ? { ...current, looking: false, lookError: error } : current));
    }
  }, [accessToken, operation]);

  const track = useCallback((requestId: string) => {
    run.current += 1;
    controller.current?.abort();
    pending.current = null;
    done();
    setPhase({ kind: "tracking", requestId, replayed: false });
    onTracked(requestId);
  }, [done, onTracked]);

  const reset = useCallback(() => {
    run.current += 1;
    controller.current?.abort();
    busy.current = false;
    setPhase({ kind: "idle" });
  }, []);

  const working = phase.kind === "checking" || phase.kind === "submitting";
  return { phase, submit, retry, lookRecent, track, reset, working };
}
