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

import { describeApiError } from "@/api/describe-error";

export { describeApiError };

/** Building create/update/archive failures; 412 is handled by the caller (it shows the newer version). */
export function describeBuildingWriteError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === "IDEMPOTENCY_KEY_CONFLICT") return "Thao tác này đã được gửi với nội dung khác. Bấm lưu lần nữa để gửi lại.";
    if (error.code === "IDEMPOTENCY_KEY_REQUIRED") return "Chưa gửi được. Hãy thử lại.";
    if (error.status === 428) return "Chưa xác định được bản thông tin công trình đang sửa. Hãy tải lại công trình rồi thử lại.";
    if (error.status === 404) return "Không tìm thấy công trình, hoặc công trình đã được lưu trữ nên không sửa được nữa.";
  }
  return describeApiError(error, fallback);
}

export function isStatus(error: unknown, status: number) {
  return error instanceof ApiError && error.status === status;
}
