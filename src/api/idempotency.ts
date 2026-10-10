"use client";

import { useCallback, useRef } from "react";

/** JSON with sorted object keys so the same logical payload always serializes the same way. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * One logical user action (create building, request process…). `keyFor(payload)` returns the same key
 * while the payload is unchanged — so a retry after a timeout, double click or lost response replays
 * the original operation — and mints a new key once the payload changes. Call `done()` after success
 * so the next identical submit is a new action.
 */
export function useIdempotencyKey() {
  const state = useRef<{ fingerprint: string; key: string } | null>(null);

  const keyFor = useCallback((payload: unknown) => {
    const fingerprint = stableStringify(payload);
    if (!state.current || state.current.fingerprint !== fingerprint) {
      state.current = { fingerprint, key: newIdempotencyKey() };
    }
    return state.current.key;
  }, []);

  const done = useCallback(() => {
    state.current = null;
  }, []);

  return { keyFor, done };
}
