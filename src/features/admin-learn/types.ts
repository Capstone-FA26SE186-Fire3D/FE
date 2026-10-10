import type { PageResponse } from "@/api/types/common";

/*
 * Learn CMS model from Docs v7 (learn_posts / learn_post_versions). The BACKEND HAS NO LEARN API YET (BE#57):
 * everything here is the target shape the Docs describe, adjusted when the real contract is published.
 */

export type LearnKind = "Article" | "Tip" | "Video";
/** Post lifecycle. Public = Published only; Hidden keeps its pointer; Deleted is a soft delete. */
export type PostStatus = "Unpublished" | "Published" | "Hidden" | "Deleted";
/** Version lifecycle is only Draft -> Published; a Published version is immutable. */
export type VersionStatus = "Draft" | "Published";
export type LifecycleAction = "publish" | "hide" | "show" | "delete" | "restore";

/** Providers the renderer is allowed to link. Anything else is rejected; nothing is ever embedded as arbitrary HTML/iframe. */
export const MEDIA_PROVIDERS = ["YouTube", "Facebook", "TikTok"] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

/** Validated descriptor the backend stores and the renderer consumes. The summary is the mandatory fallback. */
export type MediaDescriptor = { provider: MediaProvider; canonicalUrl: string; externalId: string | null; title: string; fallbackSummary: string };

/** A block holds the raw URL the editor typed; `media` is derived and sent only when the URL validates. */
export type ContentBlock =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "image"; url: string; alt: string }
  | { id: string; type: "video"; url: string; title: string; fallbackSummary: string };

export type DraftContent = {
  title: string;
  summary: string;
  coverImageUrl: string;
  kind: LearnKind;
  blocks: ContentBlock[];
  situationIds: string[];
  sourceIds: string[];
};

export type LearnVersion = DraftContent & {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  contentHash: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type LearnPost = {
  id: string;
  slug: string;
  status: PostStatus;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: LearnVersion[];
};

export type LearnPostSummary = {
  id: string;
  slug: string;
  title: string;
  kind: LearnKind;
  status: PostStatus;
  publishedVersionNumber: number | null;
  draftVersionNumber: number | null;
  updatedAt: string;
};

export type LearnListFilters = { q: string; kind: LearnKind | ""; status: PostStatus | ""; page: number; pageSize: number };

export type CatalogSituation = { id: string; name: string };
/** A `Common` knowledge source. Drafts may cite unapproved ones; publish/show require Approved. */
export type CatalogSource = { id: string; title: string; status: "Approved" | "Pending" };
export type LearnCatalog = { situations: CatalogSituation[]; sources: CatalogSource[] };

export type CreatePostInput = { slug: string; content: DraftContent; publishImmediately: boolean };

/** Every read returns the resource with the ETag header; every write carries `If-Match` and/or `Idempotency-Key`. */
export type WithEtag<T> = { data: T; etag: string };

/**
 * What the CMS screens need from a backend. `createLearnCmsApi` (api.ts) is the HTTP implementation against the
 * PROPOSED routes; the prototype supplies an in-memory one.
 */
export interface LearnCmsPort {
  catalog(): Promise<LearnCatalog>;
  list(filters: LearnListFilters): Promise<PageResponse<LearnPostSummary>>;
  get(postId: string): Promise<WithEtag<LearnPost>>;
  create(input: CreatePostInput, idempotencyKey: string): Promise<WithEtag<LearnPost>>;
  /** PUT, requires If-Match; BE answers 204 with the new ETag in the header. */
  saveDraft(postId: string, versionId: string, content: DraftContent, etag: string): Promise<{ etag: string }>;
  newDraft(postId: string, fromVersionId: string, etag: string, idempotencyKey: string): Promise<WithEtag<LearnPost>>;
  transition(postId: string, action: LifecycleAction, versionId: string | null, etag: string, idempotencyKey: string): Promise<WithEtag<LearnPost>>;
}
