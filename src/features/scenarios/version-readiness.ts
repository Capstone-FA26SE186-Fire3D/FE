import { ApiError } from "@/api/types/common";
import type { Tone } from "@/components/ui/status-badge";

import type { ProcessingJobDetail, Release, ReviewStatus, ValidationRun, VersionIssue, VersionReadiness } from "./version-types";

/** The three gates are independent: technical readiness, content approval and release never imply each other. */
export type GateState = {
  /** Short badge text. */
  label: string;
  tone: Tone;
  /** One sentence for the stepper. */
  detail: string;
  /** False when the server did not report this gate (older deployment or failed read); shown as "Chưa có dữ liệu". */
  known: boolean;
};

export const NO_DATA_TEXT = "Chưa có dữ liệu";

export function shortHash(value: string | null | undefined, length = 12) {
  if (!value) return "—";
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

const TERMINAL_JOB_STATUSES = ["succeeded", "failed", "cancelled", "canceled"];

export function isJobTerminal(status: string | undefined) {
  return !!status && TERMINAL_JOB_STATUSES.includes(status.toLowerCase());
}

export function isJobSucceeded(status: string | undefined) {
  return status?.toLowerCase() === "succeeded";
}

export function isBlockingSeverity(severity: string) {
  return ["error", "critical"].includes(severity.toLowerCase());
}

export type QaVerdict =
  | { kind: "none" }
  | { kind: "passed"; run: ValidationRun }
  | { kind: "failed"; run: ValidationRun; blockingIssues: VersionIssue[] };

/**
 * QA verdict of a job's newest validation run. `Passed` requires the run status Passed AND no Error/Critical issue on
 * that run. A succeeded job with no run is `none`, never Passed.
 */
export function qaVerdict(runs: ValidationRun[], issues: VersionIssue[]): QaVerdict {
  const run = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!run) return { kind: "none" };
  const blockingIssues = issues.filter((issue) => issue.validationRunId === run.id && isBlockingSeverity(issue.severity));
  if (run.status.toLowerCase() === "passed" && blockingIssues.length === 0) return { kind: "passed", run };
  return { kind: "failed", run, blockingIssues };
}

/** Plain-language meaning of the `missing` codes BE reports in readiness (the code itself stays out of the page). */
export const MISSING_TEXT: Record<string, string> = {
  PACKAGE_VALIDATION_REQUIRED: "Chưa có gói dựng xong và kiểm tra đạt cho phiên bản này.",
  QA_NOT_PASSED: "Lần kiểm tra tự động gần nhất không đạt.",
  QA_BLOCKERS_PRESENT: "Kiểm tra phát hiện lỗi chặn cần sửa.",
  CONFIRMATION_REQUIRED: "Chưa chốt gói phát hành (bấm “Chốt gói phát hành” ở tab Kiểm tra).",
  RUNTIME_ARTIFACT_REQUIRED: "Gói chưa sẵn sàng để chạy trên ứng dụng.",
  PROCESSING_REQUIRED: "Bản mô hình IFC chưa xử lý xong.",
  GEOMETRY_VALIDATION_REQUIRED: "Bản mô hình IFC chưa được kiểm tra.",
};

export function missingText(code: string) {
  return MISSING_TEXT[code] ?? "Còn một điều kiện chưa đạt. Tải lại trang; nếu vẫn còn, liên hệ hỗ trợ.";
}

export function technicalGate(input: { job?: ProcessingJobDetail; verdict?: QaVerdict; readiness?: VersionReadiness; hasJobs: boolean }): GateState {
  if (input.readiness?.confirmationReviewId) {
    return { label: "Đã chốt gói", tone: "success", known: true, detail: "Gói đã kiểm tra đạt và được chốt để phát hành." };
  }
  const status = input.job?.job.status;
  if (!input.job) {
    if (input.readiness?.packageJob && !input.hasJobs) {
      return { label: "Đang tải", tone: "neutral", known: true, detail: "Phiên bản đã có lượt dựng gói; đang tải kết quả." };
    }
    return input.hasJobs
      ? { label: "Chọn lượt dựng", tone: "neutral", known: true, detail: "Chọn một lượt dựng ở tab Dựng gói để xem kết quả." }
      : { label: "Chưa dựng gói", tone: "neutral", known: true, detail: "Dựng gói để hệ thống tự kiểm tra." };
  }
  if (!isJobTerminal(status)) return { label: "Đang dựng", tone: "info", known: true, detail: "Máy dựng đang xử lý; chưa có kết quả kiểm tra." };
  if (!isJobSucceeded(status)) return { label: "Dựng lỗi", tone: "danger", known: true, detail: "Dựng gói không thành công; xem tab Dựng gói và dựng lại." };
  if (!input.verdict || input.verdict.kind === "none") return { label: "Dựng xong, chờ kiểm tra", tone: "warning", known: true, detail: "Gói đã dựng nhưng chưa có kết quả kiểm tra tự động." };
  if (input.verdict.kind === "failed") return { label: "Kiểm tra không đạt", tone: "danger", known: true, detail: "Kiểm tra tự động phát hiện lỗi chặn." };
  return { label: "Kiểm tra đạt, chờ chốt", tone: "info", known: true, detail: "Kiểm tra đã đạt. Bấm “Chốt gói phát hành” ở tab Kiểm tra." };
}

