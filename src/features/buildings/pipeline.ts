import type { Tone } from "@/components/ui/status-badge";
import type { BuildingRevision, IssueSeverity, JobQa, ProcessingJob, ProcessingJobDetail, ProcessingLog, RevisionIssue, ValidationRun } from "./types";

/** Everything the UI knows about the newest processing job of one revision. */
export type RevisionPipeline = {
  job: ProcessingJob | null;
  detail: ProcessingJobDetail | null;
  qa: JobQa | null;
  /** `/qa` failed: shown as an error, never read as "no QA yet". */
  qaError?: unknown;
  /** Newest processing log of the job while it runs (the BE may not write any). */
  latestLog?: ProcessingLog | null;
};

export const emptyPipeline: RevisionPipeline = { job: null, detail: null, qa: null };

/** The BE moves a revision out of these when QA of its Geometry job is recorded. */
export function isUnsettledRevision(status: string | undefined | null) {
  return status === "Uploaded" || status === "Processing";
}

const TERMINAL_JOB_STATUSES = ["Succeeded", "Failed", "Cancelled"];

export function isTerminalJob(status: string | undefined | null) {
  return status ? TERMINAL_JOB_STATUSES.includes(status) : false;
}

export function jobLabel(status: string | undefined | null): { label: string; tone: Tone } {
  switch (status) {
    case "Queued": return { label: "Đang chờ máy xử lý", tone: "pending" };
    case "Running": return { label: "Đang xử lý", tone: "pending" };
    // Deliberately not "Hoàn thành/Đạt": the job finishing says nothing about QA.
    case "Succeeded": return { label: "Đã xử lý xong", tone: "info" };
    case "Failed": return { label: "Xử lý thất bại", tone: "danger" };
    case "Cancelled": return { label: "Đã hủy", tone: "neutral" };
    default: return { label: status ? "Không rõ trạng thái" : "Chưa xử lý", tone: "neutral" };
  }
}

export function revisionLabel(status: string | undefined | null): { label: string; tone: Tone } {
  switch (status) {
    case "Draft": return { label: "Bản nháp", tone: "neutral" };
    case "Uploaded": return { label: "Đã tải lên", tone: "info" };
    case "Processing": return { label: "Đang xử lý", tone: "pending" };
    case "NeedsFix": return { label: "Cần sửa mô hình", tone: "warning" };
    case "ReadyForScenario": return { label: "Sẵn sàng soạn kịch bản", tone: "success" };
    case "ConfirmedForTraining": return { label: "Đã xác nhận dùng cho huấn luyện", tone: "success" };
    case "Rejected": return { label: "Bị từ chối", tone: "danger" };
    case "Failed": return { label: "Xử lý thất bại", tone: "danger" };
    case "Superseded": return { label: "Đã được thay thế", tone: "neutral" };
    default: return { label: "Không rõ trạng thái", tone: "neutral" };
  }
}

export const severityOrder: IssueSeverity[] = ["Critical", "Error", "Warning", "Info"];

