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

/** Plain-language meaning of the `missing` codes BE reports in readiness (`PACKAGE_VALIDATION_REQUIRED`…). */
export const MISSING_TEXT: Record<string, string> = {
  PACKAGE_VALIDATION_REQUIRED: "Chưa có validation run cho package build của phiên bản này.",
  QA_NOT_PASSED: "QA chưa đạt (validation run không Passed).",
  QA_BLOCKERS_PRESENT: "Còn issue Error/Critical chặn.",
  CONFIRMATION_REQUIRED: "Chưa xác nhận kỹ thuật (confirm-for-training).",
  RUNTIME_ARTIFACT_REQUIRED: "Chưa có artifact runtime sẵn sàng.",
  PROCESSING_REQUIRED: "Revision IFC chưa được xử lý.",
  GEOMETRY_VALIDATION_REQUIRED: "Revision chưa có kiểm tra geometry.",
};

export function missingText(code: string) {
  return MISSING_TEXT[code] ?? code;
}

export function technicalGate(input: { job?: ProcessingJobDetail; verdict?: QaVerdict; readiness?: VersionReadiness; hasJobs: boolean }): GateState {
  if (input.readiness?.confirmationReviewId) {
    return { label: "Đã xác nhận kỹ thuật", tone: "success", known: true, detail: "Máy chủ đã ghi nhận xác nhận kỹ thuật cho phiên bản này. Việc này không thay thế duyệt nội dung." };
  }
  const status = input.job?.job.status;
  if (!input.job) {
    if (input.readiness?.packageJob && !input.hasJobs) {
      return { label: "Đang tải job", tone: "neutral", known: true, detail: "Phiên bản đã có job package build; đang tải kết quả." };
    }
    return input.hasJobs
      ? { label: "Chọn job để xem", tone: "neutral", known: true, detail: "Version đã có job package build; chọn một job để xem kết quả." }
      : { label: "Chưa chạy package build", tone: "neutral", known: true, detail: "Chạy package build để có kết quả QA kỹ thuật." };
  }
  if (!isJobTerminal(status)) return { label: "Đang xử lý", tone: "info", known: true, detail: "Job đang chờ hoặc chạy; chưa có kết quả QA." };
  if (!isJobSucceeded(status)) return { label: "Job thất bại", tone: "danger", known: true, detail: "Job không hoàn tất; xem nguyên nhân và chạy lại." };
  if (!input.verdict || input.verdict.kind === "none") return { label: "Job xong, chưa có QA", tone: "warning", known: true, detail: "Job Succeeded chưa phải QA Passed: chưa có validation run để xác nhận." };
  if (input.verdict.kind === "failed") return { label: "QA không đạt", tone: "danger", known: true, detail: "Validation run Failed hoặc còn issue Error/Critical." };
  return { label: "QA đạt, chờ xác nhận", tone: "info", known: true, detail: "QA Passed. Cần xác nhận kỹ thuật (confirm-for-training) trước khi tạo release." };
}

/** Content approval gate from the state the server reports on the version (`reviewStatus`, `rejectReason`). */
export function approvalGate(reviewStatus?: ReviewStatus | string | null, rejectReason?: string | null): GateState {
  if (!reviewStatus) {
    return { label: NO_DATA_TEXT, tone: "pending", known: false, detail: "Máy chủ không trả trạng thái duyệt của phiên bản này. Tải lại; nếu vẫn thiếu, kiểm tra phiên bản triển khai của BE." };
  }
  const status = reviewStatus.toLowerCase();
  if (status === "notsubmitted") return { label: "Chưa gửi duyệt", tone: "neutral", known: true, detail: "Gửi duyệt để PlatformAdmin duyệt đúng hash nội dung và rubric của phiên bản này." };
  if (status === "approved") return { label: "Đã duyệt", tone: "success", known: true, detail: "PlatformAdmin đã duyệt đúng hash nội dung và rubric đã gửi." };
  if (status === "rejected") return { label: "Bị từ chối", tone: "danger", known: true, detail: rejectReason ? `Lý do: ${rejectReason}. Sửa nội dung sẽ tạo version mới và phải gửi duyệt lại.` : "Sửa nội dung sẽ tạo version mới và phải gửi duyệt lại." };
  if (status === "submitted") return { label: "Đã gửi, chờ duyệt", tone: "info", known: true, detail: "Đang chờ PlatformAdmin duyệt." };
  return { label: reviewStatus, tone: "neutral", known: true, detail: "Trạng thái duyệt do máy chủ báo." };
}

