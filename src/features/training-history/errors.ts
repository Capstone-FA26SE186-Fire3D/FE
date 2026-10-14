import { ApiError } from "@/api/types/common";

export type FailureView = {
  title: string;
  message: string;
  /** Machine code from the server, shown so support can quote it. */
  code?: string;
  /** A retry can help (network, 5xx, rate limit). 401/403/404 are answers about rights, retrying the same call will not change them. */
  retryable: boolean;
};

/**
 * Words for a failed history/result read, by what happened. The server's English title is never shown. A 404 on a result
 * means the session is not the caller's (the API answers the same for "does not exist" and "belongs to someone else").
 */
export function describeFailure(error: unknown, subject: "list" | "detail"): FailureView {
  const what = subject === "list" ? "lịch sử lượt tập" : "kết quả lượt tập";
  if (error instanceof ApiError) {
    const code = error.code;
    if (error.status === 401) return { title: "Phiên đăng nhập đã hết hạn", message: "Hãy đăng nhập lại để xem lịch sử và kết quả của bạn.", code, retryable: false };
    if (error.status === 403) return { title: "Tài khoản này không có lịch sử lượt tập", message: "Lịch sử và kết quả cá nhân chỉ dành cho tài khoản học viên.", code, retryable: false };
    if (error.status === 404) return { title: "Không tìm thấy lượt tập này", message: "Lượt tập không tồn tại hoặc không thuộc tài khoản của bạn. Bạn chỉ xem được lượt tập của chính mình.", code, retryable: false };
    if (error.status === 400) return { title: "Bộ lọc không hợp lệ", message: error.fieldErrors[0]?.message ?? "Máy chủ không nhận bộ lọc này. Hãy xóa bộ lọc rồi thử lại.", code, retryable: false };
    if (error.status === 429 || error.status === 503) {
      return { title: "Máy chủ đang bận", message: error.retryAfterSeconds ? `Hãy thử lại sau ${error.retryAfterSeconds} giây.` : "Hãy thử lại sau ít phút.", code, retryable: true };
    }
    if (error.status >= 500) return { title: `Không tải được ${what}`, message: "Máy chủ gặp lỗi. Hãy thử lại sau.", code, retryable: true };
    return { title: `Không tải được ${what}`, message: "Máy chủ không xử lý được yêu cầu này.", code, retryable: true };
  }
  if (error instanceof TypeError) return { title: "Mất kết nối tới máy chủ", message: "Kiểm tra mạng rồi thử lại. Dữ liệu của bạn vẫn an toàn trên máy chủ.", retryable: true };
  return { title: `Không tải được ${what}`, message: "Đã có lỗi không mong đợi. Hãy thử lại.", retryable: true };
}
