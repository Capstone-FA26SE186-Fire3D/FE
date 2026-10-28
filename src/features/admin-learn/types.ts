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
 * Admin list row extras (BE `LearnPostAdminRow`, BE#86/#154): the newest version of ANY status (Draft or Published), so every
 * post, including Unpublished and Deleted ones, has a title in the list. `draftVersionId` is the newest open Draft or null.
 * Only `GET /api/admin/learn/posts` returns these; detail and command responses do not.
 */
export type AdminPostListInfo = {
  title: string | null;
  kind: LearnKind | null;
  latestVersionId: string | null;
  latestVersionNumber: number | null;
  latestVersionStatus: VersionStatus | null;
  draftVersionId: string | null;
  draftVersionNumber: number | null;
  versionCount: number;
};

/**
 * A post (BE `LearnPostView`). The public title is `publishedVersion.title`. `GET /posts/{id}` adds `versions` (summaries);
 * the LIST adds `latest` (see `AdminPostListInfo`), null on other responses.
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
  latest?: AdminPostListInfo | null;
};

export type AdminSituation = { id: string; slug: string; name: string; description: string | null; isActive: boolean; createdAt: string; updatedAt: string };

export type SourceStatus = "Draft" | "Approved" | "Retired";
/** Common (or tenant) knowledge source (BE `KnowledgeSourceView`) with the backend's own verdict on how a Learn version may cite it. */
export type KnowledgeSource = {
  id: string;
  visibility: string;
  /** Null for Common sources. */
  organizationId: string | null;
  title: string;
  sourceUri: string | null;
  versionLabel: string;
  jurisdiction: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  approvalStatus: SourceStatus;
  sourceHash: string;
  approvedAt: string | null;
  createdAt: string;
  revision: number;
  /** A Learn draft may cite it (Common and Draft/Approved). */
  canUseInDraft: boolean;
  /** Publish, Hidden and RAG accept it right now (Common, Approved and inside its effective window). */
  canPublishReference: boolean;
};

/** A completed Learn image upload (BE#171); `url` goes into `coverImageUrl` or an image block. */
/** Response of `POST /api/admin/learn/media/images/{uploadId}/complete` (BE#171). */
export type LearnImage = { imageId: string; url: string; width: number; height: number; contentType: string; sizeBytes: number };

/** Response of `POST /api/admin/learn/media/validate` (BE `MediaDescriptor`). */
export type MediaDescriptor = { provider: string; videoId: string; canonicalUrl: string };

/** Body of `POST /api/admin/learn/situations` (BE `CreateLearnSituationRequest`). */
export type CreateSituationInput = { slug: string; name: string; description?: string };

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
