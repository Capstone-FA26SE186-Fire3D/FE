/**
 * A deploy replaces the page's JavaScript chunks; a tab opened before it can fail to load the next chunk. One full
 * reload fetches the new build. Guarded per tab so a chunk that is really missing does not reload in a loop.
 */
const KEY = "fet3d-chunk-reload-at";
const GUARD_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError"
    || /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);
}

/** True for a chunk-load error when this tab has not just reloaded for one (read only, safe during render). */
export function shouldReloadForChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error) || typeof window === "undefined") return false;
  try {
    return Date.now() - Number(window.sessionStorage.getItem(KEY) ?? 0) >= GUARD_MS;
  } catch {
    return false;
  }
}

/** Reloads once for a chunk-load error; false when it is another error or a reload already happened just now. */
export function reloadForChunkError(error: unknown): boolean {
  if (!shouldReloadForChunkError(error)) return false;
  try {
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
