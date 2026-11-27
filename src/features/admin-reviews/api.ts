import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types/common";
import type { ReassignReviewRequest, ReviewDetail, ReviewListQuery, ReviewPage, ReviewSummary } from "./types";

function headers(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Review read side (`ScenarioReviewQueriesController`), PlatformAdmin only. Since BE#211 the decision belongs to the
 * FireSafetyExpert (`features/expert-reviews`); the admin approve/reject commands are obsolete on the server and are not
 * called from the web.
 */
export const reviewsApi = {
  list(accessToken: string, query: ReviewListQuery, signal?: AbortSignal) {
    return apiClient.request<ReviewPage>("/api/admin/scenario-reviews", { headers: headers(accessToken), query, signal });
  },
  detail(accessToken: string, reviewId: string, signal?: AbortSignal) {
    return apiClient.request<ReviewDetail>(`/api/admin/scenario-reviews/${encodeURIComponent(reviewId)}`, { headers: headers(accessToken), signal });
  },
  /** BE#242: hand a waiting review to another active FireSafetyExpert. 409 `REVIEW_NOT_PENDING`, 400 `EXPERT_NOT_AVAILABLE`. */
  reassign(accessToken: string, reviewId: string, body: ReassignReviewRequest) {
    return apiClient.request<ReviewSummary>(`/api/admin/reviews/${encodeURIComponent(reviewId)}/reassign`, { headers: headers(accessToken), method: "POST", json: { expertId: body.expertId, reason: body.reason.trim() } });
  },
};

/** True when the server assigns reviews (BE#242): the field is present on the item, even as null. */
export const hasAssignment = (item: Pick<ReviewSummary, "assignedTo">) => item.assignedTo !== undefined;

export type ReadFailure = { title: string; message: string; denied: boolean };

/** Text for a failed queue/detail read. `denied` hides the retry button because it cannot help. */
export function describeReadError(error: unknown, what: "queue" | "detail"): ReadFailure {
  const title = what === "queue" ? "Không tải được danh sách thẩm định" : "Không mở được mục này";
  if (error instanceof ApiError) {
    if (error.status === 401) return { title: "Phiên đăng nhập đã hết hạn", message: "Đăng nhập lại bằng tài khoản quản trị FET3D để xem danh sách thẩm định.", denied: true };
    if (error.status === 403) return { title: "Không có quyền truy cập", message: "Chỉ quản trị FET3D xem được danh sách thẩm định tình huống.", denied: true };
    if (error.status === 404) return { title: "Không tìm thấy mục này", message: "Mục này không tồn tại hoặc không còn truy cập được (tổ chức/công trình đã bị vô hiệu hóa). Quay lại danh sách để chọn mục khác.", denied: true };
    if (error.isRateLimited) return { title, message: error.retryAfterSeconds ? `Máy chủ đang bận, thử lại sau ${error.retryAfterSeconds} giây.` : "Máy chủ đang bận, thử lại sau ít phút.", denied: false };
    return { title, message: error.message, denied: false };
  }
  return { title, message: "Không kết nối được tới máy chủ. Kiểm tra kết nối rồi thử lại.", denied: false };
}

/**
 * Text for a failed reassign. `reload`: the item changed on the server (decided already, or gone), so the list is re-read
 * and the dialog closes; otherwise the dialog stays open with what the admin typed.
 */
export function describeReassignError(error: unknown): { message: string; reload: boolean; field?: "expertId" | "reason"; code?: string } {
  if (!(error instanceof ApiError)) return { message: "Không kết nối được tới máy chủ. Kiểm tra kết nối rồi thử lại.", reload: false };
  const code = error.code;
  if (code === "REVIEW_NOT_PENDING") return { code, reload: true, message: "Mục này đã có kết quả thẩm định nên không gán lại được. Danh sách đã được tải lại." };
  if (code === "EXPERT_NOT_AVAILABLE") return { code, reload: false, field: "expertId", message: "Chuyên viên này không còn nhận thẩm định được (tài khoản đã khóa hoặc không còn là Chuyên viên PCCC). Hãy chọn người khác." };
  if (error.status === 401) return { code, reload: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại; chưa có thay đổi nào được ghi." };
  if (error.status === 403) return { code, reload: false, message: "Chỉ quản trị FET3D gán lại được mục thẩm định." };
  if (error.status === 404) return { code, reload: true, message: "Không tìm thấy mục này nữa. Danh sách đã được tải lại." };
  if (error.status === 400) {
    const reason = error.fieldMessage("reason");
    return reason ? { code, reload: false, field: "reason", message: reason } : { code, reload: false, message: "Thông tin chưa hợp lệ. Hãy kiểm tra rồi gửi lại." };
  }
  if (error.isRateLimited) return { code, reload: false, message: error.retryAfterSeconds ? `Máy chủ đang bận, thử lại sau ${error.retryAfterSeconds} giây.` : "Máy chủ đang bận, thử lại sau ít phút." };
  return { code, reload: false, message: "Chưa gán lại được. Hãy thử lại." };
}

/** Tag of reads that count the review queue (sidebar badge): re-read when the queue is reloaded (`invalidateAsyncData`). */
export const REVIEW_QUEUE_TAG = "admin-review-queue";
