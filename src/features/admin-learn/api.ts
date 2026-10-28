import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types/common";
import { bool, isRecord, kindOf, list, num, parsePage, parseSituationRef, parseSourceRef, str, strOrNull } from "@/features/learn/parse";
import { POST_STATUSES, type PostStatus } from "@/features/learn/types";
import type { AdminPost, AdminPostListInfo, AdminSituation, AdminVersion, CreatePostInput, CreateSituationInput, KnowledgeSource, LearnImage, LifecycleOperation, MediaDescriptor, Page, SourceStatus, VersionInput, VersionStatus, VersionSummary, WithEtag } from "./types";

/*
 * Learn CMS over the real contract: /api/admin/learn/* and /api/admin/knowledge-sources (PlatformAdmin).
 * Reads carry `ETag` (post revision for posts, version revision for versions); every If-Match write sends it back.
 * Create routes REQUIRE Idempotency-Key; PUT version, publish and lifecycle accept an optional one that replays the
 * first success for the same input, which is what makes a retry after a lost response safe.
 */

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });
export const etagFor = (revision: number) => `"${revision}"`;
/** The ETag header when the browser exposes it, else the quoted `revision` from the body (the backend derives the header from it). */
const etagOf = (headers: Headers, revision: number) => headers.get("etag") ?? etagFor(revision);

const postStatus = (value: unknown): PostStatus => ((POST_STATUSES as readonly string[]).includes(value as string) ? (value as PostStatus) : "Unpublished");
const versionStatus = (value: unknown): VersionStatus => (value === "Published" ? "Published" : "Draft");

export function parseVersion(raw: unknown): AdminVersion | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    postId: str(raw.postId),
    versionNumber: num(raw.versionNumber, 1),
    contentSchemaVersion: str(raw.contentSchemaVersion, "fet3d.learn/1"),
    kind: kindOf(raw.kind),
    title: str(raw.title),
    summary: str(raw.summary),
    coverImageUrl: strOrNull(raw.coverImageUrl),
    blocks: list(raw.blocks),
    contentHash: str(raw.contentHash),
    status: versionStatus(raw.status),
    publishedAt: strOrNull(raw.publishedAt),
    revision: num(raw.revision, 1),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    situations: list(raw.situations).map(parseSituationRef).filter((item) => item !== null),
    sources: list(raw.sources).map(parseSourceRef).filter((item) => item !== null),
  };
}

function parseVersionSummary(raw: unknown): VersionSummary | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return { id: raw.id, versionNumber: num(raw.versionNumber, 1), status: versionStatus(raw.status), title: str(raw.title), revision: num(raw.revision, 1), updatedAt: str(raw.updatedAt) };
}

/** List-only fields; null when the row carries none of them (detail and command responses). */
function parseListInfo(raw: Record<string, unknown>): AdminPostListInfo | null {
  if (!("latestVersionId" in raw) && !("versionCount" in raw) && !("title" in raw)) return null;
  return {
    title: strOrNull(raw.title),
    kind: typeof raw.kind === "string" ? kindOf(raw.kind) : null,
    latestVersionId: strOrNull(raw.latestVersionId),
    latestVersionNumber: typeof raw.latestVersionNumber === "number" ? raw.latestVersionNumber : null,
    latestVersionStatus: raw.latestVersionStatus == null ? null : versionStatus(raw.latestVersionStatus),
    draftVersionId: strOrNull(raw.draftVersionId),
    draftVersionNumber: typeof raw.draftVersionNumber === "number" ? raw.draftVersionNumber : null,
    versionCount: num(raw.versionCount, 0),
  };
}

export function parsePost(raw: unknown): AdminPost | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    slug: str(raw.slug),
    publicationStatus: postStatus(raw.publicationStatus),
    publishedVersionId: strOrNull(raw.publishedVersionId),
    revision: num(raw.revision, 1),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    publishedVersion: parseVersion(raw.publishedVersion),
    versions: Array.isArray(raw.versions) ? raw.versions.map(parseVersionSummary).filter((item) => item !== null) : null,
    latest: parseListInfo(raw),
  };
}

const requirePost = (raw: unknown): AdminPost => {
  const post = parsePost(raw);
  if (!post) throw new ApiError("Máy chủ trả về bài không đọc được.", 502, undefined, undefined, "LEARN_POST_MALFORMED");
  return post;
};
const requireVersion = (raw: unknown): AdminVersion => {
  const version = parseVersion(raw);
  if (!version) throw new ApiError("Máy chủ trả về phiên bản không đọc được.", 502, undefined, undefined, "LEARN_VERSION_MALFORMED");
  return version;
};

