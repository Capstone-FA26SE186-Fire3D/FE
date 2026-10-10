import type { MediaDescriptor, MediaProvider } from "./types";

export type MediaParse = { ok: true; provider: MediaProvider; canonicalUrl: string; externalId: string } | { ok: false; reason: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DIGITS = /^\d{6,25}$/;

/**
 * Normalizes a pasted video URL for PREVIEW ONLY. The backend validates again and is the authority; this
 * exists so the editor can show the provider and refuse links the allowlist would reject. Never builds an
 * embed: the result is a canonical link plus an id.
 */
export function parseMediaUrl(input: string): MediaParse {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Nhập đường dẫn video." };
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: "Đường dẫn không hợp lệ." }; }
  if (url.protocol !== "https:") return { ok: false, reason: "Chỉ nhận đường dẫn https." };
  if (url.username || url.password || url.port) return { ok: false, reason: "Đường dẫn không được chứa thông tin đăng nhập hoặc cổng." };
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? url.searchParams.get("v") ?? "" : parts[0] === "shorts" ? parts[1] ?? "" : "";
    if (!YOUTUBE_ID.test(id)) return { ok: false, reason: "Không nhận ra mã video YouTube. Dùng dạng youtube.com/watch?v=…, youtu.be/… hoặc youtube.com/shorts/…" };
    return { ok: true, provider: "YouTube", canonicalUrl: `https://www.youtube.com/watch?v=${id}`, externalId: id };
  }
  if (FACEBOOK_HOSTS.has(host)) {
    if (host === "fb.watch") {
      return /^[A-Za-z0-9_-]{4,40}$/.test(parts[0] ?? "") ? { ok: true, provider: "Facebook", canonicalUrl: `https://fb.watch/${parts[0]}`, externalId: parts[0] } : { ok: false, reason: "Không nhận ra liên kết fb.watch." };
    }
    const watchId = parts[0] === "watch" ? url.searchParams.get("v") ?? "" : "";
    const videoIndex = parts.indexOf("videos");
    const id = watchId || (videoIndex >= 1 ? parts[videoIndex + 1] ?? "" : "") || (parts[0] === "reel" ? parts[1] ?? "" : "");
    if (!DIGITS.test(id)) return { ok: false, reason: "Không nhận ra mã video Facebook. Dùng facebook.com/watch?v=…, …/videos/… hoặc facebook.com/reel/…" };
    return { ok: true, provider: "Facebook", canonicalUrl: `https://www.facebook.com/watch/?v=${id}`, externalId: id };
  }
  if (TIKTOK_HOSTS.has(host)) {
    const videoIndex = parts.indexOf("video");
    const id = parts[0]?.startsWith("@") && videoIndex === 1 ? parts[2] ?? "" : "";
    if (!DIGITS.test(id)) return { ok: false, reason: "Dùng đường dẫn đầy đủ dạng tiktok.com/@tên/video/… (không nhận liên kết rút gọn)." };
    return { ok: true, provider: "TikTok", canonicalUrl: `https://www.tiktok.com/${parts[0]}/video/${id}`, externalId: id };
  }
  return { ok: false, reason: "Chỉ chấp nhận video từ YouTube, Facebook hoặc TikTok." };
}

/** The descriptor sent to the backend for a video block, or null while the URL/fallback is not valid. */
export function toMediaDescriptor(url: string, title: string, fallbackSummary: string): MediaDescriptor | null {
  const parsed = parseMediaUrl(url);
  if (!parsed.ok || !fallbackSummary.trim()) return null;
  return { provider: parsed.provider, canonicalUrl: parsed.canonicalUrl, externalId: parsed.externalId, title: title.trim(), fallbackSummary: fallbackSummary.trim() };
}

/** Image URLs must be https; the renderer never accepts data: or javascript: URLs. */
export function isSafeImageUrl(value: string): boolean {
  try { const url = new URL(value.trim()); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
