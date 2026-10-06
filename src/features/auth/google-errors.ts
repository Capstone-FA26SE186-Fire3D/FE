import { ApiError } from "@/api/types/common";

export function googleErrorMessage(error: unknown) {
  const code = error instanceof ApiError ? error.payload?.code : typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Bạn đã hủy đăng nhập Google. Có thể thử lại khi sẵn sàng.";
  if (code === "auth/popup-blocked") return "Trình duyệt đã chặn cửa sổ Google. Cho phép cửa sổ bật lên rồi thử lại.";
  if (code === "auth/network-request-failed" || error instanceof TypeError) return "Không thể kết nối. Kiểm tra mạng rồi thử lại Google.";
  if (code === "ONBOARDING_TOKEN_EXPIRED" || code === "ONBOARDING_TOKEN_INVALID") return "Xác minh Google đã hết hạn hoặc không còn hiệu lực. Hãy thử lại Google.";
  if (code === "ONBOARDING_ALREADY_COMPLETED") return "Tài khoản đã được tạo. Bấm Tiếp tục với Google để đăng nhập.";
  if (code === "IDEMPOTENCY_KEY_CONFLICT") return "Yêu cầu này đã được hoàn tất với thông tin khác. Bấm Tiếp tục với Google để kiểm tra tài khoản.";
  if (code === "ONBOARDING_RETRY_REQUIRED") return "Dịch vụ đang bận. Chờ một chút rồi bấm hoàn tất lại.";
  if (code === "GOOGLE_ONBOARDING_RATE_LIMITED") return "Bạn đã thử Google nhiều lần. Chờ hết thời gian bên dưới rồi thử lại.";
  if (code === "GOOGLE_PROVIDER_UNAVAILABLE") return "Dịch vụ Google tạm thời không khả dụng. Hãy thử lại sau.";
  if (code === "ACCOUNT_DISABLED") return "Tài khoản hoặc tổ chức đã bị khóa. Liên hệ quản trị viên để được hỗ trợ.";
  if (code === "ACCOUNT_LINK_REQUIRED" || code === "EMAIL_EXISTS") return "Email đã có tài khoản. Hãy đăng nhập bằng email; tài khoản Google chưa được liên kết.";
  return error instanceof Error ? error.message : "Không thể hoàn tất Google. Hãy thử lại.";
}