/** Content approval gate from the state the server reports on the version (`reviewStatus`, `rejectReason`). */
export function approvalGate(reviewStatus?: ReviewStatus | string | null, rejectReason?: string | null): GateState {
  if (!reviewStatus) {
    return { label: NO_DATA_TEXT, tone: "pending", known: false, detail: "Chưa đọc được trạng thái duyệt. Tải lại trang; nếu vẫn thiếu, liên hệ hỗ trợ." };
  }
  const status = reviewStatus.toLowerCase();
  if (status === "notsubmitted") return { label: "Chưa gửi duyệt", tone: "neutral", known: true, detail: "Gửi để quản trị FET3D duyệt nội dung và tiêu chí chấm của phiên bản này." };
  if (status === "approved") return { label: "Đã duyệt", tone: "success", known: true, detail: "Quản trị FET3D đã duyệt nội dung và tiêu chí chấm của phiên bản này." };
  if (status === "rejected") return { label: "Bị từ chối", tone: "danger", known: true, detail: rejectReason ? `Lý do: ${rejectReason}. Sửa nội dung sẽ tạo phiên bản mới và phải gửi duyệt lại.` : "Sửa nội dung sẽ tạo phiên bản mới và phải gửi duyệt lại." };
  if (status === "submitted") return { label: "Đã gửi, chờ duyệt", tone: "info", known: true, detail: "Đang chờ quản trị FET3D duyệt." };
  return { label: reviewStatus, tone: "neutral", known: true, detail: "Trạng thái duyệt do hệ thống báo." };
}

export function releaseGate(release?: Release | null): GateState {
  if (!release) return { label: "Chưa có bản phát hành", tone: "neutral", known: true, detail: "Tạo được khi nội dung đã duyệt và gói đã chốt." };
  const status = release.status.toLowerCase();
  if (status === "published") return { label: "Đã phát hành", tone: "success", known: true, detail: "Học viên đã dùng được." };
  if (status === "revoked") return { label: "Đã thu hồi", tone: "danger", known: true, detail: release.revokedReason ? `Lý do: ${release.revokedReason}` : "Bản phát hành đã bị thu hồi." };
  return { label: "Đã tạo, chưa phát hành", tone: "warning", known: true, detail: "Học viên chưa dùng được. Bấm Phát hành; hệ thống kiểm tra lại duyệt, gói và dịch vụ của công trình." };
}

// ---- Error messages by code ----

export type ErrorContext = "snapshot" | "build" | "confirm" | "submit" | "release" | "publish" | "revoke" | "read";

