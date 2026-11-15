import { env } from "@/configs/env";

/**
 * A Building QR token is 32 random bytes in base64url (43 characters, BE `BuildingQrCodes`). The server is the
 * authority; this only rejects values that cannot be a token before they reach a URL, a request or a redirect.
 */
export const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function isQrToken(value: string | null | undefined): value is string {
  return typeof value === "string" && QR_TOKEN_PATTERN.test(value);
}

/** Landing path for a token: `/qr/<token>`. Never add query parameters or fragments to it. */
export function qrLandingPath(token: string) {
  return `/qr/${token}`;
}

/**
 * Landing URL of this site for a token. Only a fallback: what a Building QR encodes is the BE's `content`
 * (`issuedQrContent`). It is used when the server sent none (its public web address is not configured).
 */
export function qrLandingUrl(origin: string, token: string) {
  return `${origin.replace(/\/+$/, "")}${qrLandingPath(token)}`;
}

/**
 * The BE's `content` of a freshly issued code (`BuildingQrCreated.Content`, `{FrontendUrl}/qr/{token}`) when it is
 * what scanners accept: an http(s) URL whose path is exactly `/qr/<this token>`, with no query, fragment or
 * credentials (the app's `parseQrToken` rejects those). Anything else returns null so the caller does not print it.
 */
export function issuedQrContent(content: string | null | undefined, token: string): string | null {
  if (typeof content !== "string" || !isQrToken(token)) return null;
  const value = content.trim();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.pathname === qrLandingPath(token) ? value : null;
  } catch {
    return null;
  }
}

export function resolveQrLandingOrigin(browserOrigin: string) {
  return env.qrLandingOrigin.trim() || browserOrigin;
}

export function isLocalOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".local");
  } catch {
    return false;
  }
}
