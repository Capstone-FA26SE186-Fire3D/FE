/**
 * User-facing Vietnamese for failed requests. The API answers in English (`title`, `detail`, field `message`); that text is
 * for developers and is never shown as is. `ApiError` runs every message through here, so `error.message` and field
 * messages are already Vietnamese wherever a screen renders them. The original English stays on `ApiError.serverMessage`.
 */

/** Vietnamese letters with diacritics: a server message that has them was written for users and may be shown. */
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

export function isVietnamese(text: string | undefined | null): text is string {
  return Boolean(text && VIETNAMESE.test(text));
}

/** Server text only when it is already Vietnamese; otherwise the given fallback. */
export function serverText(text: string | undefined | null, fallback: string): string {
  return isVietnamese(text) ? text : fallback;
}

/** Stable API error codes seen across screens (feature modules keep their own, more specific maps). */
export const ERROR_TEXT: Record<string, string> = {
  // sign-in, registration, Google
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  AUTH_LOGIN_RATE_LIMITED: "Bạn đã đăng nhập sai quá nhiều lần. Hãy chờ một lúc rồi thử lại.",
  AUTH_REFRESH_RATE_LIMITED: "Hệ thống đang bận. Hãy thử lại sau ít phút.",
  ACCOUNT_DISABLED: "Tài khoản hoặc tổ chức đang bị khóa. Hãy liên hệ quản trị.",
  ACCOUNT_CHANGED: "Tài khoản vừa thay đổi ở nơi khác. Hãy đăng nhập lại.",
  ACCOUNT_LINK_REQUIRED: "Email này đã có tài khoản. Hãy đăng nhập bằng email và mật khẩu rồi liên kết Google trong hồ sơ.",
  EMAIL_EXISTS: "Email này đã được đăng ký.",
  USERNAME_EXISTS: "Tên người dùng này đã có người dùng.",
  PHONE_NUMBER_EXISTS: "Số điện thoại cá nhân đã được sử dụng.",
  ORGANIZATION_PHONE_EXISTS: "Số điện thoại đã được một tổ chức sử dụng.",
  EMAIL_NOT_VERIFIED: "Hãy xác minh email trước khi đăng nhập.",
  EMAIL_VERIFICATION_REQUIRED: "Hãy xác minh email trước khi tạo tài khoản.",
  INVALID_EMAIL: "Email chưa hợp lệ.",
  INVALID_PASSWORD: "Mật khẩu cần từ 6 đến 128 ký tự.",
  INVALID_CURRENT_PASSWORD: "Mật khẩu hiện tại không đúng.",
  INVALID_OTP: "Hãy nhập mã xác minh gồm 6 chữ số.",
  OTP_INVALID: "Mã xác minh sai hoặc đã hết hạn.",
  OTP_RATE_LIMITED: "Bạn yêu cầu mã quá nhiều lần. Hãy chờ một lúc rồi thử lại.",
  REGISTRATION_EXPIRED: "Lượt đăng ký này đã hết hạn. Hãy đăng ký lại để nhận mã mới.",
  REGISTRATION_PROOF_EXPIRED: "Mã xác minh đã hết hạn. Hãy yêu cầu mã mới.",
  INVALID_RESET_CODE: "Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được dùng. Hãy yêu cầu liên kết mới.",
  INVALID_VERIFICATION_TOKEN: "Liên kết xác minh đã hết hạn hoặc đã được dùng.",
  INVALID_REFRESH_TOKEN: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  INVALID_FIREBASE_TOKEN: "Không xác minh được tài khoản Google. Hãy thử lại.",
  GOOGLE_PROVIDER_UNAVAILABLE: "Đăng nhập Google đang tạm gián đoạn. Hãy thử lại sau.",
  IDENTITY_UNAVAILABLE: "Dịch vụ đăng nhập đang tạm gián đoạn. Hãy thử lại sau.",
  INVALID_ORGANIZATION: "Tổ chức không khả dụng.",
  ORGANIZATION_CONFLICT: "Chưa tạo được tổ chức. Hãy thử lại.",
  // profile and avatar
  AVATAR_NOT_FOUND: "Chưa có ảnh đại diện.",
  AVATAR_UPLOAD_CHANGED: "Ảnh vừa thay đổi trước khi tải xong. Hãy tải lại ảnh.",
  AVATAR_UPLOAD_SUPERSEDED: "Ảnh này đã được thay bằng một thay đổi mới hơn.",
  AVATAR_UPLOAD_UNAVAILABLE: "Chưa tải được ảnh. Hãy thử lại.",
  INVALID_AVATAR_CONTENT: "Ảnh không hợp lệ. Hãy dùng ảnh tĩnh, tối đa 4096 × 4096 điểm ảnh.",
  INVALID_AVATAR_MEDIA_TYPE: "Ảnh phải là JPEG, PNG hoặc WebP.",
  INVALID_AVATAR_SIZE: "Ảnh tối đa 5 MB.",
  INVALID_AVATAR_UPLOAD: "Lượt tải ảnh đã hết hạn. Hãy chọn ảnh lại.",
  // generic
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy dữ liệu, hoặc dữ liệu không thuộc tổ chức của bạn.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Hãy chờ một lúc rồi thử lại.",
  ADMINISTRATION_RATE_LIMITED: "Bạn thao tác quá nhanh. Hãy chờ một lúc rồi thử lại.",
  PRECONDITION_FAILED: "Dữ liệu vừa được thay đổi ở nơi khác. Hãy tải lại rồi thử lại.",
  PRECONDITION_REQUIRED: "Dữ liệu cần tải lại trước khi lưu. Hãy tải lại rồi thử lại.",
  IF_MATCH_REQUIRED: "Dữ liệu cần tải lại trước khi lưu. Hãy tải lại rồi thử lại.",
  INVALID_IF_MATCH: "Dữ liệu cần tải lại trước khi lưu. Hãy tải lại rồi thử lại.",
  REVISION_MISMATCH: "Dữ liệu vừa được thay đổi ở nơi khác. Hãy tải lại rồi thử lại.",
  IDEMPOTENCY_KEY_REQUIRED: "Yêu cầu thiếu thông tin. Hãy tải lại trang rồi thử lại.",
  IDEMPOTENCY_KEY_CONFLICT: "Yêu cầu trùng với một yêu cầu trước nhưng nội dung khác. Hãy tải lại trang rồi thử lại.",
  VALIDATION_ERROR: "Thông tin chưa hợp lệ. Hãy kiểm tra lại.",
  SLUG_EXISTS: "Đường dẫn tổ chức này đã được dùng.",
  LAST_ADMIN: "Không thể khóa tài khoản quản trị cuối cùng.",
  SELF_DEACTIVATION: "Bạn không thể tự khóa tài khoản của mình.",
  ADMIN_EXISTS: "Đã có tài khoản quản trị.",
  BILLING_RESOURCE_NOT_FOUND: "Không tìm thấy gói dịch vụ.",
  BUILDING_MUTATION_FAILED: "Chưa lưu được công trình. Hãy thử lại.",
  IFC_UNSUPPORTED_FORMAT: "Tệp không phải mô hình IFC. Hãy xuất IFC từ Revit hoặc ArchiCAD rồi tải lại.",
  IFC_UPLOAD_EXPIRED: "Lượt tải IFC đã hết hạn. Hãy tải lại tệp.",
  IFC_UPLOAD_DISABLED: "Chức năng tải IFC đang tạm ngưng.",
  IFC_SOURCE_CHANGED: "Tệp đã thay đổi trong lúc tải. Hãy tải lại.",
  IFC_SOURCE_MISMATCH: "Tệp tải lên không khớp. Hãy tải lại.",
  IFC_STORAGE_UNAVAILABLE: "Kho lưu trữ đang bận. Hãy thử lại.",
  PREVIEW_STORAGE_UNAVAILABLE: "Chưa tải được hình 3D. Hãy thử lại sau.",
  EDITOR_SCHEMA_INVALID: "Bản nháp có chỗ chưa hợp lệ. Xem danh sách vấn đề rồi sửa.",
};

