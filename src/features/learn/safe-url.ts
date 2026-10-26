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

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const NUMERIC_ID = /^\d{1,25}$/;

/**
 * Player URL for an allowlisted video (BE docs/learn-library.md): built from `provider` + `videoId` (+ the canonical link for
 * Facebook), never from anything the content could inject. Hosts: youtube-nocookie.com, tiktok.com/embed/v2, facebook.com/plugins.
 */
export function embedUrl(provider: VideoProvider, videoId: string, link: string): string | null {
  if (provider === "YouTube") return YOUTUBE_ID.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0` : null;
  if (provider === "TikTok") return NUMERIC_ID.test(videoId) ? `https://www.tiktok.com/embed/v2/${videoId}` : null;
  return NUMERIC_ID.test(videoId) && videoLink(provider, link) ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(link)}&show_text=false&autoplay=true` : null;
}

/** Still frame for a YouTube video (no request to the player until the reader presses play); other providers have none. */
export function videoPoster(provider: VideoProvider, videoId: string): string | null {
  return provider === "YouTube" && YOUTUBE_ID.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}
