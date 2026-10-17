import { ApiError } from "@/api/types/common";
import type { Tone } from "@/components/ui/status-badge";

import type { AiRequest, AiRequestStatus, AiResultType } from "./types";

const OPERATION: Record<string, string> = { ScenarioDraft: "Đề xuất kịch bản", Answer: "Hỏi đáp", TraineeAnswer: "Hỏi đáp của Trainee" };
export const operationLabel = (operation: string) => OPERATION[operation] ?? operation;
const AUDIENCE: Record<string, string> = { organization: "Tổ chức", trainee: "Trainee" };
export const audienceLabel = (audience: string) => AUDIENCE[audience] ?? audience;
const CONFIDENCE: Record<string, string> = { low: "Thấp", medium: "Trung bình", high: "Cao" };
export const confidenceLabel = (value: string) => CONFIDENCE[value] ?? value;

const STATUS: Record<AiRequestStatus, { label: string; tone: Tone }> = {
  Accepted: { label: "Đang chờ xử lý", tone: "pending" },
  Processing: { label: "Đang xử lý", tone: "pending" },
  Succeeded: { label: "Hoàn tất", tone: "success" },
  Failed: { label: "Thất bại", tone: "danger" },
  NeedsReconcile: { label: "Chờ đối soát", tone: "warning" },
  Rejected: { label: "Bị từ chối", tone: "danger" },
};

const RESULT_TYPE: Record<AiResultType, { label: string; tone: Tone }> = {
  KnowledgeAnswer: { label: "Câu trả lời", tone: "success" },
  ScenarioDraft: { label: "Đề xuất kịch bản", tone: "success" },
  InsufficientEvidence: { label: "Chưa đủ căn cứ", tone: "warning" },
  RejectedBySafetyGate: { label: "Bị cổng an toàn từ chối", tone: "danger" },
};

export const resultTypeLabel = (resultType: string) => RESULT_TYPE[resultType as AiResultType]?.label ?? resultType;

/**
 * Badge of a request. A Succeeded request that produced no content (InsufficientEvidence, RejectedBySafetyGate) shows
 * its `resultType` instead of "Hoàn tất", so it is never read as an answer.
 */
const badge = (status: string, resultType?: string | null) => {
  if (status === "Succeeded" && (resultType === "InsufficientEvidence" || resultType === "RejectedBySafetyGate")) return RESULT_TYPE[resultType];
  return STATUS[status as AiRequestStatus];
};
export const statusLabel = (status: string, resultType?: string | null) => badge(status, resultType)?.label ?? status;
export const statusTone = (status: string, resultType?: string | null): Tone => badge(status, resultType)?.tone ?? "neutral";

/** States the service may still change by itself: poll these, stop on anything else. NeedsReconcile waits for an admin, not for polling. */
export const isInFlight = (status: string) => status === "Accepted" || status === "Processing";

type Outcome = Pick<AiRequest, "status" | "resultType">;
export const hasResultType = (request: Outcome, resultType: AiResultType) => request.status === "Succeeded" && request.resultType === resultType;

/** Only a Succeeded ScenarioDraft carries a proposal (result.status NeedsUserEdit) that may be applied in the editor. */
export const isSuccessfulDraft = (request: Outcome) => hasResultType(request, "ScenarioDraft");