/** Field errors: the API names the field, so the sentence can say which one without echoing English. */
const FIELD_TEXT: Record<string, string> = {
  email: "Email chưa hợp lệ.",
  password: "Mật khẩu cần từ 6 đến 128 ký tự.",
  newpassword: "Mật khẩu mới cần từ 6 đến 128 ký tự.",
  currentpassword: "Mật khẩu hiện tại không đúng.",
  username: "Tên người dùng chưa hợp lệ.",
  fullname: "Họ tên chưa hợp lệ.",
  phonenumber: "Số điện thoại chưa hợp lệ.",
  phone: "Số điện thoại chưa hợp lệ.",
  code: "Mã chưa đúng.",
  otp: "Mã xác minh chưa đúng.",
  name: "Tên chưa hợp lệ.",
  address: "Địa chỉ chưa hợp lệ.",
  label: "Nhãn chưa hợp lệ.",
  reason: "Lý do chưa hợp lệ.",
  title: "Tiêu đề chưa hợp lệ.",
  slug: "Đường dẫn rút gọn chưa hợp lệ.",
  url: "Đường dẫn chưa hợp lệ.",
  question: "Câu hỏi chưa hợp lệ. Chỉ dùng văn bản thuần.",
  description: "Mô tả chưa hợp lệ.",
  learnerlimit: "Số học viên chưa hợp lệ.",
  durationmonths: "Thời hạn chỉ có thể là 6 hoặc 12 tháng.",
  aipolicyversionid: "Hãy chọn phiên bản chính sách AI.",
  quotaunit: "Đơn vị hạn mức chưa hợp lệ.",
  dailyunits: "Hạn mức mỗi ngày chưa hợp lệ.",
  reserveunits: "Mức tạm trừ chưa hợp lệ.",
  unitprice: "Đơn giá chưa hợp lệ.",
  effectivefrom: "Thời điểm bắt đầu chưa hợp lệ.",
  effectiveuntil: "Thời điểm kết thúc chưa hợp lệ.",
  versionlabel: "Nhãn bản IFC chưa hợp lệ.",
};

