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

/** The published version inside `GET /api/learn/posts/{slug}` (BE `LearnVersionView`). `blocks` stay untyped until the renderer parses them. */
export type PublicVersion = {
  id: string;
  postId: string;
  versionNumber: number;
  /** `fet3d.learn/1`. */
  contentSchemaVersion: string;
  contentHash: string;
  /** Version status; always Published on a public read. */
  status: string;
  revision: number;
  kind: LearnKind;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  blocks: unknown[];
  publishedAt: string | null;
  situations: SituationRef[];
  sources: SourceRef[];
};

/** `GET /api/learn/posts/{slug}` (BE `LearnPostView`; public reads omit `versions`). `version` is the API's `publishedVersion`. */
export type PublicPost = {
  id: string;
  slug: string;
  publicationStatus: PostStatus | string;
  publishedVersionId: string | null;
  revision: number;
  createdAt: string | null;
  updatedAt: string | null;
  version: PublicVersion;
};

export type PublicSituation = { id: string; slug: string; name: string; description: string | null };

/** Row of `GET /api/learn/bookmarks`. An unavailable bookmark has no content: only the post id and when it was saved. */
export type BookmarkItem =
  | { available: true; postId: string; bookmarkedAt: string; slug: string; title: string; summary: string; kind: LearnKind }
  | { available: false; postId: string; bookmarkedAt: string };

/** `counts` of `GET /api/learn/bookmarks`: every bookmark of the Trainee whatever the filters/page, available ones by kind. */
export type BookmarkCounts = Record<LearnKind, number> & { unavailable: number };

/** `GET /api/learn/bookmarks` (BE `LearnBookmarkPage`). `total` counts rows matching `kind`/`search`; `counts` ignores them (null when absent). */
export type BookmarkPage = PageOf<BookmarkItem> & { counts: BookmarkCounts | null };

/** Answer of `PUT`/`DELETE`/`GET /api/learn/bookmarks/{postId}` (BE `LearnBookmarkState`). */
export type BookmarkState = { postId: string; bookmarked: boolean };
