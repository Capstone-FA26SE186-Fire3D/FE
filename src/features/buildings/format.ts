import { ApiError } from "@/api/types/common";

const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateOnly.format(date);
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function shortHash(hash: string | null | undefined, length = 10) {
  if (!hash) return "—";
  return hash.length > length ? `${hash.slice(0, length)}…` : hash;
}

/** User-facing Vietnamese text for a failed request. The raw (English) server title is not shown. */
export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (error.status === 404) return "Không tìm thấy dữ liệu. Có thể công trình hoặc revision đã bị xóa hoặc không thuộc tổ chức này.";
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

export function isStatus(error: unknown, status: number) {
  return error instanceof ApiError && error.status === status;
}
