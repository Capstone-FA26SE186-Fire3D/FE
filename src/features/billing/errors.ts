import { ApiError } from "@/api/types/common";

/** Meaning of each billing/PayOS error code; the BE message is English, so the UI states the cause in Vietnamese. */
const CODE_MESSAGES: Record<string, string> = {
  BILLING_VALIDATION_FAILED: "Dữ liệu chưa hợp lệ. Kiểm tra các trường được đánh dấu rồi gửi lại.",
  ZERO_AMOUNT_NOT_SUPPORTED: "Tổng tiền báo giá bằng 0 nên chưa hỗ trợ phát hành/thanh toán. Hãy chọn gói có đơn giá lớn hơn 0.",
  IDEMPOTENCY_KEY_CONFLICT: "Khóa chống gửi trùng đã được dùng cho nội dung khác. Tải lại trang rồi thao tác lại để tạo khóa mới.",
  IDEMPOTENCY_KEY_REQUIRED: "Yêu cầu thiếu khóa chống gửi trùng (Idempotency-Key). Tải lại trang rồi thử lại; nếu lặp lại hãy báo cho đội kỹ thuật.",
  IF_MATCH_REQUIRED: "Yêu cầu thiếu phiên bản (If-Match). Tải lại dữ liệu rồi thử lại.",
  INVALID_IF_MATCH: "Phiên bản (ETag) không đúng định dạng. Tải lại dữ liệu rồi thử lại.",
  REVISION_MISMATCH: "Dữ liệu vừa được thay đổi ở nơi khác. Đã giữ nội dung bạn nhập; hãy tải bản mới để đối chiếu rồi lưu lại.",
  BILLING_STATE_CONFLICT: "Trạng thái hiện tại không cho phép thao tác này (ví dụ báo giá đã hết hạn hoặc không còn ở trạng thái chờ chấp nhận).",
  BILLING_RESOURCE_NOT_FOUND: "Không tìm thấy mục này trong phạm vi của bạn. Công trình cần có tên và địa chỉ, và gói phải đang hoạt động.",
  BILLING_ROLE_FORBIDDEN: "Tài khoản của bạn không có quyền thực hiện thao tác này.",
  ORGANIZATION_USER_REQUIRED: "Chỉ tài khoản tổ chức mới thực hiện được thao tác này.",
  ORGANIZATION_UNAVAILABLE: "Tổ chức hiện không hoạt động nên chưa thể thao tác thanh toán.",
  ACCOUNT_UNAVAILABLE: "Tài khoản không còn hoạt động. Hãy đăng nhập lại.",
  SESSION_REVOKED: "Phiên đăng nhập đã bị thu hồi. Hãy đăng nhập lại rồi tiếp tục.",
  PACKAGE_CODE_EXISTS: "Mã gói đã tồn tại. Chọn mã khác.",
  DISCOUNT_CODE_EXISTS: "Mã giảm giá đã tồn tại. Chọn mã khác.",
  BILLING_PAGINATION_INVALID: "Tham số phân trang không hợp lệ.",
  PAYOS_DISABLED: "Cổng thanh toán PayOS đang tắt ở môi trường này. Chưa thể tạo liên kết thanh toán.",
  PAYOS_NOT_CONFIGURED: "Cổng thanh toán PayOS chưa được cấu hình. Chưa thể tạo liên kết thanh toán.",
  PAYOS_QUOTATION_REQUIRED: "Thiếu mã báo giá để thanh toán.",
  QUOTATION_NOT_PAYABLE: "Chỉ báo giá đã được chấp nhận và còn hạn mới thanh toán được. Hãy chấp nhận lại hoặc yêu cầu báo giá mới.",
  QUOTATION_ALREADY_PAID: "Báo giá này đã được thanh toán. Xem trạng thái kích hoạt thay vì thanh toán lại.",
  PAYMENT_ALREADY_PAID: "Giao dịch đã được thanh toán nên không thể hủy.",
  BUILDING_UNAVAILABLE: "Có công trình trong báo giá không còn hoạt động. Hãy tạo báo giá mới.",
  PAYOS_PROVIDER_MISMATCH: "PayOS trả về dữ liệu không khớp báo giá nên giao dịch bị chặn. Hãy liên hệ hỗ trợ.",
  PAYOS_PROVIDER_TIMEOUT: "PayOS phản hồi chậm. Hệ thống sẽ tự thử lại; bạn có thể kiểm tra lại sau ít phút.",
  PAYOS_PROVIDER_UNAVAILABLE: "PayOS tạm thời không khả dụng. Hệ thống sẽ tự thử lại.",
  PAYOS_AWAITING_VERIFIED_WEBHOOK: "Đang chờ PayOS xác nhận thanh toán. Việc quay lại từ PayOS chưa phải bằng chứng đã thanh toán.",
  PAYOS_LINK_NOT_FOUND: "Liên kết thanh toán không còn tồn tại hoặc đã hết hạn. Hãy tạo lại thanh toán.",
  PAYOS_QUOTATION_EXPIRED: "Báo giá đã hết hạn nên không thể thanh toán.",
  PAYOS_QUOTATION_ALREADY_PAID: "Báo giá này đã được thanh toán.",
  PAYOS_BUILDING_UNAVAILABLE: "Có công trình trong báo giá không còn hoạt động.",
  PAYOS_SESSION_REVOKED: "Phiên đăng nhập đã bị thu hồi. Hãy đăng nhập lại.",
  PAYOS_SCOPE_UNAVAILABLE: "Tổ chức hoặc công trình không còn khả dụng để thanh toán.",
  PAYOS_RESPONSE_SIGNATURE_INVALID: "Không xác thực được phản hồi từ PayOS. Giao dịch bị chặn; hãy liên hệ hỗ trợ.",
  PAYOS_PROVISIONING_UNAVAILABLE: "Hệ thống kích hoạt dịch vụ tạm thời chưa sẵn sàng. Hệ thống sẽ tự thử lại.",
};

