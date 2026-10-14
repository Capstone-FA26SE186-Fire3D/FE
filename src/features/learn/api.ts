import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types/common";
import { bool, isRecord, kindOf, list, num, parsePage, parseSituationRef, parseSourceRef, str, strOrNull } from "./parse";
import { LEARN_LIMITS, type LearnFilterField } from "./query";
import type { BookmarkItem, PageOf, PublicPost, PublicPostSummary, PublicSituation, PublicVersion } from "./types";

/** Public Learn (`/api/learn/*`, anonymous) and Trainee bookmarks (Bearer). Contract: BE docs/learn-library.md. */

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

function parseSummary(raw: unknown): PublicPostSummary | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.slug !== "string") return null;
  return { id: raw.id, slug: raw.slug, kind: kindOf(raw.kind), title: str(raw.title, raw.slug), summary: str(raw.summary), coverImageUrl: strOrNull(raw.coverImageUrl), publishedAt: str(raw.publishedAt) };
}

function parseVersion(raw: unknown): PublicVersion | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    postId: str(raw.postId),
    versionNumber: num(raw.versionNumber, 1),
    kind: kindOf(raw.kind),
    title: str(raw.title),
    summary: str(raw.summary),
    coverImageUrl: strOrNull(raw.coverImageUrl),
    blocks: list(raw.blocks),
    publishedAt: strOrNull(raw.publishedAt),
    situations: list(raw.situations).map(parseSituationRef).filter((item) => item !== null),
    sources: list(raw.sources).map(parseSourceRef).filter((item) => item !== null),
  };
}

function parseBookmark(raw: unknown): BookmarkItem | null {
  if (!isRecord(raw) || typeof raw.postId !== "string") return null;
  const bookmarkedAt = str(raw.bookmarkedAt);
  if (bool(raw.available) && typeof raw.slug === "string") return { available: true, postId: raw.postId, bookmarkedAt, slug: raw.slug, title: str(raw.title, raw.slug), summary: str(raw.summary), kind: kindOf(raw.kind) };
  return { available: false, postId: raw.postId, bookmarkedAt };
}

export type LearnPostsQuery = { search?: string; situations?: string[]; kinds?: string[]; page: number; pageSize: number };

export const learnApi = {
  async situations(signal?: AbortSignal): Promise<PublicSituation[]> {
    const raw = await apiClient.request<unknown>("/api/learn/situations", { signal });
    return list(raw).flatMap((item) => (isRecord(item) && typeof item.id === "string" ? [{ id: item.id, slug: str(item.slug), name: str(item.name, str(item.slug)), description: strOrNull(item.description) }] : []));
  },

  /**
   * `GET /api/learn/posts` (anonymous, Published only, newest first). Filtering happens on the server BEFORE paging and `total` is exact:
   * `search` (2-100 chars, matched in title+summary ignoring case and Vietnamese diacritics), `situation` and `kind` repeated (OR inside one
   * filter, AND between filters). Invalid values answer 400 VALIDATION_ERROR with `errors` per field.
   */
  async posts(query: LearnPostsQuery, signal?: AbortSignal): Promise<PageOf<PublicPostSummary>> {
    const search = query.search?.trim();
    const raw = await apiClient.request<unknown>("/api/learn/posts", {
      query: { search: search || undefined, situation: query.situations?.length ? query.situations : undefined, kind: query.kinds?.length ? query.kinds : undefined, page: query.page, pageSize: query.pageSize },
      signal,
    });
    return parsePage(raw, parseSummary);
  },

  /** 404 = unknown, never published or deleted; 410 (`LEARN_POST_UNAVAILABLE`) = hidden. */
  async post(slug: string, signal?: AbortSignal): Promise<PublicPost> {
    const raw = await apiClient.request<unknown>(`/api/learn/posts/${encodeURIComponent(slug)}`, { signal });
    const body = isRecord(raw) ? raw : {};
    const version = parseVersion(body.publishedVersion);
    if (typeof body.id !== "string" || !version) throw new ApiError("Máy chủ trả về bài không đọc được.", 502, undefined, undefined, "LEARN_POST_MALFORMED");
    return { id: body.id, slug: str(body.slug, slug), version };
  },

  async bookmarks(accessToken: string, query: { page: number; pageSize: number }, signal?: AbortSignal): Promise<PageOf<BookmarkItem>> {
    const raw = await apiClient.request<unknown>("/api/learn/bookmarks", { headers: auth(accessToken), query, signal });
    return parsePage(raw, parseBookmark);
  },

  /** Idempotent: saving an already-saved post is a no-op. 404 when the post is not Published. */
  async bookmark(accessToken: string, postId: string): Promise<void> {
    await apiClient.request<unknown>(`/api/learn/bookmarks/${encodeURIComponent(postId)}`, { headers: auth(accessToken), method: "PUT" });
  },

  /** Idempotent: removing a bookmark that does not exist is a no-op. Works for unavailable posts too. */
  async unbookmark(accessToken: string, postId: string): Promise<void> {
    await apiClient.request<unknown>(`/api/learn/bookmarks/${encodeURIComponent(postId)}`, { headers: auth(accessToken), method: "DELETE" });
  },
};

/** Vietnamese message for a failed public read. */
export function describeReadError(error: unknown): { status: number | null; title: string; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 404) return { status: 404, title: "Không tìm thấy bài", message: "Bài này không tồn tại hoặc chưa được công khai." };
    if (error.status === 410) return { status: 410, title: "Bài tạm thời không hiển thị", message: "Bài này đang được ẩn khỏi trang công khai. Bạn có thể xem các bài khác trong Learn." };
    if (error.isRateLimited) return { status: error.status, title: "Máy chủ đang bận", message: error.retryAfterSeconds ? `Thử lại sau ${error.retryAfterSeconds} giây.` : "Thử lại sau ít phút." };
    return { status: error.status, title: "Không tải được nội dung", message: `Máy chủ trả lỗi${error.code ? ` (${error.code})` : ` ${error.status}`}. Hãy thử lại.` };
  }
  return { status: null, title: "Không kết nối được tới máy chủ", message: "Hãy kiểm tra kết nối rồi thử lại." };
}

const FILTER_FIELDS: readonly LearnFilterField[] = ["search", "situation", "kind"];
const FILTER_MESSAGES: Record<LearnFilterField, string> = {
  search: `Từ khóa phải có ${LEARN_LIMITS.searchMin}–${LEARN_LIMITS.searchMax} ký tự.`,
  situation: `Chỉ chọn tối đa ${LEARN_LIMITS.situationMax} tình huống, mỗi mã dài tối đa ${LEARN_LIMITS.situationSlugMax} ký tự.`,
  kind: "Loại bài chỉ gồm Bài viết, Mẹo hoặc Video.",
};

/** A 400 from the list: which filter parameters the API rejected (`errors` of the ProblemDetails) and what to tell the reader. */
export function describeFilterError(error: unknown): { fields: LearnFilterField[]; messages: string[]; code: string } | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const fields = FILTER_FIELDS.filter((field) => error.fieldMessage(field) !== undefined);
  return { fields, messages: fields.map((field) => FILTER_MESSAGES[field]), code: error.code ?? "400" };
}
