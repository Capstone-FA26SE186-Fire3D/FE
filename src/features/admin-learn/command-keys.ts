import { newIdempotencyKey, stableStringify } from "@/api/idempotency";

/*
 * Durable Idempotency-Keys for Learn commands. One key per INTENT (operation + resource + ETag + payload): while the same
 * intent is retried (double click, lost response, closing and reopening the dialog, even a reload) the same key is sent,
 * so the backend replays the first success instead of failing with 412 or doing it twice. A different payload or a moved
 * ETag is a different intent and gets a fresh key. A key is dropped only when the command has succeeded.
 *
 * Held in module memory and mirrored to sessionStorage as an opaque token map {intent hash -> key}. It stores no content,
 * no ETag and no business state; losing it only means the next retry uses a new key.
 */

const STORAGE_KEY = "fet3d:learn-command-keys:v1";
const MAX_ENTRIES = 60;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Entry = { key: string; at: number };
let memory: Map<string, Entry> | null = null;

function storage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

function load(): Map<string, Entry> {
  if (memory) return memory;
  memory = new Map();
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const now = Date.now();
      for (const [intent, value] of Object.entries(parsed as Record<string, unknown>)) {
        const entry = value as Partial<Entry> | null;
        if (entry && typeof entry.key === "string" && typeof entry.at === "number" && now - entry.at < MAX_AGE_MS) memory.set(intent, { key: entry.key, at: entry.at });
      }
    }
  } catch { /* unreadable storage: start empty */ }
  return memory;
}

function persist(map: Map<string, Entry>) {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map))); } catch { /* storage blocked: memory only */ }
}

/** 53-bit string hash (cyrb53): a short, stable id for a possibly large intent. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const intentId = (intent: unknown) => hash(stableStringify(intent));

/** The key for this intent: the same one on every retry until `commandDone`. */
export function commandKey(intent: unknown): string {
  const map = load();
  const id = intentId(intent);
  const existing = map.get(id);
  if (existing) return existing.key;
  const key = newIdempotencyKey();
  map.set(id, { key, at: Date.now() });
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  persist(map);
  return key;
}

/** Call after the command succeeded so the next identical intent is a new action. */
export function commandDone(intent: unknown) {
  const map = load();
  if (map.delete(intentId(intent))) persist(map);
}

/** Test hook. */
export function resetCommandKeys() {
  memory = new Map();
  try { storage()?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
