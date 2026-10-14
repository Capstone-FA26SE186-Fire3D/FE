import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types/common";
import { isRecord, list, num, parsePage, str, strOrNull, bool } from "@/features/learn/parse";
import type { JsonObject } from "@/features/scenario-editor/store/json";
import { isKind, type LibraryItem, type LibraryKind, type LibraryVersion, type LibraryVersionRef, type Page, type VersionInput, type VersionStatus, type WithEtag } from "./types";

/*
 * Organization Library over the real contract.
 *  - Reads for OrganizationUser and PlatformAdmin: `/api/library/*` (organizations see only active items that have a
 *    Published version, and only Published versions; a Draft version id is a 404 for them).
 *  - Admin: `/api/admin/library/*` (PlatformAdmin only). ETag is the quoted `revision` of the item or version. Create routes
 *    REQUIRE Idempotency-Key; PATCH item, PUT version and publish accept an optional one that replays the first success.
 */

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });
export const etagFor = (revision: number) => `"${revision}"`;
/** The ETag header when the browser exposes it, else the quoted `revision` from the body (the backend derives the header from it). */
const etagOf = (headers: Headers, revision: number) => headers.get("etag") ?? etagFor(revision);

const versionStatus = (value: unknown): VersionStatus => (value === "Published" ? "Published" : "Draft");

function parseRef(raw: unknown): LibraryVersionRef | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return { id: raw.id, versionNumber: num(raw.versionNumber, 1), name: str(raw.name), status: versionStatus(raw.status), revision: num(raw.revision, 1), publishedAt: strOrNull(raw.publishedAt) };
}

export function parseVersion(raw: unknown): LibraryVersion | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !isKind(raw.kind)) return null;
  return {
    id: raw.id,
    itemId: str(raw.itemId),
    kind: raw.kind,
    code: str(raw.code),
    versionNumber: num(raw.versionNumber, 1),
    name: str(raw.name),
    payload: isRecord(raw.payload) ? (raw.payload as JsonObject) : {},
    requiredCapabilities: list(raw.requiredCapabilities).filter((item): item is string => typeof item === "string"),
    payloadHash: str(raw.payloadHash),
    status: versionStatus(raw.status),
    publishedAt: strOrNull(raw.publishedAt),
    revision: num(raw.revision, 1),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
  };
}

export function parseItem(raw: unknown): LibraryItem | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !isKind(raw.kind)) return null;
  return {
    id: raw.id,
    kind: raw.kind,
    code: str(raw.code),
    isActive: bool(raw.isActive, true),
    revision: num(raw.revision, 1),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    latestPublished: parseVersion(raw.latestPublished),
    versions: list(raw.versions).map(parseRef).filter((item) => item !== null),
  };
}

const malformed = (what: string, code: string) => new ApiError(`Máy chủ trả về ${what} không đọc được.`, 502, undefined, undefined, code);
function requireItem(raw: unknown): LibraryItem {
  const item = parseItem(raw);
  if (!item) throw malformed("mục thư viện", "LIBRARY_ITEM_MALFORMED");
  return item;
}
function requireVersion(raw: unknown): LibraryVersion {
  const version = parseVersion(raw);
  if (!version) throw malformed("phiên bản", "LIBRARY_VERSION_MALFORMED");
  return version;
}

async function itemWithEtag(promise: Promise<{ data: unknown; headers: Headers }>): Promise<WithEtag<LibraryItem>> {
  const response = await promise;
  const item = requireItem(response.data);
  return { data: item, etag: etagOf(response.headers, item.revision) };
}
async function versionWithEtag(promise: Promise<{ data: unknown; headers: Headers }>): Promise<WithEtag<LibraryVersion>> {
  const response = await promise;
  const version = requireVersion(response.data);
  return { data: version, etag: etagOf(response.headers, version.revision) };
}

type ListQuery = { kind?: LibraryKind | ""; page: number; pageSize: number };
const listQuery = (query: ListQuery) => ({ kind: query.kind || undefined, page: query.page, pageSize: query.pageSize });

/** Read side for OrganizationUser and PlatformAdmin. */
export const libraryApi = {
  async listItems(accessToken: string, query: ListQuery, signal?: AbortSignal): Promise<Page<LibraryItem>> {
    const raw = await apiClient.request<unknown>("/api/library/items", { headers: auth(accessToken), query: listQuery(query), signal });
    return parsePage(raw, parseItem);
  },
  /** 404 when the item is inactive or has no Published version (for organizations). */
  async getItem(accessToken: string, id: string, signal?: AbortSignal): Promise<LibraryItem> {
    return requireItem(await apiClient.request<unknown>(`/api/library/items/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal }));
  },
  /** Published versions only for organizations; stays readable after the item is deactivated. */
  async getVersion(accessToken: string, id: string, signal?: AbortSignal): Promise<LibraryVersion> {
    return requireVersion(await apiClient.request<unknown>(`/api/library/versions/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal }));
  },
};

export const libraryAdminApi = {
  async listItems(accessToken: string, query: ListQuery, signal?: AbortSignal): Promise<Page<LibraryItem>> {
    const raw = await apiClient.request<unknown>("/api/admin/library/items", { headers: auth(accessToken), query: listQuery(query), signal });
    return parsePage(raw, parseItem);
  },
  getItem: (accessToken: string, id: string, signal?: AbortSignal) => itemWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/library/items/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal })),
  /** 201 without an ETag header: the ETag of the new item is `"revision"` from the body. 409 `LIBRARY_CODE_EXISTS`. */
  createItem: (accessToken: string, input: { kind: LibraryKind; code: string }, idempotencyKey: string) => itemWithEtag(apiClient.requestWithMeta<unknown>("/api/admin/library/items", { headers: auth(accessToken), method: "POST", json: input, idempotencyKey })),
  /** Only `isActive` can change. 412 stale, 428 without If-Match. */
  updateItem: (accessToken: string, id: string, input: { isActive: boolean }, etag: string, idempotencyKey: string) => itemWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/library/items/${encodeURIComponent(id)}`, { headers: auth(accessToken), method: "PATCH", json: input, ifMatch: etag, idempotencyKey })),

  getVersion: (accessToken: string, id: string, signal?: AbortSignal) => versionWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/library/versions/${encodeURIComponent(id)}`, { headers: auth(accessToken), signal })),
  /** A new Draft. Idempotency-Key required. 422 `CONTENT_INVALID` with `issues[{code,path,message}]` (paths like `$.payload.rubric.schema_version`). */
  createVersion: (accessToken: string, itemId: string, input: VersionInput, idempotencyKey: string) => versionWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/library/items/${encodeURIComponent(itemId)}/versions`, { headers: auth(accessToken), method: "POST", json: input, idempotencyKey })),
  /** Only a Draft (409 `LIBRARY_VERSION_PUBLISHED` once Published); `etag` is the version ETag (If-Match). */
  updateVersion: (accessToken: string, versionId: string, input: VersionInput, etag: string, idempotencyKey: string) => versionWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/library/versions/${encodeURIComponent(versionId)}`, { headers: auth(accessToken), method: "PUT", json: input, ifMatch: etag, idempotencyKey })),
  /** The response is the published version (its new ETag); the ITEM revision moves too, so the caller re-reads the item. */
  publishVersion: (accessToken: string, versionId: string, etag: string, idempotencyKey: string) => versionWithEtag(apiClient.requestWithMeta<unknown>(`/api/admin/library/versions/${encodeURIComponent(versionId)}/publish`, { headers: auth(accessToken), method: "POST", ifMatch: etag, idempotencyKey })),
};
