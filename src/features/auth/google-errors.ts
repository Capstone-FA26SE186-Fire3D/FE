import { ApiError } from "@/api/types/common";

export function googleErrorMessage(error: unknown) {
  const code = error instanceof ApiError ? error.payload?.code : typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Bạn đã hủy đăng nhập Google. Có thể thử lại khi sẵn sàng.";
  if (code === "auth/popup-blocked") return "Trình duyệt đã chặn cửa sổ Google. Cho phép cửa sổ bật lên rồi thử lại.";
  if (code === "auth/network-request-failed" || error instanceof TypeError) return "Không thể kết nối. Kiểm tra mạng rồi thử lại Google.";
  if (code === "ONBOARDING_TOKEN_EXPIRED" || code === "ONBOARDING_TOKEN_INVALID") return "Xác minh Google đã hết hạn hoặc không còn hiệu lực. Hãy thử lại Google.";
  if (code === "ACCOUNT_LINK_REQUIRED" || code === "EMAIL_EXISTS") return "Email đã có tài khoản. Hãy đăng nhập bằng email; tài khoản Google chưa được liên kết.";
  return error instanceof Error ? error.message : "Không thể hoàn tất Google. Hãy thử lại.";
}