const codeMessages: Record<string, string> = {
  SCENARIO_SNAPSHOT_REQUIRED: "Phiên bản này thiếu nội dung hoặc tiêu chí chấm. Hãy tạo phiên bản mới từ bản nháp.",
  IFC_SOURCE_NOT_VERIFIED: "Tệp IFC của công trình chưa tải lên xong. Hoàn tất tải IFC ở tab IFC rồi dựng gói.",
  IDEMPOTENCY_KEY_REQUIRED: "Yêu cầu thiếu thông tin. Hãy tải lại trang rồi thử lại.",
  IDEMPOTENCY_KEY_CONFLICT: "Yêu cầu trùng với một yêu cầu trước nhưng nội dung khác. Hãy tải lại trang rồi thử lại.",
  PRECONDITION_REQUIRED: "Bản nháp đã thay đổi hoặc chưa tải. Hãy tải lại bản nháp rồi thử lại.",
  PRECONDITION_FAILED: "Bản nháp đã thay đổi từ lần bạn tải. Chưa tạo phiên bản nào.",
  INVALID_IF_MATCH: "Bản nháp đã thay đổi. Hãy tải lại bản nháp.",
  READINESS_PROVENANCE_MISMATCH: "Kết quả kiểm tra không còn khớp với gói mới nhất (có thể vừa dựng lại). Tải lại trang rồi chốt lại.",
  READINESS_BLOCKED: "Kiểm tra chưa đạt hoặc còn lỗi chặn nên chưa chốt được gói.",
  CONFIRMATION_ALREADY_EXISTS: "Phiên bản này đã chốt một gói khác.",
  CONTENT_REVIEW_ALREADY_EXISTS: "Phiên bản này đã được gửi duyệt. Mỗi phiên bản chỉ gửi một lần; sửa nội dung sẽ tạo phiên bản mới.",
  CONTENT_APPROVAL_REQUIRED: "Cần quản trị FET3D duyệt nội dung của phiên bản này trước.",
  RELEASE_PROVENANCE_MISMATCH: "Gói đã chốt không còn khớp với kết quả kiểm tra mới nhất. Tải lại trang, chốt lại gói rồi thử lại.",
  PACKAGE_METADATA_MISMATCH: "Gói không tương thích với phiên bản ứng dụng hiện tại. Hãy dựng lại gói.",
  RELEASE_ALREADY_EXISTS: "Phiên bản này đã có bản phát hành.",
  PUBLISH_GATE_UNAVAILABLE: "Hệ thống chưa mở chức năng phát hành ở môi trường này. Bản phát hành vẫn giữ nguyên, chưa mở cho học viên.",
  BUILDING_ENTITLEMENT_REQUIRED: "Công trình chưa có dịch vụ trả phí còn hiệu lực. Gói dùng thử không đủ để phát hành.",
  CONFIRMATION_REQUIRED: "Chưa chốt gói phát hành ở tab Kiểm tra.",
  RELEASE_NOT_BUILT: "Bản phát hành này đã phát hành hoặc đã thu hồi nên không phát hành lại được.",
  RELEASE_READINESS_REQUIRED: "Phần kỹ thuật chưa đủ điều kiện phát hành.",
  RELEASE_QA_NOT_PASSED: "Gói của bản phát hành chưa kiểm tra đạt.",
  RELEASE_QA_BLOCKERS_PRESENT: "Gói của bản phát hành còn lỗi chặn.",
  RELEASE_ARTIFACT_REQUIRED: "Bản phát hành thiếu gói hợp lệ.",
  PACKAGE_COMPATIBILITY_REQUIRED: "Gói chưa tương thích với phiên bản ứng dụng hiện có.",
  TRAINING_UNAVAILABLE: "Bài huấn luyện của bản phát hành không còn khả dụng.",
  TRAINING_INACTIVE: "Bài huấn luyện của bản phát hành đang tắt.",
  BUILDING_ACCESS_REQUIRED: "Không có quyền truy cập công trình này.",
  UNAUTHORIZED: "Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.",
  FORBIDDEN: "Tài khoản này không có quyền thực hiện thao tác.",
  NOT_FOUND: "Không tìm thấy dữ liệu hoặc không thuộc tổ chức của bạn.",
  VALIDATION_ERROR: "Dữ liệu chưa hợp lệ.",
};

const statusFallback: Record<number, string> = {
  401: "Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.",
  403: "Tài khoản này không có quyền thực hiện thao tác.",
  404: "Không tìm thấy dữ liệu hoặc không thuộc tổ chức của bạn.",
  412: "Dữ liệu đã thay đổi từ lần bạn tải.",
  428: "Dữ liệu cần tải lại trước khi lưu. Hãy tải lại rồi thử lại.",
  429: "Quá nhiều yêu cầu. Hãy chờ rồi thử lại.",
  503: "Dịch vụ chưa sẵn sàng. Hãy thử lại sau.",
};

export type DescribedError = { code?: string; status?: number; message: string; fieldErrors: Array<{ code: string; path: string; message: string }>; retryAfterSeconds?: number };

export function describeError(error: unknown, fallback = "Đã xảy ra lỗi. Hãy thử lại."): DescribedError {
  if (error instanceof ApiError) {
    const byCode = error.code ? codeMessages[error.code] : undefined;
    return {
      code: error.code,
      status: error.status,
      // The server message is English and technical: show it only when nothing better is known.
      message: byCode ?? statusFallback[error.status] ?? (error.status >= 500 ? "Máy chủ đang gặp lỗi. Hãy thử lại sau ít phút." : fallback),
      fieldErrors: error.fieldErrors,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return { message: error instanceof Error && error.message ? error.message : fallback, fieldErrors: [] };
}

/** Top-level keys whose JSON differs between two draft states; used to compare a stale draft with the reloaded one. */
export function changedTopLevelKeys(before: unknown, after: unknown): string[] {
  const left = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const right = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}