/** Stable failure codes the BE writes on a request (`OrganizationAi.cs`, `docs/organization-ai.md`). */
const FAILURE: Record<string, string> = {
  AI_PROVIDER_UNREACHABLE: "Không gửi được tới dịch vụ AI sau nhiều lần thử (yêu cầu chưa tới nơi xử lý).",
  AI_PROVIDER_REJECTED: "Dịch vụ AI từ chối yêu cầu (dữ liệu không được chấp nhận).",
  AI_OUTCOME_UNKNOWN: "Chưa rõ dịch vụ AI đã xử lý xong hay chưa (quá thời gian chờ hoặc mất kết nối).",
  AI_RESULT_INVALID: "Kết quả của dịch vụ AI không đúng cấu trúc nên bị giữ lại, không hiển thị.",
  AI_CITATION_INVALID: "Kết quả trích dẫn nguồn không hợp lệ nên bị giữ lại, không hiển thị.",
  AI_USAGE_INVALID: "Số liệu sử dụng do dịch vụ AI báo không hợp lệ.",
  AI_USAGE_EXCEEDS_RESERVATION: "Mức sử dụng vượt phần quota đã giữ chỗ nên không được chấp nhận.",
  AI_REQUEST_NOT_RECEIVED: "Dịch vụ AI xác nhận chưa nhận được yêu cầu này.",
  AI_SOURCE_HASH_MISMATCH: "Tài liệu nguồn đã thay đổi so với bản được ghim (mã băm không khớp) nên dịch vụ AI không dùng được.",
  AI_SOURCE_UNAVAILABLE: "Dịch vụ AI không đọc được tài liệu nguồn đã ghim.",
  AI_REVISION_NOT_PINNED: "Dịch vụ AI không nhận được revision mô hình đã ghim cho đề xuất.",
  AI_BIM_ANCHOR_INVALID: "Đề xuất neo vào phần tử không thuộc revision mô hình đã ghim nên bị giữ lại.",
  AI_REVISION_STALE: "Revision mô hình đã mất hình học được chấp nhận trong lúc xử lý nên đề xuất bị giữ lại.",
};
export const failureText = (code: string | null | undefined) => (code ? FAILURE[code] ?? `Mã lỗi: ${code}` : undefined);

export const SOURCE_KIND_LABEL: Record<string, string> = {
  KnowledgeSource: "Tri thức chuẩn (đã duyệt)",
  LibraryVersion: "Thư viện tổ chức",
  LearnPost: "Bài Learn",
};
export const sourceKindLabel = (kind: string) => SOURCE_KIND_LABEL[kind] ?? kind;

/** `422 CONTENT_INVALID` carries `issues[{code,path,message}]` (not ProblemDetails `errors`). */
export function issueMessages(error: unknown): Array<{ code: string; path: string; message: string }> {
  if (!(error instanceof ApiError)) return [];
  const raw = error.payload?.issues;
  const out: Array<{ code: string; path: string; message: string }> = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") {
        const entry = item as Record<string, unknown>;
        if (typeof entry.message === "string") out.push({ code: typeof entry.code === "string" ? entry.code : "", path: typeof entry.path === "string" ? entry.path : "", message: entry.message });
      }
    }
  }
  return out.length ? out : error.fieldErrors;
}

/** Message of one field (`$.question`, `$.prompt`, …) from either `issues` or `errors`. */
export function fieldIssue(error: unknown, path: string): string | undefined {
  const normalize = (value: string) => value.replace(/^\$\.?/, "").toLowerCase();
  return issueMessages(error).find((item) => normalize(item.path) === normalize(path))?.message;
}

