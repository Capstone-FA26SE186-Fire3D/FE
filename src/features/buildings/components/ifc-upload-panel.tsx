"use client";

import { CircleCheck, FileUp, RotateCcw, Upload, X } from "lucide-react";
import { useId, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { formatBytes } from "../format";
import { validateIfcFile } from "../ifc-upload";
import { uploadSteps, useIfcUploadFlow } from "../use-ifc-upload-flow";
import { useNow } from "../use-now";

function Stepper({ completed, running, failedStep }: { completed: number; running: boolean; failedStep: number | null }) {
  return <ol className="ops-stepper" aria-label="Các bước tải IFC">
    {uploadSteps.map((step, index) => {
      const state = failedStep === index ? "error" : index < completed ? "done" : index === completed && running ? "active" : "todo";
      return <li key={step.id} data-state={state} aria-current={state === "active" ? "step" : undefined}>
        <span className="ops-stepper-dot" aria-hidden="true">{state === "done" ? <CircleCheck size={16} /> : state === "error" ? <X size={14} /> : index + 1}</span>
        <span className="ops-stepper-label">{step.label}<span className="sr-only">{state === "done" ? " (đã xong)" : state === "error" ? " (lỗi)" : state === "active" ? " (đang chạy)" : ""}</span></span>
      </li>;
    })}
  </ol>;
}

function runningText(completed: number) {
  if (completed >= 4) return "Đang gửi yêu cầu xử lý…";
  if (completed >= 3) return "Đang xác nhận tệp với máy chủ…";
  return "Đang chuẩn bị tải lên…";
}

/**
 * Chọn tệp → Kiểm tra (SHA-256) → Tải lên (signed PUT, có tiến độ) → Xác nhận (upload-complete) → Xử lý (process).
 * Retry resumes from the failed step with the same Idempotency-Key; choosing another file starts a new intent.
 */
export function IfcUploadPanel({ accessToken, buildingId, onRevisionChanged }: {
  accessToken: string | null;
  buildingId: string;
  onRevisionChanged: (revisionId: string, phase: "uploaded" | "processing", jobId?: string) => void;
}) {
  const flow = useIfcUploadFlow({ accessToken, buildingId, onRevisionChanged });
  const progressId = useId();
  const { file, versionLabel, status, completed, progress, error, notice } = flow;
  const running = status === "running";
  const now = useNow(Boolean(error?.retryAt));
  const waitSeconds = error?.retryAt ? Math.max(0, Math.ceil((error.retryAt - now) / 1000)) : 0;

  const fileProblem = file ? validateIfcFile(file) : null;
  const labelTooLong = versionLabel.trim().length > 100;
  const canStart = Boolean(accessToken && file && !fileProblem && versionLabel.trim() && !labelTooLong);
  const locked = running || status === "done";
  const blockedRetry = status === "error" && Boolean(error) && ((error?.retryAt ? waitSeconds > 0 : false) || (!error?.retryable && !error?.restart));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canStart && !blockedRetry) void flow.start();
  };

  const startLabel = status === "error"
    ? error?.restart ? "Bắt đầu lại" : error?.fileStored ? "Gửi lại yêu cầu xử lý" : "Thử lại"
    : "Tải lên và xử lý";

  return <Panel title="Tải lên IFC mới" description="Mỗi lần tải tạo một revision mới. Tệp được kiểm tra SHA-256 trên máy bạn rồi tải thẳng lên kho lưu trữ." bodyClassName="ops-stack">
    <Stepper completed={completed} running={running} failedStep={status === "error" && error ? error.step : null} />

    <form onSubmit={submit} className="ops-stack" noValidate>
      <div className="ops-form-grid">
        <Field label="Nhãn revision" required hint="Ví dụ: IFC rev. 02 — tối đa 100 ký tự." error={labelTooLong ? "Nhãn revision tối đa 100 ký tự." : undefined}>
          {(p) => <Input {...p} maxLength={120} value={versionLabel} disabled={locked} placeholder="IFC rev. 02" onChange={(event) => flow.setVersionLabel(event.target.value)} />}
        </Field>
        <Field label="Tệp IFC" required hint={file && !fileProblem ? `${file.name} · ${formatBytes(file.size)}` : "Chỉ nhận tệp .ifc không rỗng."} error={fileProblem ?? undefined}>
          {(p) => <Input {...p} type="file" accept=".ifc" disabled={locked} onChange={(event) => flow.setFile(event.target.files?.[0] ?? null)} />}
        </Field>
      </div>

      {running && progress && <div className="ops-progress-row">
        <label htmlFor={progressId}>{progress.stage === "hash" ? "Đang tính SHA-256 của tệp" : "Đang tải lên kho lưu trữ"}</label>
        <progress id={progressId} max={100} value={Math.round(progress.fraction * 100)} />
        <span aria-hidden="true">{Math.round(progress.fraction * 100)}%</span>
      </div>}
      {running && !progress && <p className="ops-muted" role="status">{runningText(completed)}</p>}

      {status === "error" && error && <Alert tone="danger" title={error.fileStored ? "IFC đã lưu, nhưng chưa gửi được xử lý" : "Tải lên chưa hoàn tất"}>
        {error.message}
        {error.retryable && !error.restart && !error.fileStored && " Nội dung bạn đã chọn được giữ nguyên; thử lại sẽ tiếp tục đúng yêu cầu cũ, không tạo bản trùng."}
        {waitSeconds > 0 && ` Hệ thống yêu cầu chờ ${waitSeconds} giây trước khi thử lại.`}
      </Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}
      {status === "done" && <Alert tone="success" title="Đã gửi xử lý IFC">Yêu cầu đã được nhận (202), chưa phải đã xử lý xong. Tiến trình và kết quả QA hiển thị bên dưới và tự cập nhật.</Alert>}

      <div className="ops-actions">
        {status !== "done" && <Button type="submit" disabled={!canStart || running || blockedRetry}>
          {status === "error" ? <RotateCcw size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}{running ? "Đang xử lý…" : startLabel}{waitSeconds > 0 && ` (${waitSeconds}s)`}
        </Button>}
        {running && <Button type="button" variant="quiet" onClick={flow.cancel}>Hủy</Button>}
        {(status === "done" || (status === "error" && !running)) && <Button type="button" variant="quiet" onClick={flow.reset}><FileUp size={16} aria-hidden="true" />{status === "done" ? "Tải IFC khác" : "Chọn tệp khác"}</Button>}
      </div>
    </form>
  </Panel>;
}