/** Lowercase hex SHA-256 of a file (Learn images are at most 5 MB, so one digest call is fine). */
async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const sourceStatus = (value: unknown): SourceStatus => (value === "Approved" || value === "Retired" ? value : "Draft");

export function parseSource(raw: unknown): KnowledgeSource | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    visibility: str(raw.visibility, "Common"),
    organizationId: strOrNull(raw.organizationId),
    title: str(raw.title, "Nguồn không rõ tên"),
    sourceUri: strOrNull(raw.sourceUri),
    versionLabel: str(raw.versionLabel),
    jurisdiction: strOrNull(raw.jurisdiction),
    effectiveFrom: strOrNull(raw.effectiveFrom),
    effectiveUntil: strOrNull(raw.effectiveUntil),
    approvalStatus: sourceStatus(raw.approvalStatus),
    sourceHash: str(raw.sourceHash),
    approvedAt: strOrNull(raw.approvedAt),
    createdAt: str(raw.createdAt),
    revision: num(raw.revision, 1),
    canUseInDraft: bool(raw.canUseInDraft),
    canPublishReference: bool(raw.canPublishReference),
  };
}

function parseSituation(raw: unknown): AdminSituation | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return { id: raw.id, slug: str(raw.slug), name: str(raw.name, str(raw.slug)), description: strOrNull(raw.description), isActive: bool(raw.isActive, true), createdAt: str(raw.createdAt), updatedAt: str(raw.updatedAt) };
}

async function postWithEtag(promise: Promise<{ data: unknown; headers: Headers }>): Promise<WithEtag<AdminPost>> {
  const response = await promise;
  const post = requirePost(response.data);
  return { data: post, etag: etagOf(response.headers, post.revision) };
}
async function versionWithEtag(promise: Promise<{ data: unknown; headers: Headers }>): Promise<WithEtag<AdminVersion>> {
  const response = await promise;
  const version = requireVersion(response.data);
  return { data: version, etag: etagOf(response.headers, version.revision) };
}