export function severityLabel(severity: string): { label: string; tone: Tone } {
  switch (severity) {
    case "Critical": return { label: "Nghiêm trọng", tone: "danger" };
    case "Error": return { label: "Lỗi", tone: "danger" };
    case "Warning": return { label: "Cảnh báo", tone: "warning" };
    case "Info": return { label: "Thông tin", tone: "info" };
    default: return { label: "Khác", tone: "neutral" };
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
  if (!job) return { state: "none", label: "Chưa kiểm tra", detail: "Bản IFC này chưa được xử lý nên chưa có kết quả kiểm tra tự động.", tone: "neutral" };
  if (job.status === "Queued" || job.status === "Running") {
    return { state: "pending", label: "Đang chờ kết quả kiểm tra", detail: "Mô hình đang được xử lý; kết quả kiểm tra tự động chỉ có sau khi lượt xử lý này xong.", tone: "pending" };
  }
  if (job.status === "Failed" || job.status === "Cancelled") {
    return { state: "unavailable", label: "Không có kết quả kiểm tra", detail: "Lượt xử lý này không hoàn tất nên không có kết quả kiểm tra.", tone: "danger" };
  }
  if (pipeline.qaError !== undefined) {
    return { state: "unavailable", label: "Không tải được kết quả kiểm tra", detail: "Chưa lấy được kết quả kiểm tra của lượt xử lý mới nhất nên chưa thể coi là đạt. Hãy tải lại trang.", tone: "danger" };
  }

  const runs = qa?.validationRuns.items ?? [];
  if (runs.length === 0) {
    return { state: "unavailable", label: "Chưa có kết quả kiểm tra", detail: "Mô hình đã xử lý xong nhưng hệ thống chưa có kết quả kiểm tra tự động. Chưa thể coi là đạt.", tone: "warning" };
  }

  const blocking = (currentIssues ?? []).filter((issue) => issue.severity === "Error" || issue.severity === "Critical").length;
  const outcomes = runs.map(runOutcome);
  if (outcomes.some((outcome) => outcome === "Failed") || blocking > 0) {
    return { state: "failed", label: "Kiểm tra không đạt", detail: blocking > 0 ? `Có ${blocking} lỗi nghiêm trọng cần xử lý trước khi dùng mô hình.` : "Lần kiểm tra tự động báo mô hình không đạt.", tone: "danger" };
  }
  if (outcomes.every((outcome) => outcome === "Passed")) {
    return { state: "passed", label: "Kiểm tra đạt", detail: "Lần kiểm tra tự động mới nhất đạt và không còn lỗi nghiêm trọng.", tone: "success" };
  }
  return { state: "unknown", label: "Chưa rõ kết quả kiểm tra", detail: "Lần kiểm tra tự động chưa cho biết rõ mô hình đạt hay không đạt.", tone: "warning" };
}

/** The run to cite when confirming readiness: newest Passed run of the current attempt. */
export function pickPassedRun(qa: JobQa | null): ValidationRun | null {
  const runs = qa?.validationRuns.items ?? [];
  return runs.find((run) => runOutcome(run) === "Passed") ?? null;
}

const STEP_LABELS: Record<string, string> = {
  Quarantine: "Kiểm tra tệp",
  Parse: "Đọc IFC",
  CleanGeometry: "Làm sạch hình học",
  Decimate: "Giảm lưới",
  GenNavMesh: "Tạo lưới di chuyển",
  GenHazardGrid: "Tạo lưới nguy hiểm",
  ExportGLB: "Xuất GLB",
  PackageBundle: "Đóng gói",
};

export function processingStepLabel(step: string) {
  return STEP_LABELS[step] ?? step;
}

/** Kind of a processing job (`Geometry` for IFC, package builds otherwise). */
export function jobKindLabel(kind: string | undefined | null) {
  if (kind === "Geometry") return "Dựng mô hình 3D";
  if (kind === "Package" || kind === "PackageBuild") return "Dựng gói";
  return "Xử lý";
}

/** Result of one automatic check (validation run). */
export function runStatusLabel(status: string | undefined | null): { label: string; tone: Tone } {
  if (status === "Passed") return { label: "Đạt", tone: "success" };
  if (status === "Failed") return { label: "Không đạt", tone: "danger" };
  if (status === "Running" || status === "Pending" || status === "Queued") return { label: "Đang kiểm tra", tone: "pending" };
  return { label: "Chưa rõ", tone: "warning" };
}

export type StepState = "todo" | "active" | "done" | "error" | "skipped";
export type PipelineStepId = "upload" | "quarantine" | "geometry" | "qa" | "exit" | "ready";
export type PipelineStep = { id: PipelineStepId; label: string; state: StepState; detail: string };
export type PipelineAction = "upload" | "process" | "retry" | "refresh" | "issues" | "exit" | "author" | "latest";
export type PipelineNext = { tone: "info" | "success" | "warning" | "danger"; title: string; guidance: string; actions: PipelineAction[] };
export type PipelineProgressModel = { steps: PipelineStep[]; next: PipelineNext };

export const EXIT_UNKNOWN = "IFC_EXIT_UNKNOWN";

/**
 * Upload → file check → geometry job → QA → exit door (only for IFC_EXIT_UNKNOWN) → ready to author, with the action that
 * unblocks the revision. Follows the BE contract: only a Failed job can be retried and a finished job never runs again
 * (process answers with the same job), so a problem in the model needs a new IFC upload.
 */
export function derivePipelineProgress({ revision, pipeline, currentIssues, loaded, hasNewerRevision }: {
  revision: BuildingRevision;
  pipeline: RevisionPipeline;
  currentIssues: Array<Pick<RevisionIssue, "severity" | "issueCode">> | undefined;
  /** False until the first job poll answered: no call to action is guessed before that. */
  loaded: boolean;
  hasNewerRevision: boolean;
}): PipelineProgressModel {
  const status = revision.status;
  const source = revision.sourceDocument;
  const quarantine = source?.quarantineStatus;
  const { job } = pipeline;
  const attempt = pipeline.detail?.currentAttempt ?? null;
  const issues = currentIssues ?? [];
  const counts = countBySeverity(issues);
  const errors = (counts.Critical ?? 0) + (counts.Error ?? 0);
  const warnings = counts.Warning ?? 0;
  const exitRequired = issues.some((issue) => issue.issueCode === EXIT_UNKNOWN);
  const verdict = deriveQaVerdict(pipeline, currentIssues);
  const ready = status === "ReadyForScenario" || status === "ConfirmedForTraining";
  const attemptText = attempt ? `lượt xử lý thứ ${attempt.attemptNumber}` : "";
  const log = job?.status === "Running" ? pipeline.latestLog : null;

  const upload: PipelineStep = source
    ? { id: "upload", label: "Tải lên", state: "done", detail: source.originalFilename }
    : { id: "upload", label: "Tải lên", state: status === "Draft" ? "active" : "todo", detail: "Chưa hoàn tất tải lên" };

  let quarantineStep: PipelineStep = { id: "quarantine", label: "Kiểm tra tệp", state: "todo", detail: "" };
  if (quarantine === "Rejected") quarantineStep = { ...quarantineStep, state: "error", detail: "Tệp bị từ chối" };
  else if (quarantine === "Accepted") quarantineStep = { ...quarantineStep, state: "done", detail: "Tệp được chấp nhận" };
  else if (source && job) quarantineStep = { ...quarantineStep, state: "skipped", detail: "Chưa có kết quả kiểm tra tệp, không ảnh hưởng việc xử lý" };
  else if (source) quarantineStep = { ...quarantineStep, state: "active", detail: "Đang chờ kiểm tra tệp" };

  let geometry: PipelineStep = { id: "geometry", label: "Dựng mô hình 3D", state: "todo", detail: source && quarantine !== "Rejected" && !job ? "Chưa chạy xử lý" : "" };
  if (job?.status === "Queued") geometry = { ...geometry, state: "active", detail: attempt ? `Đang chờ máy xử lý · ${attemptText}` : "Đang chờ máy xử lý nhận tệp" };
  else if (job?.status === "Running") geometry = { ...geometry, state: "active", detail: ["Đang xử lý", attemptText, log ? `bước ${processingStepLabel(log.step)}` : ""].filter(Boolean).join(" · ") };
  else if (job?.status === "Succeeded") geometry = { ...geometry, state: "done", detail: attemptText };
  else if (job?.status === "Failed") geometry = { ...geometry, state: "error", detail: attemptText ? `Lỗi ở ${attemptText}` : "Xử lý bị lỗi" };
  else if (job?.status === "Cancelled") geometry = { ...geometry, state: "error", detail: "Đã hủy" };

  let qa: PipelineStep = { id: "qa", label: "Kiểm tra tự động", state: "todo", detail: "" };
  if (job?.status === "Succeeded") {
    const countText = `${errors} lỗi · ${warnings} cảnh báo`;
    if (verdict.state === "failed") qa = { ...qa, state: "error", detail: countText };
    else if (verdict.state === "passed" || ready) qa = { ...qa, state: "done", detail: countText };
    else if (pipeline.qaError !== undefined) qa = { ...qa, state: "error", detail: "Lỗi tải kết quả" };
    else qa = { ...qa, state: "active", detail: "Đang chờ kết quả kiểm tra" };
  } else if (job?.status === "Failed" || job?.status === "Cancelled") qa = { ...qa, detail: "Không có kết quả kiểm tra" };

  const steps: PipelineStep[] = [upload, quarantineStep, geometry, qa];
  if (exitRequired) {
    const exitState: StepState = ready ? "done" : status === "NeedsFix" && verdict.state !== "failed" ? "error" : "todo";
    steps.push({ id: "exit", label: "Xác nhận cửa thoát", state: exitState, detail: ready ? "Đã chọn cửa thoát" : exitState === "error" ? "Cần chọn một cửa làm lối thoát" : "" });
  }
  let readyStep: PipelineStep = { id: "ready", label: "Sẵn sàng soạn kịch bản", state: ready ? "done" : "todo", detail: status === "ConfirmedForTraining" ? "Đã xác nhận dùng cho huấn luyện" : ready ? "Có thể soạn kịch bản" : "" };
  if (status === "Rejected") readyStep = { ...readyStep, state: "error", detail: "Bản IFC bị từ chối" };
  if (status === "Superseded") readyStep = { ...readyStep, state: "skipped", detail: "Đã được thay thế" };
  steps.push(readyStep);

  return { steps, next: nextAction() };

  function nextAction(): PipelineNext {
    if (status === "Superseded") {
      return { tone: "warning", title: "Bản IFC đã được thay thế", guidance: "Đã có bản IFC mới hơn thay cho bản này. Xem tiến trình và soạn kịch bản trên bản IFC mới nhất.", actions: hasNewerRevision ? ["latest"] : [] };
    }
    if (status === "Rejected") {
      return { tone: "danger", title: "Bản IFC bị từ chối", guidance: "Bản IFC này không dùng được để soạn kịch bản. Sửa mô hình trong phần mềm thiết kế rồi tải lên tệp IFC mới.", actions: ["upload"] };
    }
    if (quarantine === "Rejected") {
      return { tone: "danger", title: "Tệp IFC bị từ chối khi kiểm tra", guidance: "Hệ thống không chấp nhận tệp này nên không xử lý. Kiểm tra lại tệp xuất từ phần mềm thiết kế rồi tải lên tệp IFC mới.", actions: ["upload"] };
    }
    if (!source) return { tone: "info", title: "Chưa hoàn tất tải lên", guidance: "Bản IFC này chưa có tệp tải lên hoàn chỉnh. Bấm “Tải IFC” để tải tệp lên.", actions: ["upload"] };
    if (!loaded) return { tone: "info", title: "Đang tải trạng thái xử lý…", guidance: "", actions: [] };
    if (job?.status === "Failed") {
      return { tone: "danger", title: "Xử lý IFC thất bại", guidance: `Máy xử lý không dựng được mô hình 3D${attemptText ? ` ở ${attemptText}` : ""}. Bấm chạy lại (cần nhập lý do); nếu vẫn lỗi, kiểm tra tệp rồi tải lên IFC mới.`, actions: ["retry", "upload"] };
    }
    if (job?.status === "Cancelled") return { tone: "danger", title: "Lượt xử lý đã bị hủy", guidance: "Chỉ lượt xử lý bị lỗi mới chạy lại được. Tải lên IFC mới để xử lý lại.", actions: ["upload"] };
    if (status === "Failed") return { tone: "danger", title: "Xử lý thất bại", guidance: "Bản IFC này bị lỗi khi xử lý và không chạy lại được. Tải lên IFC mới.", actions: ["upload"] };
    if (!job) {
      return isUnsettledRevision(status)
        ? { tone: "info", title: "Chưa chạy xử lý IFC", guidance: "Tệp đã tải lên nhưng chưa được xử lý. Bấm chạy xử lý để dựng mô hình 3D và kiểm tra tự động.", actions: ["process"] }
        : { tone: "info", title: revisionLabel(status).label, guidance: "Bản IFC này chưa được xử lý.", actions: [] };
    }
    if (job.status === "Queued" || job.status === "Running") {
      return { tone: "info", title: "Đang dựng mô hình 3D", guidance: "Máy xử lý đang làm việc; trang tự cập nhật, bạn không cần thao tác. Kết quả kiểm tra có sau khi xử lý xong.", actions: [] };
    }
    if (pipeline.qaError !== undefined) return { tone: "danger", title: "Không tải được kết quả kiểm tra", guidance: "Chưa biết mô hình có đạt kiểm tra hay không. Tải lại để thử lần nữa.", actions: ["refresh"] };
    if (ready) {
      return status === "ConfirmedForTraining"
        ? { tone: "success", title: "Đã xác nhận dùng cho huấn luyện", guidance: "Mô hình đã qua kiểm tra và được xác nhận dùng được cho huấn luyện. Tiếp tục soạn hoặc quản lý kịch bản ở tab Kịch bản.", actions: ["author"] }
        : { tone: "success", title: "Sẵn sàng soạn kịch bản", guidance: `Mô hình đã qua kiểm tra${warnings > 0 ? ` (còn ${warnings} cảnh báo, không ảnh hưởng)` : ""}. Mở tab Kịch bản để tạo hoặc soạn kịch bản trên bản IFC này.`, actions: ["author"] };
    }
    if (status === "NeedsFix" && exitRequired && verdict.state !== "failed") {
      return { tone: "warning", title: "Chọn cửa thoát ra ngoài", guidance: "Kiểm tra tự động chưa tìm thấy cửa nào dẫn ra ngoài tòa nhà. Chọn một cửa có sẵn làm lối thoát ở mục “Thiết bị phát hiện từ IFC” rồi lưu; không cần tải lại IFC.", actions: ["exit"] };
    }
    if (status === "NeedsFix" || verdict.state === "failed") {
      return { tone: "danger", title: "Mô hình cần sửa", guidance: `Kiểm tra tự động ${errors > 0 ? `tìm thấy ${errors} lỗi nghiêm trọng` : "báo mô hình không đạt"}. Xem từng vấn đề và cách xử lý; lỗi trong mô hình phải sửa trong phần mềm thiết kế rồi tải lên IFC mới, vì lượt xử lý đã xong không chạy lại được.`, actions: ["issues", "upload"] };
    }
    if (isUnsettledRevision(status)) return { tone: "info", title: "Đang cập nhật trạng thái bản IFC", guidance: "Mô hình đã xử lý xong; hệ thống đang ghi kết quả kiểm tra. Trang tự cập nhật.", actions: [] };
    return { tone: "info", title: revisionLabel(status).label, guidance: verdict.detail, actions: [] };
  }
}
