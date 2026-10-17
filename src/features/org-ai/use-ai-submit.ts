"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/types/common";
import { useIdempotencyKey } from "@/api/idempotency";

import { orgAiApi } from "./api";
import { isUnknownOutcome } from "./labels";
import type { AiOperation, AiOperationLimit, AiRequest } from "./types";

/**
 * One AI command (ask / scenario draft) from click to a known request.
 *
 *  - Before any call the limits of the operation are read (`GET /api/ai/organization/limits`): no active policy or
 *    `canSubmit: false` (balance below `estimatedReserve`) → NOTHING is sent. The BE computes the reserve, not the FE.
 *  - The POST carries one Idempotency-Key per payload (`useIdempotencyKey`). A lost response, timeout or 5xx never mints a
 *    new request: the key is kept, and "retry" replays the same intent (the BE returns the original request).
 *  - When the outcome is unknown the user can look at "my recent requests" first; a request found there is tracked by id.
 *  - A late answer of an older attempt is dropped (`run` token), so it cannot overwrite what the user sees now.
 */

export type SubmitPhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "submitting"; replay: boolean }
  | { kind: "blocked"; limit: AiOperationLimit | null; message?: { title: string; text: string } }
  | { kind: "failed"; error: unknown; stage: "quota" | "submit" }
  | { kind: "unknown"; error: unknown; candidates: AiRequest[] | null; looking: boolean; lookError: unknown }
  | { kind: "tracking"; requestId: string; replayed: boolean };

type Pending = { payload: unknown; text: string; send: (key: string, signal: AbortSignal) => Promise<AiRequest>; startedAt: number };

export const SUBMIT_TIMEOUT_MS = 30_000;

/** The limit of one operation, or null when the BE lists none for it (treated like "no active policy"). */
export const limitOf = (items: AiOperationLimit[] | undefined, operation: AiOperation) => items?.find((item) => item.operation === operation) ?? null;
export const canSubmitWith = (limit: AiOperationLimit | null): limit is AiOperationLimit => Boolean(limit?.policyActive && limit.canSubmit);

/** The text that was asked, to match the request again from `input.text` after a lost response. */
const textOf = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>).question ?? (payload as Record<string, unknown>).prompt;
  return typeof value === "string" ? value : "";
};

/** Some gateways put the id of a stored request in the error body; the BE contract does not promise it, so it is only a hint. */
function requestIdOf(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const id = error.payload?.requestId;
  return typeof id === "string" && id ? id : null;
}

/**
 * How a caller other than the organization checks before sending and finds its recent requests (the Trainee composer:
 * daily quota instead of organization limits, `/api/ai/trainee/requests` instead of `/api/ai/requests`).
 */
export type SubmitAdapter = {
  /** null: go ahead; otherwise the blocked phase to show (nothing is sent). Throwing shows "could not check". */
  check: (signal?: AbortSignal) => Promise<Extract<SubmitPhase, { kind: "blocked" }> | null>;
  recent: () => Promise<AiRequest[]>;
};

export function useAiSubmit(accessToken: string, operation: AiOperation, onTracked: (requestId: string) => void, adapter?: SubmitAdapter) {
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
    const item: Pending = { payload, text: textOf(payload), send: call, startedAt: Date.now() };
    pending.current = item;
    try {
      setPhase({ kind: "checking" });
      let blocked: Extract<SubmitPhase, { kind: "blocked" }> | null;
      try {
        if (adapter) blocked = await adapter.check();
        else {
          const limit = limitOf((await orgAiApi.limits(accessToken)).items, operation);
          blocked = canSubmitWith(limit) ? null : { kind: "blocked", limit };
        }
      } catch (error) {
        if (run.current === token) setPhase({ kind: "failed", error, stage: "quota" });
        return;
      }
      if (run.current !== token) return;
      if (blocked) {
        setPhase(blocked);
        return;
      }
      await send(item, false, token);
    } finally {
      busy.current = false;
    }
  }, [accessToken, adapter, operation, send]);

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
      const items = adapter ? await adapter.recent() : (await orgAiApi.listRequests(accessToken, { operation, mine: true, page: 1, pageSize: 5 })).items;
      // A minute of clock skew between browser and server; candidates are suggestions, the user decides.
      const since = item.startedAt - 60_000;
      const recent = items.filter((entry) => new Date(entry.createdAt).getTime() >= since);
      // `input.text` names what was asked: when it is there, only requests with the same text are this intent.
      const same = recent.filter((entry) => entry.input?.text?.trim() === item.text.trim());
      const candidates = item.text && recent.some((entry) => entry.input) ? same : recent;
      setPhase((current) => (current.kind === "unknown" ? { ...current, candidates, looking: false } : current));
    } catch (error) {
      setPhase((current) => (current.kind === "unknown" ? { ...current, looking: false, lookError: error } : current));
    }
  }, [accessToken, adapter, operation]);

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
