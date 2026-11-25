import { apiClient } from "@/api/client";
import { ApiError } from "@/api/types/common";
import type { ReviewDetail, ReviewListQuery, ReviewPage } from "./types";

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
};

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

/** Tag of reads that count the review queue (sidebar badge): re-read when the queue is reloaded (`invalidateAsyncData`). */
export const REVIEW_QUEUE_TAG = "admin-review-queue";
