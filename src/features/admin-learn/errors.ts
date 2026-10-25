import { ApiError } from "@/api/types/common";

export type Issue = { code: string; path: string; message: string };

/** How the UI should treat a failed CMS command. */
export type LearnErrorKind =
  /** 412/428: the resource moved on; keep the user's input, reload to compare. */
  | "stale"
  /** Network, 5xx, 429: nothing is known to have been applied; retrying uses the SAME Idempotency-Key. */
  | "retry"
  /** 422/400: the content is wrong; fix it. */
  | "invalid"
  /** 409: the current state does not allow it (published, deleted, source not approved, slug taken...). */
  | "conflict"
  /** 401/403. */
  | "denied"
  | "notFound"
  | "other";

export type LearnErrorView = { kind: LearnErrorKind; code: string | null; title: string; message: string; issues: Issue[] };

/** CONTENT_INVALID carries `issues: [{code,path,message}]` (not the ProblemDetails `errors` map). */
export function issuesOf(error: unknown): Issue[] {
  if (!(error instanceof ApiError)) return [];
  const raw = error.payload?.issues;
  const issues: Issue[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      if (typeof record.message === "string") issues.push({ code: typeof record.code === "string" ? record.code : "INVALID", path: typeof record.path === "string" ? record.path : "$", message: record.message });
    }
  }
  if (issues.length === 0) for (const field of error.fieldErrors) issues.push({ code: field.code, path: field.path || "$", message: field.message });
  return issues;
}

const issueMessages: Record<string, string> = {
  MARKUP_NOT_ALLOWED: "Chỉ nhận văn bản thuần: không dùng thẻ HTML, iframe hay script.",
  LEARN_MEDIA_INVALID: "Dùng liên kết đầy đủ từ YouTube, Facebook hoặc TikTok (không nhận liên kết rút gọn).",
  FIELD_UNKNOWN: "Trường này không thuộc loại khối đang dùng nên máy chủ từ chối. Xóa khối hoặc trường đó.",
  VALUE_UNSUPPORTED: "Giá trị hoặc loại khối không được hỗ trợ.",
  STRING_INVALID: "Văn bản trống, quá dài hoặc chứa ký tự điều khiển.",
  FIELD_REQUIRED: "Trường này là bắt buộc.",
  URL_INVALID: "Dùng đường dẫn https tuyệt đối, không chứa thông tin đăng nhập.",
  VIDEO_REQUIRED: "Bài loại Video cần ít nhất một khối video.",
  SITUATIONS_INVALID: "Tối đa 20 tình huống, không trùng nhau.",
  SOURCES_INVALID: "Tối đa 20 nguồn, vai trò Primary/Reference/Transcript, không trùng.",
  TYPE_INVALID: "Mỗi khối phải là một đối tượng có trường type.",
  CONTENT_TOO_LARGE: "Nội dung bài tối đa 256 KB.",
};

/** A backend validation issue as the editor shows it: Vietnamese explanation plus the code and path for support. */
export function translateIssue(issue: Issue): { path: string; message: string } {
  const text = issueMessages[issue.code] ?? issue.message;
  return { path: issue.path, message: `${text} [${issue.code}${issue.path && issue.path !== "$" ? ` ${issue.path}` : ""}]` };
}

