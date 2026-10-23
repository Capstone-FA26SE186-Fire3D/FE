"use client";

import { useSyncExternalStore } from "react";

/** localStorage key of the last buildings opened in this browser (newest first, max 5). */
export const RECENT_BUILDINGS_KEY = "fire3d-recent-buildings";
const MAX_RECENT = 5;

export type RecentBuilding = { id: string; name: string; floors?: number };

const listeners = new Set<() => void>();
const EMPTY: RecentBuilding[] = [];
// useSyncExternalStore needs a stable snapshot for an unchanged value: cache the parsed list by its raw string.
let cachedRaw: string | null = null;
let cachedList: RecentBuilding[] = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(RECENT_BUILDINGS_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): RecentBuilding[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    return value
      .filter((item): item is RecentBuilding => typeof item === "object" && item !== null && typeof (item as RecentBuilding).id === "string" && typeof (item as RecentBuilding).name === "string")
      .slice(0, MAX_RECENT)
      .map((item) => ({ id: item.id, name: item.name, floors: typeof item.floors === "number" ? item.floors : undefined }));
  } catch {
    return EMPTY;
  }
}

/** Newest first. Returns the same array instance while storage is unchanged. */
export function readRecentBuildings(): RecentBuilding[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parse(raw);
  }
  return cachedList;
}

/** Called by the building detail page: moves (or adds) the building to the top of the recent list. */
export function rememberRecentBuilding({ id, name, floors }: RecentBuilding) {
  if (!id || !name) return;
  const entry: RecentBuilding = floors === undefined ? { id, name } : { id, name, floors };
  const next = [entry, ...readRecentBuildings().filter((item) => item.id !== id)].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_BUILDINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the palette simply shows no recent buildings.
  }
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

/** Live view of the recent list for the command palette (updates when another tab or the detail page writes it). */
export function useRecentBuildings(): RecentBuilding[] {
  return useSyncExternalStore(subscribe, readRecentBuildings, () => EMPTY);
}