const CODE: Record<string, string> = {
  AI_PROVIDER_UNAVAILABLE: "Dịch vụ AI chưa được bật hoặc chưa cấu hình ở môi trường này. Chưa có quota nào bị giữ.",
  AI_POLICY_UNAVAILABLE: "Chưa có chính sách AI đang hiệu lực cho thao tác này. Hãy báo PlatformAdmin cấu hình chính sách trước.",
  AI_QUOTA_EXHAUSTED: "Quota AI của tổ chức không đủ cho yêu cầu này. Hệ thống không tính vượt mức; hãy mua top-up trả trước rồi thử lại.",
  AI_INPUT_TOO_LARGE: "Nội dung dài hơn giới hạn của chính sách AI hiện hành. Hãy rút gọn rồi gửi lại.",
  AI_TOO_MANY_SOURCES: "Chọn quá nhiều nguồn so với chính sách AI hiện hành. Hãy bỏ bớt nguồn.",
  AI_NO_SOURCES: "Chưa có nguồn nào đủ điều kiện để trả lời. Nguồn tri thức cần được PlatformAdmin duyệt trước.",
  AI_SOURCE_NOT_ALLOWED: "Có nguồn không còn đủ điều kiện (đã hết hiệu lực hoặc không thuộc tổ chức). Tải lại danh sách nguồn rồi chọn lại.",
  AI_RECONCILE_NOT_ALLOWED: "Chỉ yêu cầu đang ở trạng thái Chờ đối soát mới đối soát được. Trạng thái đã thay đổi; hãy tải lại.",
  AI_POLICY_OVERLAP: "Khoảng hiệu lực chồng lên một chính sách khác của cùng thao tác. Chọn khoảng không giao nhau.",
  AI_REVISION_NOT_READY: "Công trình chưa có revision mô hình sẵn sàng cho kịch bản (hình học đã được chấp nhận, QA đạt). Hoàn tất xử lý IFC trước.",
  AI_DAILY_QUOTA_EXHAUSTED: "Bạn đã dùng hết lượt hỏi AI hôm nay. Lượt mới có lại vào đầu ngày hôm sau.",
  AI_BLOCKED_DURING_ASSESSMENT: "AI tạm khóa khi bạn đang có một bài đánh giá (Assessment) đang chạy. Hoàn tất bài rồi hỏi lại.",
  AI_CONTEXT_NOT_FOUND: "Nội dung bạn hỏi kèm (bài Learn, bài tập huấn hoặc kết quả) không còn truy cập được.",
  KNOWLEDGE_SOURCE_EXISTS: "Nguồn này (cùng phiên bản và nội dung) đã được đăng ký.",
  KNOWLEDGE_SOURCE_STATE_CONFLICT: "Trạng thái nguồn đã thay đổi nên không thực hiện được thao tác này. Hãy tải lại.",
  PRECONDITION_FAILED: "Nguồn vừa được thay đổi ở nơi khác (phiên bản không còn khớp). Hãy tải bản mới rồi thao tác lại.",
  PRECONDITION_REQUIRED: "Thiếu phiên bản (If-Match). Tải lại dữ liệu rồi thử lại.",
  INVALID_IF_MATCH: "Phiên bản (ETag) không đúng định dạng. Tải lại dữ liệu rồi thử lại.",
  IDEMPOTENCY_KEY_CONFLICT: "Khóa chống gửi trùng đã được dùng cho nội dung khác. Tải lại trang để tạo khóa mới.",
  IDEMPOTENCY_KEY_REQUIRED: "Yêu cầu thiếu khóa chống gửi trùng. Tải lại trang rồi thử lại.",
  NOT_FOUND: "Không tìm thấy mục này trong phạm vi của bạn (có thể đã bị xóa hoặc thuộc tổ chức khác).",
  VALIDATION_ERROR: "Tham số chưa hợp lệ.",
  CONTENT_INVALID: "Nội dung chưa hợp lệ. Kiểm tra các trường được đánh dấu.",
};

/** User-facing text for a failed AI call. A known BE code wins over the (English) server message. */
export function aiErrorText(error: unknown, fallback = "Không hoàn tất được thao tác. Hãy thử lại."): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code && CODE[error.code] && error.code !== "CONTENT_INVALID") return CODE[error.code];
  switch (error.status) {
    case 401: return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    case 402: return "Cần thanh toán hoặc kích hoạt quota trước khi dùng tiếp. Mở Quota AI để mua top-up.";
    case 403: return "Bạn không có quyền thực hiện thao tác này.";
    case 404: return CODE.NOT_FOUND;
    case 409: return error.message || "Thao tác xung đột với trạng thái hiện tại. Tải lại rồi thử lại.";
    case 412: return CODE.PRECONDITION_FAILED;
    case 422: return issueMessages(error)[0]?.message ?? CODE.CONTENT_INVALID;
    case 429: return error.retryAfterSeconds ? `Gửi quá nhanh. Thử lại sau ${error.retryAfterSeconds} giây.` : "Gửi quá nhanh. Hãy thử lại sau ít phút.";
    case 503: return error.retryAfterSeconds ? `Dịch vụ tạm thời chưa sẵn sàng. Thử lại sau ${error.retryAfterSeconds} giây.` : "Dịch vụ tạm thời chưa sẵn sàng. Hãy thử lại sau.";
    default: return error.status >= 500 ? "Máy chủ gặp sự cố. Hãy thử lại sau." : error.message || fallback;
  }
}

/** True when the HTTP call itself did not give a usable answer, so the request may or may not exist on the server. */
export function isUnknownOutcome(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true; // network failure, timeout, aborted by the browser, unreadable body
  if (error.status === 408) return true;
  // A coded BE answer (AI_PROVIDER_UNAVAILABLE, AI_POLICY_UNAVAILABLE: refused before anything is reserved) is definitive;
  // a bare 5xx (gateway, proxy, crash) says nothing about whether the request was stored.
  if (error.status >= 500) return !error.code;
  return false;
}
