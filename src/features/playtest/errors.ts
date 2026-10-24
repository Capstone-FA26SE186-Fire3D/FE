import { ApiError } from "@/api/types/common";

/** Stable BE codes for the playtest endpoints (PlaytestLifecycle.cs, playtest-manual-test.md) with plain-language copy. */
const codeMessages: Record<string, string> = {
  DRAFT_SNAPSHOT_REQUIRED: "Bản nháp đã đổi so với phiên bản. Tạo phiên bản mới rồi dựng gói chạy thử cho phiên bản đó.",
  PLAYTEST_PACKAGE_REQUIRED: "Phiên bản này chưa có gói chạy thử đã dựng và kiểm tra đạt. Dựng loại gói chạy thử ở tab Dựng gói rồi thử lại.",
  RUNTIME_INCOMPATIBLE: "Gói không tương thích với phiên bản ứng dụng hiện tại. Hãy dựng lại gói.",
  PLAYTEST_ENTITLEMENT_REQUIRED: "Công trình này chưa có dịch vụ trả phí còn hiệu lực hoặc gói dùng thử đã hết lượt chạy thử.",
  PLAYTEST_LAUNCH_UNAVAILABLE: "Chức năng chạy thử chưa được bật. Chưa trừ lượt dùng thử.",
  PLAYTEST_HANDOFF_UNAVAILABLE: "Chức năng mở trên điện thoại chưa được bật. Chưa tạo mã nào.",
  PLAYTEST_HANDOFF_NOT_RECOVERABLE: "Không thể hiển thị lại mã đã tạo. Hãy tạo mã mới.",
  PLAYTEST_HANDOFF_EXPIRED: "Mã đã hết hạn hoặc đã bị thay bằng mã mới. Hãy cấp lại mã.",
  PLAYTEST_HANDOFF_USED: "Mã đã được một điện thoại khác dùng.",
  PLAYTEST_HANDOFF_REVOKED: "Mã đã bị thay thế hoặc hủy.",
  PLAYTEST_HANDOFF_ISSUER_INVALID: "Phiên đăng nhập đã tạo mã không còn hiệu lực. Đăng nhập lại rồi tạo mã mới.",
  PLAYTEST_HANDOFF_INVALID: "Mã không hợp lệ.",
  PLAYTEST_SESSION_MISMATCH: "Chỉ thiết bị đang giữ lượt chạy thử mới làm được thao tác này. Trang web chỉ theo dõi và hủy.",
  PLAYTEST_ALREADY_STARTED: "Đã bắt đầu chơi nên không chuyển sang thiết bị khác được.",
  PLAYTEST_ALREADY_LAUNCHED: "Đã chạy trên một thiết bị nên không chuyển sang thiết bị khác được.",
  PLAYTEST_TERMINAL: "Lượt chạy thử đã kết thúc.",
  PLAYTEST_GRANT_EXPIRED: "Mã mở bài đã hết hạn; mở lại trên điện thoại.",
  PLAYTEST_GRANT_STALE: "Đã có mã khởi chạy mới hơn.",
  IDEMPOTENCY_KEY_CONFLICT: "Yêu cầu trùng với một yêu cầu trước nhưng nội dung khác. Tải lại trang rồi thử lại.",
  IDEMPOTENCY_KEY_REQUIRED: "Yêu cầu thiếu thông tin. Tải lại trang rồi thử lại.",
  VALIDATION_ERROR: "Dữ liệu chưa hợp lệ.",
  UNAUTHORIZED: "Phiên đăng nhập không còn hiệu lực. Đăng nhập lại.",
};

const statusMessages: Record<number, string> = {
  401: "Phiên đăng nhập không còn hiệu lực. Đăng nhập lại.",
  403: "Chỉ tài khoản tổ chức của công trình mới chạy thử được.",
  404: "Không tìm thấy lượt chạy thử hoặc kịch bản này, hoặc nó không thuộc tổ chức của bạn.",
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
  const message = (error.code ? codeMessages[error.code] : undefined) ?? statusMessages[error.status] ?? (error.status >= 500 ? "Máy chủ đang gặp lỗi. Thử lại sau ít phút." : fallback);
  const title = error.status === 403 ? "Không có quyền chạy thử"
    : error.status === 404 ? "Không tìm thấy hoặc ngoài phạm vi của bạn"
      : error.status === 429 ? "Tạm thời bị giới hạn tần suất"
        : error.status === 503 ? "Tính năng chưa sẵn sàng"
          : error.status === 401 ? "Hết phiên đăng nhập"
            : "Không thực hiện được";
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
