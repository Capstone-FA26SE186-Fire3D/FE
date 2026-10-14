import { ApiError } from "@/api/types/common";

export type LibraryIssue = { code: string; path: string; message: string };

/** How the UI should treat a failed Library request. */
export type LibraryErrorKind =
  /** 412/428: the resource moved on; keep the user's input, reload to compare. */
  | "stale"
  /** Network, 5xx, 429: nothing is known to have been applied; retrying sends the SAME Idempotency-Key. */
  | "retry"
  /** 422/400: the content is wrong; fix it. */
  | "invalid"
  /** 409: the current state does not allow it (code taken, version already Published...). */
  | "conflict"
  /** 401/403. */
  | "denied"
  | "notFound"
  | "other";

export type LibraryErrorView = { kind: LibraryErrorKind; code: string | null; title: string; message: string; issues: LibraryIssue[] };

/** `CONTENT_INVALID` carries `issues: [{code,path,message}]`; a ProblemDetails `errors` map is read as a fallback. */
export function issuesOf(error: unknown): LibraryIssue[] {
  if (!(error instanceof ApiError)) return [];
  const raw = error.payload?.issues;
  const issues: LibraryIssue[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      if (typeof record.message === "string") issues.push({ code: typeof record.code === "string" ? record.code : "INVALID", path: typeof record.path === "string" ? record.path : "$", message: record.message });
    }
  }
  if (issues.length === 0) for (const field of error.fieldErrors) issues.push({ code: field.code, path: field.path || "$", message: field.message });
  // The documented 422 for an unsupported rubric version may come as the top-level code with no issue list.
  if (issues.length === 0 && error.code === "RUBRIC_SCHEMA_VERSION_UNSUPPORTED") issues.push({ code: error.code, path: "$.payload.rubric.schema_version", message: error.message });
  return issues;
}

const issueMessages: Record<string, string> = {
  RUBRIC_SCHEMA_VERSION_UNSUPPORTED: 'schema_version của rubric không được máy chủ hỗ trợ. Chọn một phiên bản trong danh mục rubric (giá trị chuỗi, ví dụ "1"; số 1, "v1" hay "1.0" không phải bí danh).',
  RUBRIC_METRIC_UNSUPPORTED: "Chỉ số không thuộc danh sách máy chủ tính. Chọn chỉ số trong danh mục rubric.",
  EDITOR_SCHEMA_VERSION_UNSUPPORTED: "Template phải khai báo schemaVersion fet3d.editor/1.",
  FIELD_UNKNOWN: "Trường này không thuộc loại mẫu đang dùng nên máy chủ từ chối.",
  FIELD_REQUIRED: "Trường này là bắt buộc.",
  STRING_INVALID: "Văn bản trống, quá dài hoặc chứa ký tự điều khiển.",
  CAPABILITIES_INVALID: "Tối đa 50 mã năng lực, khác nhau, mỗi mã dạng chữ/số và _ . : - (tối đa 128 ký tự).",
  PROPERTIES_INVALID: "Tối đa 50 thuộc tính; mỗi giá trị là chuỗi, số hoặc đúng/sai.",
  CONTENT_TOO_LARGE: "Nội dung tối đa 256 KB.",
  ID_DUPLICATE: "Mã bị trùng.",
};

/** A backend validation issue as the form shows it: Vietnamese explanation plus the code for support. */
export function translateIssue(issue: LibraryIssue): string {
  return `${issueMessages[issue.code] ?? issue.message} [${issue.code}]`;
}

const messages: Record<string, { kind: LibraryErrorKind; title: string; message: string }> = {
  LIBRARY_CODE_EXISTS: { kind: "conflict", title: "Mã đã được dùng", message: "Đã có mục thư viện khác dùng mã này. Chọn một mã khác." },
  LIBRARY_VERSION_PUBLISHED: { kind: "conflict", title: "Phiên bản này đã xuất bản", message: "Phiên bản đã xuất bản là bất biến. Tạo phiên bản mới từ nội dung của bạn để tiếp tục chỉnh sửa." },
  IDEMPOTENCY_KEY_CONFLICT: { kind: "conflict", title: "Mã thao tác bị dùng cho nội dung khác", message: "Đóng hộp thoại rồi thử lại để tạo một thao tác mới." },
  CONTENT_INVALID: { kind: "invalid", title: "Nội dung chưa đạt yêu cầu", message: "Máy chủ từ chối nội dung. Sửa các điểm bên dưới rồi lưu lại." },
  CONTENT_TOO_LARGE: { kind: "invalid", title: "Nội dung quá lớn", message: "Nội dung tối đa 256 KB." },
  RUBRIC_SCHEMA_VERSION_UNSUPPORTED: { kind: "invalid", title: "schema_version của rubric không được hỗ trợ", message: "Sửa tại trường schema_version của rubric rồi lưu lại." },
  VALIDATION_ERROR: { kind: "invalid", title: "Dữ liệu chưa hợp lệ", message: "Kiểm tra lại các trường rồi thử lại." },
};

export function describeLibraryError(error: unknown): LibraryErrorView {
  if (!(error instanceof ApiError)) {
    return { kind: "retry", code: null, title: "Không kết nối được tới máy chủ", message: "Nội dung của bạn được giữ nguyên. Thử lại sẽ dùng cùng mã thao tác nên không bị ghi hai lần.", issues: [] };
  }
  const issues = issuesOf(error);
  const code = error.code ?? null;
  if (error.status === 412) return { kind: "stale", code, title: "Đã có thay đổi ở nơi khác", message: "Phiên bản bạn mở không còn là bản mới nhất. Nội dung của bạn vẫn được giữ lại; tải bản mới để đối chiếu.", issues };
  if (error.status === 428 || code === "INVALID_IF_MATCH") return { kind: "stale", code, title: "Thiếu thông tin phiên bản", message: "Tải lại rồi thử lại.", issues };
  if (error.status === 401) return { kind: "denied", code, title: "Phiên đăng nhập đã hết hạn", message: "Đăng nhập lại. Nội dung đang nhập vẫn được giữ trong trang này.", issues };
  if (error.status === 403) return { kind: "denied", code, title: "Không có quyền", message: "Tài khoản này không được dùng chức năng thư viện này.", issues };
  if (error.status === 404) return { kind: "notFound", code, title: "Không tìm thấy", message: "Mục hoặc phiên bản này không còn khả dụng (đã ngừng dùng hoặc chưa xuất bản).", issues };
  const known = code ? messages[code] : undefined;
  if (known) return { ...known, code, issues };
  if (error.status === 429 || error.status === 503) return { kind: "retry", code, title: "Máy chủ đang bận", message: error.retryAfterSeconds ? `Thử lại sau ${error.retryAfterSeconds} giây. Cùng mã thao tác sẽ được dùng lại.` : "Thử lại sau ít phút. Cùng mã thao tác sẽ được dùng lại.", issues };
  if (error.status === 409) return { kind: "conflict", code, title: "Trạng thái không cho phép", message: error.message, issues };
  if (error.status === 422 || error.status === 400) return { kind: "invalid", code, title: "Dữ liệu chưa hợp lệ", message: error.message, issues };
  return { kind: "retry", code, title: "Không thể hoàn tất", message: `Máy chủ trả lỗi${code ? ` (${code})` : ` ${error.status}`}. Nội dung của bạn vẫn được giữ; thử lại sẽ dùng cùng mã thao tác.`, issues };
}