const messages: Record<string, { kind: LearnErrorKind; title: string; message: string }> = {
  LEARN_SOURCE_NOT_APPROVED: { kind: "conflict", title: "Có nguồn chưa được duyệt", message: "Bản này trích dẫn nguồn Common chưa Approved. Bản nháp vẫn lưu được, nhưng chỉ xuất bản được khi mọi nguồn đã được duyệt." },
  LEARN_SOURCE_INVALID: { kind: "invalid", title: "Nguồn không hợp lệ", message: "Chỉ trích dẫn được nguồn Common. Hãy bỏ nguồn tổ chức hoặc nguồn không tồn tại." },
  LEARN_SITUATION_INVALID: { kind: "invalid", title: "Tình huống không dùng được", message: "Có tình huống không tồn tại hoặc đã ngừng hoạt động. Bỏ nó khỏi bài rồi thử lại." },
  LEARN_VERSION_PUBLISHED: { kind: "conflict", title: "Bản này đã xuất bản", message: "Bản đã xuất bản là bất biến. Tạo bản nháp mới từ nội dung của bạn để tiếp tục chỉnh sửa." },
  LEARN_POST_DELETED: { kind: "conflict", title: "Bài đã bị xóa", message: "Khôi phục bài trước khi sửa, tạo bản nháp hay xuất bản." },
  LEARN_STATE_CONFLICT: { kind: "conflict", title: "Trạng thái bài không cho phép", message: "Trạng thái hiện tại của bài không cho phép thao tác này (có thể đã đổi ở nơi khác). Tải lại để xem trạng thái mới." },
  SLUG_EXISTS: { kind: "conflict", title: "Slug đã được dùng", message: "Đã có bài khác dùng slug này. Chọn một slug khác." },
  IDEMPOTENCY_KEY_CONFLICT: { kind: "conflict", title: "Mã thao tác bị dùng cho nội dung khác", message: "Đóng hộp thoại rồi thử lại để tạo một thao tác mới." },
  LEARN_MEDIA_INVALID: { kind: "invalid", title: "Video không hợp lệ", message: "Dùng liên kết đầy đủ từ YouTube, Facebook hoặc TikTok. Liên kết rút gọn (như fb.watch), mã nhúng và các trang khác không được nhận." },
  CONTENT_INVALID: { kind: "invalid", title: "Nội dung chưa đạt yêu cầu", message: "Máy chủ từ chối nội dung. Sửa các điểm bên dưới rồi lưu lại." },
  CONTENT_TOO_LARGE: { kind: "invalid", title: "Nội dung quá lớn", message: "Nội dung bài tối đa 256 KB." },
  VALIDATION_ERROR: { kind: "invalid", title: "Dữ liệu chưa hợp lệ", message: "Kiểm tra lại các trường rồi thử lại." },
};

export function describeLearnError(error: unknown): LearnErrorView {
  if (!(error instanceof ApiError)) {
    return { kind: "retry", code: null, title: "Không kết nối được tới máy chủ", message: "Nội dung của bạn được giữ nguyên. Thử lại sẽ dùng cùng mã thao tác nên không bị ghi hai lần.", issues: [] };
  }
  const issues = issuesOf(error);
  const code = error.code ?? null;
  if (error.status === 412) return { kind: "stale", code, title: "Đã có thay đổi ở nơi khác", message: "Phiên bản bạn mở không còn là bản mới nhất. Nội dung của bạn vẫn được giữ lại; tải bản mới để đối chiếu.", issues };
  if (error.status === 428 || code === "INVALID_IF_MATCH") return { kind: "stale", code, title: "Thiếu thông tin phiên bản", message: "Tải lại bài rồi thử lại.", issues };
  if (error.status === 401) return { kind: "denied", code, title: "Phiên đăng nhập đã hết hạn", message: "Đăng nhập lại. Nội dung đang nhập vẫn được giữ trong trang này.", issues };
  if (error.status === 403) return { kind: "denied", code, title: "Không có quyền", message: "Chỉ quản trị FET3D được quản lý bài học.", issues };
  if (error.status === 404) return { kind: "notFound", code, title: "Không tìm thấy", message: "Bài hoặc phiên bản này không còn tồn tại.", issues };
  const known = code ? messages[code] : undefined;
  if (known) return { ...known, code, issues };
  if (error.status === 429 || error.status === 503) return { kind: "retry", code, title: "Máy chủ đang bận", message: error.retryAfterSeconds ? `Thử lại sau ${error.retryAfterSeconds} giây. Cùng mã thao tác sẽ được dùng lại.` : "Thử lại sau ít phút. Cùng mã thao tác sẽ được dùng lại.", issues };
  if (error.status === 409) return { kind: "conflict", code, title: "Trạng thái không cho phép", message: error.message, issues };
  if (error.status === 422 || error.status === 400) return { kind: "invalid", code, title: "Dữ liệu chưa hợp lệ", message: error.message, issues };
  return { kind: "retry", code, title: "Không thể hoàn tất", message: error.status >= 500 ? "Máy chủ đang gặp lỗi. Nội dung của bạn vẫn được giữ; bấm thử lại an toàn, không bị ghi hai lần." : `${error.message} Nội dung của bạn vẫn được giữ.`, issues };
}