export function releaseGate(release?: Release | null): GateState {
  if (!release) return { label: "Chưa có release", tone: "neutral", known: true, detail: "Release chỉ tạo được sau khi nội dung được duyệt và xác nhận kỹ thuật." };
  const status = release.status.toLowerCase();
  if (status === "published") return { label: "Published", tone: "success", known: true, detail: "Đã phát hành." };
  if (status === "revoked") return { label: "Revoked", tone: "danger", known: true, detail: release.revokedReason ? `Đã thu hồi: ${release.revokedReason}` : "Đã thu hồi." };
  return { label: "Built, chưa phát hành", tone: "warning", known: true, detail: "Built chỉ là gói đã dựng. Phát hành còn phải qua cổng kiểm tra lại duyệt nội dung, readiness và quyền dịch vụ của Building." };
}

// ---- Error messages by code ----

export type ErrorContext = "snapshot" | "build" | "confirm" | "submit" | "release" | "publish" | "revoke" | "read";

const codeMessages: Record<string, string> = {
  SCENARIO_SNAPSHOT_REQUIRED: "Version này chưa có snapshot đầy đủ (nội dung, rubric hoặc hash). Hãy tạo version mới từ draft.",
  IFC_SOURCE_NOT_VERIFIED: "Revision IFC chưa có nguồn đã xác minh upload. Hãy tải lên và hoàn tất xác minh IFC trước khi dựng package.",
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu Idempotency-Key. Hãy tải lại trang rồi thử lại.",
  IDEMPOTENCY_KEY_CONFLICT: "Yêu cầu trước đó dùng cùng khóa nhưng nội dung khác. Hãy thay đổi nội dung hoặc tải lại trang để tạo yêu cầu mới.",
  PRECONDITION_REQUIRED: "Thiếu If-Match của draft. Hãy tải lại draft rồi thử lại.",
  PRECONDITION_FAILED: "Draft đã thay đổi từ lần bạn tải. Chưa tạo snapshot nào.",
  INVALID_IF_MATCH: "ETag của draft không hợp lệ. Hãy tải lại draft.",
  READINESS_PROVENANCE_MISMATCH: "Validation run không khớp version/artifact/annotation set hiện hành (hoặc không phải attempt hiện hành). Chạy lại package build hoặc kiểm tra annotation set.",
  READINESS_BLOCKED: "QA chưa đạt: run không Passed, artifact chưa runtime-ready hoặc còn issue Error/Critical.",
  CONFIRMATION_ALREADY_EXISTS: "Version này đã có xác nhận kỹ thuật với validation run hoặc annotation set khác.",
  CONTENT_REVIEW_ALREADY_EXISTS: "Version này đã được gửi duyệt. Mỗi version chỉ gửi một lần; sửa nội dung sẽ tạo version mới.",
  CONTENT_APPROVAL_REQUIRED: "Release cần nội dung đã được PlatformAdmin duyệt đúng hash nội dung và rubric của version này.",
  RELEASE_PROVENANCE_MISMATCH: "Dữ liệu release không khớp xác nhận kỹ thuật, validation run hiện hành, artifact hoặc còn issue Error/Critical. Kiểm tra mã xác nhận và artifact.",
  PACKAGE_METADATA_MISMATCH: "Metadata package không tương thích runtime hoặc không khớp manifest do worker tạo.",
  RELEASE_ALREADY_EXISTS: "Cặp revision và version này đã có release.",
  PUBLISH_GATE_UNAVAILABLE: "Cổng phát hành chưa được bật ở môi trường này. Release vẫn ở trạng thái Built.",
  BUILDING_ENTITLEMENT_REQUIRED: "Công trình chưa có dịch vụ trả phí còn hiệu lực. Gói dùng thử không đủ để phát hành.",
  CONFIRMATION_REQUIRED: "Chưa có xác nhận kỹ thuật đúng revision, phiên bản và validation run.",
  RELEASE_NOT_BUILT: "Release không còn ở trạng thái Built nên không thể phát hành lại.",
  RELEASE_READINESS_REQUIRED: "Readiness kỹ thuật của release chưa đủ điều kiện phát hành.",
  RELEASE_QA_NOT_PASSED: "QA của release chưa đạt.",
  RELEASE_QA_BLOCKERS_PRESENT: "Release còn issue Error/Critical chặn.",
  RELEASE_ARTIFACT_REQUIRED: "Release thiếu artifact runtime hợp lệ.",
  PACKAGE_COMPATIBILITY_REQUIRED: "Package chưa tương thích với runtime hiện có.",
  TRAINING_UNAVAILABLE: "Training của release không còn khả dụng.",
  TRAINING_INACTIVE: "Training của release không ở trạng thái Active.",
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
  428: "Thiếu điều kiện If-Match. Hãy tải lại rồi thử lại.",
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
      message: byCode ?? statusFallback[error.status] ?? (error.message || fallback),
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
