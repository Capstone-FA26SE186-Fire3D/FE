import type { TokenResponse } from "./types";

export type StoredTokens = Pick<TokenResponse, "accessToken" | "refreshToken">;

/** Legacy key: sessions created before the cookie store lived in sessionStorage; tests still seed it. */
const legacyKey = "fire3d-auth-tokens";
const cookieName = "fire3d_session";
/** The refresh session family lasts 7 days (BE `Jwt` default); the API rejects an older token regardless. */
const COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;
/** Browsers drop a cookie above ~4 KB without an error, so a larger payload falls back to localStorage. */
const COOKIE_MAX_BYTES = 3800;
const channelName = "fire3d-auth";

export type SessionBroadcast =
  | { type: "session"; tokens: StoredTokens }
  | { type: "logout" };

function parseTokens(raw: string | null): StoredTokens | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const tokens = value as Record<string, unknown>;
    return typeof tokens.accessToken === "string" && typeof tokens.refreshToken === "string"
      ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
      : null;
  } catch {
    return null;
  }
}

function readCookie(): string | null {
  try {
    for (const part of document.cookie.split("; ")) {
      if (part.startsWith(`${cookieName}=`)) return decodeURIComponent(part.slice(cookieName.length + 1));
    }
  } catch {
    // Cookies disabled or malformed value.
  }
  return null;
}

function writeCookie(value: string | null): boolean {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const body = value === null ? "; Max-Age=0" : `=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_S}`;
    // SameSite=Lax keeps the session on links opened from e-mail/payment redirects while blocking cross-site sub-requests.
    document.cookie = `${cookieName}${value === null ? "=" : ""}${body}; Path=/; SameSite=Lax${secure}`;
    return value === null ? readCookie() === null : readCookie() === value;
  } catch {
    return false;
  }
}

function storage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try { return window[kind]; } catch { return null; }
}

/** Reads the shared session (cookie → localStorage fallback → legacy sessionStorage), or null when signed out. */
export function readTokens(): StoredTokens | null {
  return parseTokens(readCookie())
    ?? parseTokens(storage("localStorage")?.getItem(legacyKey) ?? null)
    ?? parseTokens(storage("sessionStorage")?.getItem(legacyKey) ?? null);
}

/** Persists the session in a first-party cookie shared by every tab; null signs out everywhere on this browser. */
export function persistTokens(tokens: StoredTokens | null) {
  const local = storage("localStorage");
  // Legacy copies must never outlive a logout nor shadow a newer cookie.
  try { storage("sessionStorage")?.removeItem(legacyKey); } catch { /* unavailable */ }
  if (!tokens) {
    writeCookie(null);
    try { local?.removeItem(legacyKey); } catch { /* unavailable */ }
    return;
  }
  const raw = JSON.stringify(tokens);
  const fits = new TextEncoder().encode(encodeURIComponent(raw)).length <= COOKIE_MAX_BYTES;
  if (fits && writeCookie(raw)) {
    try { local?.removeItem(legacyKey); } catch { /* unavailable */ }
    return;
  }
  try { local?.setItem(legacyKey, raw); } catch { /* the session continues in memory */ }
}

/** Tab-to-tab notifications: a rotated or revoked refresh token must reach every tab before it replays the old one. */
export function openSessionChannel(onMessage: (message: SessionBroadcast) => void): { post: (message: SessionBroadcast) => void; close: () => void } {
  if (typeof BroadcastChannel === "undefined") return { post: () => undefined, close: () => undefined };
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = (event: MessageEvent<SessionBroadcast>) => onMessage(event.data);
  return { post: (message) => channel.postMessage(message), close: () => channel.close() };
}

/** Serialises refresh-token rotation across tabs (a replayed consumed token revokes the whole session family). */
export async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request("fire3d-auth-refresh", task) : task();
}
