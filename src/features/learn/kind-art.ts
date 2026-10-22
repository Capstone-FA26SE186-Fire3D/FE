import type { LearnKind } from "./types";

/**
 * Medium-poly thumbnails keyed by post `kind` (the only thing a bookmark row carries besides title and summary: the API
 * has no cover image there). A post that has a real `coverImageUrl` still shows that cover; this art is the fallback.
 * Files are versioned (-v1): the CDN caches assets for about a day, so a change ships under a new name.
 */
export const KIND_ART: Record<LearnKind, string> = {
  Article: "/assets/trainee/thumb-door-v1.webp",
  Tip: "/assets/trainee/thumb-extinguisher-v1.webp",
  Video: "/assets/trainee/thumb-phone-v1.webp",
};
export const KIND_ART_SIZE = { width: 720, height: 480 } as const;

/** Tone of the kind badge (Article blue, Tip green, Video amber); the label is always shown too. */
export const KIND_TONE: Record<LearnKind, "info" | "success" | "warning"> = { Article: "info", Tip: "success", Video: "warning" };