export const learnAdminApi = {
  async listPosts(accessToken: string, query: { status?: string; page: number; pageSize: number }, signal?: AbortSignal): Promise<Page<AdminPost>> {
    const raw = await apiClient.request<unknown>("/api/admin/learn/posts", { headers: auth(accessToken), query: { status: query.status || undefined, page: query.page, pageSize: query.pageSize }, signal });
    return parsePage(raw, parsePost);
  },
  getPost: (accessToken: string, id: string, signal?: AbortSignal) => postWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/learn/posts/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal })),
  /** 201, no ETag header: the ETag of the new post is `"revision"` from the body. `publish: true` publishes the first version atomically. */
  createPost: (accessToken: string, input: CreatePostInput, idempotencyKey: string) => postWithEtag(apiClient.requestWithMeta<unknown>("/api/admin/learn/posts", { headers: auth(accessToken), method: "POST", json: input, idempotencyKey })),

  getVersion: (accessToken: string, id: string, signal?: AbortSignal) => versionWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/learn/versions/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal })),
  /** A new Draft built from the full content given (copy a version's content to start from it). Idempotency-Key required. */
  createVersion: (accessToken: string, postId: string, input: VersionInput, idempotencyKey: string) => versionWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/learn/posts/${encodeURIComponent(postId)}/versions`, { headers: auth(accessToken), method: "POST", json: input, idempotencyKey })),
  /** Only a Draft; `etag` is the version ETag (If-Match). 412 stale, 409 once Published. */
  updateVersion: (accessToken: string, versionId: string, input: VersionInput, etag: string, idempotencyKey: string) => versionWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/learn/versions/${encodeURIComponent(versionId)}`, { headers: auth(accessToken), method: "PUT", json: input, ifMatch: etag, idempotencyKey })),
  /** Publishes a Draft (version ETag). The response is the POST, whose ETag is the new post revision. */
  publishVersion: (accessToken: string, versionId: string, etag: string, idempotencyKey: string) => postWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/learn/versions/${encodeURIComponent(versionId)}/publish`, { headers: auth(accessToken), method: "POST", ifMatch: etag, idempotencyKey })),
  /** hide | show | delete | restore with the POST ETag. */
  lifecycle: (accessToken: string, postId: string, operation: LifecycleOperation, etag: string, idempotencyKey: string) => postWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/learn/posts/${encodeURIComponent(postId)}/${operation}`, { headers: auth(accessToken), method: "POST", ifMatch: etag, idempotencyKey })),

  async listSituations(accessToken: string, query: { search?: string; isActive?: boolean; page: number; pageSize: number }, signal?: AbortSignal): Promise<Page<AdminSituation>> {
    const raw = await apiClient.request<unknown>("/api/admin/learn/situations", { headers: auth(accessToken), query: { search: query.search || undefined, isActive: query.isActive, page: query.page, pageSize: query.pageSize }, signal });
    return parsePage(raw, parseSituation);
  },
  async createSituation(accessToken: string, input: CreateSituationInput, idempotencyKey: string): Promise<AdminSituation> {
    const raw = await apiClient.request<unknown>("/api/admin/learn/situations", { headers: auth(accessToken), method: "POST", json: { slug: input.slug, name: input.name, description: input.description || null }, idempotencyKey });
    const created = parseSituation(raw);
    if (!created) throw new ApiError("Máy chủ trả về tình huống không đọc được.", 502, undefined, undefined, "LEARN_SITUATION_MALFORMED");
    return created;
  },

  /** The URL is never fetched by the backend; it only returns the canonical descriptor. 422 `LEARN_MEDIA_INVALID` when not allowlisted. */
  async validateMedia(accessToken: string, url: string, signal?: AbortSignal): Promise<MediaDescriptor> {
    const raw = await apiClient.request<unknown>("/api/admin/learn/media/validate", { headers: auth(accessToken), method: "POST", json: { url }, signal });
    if (!isRecord(raw) || typeof raw.canonicalUrl !== "string") throw new ApiError("Máy chủ trả về kết quả kiểm tra không đọc được.", 502, undefined, undefined, "LEARN_MEDIA_MALFORMED");
    return { provider: str(raw.provider), videoId: str(raw.videoId), canonicalUrl: raw.canonicalUrl };
  },

  /**
   * Uploads a cover or block image (BE#171): intent (Idempotency-Key, name, type, size, sha256) → PUT to the presigned URL
   * with exactly the returned headers → complete, which checks the bytes. The url is a stable public address on the API.
   */
  async uploadImage(accessToken: string, file: File, idempotencyKey: string): Promise<LearnImage> {
    const intent = await apiClient.request<unknown>("/api/admin/learn/media/images/upload-intent", {
      headers: auth(accessToken), method: "POST", idempotencyKey,
      json: { fileName: file.name || "anh", contentType: file.type, sizeBytes: file.size, sha256: await sha256Hex(file) },
    });
    if (!isRecord(intent) || typeof intent.uploadId !== "string" || typeof intent.uploadUrl !== "string") throw new ApiError("Máy chủ trả về phiên tải ảnh không đọc được.", 502, undefined, undefined, "LEARN_UPLOAD_MALFORMED");
    const headers = isRecord(intent.headers) ? Object.fromEntries(Object.entries(intent.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : { "Content-Type": file.type };
    const put = await fetch(intent.uploadUrl, { method: "PUT", body: file, headers });
    if (!put.ok) throw new ApiError("Không tải được ảnh lên kho lưu trữ.", put.status, undefined, undefined, "LEARN_UPLOAD_PUT_FAILED");
    const done = await apiClient.request<unknown>(`/api/admin/learn/media/images/${encodeURIComponent(intent.uploadId)}/complete`, { headers: auth(accessToken), method: "POST" });
    if (!isRecord(done) || typeof done.url !== "string") throw new ApiError("Máy chủ trả về ảnh không đọc được.", 502, undefined, undefined, "LEARN_IMAGE_MALFORMED");
    return { imageId: str(done.imageId), url: done.url, width: num(done.width), height: num(done.height), contentType: str(done.contentType, file.type), sizeBytes: num(done.sizeBytes, file.size) };
  },

  /** Editor catalog: `visibility=Common` so tenant sources never enter a Learn draft. */
  async listSources(accessToken: string, query: { status?: string; search?: string; page: number; pageSize: number }, signal?: AbortSignal): Promise<Page<KnowledgeSource>> {
    const raw = await apiClient.request<unknown>("/api/admin/knowledge-sources", { headers: auth(accessToken), query: { visibility: "Common", status: query.status || undefined, search: query.search || undefined, page: query.page, pageSize: query.pageSize }, signal });
    return parsePage(raw, parseSource);
  },
  async getSource(accessToken: string, id: string, signal?: AbortSignal): Promise<KnowledgeSource> {
    const raw = await apiClient.request<unknown>(`/api/admin/knowledge-sources/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal });
    const source = parseSource(raw);
    if (!source) throw new ApiError("Máy chủ trả về nguồn không đọc được.", 502, undefined, undefined, "SOURCE_MALFORMED");
    return source;
  },
};
