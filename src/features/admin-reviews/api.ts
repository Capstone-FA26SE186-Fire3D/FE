import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types/common";
import type { ContentReviewDecision, ContentReviewDecisionRequest, ReviewAction, ReviewDetail, ReviewListQuery, ReviewPage } from "./types";

const HASH = /^[0-9a-fA-F]{64}$/;
export const REASON_MAX = 4000;

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** The server lower-cases hashes and trims the reason; sending the same normal form keeps replays byte-identical. */
export function normalizeDecisionInput(action: ReviewAction, input: ContentReviewDecisionRequest): ContentReviewDecisionRequest {
  const base = { contentHash: input.contentHash.trim().toLowerCase(), rubricHash: input.rubricHash.trim().toLowerCase() };
  return action === "reject" ? { ...base, reason: (input.reason ?? "").trim() } : base;
}

/** Same checks as the controller, so obvious mistakes are caught before a round trip. */
export function validateReason(reason: string): string | undefined {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return "Nhập lý do từ chối (1–4000 ký tự).";
  if (trimmed.length > REASON_MAX) return `Lý do tối đa ${REASON_MAX} ký tự (đang ${trimmed.length}).`;
  return undefined;
}

export function hasValidHashes(input: ContentReviewDecisionRequest): boolean {
  return HASH.test(input.contentHash.trim()) && HASH.test(input.rubricHash.trim());
}

/**
 * Review read side and decision commands (`ScenarioReviewQueriesController`, `ScenarioContentReviewsController`),
 * PlatformAdmin only. Decisions require `Idempotency-Key` (400 IDEMPOTENCY_KEY_REQUIRED without it); the same key with
 * a different payload is 409 IDEMPOTENCY_KEY_CONFLICT. The decision addresses the SCENARIO VERSION id, not the review id.
 */
export const reviewsApi = {
  list(accessToken: string, query: ReviewListQuery, signal?: AbortSignal) {
    return apiClient.request<ReviewPage>("/api/admin/scenario-reviews", { headers: headers(accessToken), query, signal });
  },
  detail(accessToken: string, reviewId: string, signal?: AbortSignal) {
    return apiClient.request<ReviewDetail>(`/api/admin/scenario-reviews/${encodeURIComponent(reviewId)}`, { headers: headers(accessToken), signal });
  },
  decide(accessToken: string, action: ReviewAction, versionId: string, input: ContentReviewDecisionRequest, idempotencyKey: string) {
    return apiClient.request<ContentReviewDecision>(`/api/admin/scenario-versions/${encodeURIComponent(versionId)}/${action}`, {
      headers: headers(accessToken),
      json: normalizeDecisionInput(action, input),
      idempotencyKey,
    });
  },
};

/**
 * How the dialog should react to a failed decision.
 * - `retry`: nothing is known to be written (network, timeout, 429/5xx): keep the Idempotency-Key and offer the same request again.
 * - `reload`: the server's state is the truth (409, 401/403/404): reload the detail instead of guessing.
 * - `fix`: the input is invalid (400): the user edits and resubmits.
 */
export type DecisionFailure = { kind: "retry" | "reload" | "fix"; message: string; code?: string; reason?: string };

export function describeDecisionError(error: unknown): DecisionFailure {
  if (!(error instanceof ApiError)) {
    return { kind: "retry", message: "Không kết nối được tới máy chủ hoặc chưa nhận được phản hồi. Quyết định có thể đã được ghi: bấm Thử lại sẽ gửi cùng mã thao tác nên không bị ghi hai lần." };
  }
  const code = error.code;
  switch (code) {
    case "CONTENT_REVIEW_NOT_PENDING": return { kind: "reload", code, message: "Bản này không còn ở trạng thái chờ duyệt: đã có quyết định (quyết định không đổi được). Đang tải lại trạng thái hiện tại." };
    case "CONTENT_HASH_MISMATCH": return { kind: "reload", code, message: "Nội dung phiên bản không khớp với bản đang xem. Đang tải lại chi tiết; hãy xem lại rồi quyết định lại." };
    case "IDEMPOTENCY_KEY_CONFLICT": return { kind: "reload", code, message: "Mã thao tác đã được dùng cho một quyết định khác. Đang tải lại trạng thái hiện tại." };
    case "SCENARIO_SNAPSHOT_REQUIRED": return { kind: "reload", code, message: "Phiên bản chưa có nội dung kịch bản và rubric hợp lệ nên chưa quyết định được." };
    default: break;
  }
  if (error.status === 409) return { kind: "reload", code, message: "Quyết định không ghi được ở trạng thái hiện tại. Đang tải lại để hiển thị trạng thái đúng." };
  if (error.status === 401) return { kind: "reload", code, message: "Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Đăng nhập lại rồi mở lại bản duyệt; không có quyết định nào được ghi từ phản hồi này." };
  if (error.status === 403) return { kind: "reload", code, message: "Chỉ quản trị FET3D được duyệt hoặc từ chối kịch bản." };
  if (error.status === 404) return { kind: "reload", code, message: "Không tìm thấy phiên bản này (không thuộc phạm vi truy cập hoặc tổ chức/công trình đã bị vô hiệu hóa)." };
  if (error.status === 400) {
    const reason = error.fieldMessage("reason");
    const hash = error.fieldMessage("contentHash") ?? error.fieldMessage("rubricHash");
    if (hash) return { kind: "reload", code, message: "Hash do máy chủ trả về bị từ chối. Đang tải lại chi tiết." };
    return { kind: "fix", code, reason, message: reason ?? "Dữ liệu chưa hợp lệ. Kiểm tra lại lý do rồi gửi lại." };
  }
  if (error.isRateLimited) {
    const wait = error.retryAfterSeconds ? ` Thử lại sau ${error.retryAfterSeconds} giây.` : " Thử lại sau ít phút.";
    return { kind: "retry", code, message: `Máy chủ đang bận.${wait} Thử lại dùng cùng mã thao tác.` };
  }
  return { kind: "retry", code, message: "Không ghi được quyết định. Nội dung bạn nhập vẫn được giữ lại; bấm thử lại an toàn, không bị ghi hai lần." };
}

export type ReadFailure = { title: string; message: string; denied: boolean };

/** Text for a failed queue/detail read. `denied` hides the retry button because it cannot help. */
export function describeReadError(error: unknown, what: "queue" | "detail"): ReadFailure {
  const title = what === "queue" ? "Không tải được hàng chờ duyệt" : "Không mở được bản duyệt";
  if (error instanceof ApiError) {
    if (error.status === 401) return { title: "Phiên đăng nhập đã hết hạn", message: "Đăng nhập lại bằng tài khoản quản trị FET3D để xem hàng chờ duyệt.", denied: true };
    if (error.status === 403) return { title: "Không có quyền truy cập", message: "Chỉ quản trị FET3D xem và quyết định được bản duyệt kịch bản.", denied: true };
    if (error.status === 404) return { title: "Không tìm thấy bản duyệt", message: "Bản duyệt không tồn tại hoặc không còn truy cập được (tổ chức/công trình đã bị vô hiệu hóa). Quay lại hàng chờ để chọn bản khác.", denied: true };
    if (error.isRateLimited) return { title, message: error.retryAfterSeconds ? `Máy chủ đang bận, thử lại sau ${error.retryAfterSeconds} giây.` : "Máy chủ đang bận, thử lại sau ít phút.", denied: false };
    return { title, message: error.message, denied: false };
  }
  return { title, message: "Không kết nối được tới máy chủ. Kiểm tra kết nối rồi thử lại.", denied: false };
}
