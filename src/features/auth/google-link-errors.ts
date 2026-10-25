import { ApiError } from "@/api/types/common";
import { googleErrorMessage } from "./google-errors";

export type GoogleLinkProblem = {
  message: string;
  /** Field the message belongs to, when the failure is about one input. */
  field?: "currentPassword" | "newPassword";
  /** Seconds to wait before another attempt (429/503 Retry-After). */
  retryAfterSeconds?: number;
  /** The session is gone or must be renewed: offer to sign in again. */
  needsLogin?: boolean;
  /** The saved profile no longer matches the server: offer to reload it. */
  reload?: boolean;
};

function waitText(seconds?: number) {
  return seconds ? ` Thử lại sau ${seconds} giây.` : " Hãy thử lại sau ít phút.";
}

/**
 * Maps `POST /api/me/link-google` failures to Vietnamese copy. Messages never echo what the user typed,
 * the Firebase token or the server detail text.
 */
export function linkGoogleProblem(error: unknown): GoogleLinkProblem {
  if (!(error instanceof ApiError)) {
    // The request left the browser but no answer came back: the server may have finished and revoked the session.
    if (error instanceof TypeError) return { message: "Không nhận được phản hồi. Nếu Google đã được liên kết, phiên hiện tại sẽ bị thu hồi: tải lại trang hoặc đăng nhập lại để kiểm tra." };
    return { message: googleErrorMessage(error) };
  }
  const retryAfterSeconds = error.retryAfterSeconds;
  switch (error.code) {
    case "INVALID_CURRENT_PASSWORD": return { message: "Mật khẩu hiện tại không đúng.", field: "currentPassword" };
    case "VALIDATION_ERROR": {
      const password = error.fieldMessage("currentPassword");
      const token = error.fieldMessage("idToken");
      if (password) return { message: password, field: "currentPassword" };
      return { message: token ? "Xác thực Google không hợp lệ. Hãy thử lại Google." : "Thông tin liên kết chưa hợp lệ. Kiểm tra mật khẩu và thử lại." };
    }
    case "INVALID_FIREBASE_TOKEN": return { message: "Xác thực Google không hợp lệ hoặc đã hết hạn. Bấm liên kết để đăng nhập Google lại." };
    case "UNAUTHORIZED": return { message: "Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại rồi thử liên kết.", needsLogin: true };
    case "LOCAL_PASSWORD_REQUIRED": return { message: "Tài khoản này chưa có mật khẩu FET3D nên không dùng được bước liên kết. Hãy đặt mật khẩu sau khi xác thực Google.", reload: true };
    case "EMAIL_NOT_VERIFIED": return { message: "Email của tài khoản chưa được xác minh. Hoàn tất xác minh email rồi liên kết Google." };
    case "ACCOUNT_CHANGED": return { message: "Mật khẩu hoặc tài khoản vừa thay đổi. Đăng nhập lại rồi thử liên kết.", needsLogin: true };
    case "GOOGLE_ALREADY_LINKED": return { message: "Tài khoản Google này đã được liên kết với một tài khoản FET3D khác. Dùng tài khoản Google khác hoặc đăng nhập tài khoản kia." };
    case "GOOGLE_ACCOUNT_REPLACEMENT_FORBIDDEN": return { message: "Tài khoản của bạn đã liên kết với một tài khoản Google khác. FET3D không cho thay thế tài khoản Google đã liên kết.", reload: true };
    case "PASSWORD_RESET_PENDING": return { message: "Đang có yêu cầu khôi phục mật khẩu chưa hoàn tất. Hoàn tất khôi phục rồi liên kết Google." };
    case "GOOGLE_PROVIDER_UNAVAILABLE": return { message: `Dịch vụ xác minh Google tạm thời không khả dụng.${waitText(retryAfterSeconds)}`, retryAfterSeconds };
    default:
  }
  if (error.status === 429) return { message: `Bạn thao tác quá nhanh.${waitText(retryAfterSeconds)}`, retryAfterSeconds };
  if (error.status === 503) return { message: `Dịch vụ tạm thời không khả dụng.${waitText(retryAfterSeconds)}`, retryAfterSeconds };
  if (error.status === 401) return { message: "Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.", needsLogin: true };
  if (error.status === 403) return { message: "Tài khoản chưa đủ điều kiện để liên kết Google." };
  return { message: "Không thể liên kết Google. Vui lòng thử lại." };
}

/** Maps `POST /api/me/password` (first local password of a Google-only account) failures. */
export function setPasswordProblem(error: unknown): GoogleLinkProblem {
  if (!(error instanceof ApiError)) {
    if (error instanceof TypeError) return { message: "Không nhận được phản hồi. Nếu mật khẩu đã được đặt, mọi phiên sẽ bị thu hồi: tải lại trang hoặc đăng nhập lại để kiểm tra." };
    return { message: googleErrorMessage(error) };
  }
  const retryAfterSeconds = error.retryAfterSeconds;
  switch (error.code) {
    case "PASSWORD_ALREADY_SET": return { message: "Tài khoản đã có mật khẩu. Dùng mục Đổi mật khẩu bên dưới.", reload: true };
    case "RECENT_LOGIN_REQUIRED": return { message: "Cần đăng nhập Google lại trong vòng 5 phút trước khi đặt mật khẩu. Bấm nút để xác thực lại." };
    case "INVALID_FIREBASE_TOKEN": return { message: "Cần xác thực đúng tài khoản Google đã liên kết. Bấm nút để đăng nhập Google lại." };
    case "GOOGLE_LINK_REQUIRED": return { message: "Tài khoản này chưa liên kết Google nên không thể đặt mật khẩu theo cách này.", reload: true };
    case "ACCOUNT_CHANGED": return { message: "Tài khoản Google đã liên kết vừa thay đổi. Đăng nhập lại rồi thử lại.", needsLogin: true };
    case "PASSWORD_RESET_PENDING": return { message: "Đang có yêu cầu khôi phục mật khẩu chưa hoàn tất. Hoàn tất khôi phục rồi đặt mật khẩu." };
    case "UNAUTHORIZED": return { message: "Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.", needsLogin: true };
    case "VALIDATION_ERROR": {
      const password = error.fieldMessage("newPassword");
      return { message: password ?? "Mật khẩu mới chưa hợp lệ.", field: password ? "newPassword" : undefined };
    }
    case "GOOGLE_PROVIDER_UNAVAILABLE": return { message: `Dịch vụ xác minh Google tạm thời không khả dụng.${waitText(retryAfterSeconds)}`, retryAfterSeconds };
    default:
  }
  if (error.status === 429) return { message: `Bạn thao tác quá nhanh.${waitText(retryAfterSeconds)}`, retryAfterSeconds };
  if (error.status === 503) return { message: `Dịch vụ tạm thời không khả dụng.${waitText(retryAfterSeconds)}`, retryAfterSeconds };
  if (error.status === 401) return { message: "Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.", needsLogin: true };
  return { message: "Không thể đặt mật khẩu. Vui lòng thử lại." };
}
