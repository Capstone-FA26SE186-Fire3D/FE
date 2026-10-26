import type { LearnKind, PostStatus, SituationRef, SourceRef } from "@/features/learn/types";

/*
 * Learn CMS shapes as the backend returns them (BE docs/learn-library.md, ContentController, learn_*_representation).
 * `revision` is the number inside the ETag: post revision for post resources, version revision for version resources.
 */

export type { LearnKind, PostStatus, SituationRef, SourceRef };

export type VersionStatus = "Draft" | "Published";
/** `hide | show | delete | restore` are the exact operation names in `POST /api/admin/learn/posts/{id}/{operation}`. */
export type LifecycleOperation = "hide" | "show" | "delete" | "restore";
export const SOURCE_ROLES = ["Primary", "Reference", "Transcript"] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export type WithEtag<T> = { data: T; etag: string };
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export type VersionSummary = { id: string; versionNumber: number; status: VersionStatus; title: string; revision: number; updatedAt: string };

export type AdminVersion = {
  id: string;
  postId: string;
  versionNumber: number;
  contentSchemaVersion: string;
  kind: LearnKind;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  blocks: unknown[];
  contentHash: string;
  status: VersionStatus;
  publishedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  situations: SituationRef[];
  sources: SourceRef[];
};

/**
 * A post. In the LIST the `versions` array is absent and only the current published version is embedded, so a post that
 * was never published has no title there (a backend gap, reported). `GET /posts/{id}` adds `versions` (summaries).
 */
export type AdminPost = {
  id: string;
  slug: string;
  publicationStatus: PostStatus;
  publishedVersionId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedVersion: AdminVersion | null;
  versions: VersionSummary[] | null;
};

export type AdminSituation = { id: string; slug: string; name: string; description: string | null; isActive: boolean; createdAt: string; updatedAt: string };

export type SourceStatus = "Draft" | "Approved" | "Retired";
/** Common (or tenant) knowledge source with the backend's own verdict on how a Learn version may cite it. */
export type KnowledgeSource = {
  id: string;
  visibility: string;
  title: string;
  sourceUri: string | null;
  versionLabel: string;
  jurisdiction: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  approvalStatus: SourceStatus;
  revision: number;
  /** A Learn draft may cite it (Common and Draft/Approved). */
  canUseInDraft: boolean;
  /** Publish, Hidden and RAG accept it right now (Common, Approved and inside its effective window). */
  canPublishReference: boolean;
};

/** A completed Learn image upload (BE#171); `url` goes into `coverImageUrl` or an image block. */
export type LearnImage = { imageId: string; url: string; width: number; height: number };

export type MediaDescriptor = { provider: string; videoId: string; canonicalUrl: string };

/** Wire form of a version for POST /posts (inside `version`), POST /posts/{id}/versions and PUT /versions/{id}. */
export type VersionInput = {
  kind: LearnKind;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  blocks: Array<Record<string, unknown>>;
  situationIds: string[];
  sources: Array<{ sourceId: string; role: string; locator: Record<string, unknown> }>;
};

export type CreatePostInput = { slug: string; publish: boolean; version: VersionInput };
