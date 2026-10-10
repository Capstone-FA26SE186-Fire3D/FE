import type { Tone } from "@/components/ui/status-badge";
import type { IssueSeverity, JobQa, ProcessingJob, ProcessingJobDetail, RevisionIssue, ValidationRun } from "./types";

/** Everything the UI knows about the newest processing job of one revision. */
export type RevisionPipeline = {
  job: ProcessingJob | null;
  detail: ProcessingJobDetail | null;
  qa: JobQa | null;
};

export const emptyPipeline: RevisionPipeline = { job: null, detail: null, qa: null };

const TERMINAL_JOB_STATUSES = ["Succeeded", "Failed", "Cancelled"];

export function isTerminalJob(status: string | undefined | null) {
  return status ? TERMINAL_JOB_STATUSES.includes(status) : false;
}

export function jobLabel(status: string | undefined | null): { label: string; tone: Tone } {
  switch (status) {
    case "Queued": return { label: "Đang chờ worker", tone: "pending" };
    case "Running": return { label: "Đang xử lý", tone: "pending" };
    // Deliberately not "Hoàn thành/Đạt": the job finishing says nothing about QA.
    case "Succeeded": return { label: "Worker chạy xong", tone: "info" };
    case "Failed": return { label: "Xử lý thất bại", tone: "danger" };
    case "Cancelled": return { label: "Đã hủy", tone: "neutral" };
    default: return { label: status ?? "Chưa xử lý", tone: "neutral" };
  }
}

export function revisionLabel(status: string | undefined | null): { label: string; tone: Tone } {
  switch (status) {
    case "Draft": return { label: "Bản nháp", tone: "neutral" };
    case "Uploaded": return { label: "Đã tải lên", tone: "info" };
    case "Processing": return { label: "Đang xử lý", tone: "pending" };
    case "NeedsFix": return { label: "Cần sửa mô hình", tone: "warning" };
    case "ReadyForScenario": return { label: "Sẵn sàng soạn kịch bản", tone: "success" };
    case "ConfirmedForTraining": return { label: "Đã xác nhận kỹ thuật", tone: "success" };
    case "Rejected": return { label: "Bị từ chối", tone: "danger" };
    case "Failed": return { label: "Xử lý thất bại", tone: "danger" };
    case "Superseded": return { label: "Đã được thay thế", tone: "neutral" };
    default: return { label: status ?? "Không rõ", tone: "neutral" };
  }
}

export const severityOrder: IssueSeverity[] = ["Critical", "Error", "Warning", "Info"];

export function severityLabel(severity: string): { label: string; tone: Tone } {
  switch (severity) {
    case "Critical": return { label: "Nghiêm trọng", tone: "danger" };
    case "Error": return { label: "Lỗi", tone: "danger" };
    case "Warning": return { label: "Cảnh báo", tone: "warning" };
    case "Info": return { label: "Thông tin", tone: "info" };
    default: return { label: severity, tone: "neutral" };
  }
}

export function severityRank(severity: string) {
  const index = severityOrder.indexOf(severity as IssueSeverity);
  return index === -1 ? severityOrder.length : index;
}

export function countBySeverity(issues: Array<Pick<RevisionIssue, "severity">>) {
  const counts: Record<string, number> = { Critical: 0, Error: 0, Warning: 0, Info: 0 };
  for (const issue of issues) counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
  return counts;
}

export type QaVerdict = {
  state: "none" | "pending" | "unavailable" | "passed" | "failed" | "unknown";
  label: string;
  detail: string;
  tone: Tone;
};

function runOutcome(run: ValidationRun): string | undefined {
  const status = run.status;
  if (status === "Passed" || status === "Failed") return status;
  const summary = run.summary;
  if (summary && typeof summary === "object" && "outcome" in summary) {
    const outcome = (summary as { outcome?: unknown }).outcome;
    if (outcome === "Passed" || outcome === "Failed") return outcome;
  }
  return undefined;
}

/**
 * The QA verdict comes ONLY from the validation run of the current attempt and its current issues.
 * A job with status `Succeeded` just means the worker finished; it is never promoted to "Passed" here.
 */
export function deriveQaVerdict(pipeline: RevisionPipeline, currentIssues: Array<Pick<RevisionIssue, "severity">> | undefined): QaVerdict {
  const { job, qa } = pipeline;
  if (!job) return { state: "none", label: "Chưa có QA", detail: "Revision này chưa được xử lý nên chưa có kết quả kiểm tra.", tone: "neutral" };
  if (job.status === "Queued" || job.status === "Running") {
    return { state: "pending", label: "Đang chờ kết quả QA", detail: "Worker đang xử lý; kết quả QA chỉ có sau khi lần chạy này kết thúc.", tone: "pending" };
  }
  if (job.status === "Failed" || job.status === "Cancelled") {
    return { state: "unavailable", label: "Không có kết quả QA", detail: "Lần xử lý này không hoàn tất nên không có kết quả QA hợp lệ.", tone: "danger" };
  }

  const runs = qa?.validationRuns.items ?? [];
  if (runs.length === 0) {
    return { state: "unavailable", label: "Chưa có kết quả QA", detail: "Worker đã chạy xong nhưng API chưa trả validation run cho lần chạy hiện hành. Chưa thể coi là đạt.", tone: "warning" };
  }

  const blocking = (currentIssues ?? []).filter((issue) => issue.severity === "Error" || issue.severity === "Critical").length;
  const outcomes = runs.map(runOutcome);
  if (outcomes.some((outcome) => outcome === "Failed") || blocking > 0) {
    return { state: "failed", label: "QA không đạt", detail: blocking > 0 ? `Có ${blocking} issue mức Error/Critical cần xử lý trước khi dùng mô hình.` : "Validator báo kết quả Failed.", tone: "danger" };
  }
  if (outcomes.every((outcome) => outcome === "Passed")) {
    return { state: "passed", label: "QA đạt", detail: "Validation run hiện hành báo Passed và không còn issue Error/Critical.", tone: "success" };
  }
  return { state: "unknown", label: `QA: ${runs[0].status}`, detail: "Validator chưa trả kết quả Passed/Failed rõ ràng.", tone: "warning" };
}

/** The run to cite when confirming readiness: newest Passed run of the current attempt. */
export function pickPassedRun(qa: JobQa | null): ValidationRun | null {
  const runs = qa?.validationRuns.items ?? [];
  return runs.find((run) => runOutcome(run) === "Passed") ?? null;
}
