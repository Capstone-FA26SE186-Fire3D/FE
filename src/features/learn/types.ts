/*
 * Learn contract `fet3d.learn/1` as the BACKEND returns it (BE docs/learn-library.md, ContentController, learn_*_representation).
 * Public reads only ever carry a Published version; the admin CMS reuses these shapes in features/admin-learn.
 */

export const LEARN_KINDS = ["Article", "Tip", "Video"] as const;
export type LearnKind = (typeof LEARN_KINDS)[number];

/** Post lifecycle: Unpublished (never public) | Published | Hidden (410 on public read) | Deleted (soft delete). */
export const POST_STATUSES = ["Unpublished", "Published", "Hidden", "Deleted"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const kindLabel: Record<LearnKind, string> = { Article: "Bài viết", Tip: "Mẹo", Video: "Video" };

export type SituationRef = { id: string; slug: string; name: string };
/** One cited source of a version. `locator` is an opaque JSON object the backend stores per citation. */
export type SourceRef = { sourceId: string; title: string; versionLabel: string; role: string; locator: Record<string, unknown> };

export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };

/** Row of `GET /api/learn/posts`. */
export type PublicPostSummary = {
  id: string;
  slug: string;
  kind: LearnKind;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  publishedAt: string;
};

/** The published version inside `GET /api/learn/posts/{slug}`. `blocks` stay untyped until the renderer parses them. */
export type PublicVersion = {
  id: string;
  postId: string;
  versionNumber: number;
  kind: LearnKind;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  blocks: unknown[];
  publishedAt: string | null;
  situations: SituationRef[];
  sources: SourceRef[];
};

export type PublicPost = { id: string; slug: string; version: PublicVersion };

export type PublicSituation = { id: string; slug: string; name: string; description: string | null };

/** Row of `GET /api/learn/bookmarks`. An unavailable bookmark has no content: only the post id and when it was saved. */
export type BookmarkItem =
  | { available: true; postId: string; bookmarkedAt: string; slug: string; title: string; summary: string; kind: LearnKind }
  | { available: false; postId: string; bookmarkedAt: string };