export function statusText(status: number, retryAfterSeconds?: number): string | undefined {
  if (status === 0) return "Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.";
  if (status === 400 || status === 422) return "Thông tin chưa hợp lệ. Hãy kiểm tra lại.";
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy dữ liệu, hoặc dữ liệu không thuộc tổ chức của bạn.";
  if (status === 409) return "Thao tác không thực hiện được ở trạng thái hiện tại. Hãy tải lại rồi thử lại.";
  if (status === 412) return "Dữ liệu vừa được thay đổi ở nơi khác. Hãy tải lại rồi thử lại.";
  if (status === 428) return "Dữ liệu cần tải lại trước khi lưu. Hãy tải lại rồi thử lại.";
  if (status === 413) return "Tệp quá lớn.";
  if (status === 429 || status === 503) return retryAfterSeconds ? `Hệ thống đang bận. Hãy thử lại sau ${retryAfterSeconds} giây.` : "Hệ thống đang bận. Hãy thử lại sau ít phút.";
  if (status >= 500) return "Máy chủ đang gặp lỗi. Hãy thử lại sau ít phút.";
  return undefined;
}

/** The sentence an `ApiError` carries: by code, else the server text if it is Vietnamese, else by HTTP status. */
export function friendlyMessage(code: string | undefined, status: number, serverMessage: string, retryAfterSeconds?: number): string {
  return (code ? ERROR_TEXT[code] : undefined)
    ?? (isVietnamese(serverMessage) ? serverMessage : undefined)
    ?? statusText(status, retryAfterSeconds)
    ?? "Không thực hiện được. Hãy thử lại.";
}

/** The sentence for one field error: Vietnamese server text, else by code, else by field name. */
export function friendlyFieldMessage(path: string, code: string | undefined, serverMessage: string): string {
  if (isVietnamese(serverMessage)) return serverMessage;
  if (code && ERROR_TEXT[code] && code !== "VALIDATION_ERROR") return ERROR_TEXT[code];
  const field = path.replace(/^\$\.?/, "").split(/[.[\]]/).filter(Boolean).pop()?.toLowerCase() ?? "";
  return FIELD_TEXT[field] ?? "Giá trị chưa hợp lệ.";
}
