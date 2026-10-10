import { apiClient } from "@/api/client";
import { ApiError, type PageResponse } from "@/api/types/common";
import { toMediaDescriptor } from "./media";
import type { CreatePostInput, DraftContent, LearnCatalog, LearnCmsPort, LearnListFilters, LearnPost, LearnPostSummary, LifecycleAction, WithEtag } from "./types";

/*
 * HTTP client for the Learn CMS. THE BACKEND HAS NO SUCH ROUTES (BE#57): paths below are a PROPOSAL derived from
 * the Docs v7 gates (ETag/If-Match, Idempotency-Key, publish/hide/show/delete/restore) and must be replaced by
 * the real contract when it is published. Nothing in the production UI calls this yet.
 */
const BASE = "/api/admin/learn";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function etagOf(headersIn: Headers): string {
  const value = headersIn.get("ETag");
  if (!value) throw new ApiError("Máy chủ không trả ETag cho tài nguyên này.", 502, undefined, undefined, "ETAG_MISSING");
  return value;
}

/** Wire form of a draft: blocks carry the validated media descriptor, never raw HTML. */
export function toWireContent(content: DraftContent) {
  return {
    title: content.title.trim(),
    summary: content.summary.trim(),
    coverImageUrl: content.coverImageUrl.trim() || null,
    kind: content.kind,
    situationIds: content.situationIds,
    sourceIds: content.sourceIds,
    blocks: content.blocks.map((block) => {
      switch (block.type) {
        case "heading":
        case "paragraph": return { type: block.type, text: block.text.trim() };
        case "image": return { type: "image" as const, url: block.url.trim(), alt: block.alt.trim() };
        case "video": return { type: "video" as const, media: toMediaDescriptor(block.url, block.title, block.fallbackSummary) };
      }
    }),
  };
}

export function createLearnCmsApi(accessToken: string): LearnCmsPort {
  const auth = headers(accessToken);
  const withEtag = async <T>(promise: Promise<{ data: T; headers: Headers }>): Promise<WithEtag<T>> => {
    const response = await promise;
    return { data: response.data, etag: etagOf(response.headers) };
  };
  return {
    catalog: () => apiClient.request<LearnCatalog>(`${BASE}/catalog`, { headers: auth }),
    list: (filters: LearnListFilters) => apiClient.request<PageResponse<LearnPostSummary>>(`${BASE}/posts`, { headers: auth, query: { q: filters.q || undefined, kind: filters.kind || undefined, status: filters.status || undefined, page: filters.page, pageSize: filters.pageSize } }),
    get: (postId) => withEtag(apiClient.requestWithMeta<LearnPost>(`${BASE}/posts/${encodeURIComponent(postId)}`, { headers: auth })),
    create: (input: CreatePostInput, idempotencyKey) => withEtag(apiClient.requestWithMeta<LearnPost>(`${BASE}/posts`, { headers: auth, json: { slug: input.slug, publishImmediately: input.publishImmediately, ...toWireContent(input.content) }, idempotencyKey })),
    async saveDraft(postId, versionId, content, etag) {
      const response = await apiClient.requestWithMeta<void>(`${BASE}/posts/${encodeURIComponent(postId)}/versions/${encodeURIComponent(versionId)}`, { headers: auth, method: "PUT", json: toWireContent(content), ifMatch: etag });
      return { etag: etagOf(response.headers) };
    },
    newDraft: (postId, fromVersionId, etag, idempotencyKey) => withEtag(apiClient.requestWithMeta<LearnPost>(`${BASE}/posts/${encodeURIComponent(postId)}/versions`, { headers: auth, json: { fromVersionId }, ifMatch: etag, idempotencyKey })),
    transition: (postId, action: LifecycleAction, versionId, etag, idempotencyKey) => withEtag(apiClient.requestWithMeta<LearnPost>(`${BASE}/posts/${encodeURIComponent(postId)}/${action}`, { headers: auth, json: versionId ? { versionId } : {}, ifMatch: etag, idempotencyKey })),
  };
}

export type LearnErrorView = { message: string; issues: Array<{ path: string; message: string }>; kind: "conflict" | "retry" | "invalid" | "forbidden" | "other" };

/** Text for a failed CMS write. 412 means someone else changed the post: the caller keeps the user's input. */
export function describeLearnError(error: unknown): LearnErrorView {
  if (!(error instanceof ApiError)) return { message: "Không kết nối được tới máy chủ. Nội dung bạn nhập được giữ nguyên; thử lại sẽ dùng cùng mã thao tác nên không bị ghi hai lần.", issues: [], kind: "retry" };
  const issues = error.fieldErrors.map((item) => ({ path: item.path, message: item.message }));
  if (error.status === 412) return { message: "Bài đã được thay đổi ở nơi khác kể từ lần bạn mở. Nội dung của bạn vẫn được giữ lại; hãy tải bản mới để đối chiếu.", issues, kind: "conflict" };
  if (error.status === 428) return { message: "Thiếu thông tin phiên bản (If-Match). Tải lại bài rồi thử lại.", issues, kind: "conflict" };
  if (error.status === 401) return { message: "Phiên đăng nhập đã hết hạn. Đăng nhập lại; nội dung nhập được giữ nguyên.", issues, kind: "forbidden" };
  if (error.status === 403) return { message: "Chỉ PlatformAdmin được quản lý Learn.", issues, kind: "forbidden" };
  if (error.status === 404 || error.status === 410) return { message: "Không tìm thấy bài này.", issues, kind: "other" };
  if (error.code === "LEARN_SOURCE_NOT_APPROVED") return { message: "Bài đang trích dẫn nguồn Common chưa được duyệt, nên chưa xuất bản hoặc hiện lại được.", issues, kind: "invalid" };
  if (error.code === "LEARN_SLUG_TAKEN") return { message: "Slug này đã được dùng cho bài khác.", issues, kind: "invalid" };
  if (error.code === "IDEMPOTENCY_KEY_CONFLICT") return { message: "Mã thao tác đã dùng cho nội dung khác. Đóng hộp thoại rồi thử lại để tạo thao tác mới.", issues, kind: "other" };
  if (error.status === 409 || error.status === 422) return { message: "Nội dung chưa hợp lệ hoặc trạng thái bài không cho phép thao tác này.", issues, kind: "invalid" };
  if (error.isRateLimited) return { message: error.retryAfterSeconds ? `Máy chủ đang bận. Thử lại sau ${error.retryAfterSeconds} giây.` : "Máy chủ đang bận. Thử lại sau ít phút.", issues, kind: "retry" };
  return { message: "Không thể hoàn tất thao tác. Nội dung bạn nhập vẫn được giữ lại; thử lại sẽ dùng cùng mã thao tác.", issues, kind: "retry" };
}