/** Message for a stable error code (also usable for `errorCode` fields in checkout/provisioning payloads). */
export function billingCodeMessage(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  if (CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (code.startsWith("PAYOS_PROVIDER_HTTP_")) return `PayOS trả lỗi HTTP ${code.slice("PAYOS_PROVIDER_HTTP_".length)}. Hệ thống sẽ tự thử lại.`;
  if (code.startsWith("PAYOS_")) return "Cổng thanh toán đang xử lý sự cố. Hệ thống sẽ tự thử lại; nếu kéo dài hãy liên hệ hỗ trợ kèm mã giao dịch.";
  return undefined;
}

/** User-facing text for a failed billing call. Never a raw stack/English server string when the code is known. */
export function billingErrorText(error: unknown, fallback = "Không thể hoàn tất thao tác. Hãy thử lại."): string {
  if (!(error instanceof ApiError)) return fallback;
  const byCode = billingCodeMessage(error.code);
  if (byCode) return byCode;
  switch (error.status) {
    case 400: return error.fieldErrors[0]?.message ?? "Dữ liệu chưa hợp lệ. Kiểm tra lại rồi gửi lại.";
    case 401: return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    case 403: return "Bạn không có quyền thực hiện thao tác này.";
    case 404: return "Không tìm thấy dữ liệu trong phạm vi của bạn.";
    case 409: return "Trạng thái hiện tại không cho phép thao tác này. Tải lại rồi thử lại.";
    case 412: return billingCodeMessage("REVISION_MISMATCH") ?? fallback;
    case 428: return billingCodeMessage("IF_MATCH_REQUIRED") ?? fallback;
    case 429: return error.retryAfterSeconds ? `Thao tác quá nhanh. Thử lại sau ${error.retryAfterSeconds} giây.` : "Thao tác quá nhanh. Thử lại sau ít phút.";
    case 503: return "Dịch vụ tạm thời chưa sẵn sàng. Thử lại sau ít phút.";
    default: return fallback;
  }
}

export const isStatus = (error: unknown, status: number) => error instanceof ApiError && error.status === status;
export const hasCode = (error: unknown, code: string) => error instanceof ApiError && error.code === code;
