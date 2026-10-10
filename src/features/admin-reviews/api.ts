import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types/common";
import type { ContentReviewDecision, ContentReviewDecisionRequest, ReviewAction } from "./types";

const HASH = /^[0-9a-fA-F]{64}$/;

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** The server lower-cases hashes and trims the reason; sending the same normal form keeps replays byte-identical. */
export function normalizeDecisionInput(action: ReviewAction, input: ContentReviewDecisionRequest): ContentReviewDecisionRequest {
  const reason = input.reason?.trim();
  return {
    contentHash: input.contentHash.trim().toLowerCase(),
    rubricHash: input.rubricHash.trim().toLowerCase(),
    ...(action === "reject" || reason ? { reason: reason ?? "" } : {}),
  };
}

/** Client-side mirror of the controller checks, so obvious mistakes are caught before a round trip. */
export function validateDecisionInput(action: ReviewAction, input: ContentReviewDecisionRequest): Partial<Record<keyof ContentReviewDecisionRequest, string>> {
  const errors: Partial<Record<keyof ContentReviewDecisionRequest, string>> = {};
  if (!HASH.test(input.contentHash.trim())) errors.contentHash = "Hash nội dung phải là SHA-256 (64 ký tự hex) do bước nộp trả về.";
  if (!HASH.test(input.rubricHash.trim())) errors.rubricHash = "Hash rubric phải là SHA-256 (64 ký tự hex) do bước nộp trả về.";
  const reason = input.reason?.trim() ?? "";
  if (reason.length > 4000) errors.reason = "Lý do tối đa 4000 ký tự.";
  if (action === "reject" && reason.length === 0) errors.reason = "Nhập lý do từ chối (1–4000 ký tự).";
  return errors;
}

/**
 * Review commands that already exist in BE (`ScenarioContentReviewsController`, PlatformAdmin only).
 * `Idempotency-Key` is required by the readiness gate (400 IDEMPOTENCY_KEY_REQUIRED without it); the same key
 * with a different payload is 409 IDEMPOTENCY_KEY_CONFLICT. There is NO read endpoint for the queue yet (BE#52).
 */
export const contentReviewsApi = {
  approve(accessToken: string, versionId: string, input: ContentReviewDecisionRequest, idempotencyKey: string) {
    return apiClient.request<ContentReviewDecision>(`/api/admin/scenario-versions/${encodeURIComponent(versionId)}/approve`, { headers: headers(accessToken), json: normalizeDecisionInput("approve", input), idempotencyKey });
  },
  reject(accessToken: string, versionId: string, input: ContentReviewDecisionRequest, idempotencyKey: string) {
    return apiClient.request<ContentReviewDecision>(`/api/admin/scenario-versions/${encodeURIComponent(versionId)}/reject`, { headers: headers(accessToken), json: normalizeDecisionInput("reject", input), idempotencyKey });
  },
};

export type DecisionErrorView = { message: string; fieldErrors: Partial<Record<keyof ContentReviewDecisionRequest, string>>; retryable: boolean };

/** Turns a failed decision into text for the dialog. Network/5xx errors keep the idempotency key so a retry is safe. */
export function describeDecisionError(error: unknown): DecisionErrorView {
  if (!(error instanceof ApiError)) {
    return { message: "Không kết nối được tới máy chủ. Nội dung bạn nhập được giữ nguyên; bấm thử lại sẽ dùng cùng mã thao tác nên không bị ghi hai lần.", fieldErrors: {}, retryable: true };
  }
  const fieldErrors = {
    contentHash: error.fieldMessage("contentHash"),
    rubricHash: error.fieldMessage("rubricHash"),
    reason: error.fieldMessage("reason"),
  };
  switch (error.code) {
    case "CONTENT_REVIEW_NOT_PENDING": return { message: "Bản này không còn ở trạng thái chờ duyệt (đã được xử lý ở nơi khác). Tải lại chi tiết để xem kết quả.", fieldErrors, retryable: false };
    case "CONTENT_HASH_MISMATCH": return { message: "Hash không khớp nội dung đã nộp. Tải lại chi tiết rồi duyệt đúng bản đã đóng băng.", fieldErrors, retryable: false };
    case "IDEMPOTENCY_KEY_CONFLICT": return { message: "Mã thao tác đã dùng cho nội dung khác. Đóng hộp thoại và thử lại để tạo thao tác mới.", fieldErrors, retryable: false };
    case "SCENARIO_SNAPSHOT_REQUIRED": return { message: "Phiên bản chưa có snapshot kịch bản/rubric hợp lệ nên chưa duyệt được.", fieldErrors, retryable: false };
    default: break;
  }
  if (error.status === 401) return { message: "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại; nội dung nhập được giữ nguyên.", fieldErrors, retryable: false };
  if (error.status === 403) return { message: "Chỉ PlatformAdmin được duyệt hoặc từ chối kịch bản.", fieldErrors, retryable: false };
  if (error.status === 404) return { message: "Không tìm thấy phiên bản này (có thể tổ chức hoặc công trình đã bị vô hiệu hóa).", fieldErrors, retryable: false };
  if (error.status === 400 && (fieldErrors.reason || fieldErrors.contentHash || fieldErrors.rubricHash)) return { message: "Dữ liệu chưa hợp lệ. Kiểm tra các trường được đánh dấu.", fieldErrors, retryable: false };
  if (error.isRateLimited) return { message: error.retryAfterSeconds ? `Máy chủ đang bận. Thử lại sau ${error.retryAfterSeconds} giây.` : "Máy chủ đang bận. Thử lại sau ít phút.", fieldErrors, retryable: true };
  return { message: "Không thể ghi quyết định. Nội dung bạn nhập vẫn được giữ lại; thử lại sẽ dùng cùng mã thao tác.", fieldErrors, retryable: true };
}
