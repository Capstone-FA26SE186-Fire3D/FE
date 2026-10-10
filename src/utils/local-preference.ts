"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// Keeps a choice for the current page session even when localStorage is blocked.
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  const remembered = memory.get(key);
  if (remembered !== undefined) return remembered;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Per-browser preference (theme, collapsed sidebar…). Server and first client render use
 * `fallback`; the stored value is applied after hydration. Storage failures are ignored.
 */
export function useLocalPreference<T extends string>(key: string, fallback: T, accepts: (value: string) => value is T) {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const raw = readRaw(key);
      return raw !== null && accepts(raw) ? raw : fallback;
    },
    () => fallback,
  );

  const set = useCallback((next: T) => {
    try {
      window.localStorage.setItem(key, next);
      memory.delete(key);
    } catch {
      memory.set(key, next); // Storage blocked: the choice lasts until reload.
    }
    notify();
  }, [key]);

  return [value, set] as const;
}
