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
 * What a Building QR encodes: the landing URL of this site. BE only returns the opaque token and publishes no URL,
 * so the origin is `NEXT_PUBLIC_QR_LANDING_ORIGIN` when configured, otherwise the origin the manager is using.
 */
export function qrLandingUrl(origin: string, token: string) {
  return `${origin.replace(/\/+$/, "")}${qrLandingPath(token)}`;
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
