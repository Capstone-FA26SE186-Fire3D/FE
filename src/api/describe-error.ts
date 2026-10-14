import { ApiError } from "./types/common";

/**
 * User-facing Vietnamese text for a failed request, by what actually happened (session lost, no permission, not found,
 * someone else edited it, rate limit with the server's Retry-After, server error, no network). The raw (English) server
 * title is never shown. Use it instead of one fixed sentence so a 401 is not reported as "check your connection".
 */
export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy dữ liệu. Có thể dữ liệu đã bị xóa hoặc không thuộc tổ chức này.";
    if (error.status === 412) return "Dữ liệu đã được người khác thay đổi.";
    if (error.status === 428) return "Thiếu điều kiện phiên bản. Hãy tải lại rồi thử lại.";
    if (error.status === 429 || error.status === 503) {
      return error.retryAfterSeconds ? `Hệ thống đang bận. Hãy thử lại sau ${error.retryAfterSeconds} giây.` : "Hệ thống đang bận. Hãy thử lại sau ít phút.";
    }
    if (error.status >= 500) return "Máy chủ gặp lỗi. Hãy thử lại sau.";
    return error.fieldErrors[0]?.message ?? fallback;
  }
  if (error instanceof TypeError) return "Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.";
  return fallback;
}
