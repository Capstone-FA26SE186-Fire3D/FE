/*
 * URLs that come back from the API are still data, never trusted markup: the renderer only links or loads what passes
 * these checks. The backend stores video links in canonical form, so the allowlist here is exactly those hosts.
 */

export type VideoProvider = "YouTube" | "Facebook" | "TikTok";
export const VIDEO_PROVIDERS: readonly VideoProvider[] = ["YouTube", "Facebook", "TikTok"];

const CANONICAL_HOSTS: Record<VideoProvider, string> = { YouTube: "www.youtube.com", Facebook: "www.facebook.com", TikTok: "www.tiktok.com" };

/** An absolute https URL without credentials or an explicit port, or null. */
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isVideoProvider(value: unknown): value is VideoProvider {
  return typeof value === "string" && (VIDEO_PROVIDERS as readonly string[]).includes(value);
}

/** Canonical video link for a provider, or null when the URL is not on that provider's host. */
export function videoLink(provider: unknown, value: unknown): string | null {
  if (!isVideoProvider(provider)) return null;
  const href = httpsUrl(value);
  if (!href) return null;
  return new URL(href).hostname === CANONICAL_HOSTS[provider] ? href : null;
}
