import { ApiError } from "@/api/types/common";

/** Stable BE codes for the playtest endpoints (PlaytestLifecycle.cs, playtest-manual-test.md) with plain-language copy. */
const codeMessages: Record<string, string> = {
  DRAFT_SNAPSHOT_REQUIRED: "Draft chưa có snapshot khớp trạng thái hiện tại. Tạo snapshot rồi dựng PlaytestPackage cho phiên bản đó.",
  PLAYTEST_PACKAGE_REQUIRED: "Phiên bản này chưa có PlaytestPackage đã dựng và qua kiểm tra. Dựng package loại PlaytestPackage cho đúng phiên bản bất biến này rồi thử lại.",
  RUNTIME_INCOMPATIBLE: "Package không tương thích runtime đang hoạt động (phiên bản tối thiểu, protocol, manifest schema hoặc capability). Dựng lại package hoặc chờ runtime phù hợp.",
  PLAYTEST_ENTITLEMENT_REQUIRED: "Công trình này chưa có dịch vụ trả phí còn hiệu lực hoặc gói dùng thử đã hết lượt chạy thử.",
  PLAYTEST_LAUNCH_UNAVAILABLE: "Chạy thử chưa được bật ở môi trường này (rollout hoặc khóa ký chưa cấu hình). Chưa trừ lượt dùng thử.",
  PLAYTEST_HANDOFF_UNAVAILABLE: "Chuyển sang Mobile chưa được bật ở môi trường này (cấu hình handoff chưa có). Chưa tạo mã nào.",
  PLAYTEST_HANDOFF_NOT_RECOVERABLE: "Không thể hiển thị lại mã đã tạo. Hãy tạo mã mới.",
  PLAYTEST_HANDOFF_EXPIRED: "Mã đã hết hạn hoặc đã bị thay bằng mã mới. Hãy cấp lại mã.",
  PLAYTEST_HANDOFF_USED: "Mã đã được một phiên Mobile khác dùng.",
  PLAYTEST_HANDOFF_REVOKED: "Mã đã bị thay thế hoặc hủy.",
  PLAYTEST_HANDOFF_ISSUER_INVALID: "Phiên web đã tạo mã không còn hiệu lực. Đăng nhập lại rồi cấp mã mới.",
  PLAYTEST_HANDOFF_INVALID: "Mã không hợp lệ.",
  PLAYTEST_SESSION_MISMATCH: "Thao tác này chỉ dành cho phiên đang giữ playtest (phiên đã tạo mã hoặc phiên Mobile đã gắn). Web chỉ theo dõi và hủy.",
  PLAYTEST_ALREADY_STARTED: "Playtest đã bắt đầu nên không thể cấp mã chuyển sang thiết bị khác.",
  PLAYTEST_ALREADY_LAUNCHED: "Playtest đã chạy trên một thiết bị và không thể chuyển sang thiết bị khác.",
  PLAYTEST_TERMINAL: "Playtest đã kết thúc (hoàn tất hoặc đã hủy).",
  PLAYTEST_GRANT_EXPIRED: "Mã khởi chạy đã hết hạn; Mobile cần xin mã khởi chạy mới.",
  PLAYTEST_GRANT_STALE: "Đã có mã khởi chạy mới hơn.",
  IDEMPOTENCY_KEY_CONFLICT: "Yêu cầu trước đó dùng cùng khóa nhưng nội dung khác. Tải lại trang rồi thử lại.",
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu Idempotency-Key. Tải lại trang rồi thử lại.",
  VALIDATION_ERROR: "Dữ liệu chưa hợp lệ.",
  UNAUTHORIZED: "Phiên đăng nhập không còn hiệu lực. Đăng nhập lại.",
};

const statusMessages: Record<number, string> = {
  401: "Phiên đăng nhập không còn hiệu lực. Đăng nhập lại.",
  403: "Chỉ tài khoản OrganizationUser của công trình mới chạy thử được. PlatformAdmin không phải người chạy thử.",
  404: "Không tìm thấy playtest hoặc kịch bản này, hoặc nó không thuộc tài khoản/tổ chức của bạn.",
  429: "Quá nhiều yêu cầu.",
  503: "Dịch vụ chạy thử chưa sẵn sàng. Thử lại sau.",
};

export type PlaytestErrorView = {
  status?: number;
  code?: string;
  title: string;
  message: string;
  retryAfterSeconds?: number;
  fieldErrors: Array<{ path: string; message: string }>;
  /** Definitive 401/403/404: retrying the same call cannot succeed, so polling must stop. */
  fatal: boolean;
};

export function describePlaytestError(error: unknown, fallback = "Đã xảy ra lỗi. Thử lại."): PlaytestErrorView {
  if (!(error instanceof ApiError)) {
    return { title: "Không kết nối được máy chủ", message: error instanceof Error && error.message ? error.message : fallback, fieldErrors: [], fatal: false };
  }
  const message = (error.code ? codeMessages[error.code] : undefined) ?? statusMessages[error.status] ?? (error.message || fallback);
  const title = error.status === 403 ? "Không có quyền chạy thử"
    : error.status === 404 ? "Không tìm thấy hoặc ngoài phạm vi của bạn"
      : error.status === 429 ? "Tạm thời bị giới hạn tần suất"
        : error.status === 503 ? "Tính năng chưa sẵn sàng"
          : error.status === 401 ? "Hết phiên đăng nhập"
            : "Máy chủ từ chối yêu cầu";
  return {
    status: error.status,
    code: error.code,
    title,
    message,
    retryAfterSeconds: error.retryAfterSeconds,
    fieldErrors: error.fieldErrors.map((item) => ({ path: item.path, message: item.message })),
    fatal: error.status === 401 || error.status === 403 || error.status === 404,
  };
}

/**
 * Whether the server may have executed the call. Network failure or 5xx: unknown, so the SAME Idempotency-Key must be
 * kept for the retry. A definite 4xx answer means it was rejected: the next attempt is a new intent with a new key.
 */
export function outcomeIsUnknown(error: unknown) {
  return !(error instanceof ApiError) || error.status >= 500 || error.status === 429;
}
