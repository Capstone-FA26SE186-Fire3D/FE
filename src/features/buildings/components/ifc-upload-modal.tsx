"use client";

import { CircleCheck, FileUp, RotateCcw, TriangleAlert, Upload, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useNow } from "@/api/use-now";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { SupportCode } from "@/components/ui/support-code";
import { cn } from "@/utils/cn";
import { buildingsApi } from "../api";
import { formatBytes } from "../format";
import type { IfcCriterion } from "../ifc-precheck";
import { useIfcPrecheck } from "../use-ifc-precheck";
import { uploadSteps, useIfcUploadFlow } from "../use-ifc-upload-flow";

function Stepper({ completed, running, failedStep }: { completed: number; running: boolean; failedStep: number | null }) {
  return <ol className="ifc-steps" aria-label="Các bước tải IFC">
    {uploadSteps.map((step, index) => {
      const state = failedStep === index ? "error" : index < completed ? "done" : index === completed && running ? "active" : index === completed ? "current" : "todo";
      return <li key={step.id} data-state={state} aria-current={state === "active" || state === "current" ? "step" : undefined}>
        <span className="ifc-step-dot" aria-hidden="true">{state === "done" ? <CircleCheck size={14} /> : state === "error" ? <X size={12} /> : state === "active" ? <Spinner size={14} /> : index + 1}</span>
        <span className="ifc-step-label">{step.label}<span className="ops-sr-only">{state === "done" ? " (đã xong)" : state === "error" ? " (lỗi)" : state === "active" ? " (đang chạy)" : ""}</span></span>
      </li>;
    })}
  </ol>;
}

/**
 * The public "is this file good enough" list: filled in by the in-browser check before upload, and by the server's
 * check of the processed model afterwards (`qaCriteria`).
 */
export function IfcCriteriaList({ items, label = "Kết quả kiểm tra tệp", testId = "ifc-criteria" }: { items: Array<Pick<IfcCriterion, "label" | "passed" | "blocking" | "detail"> & { id: string }>; label?: string; testId?: string }) {
  return <ul className="ifc-criteria" aria-label={label} data-testid={testId}>
    {items.map((item) => {
      const state = item.passed ? "pass" : item.blocking ? "fail" : "warn";
      return <li key={item.id} data-state={state}>
        <span aria-hidden="true">{state === "pass" ? <CircleCheck size={14} /> : state === "fail" ? <X size={14} /> : <TriangleAlert size={14} />}</span>
        <span><strong>{item.label}</strong><span className="ops-sr-only">{state === "pass" ? " (đạt)" : state === "fail" ? " (không đạt)" : " (cần lưu ý)"}</span> · {item.detail}</span>
      </li>;
    })}
  </ul>;
}

function runningText(completed: number) {
  if (completed >= 4) return "Đang gửi yêu cầu xử lý…";
  if (completed >= 3) return "Đang xác nhận tệp với máy chủ…";
  return "Đang chuẩn bị tải lên…";
}

/**
 * Figma "Tải IFC (modal)": dropzone · revision label · 5-step progress inside the modal. Chọn tệp → Kiểm tra (SHA-256) →
 * Tải lên (signed PUT, progress) → Xác nhận (upload-complete) → Xử lý (process). Retry resumes from the failed step with the
 * same Idempotency-Key; another file starts a new intent. The modal cannot be dismissed while a step runs.
 */
export function IfcUploadModal({ open, onOpenChange, accessToken, buildingId, onRevisionChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | null;
  buildingId: string;
  onRevisionChanged: (revisionId: string, phase: "uploaded" | "processing", jobId?: string) => void;
}) {
  const flow = useIfcUploadFlow({ accessToken, buildingId, onRevisionChanged });
  const progressId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { file, versionLabel, status, completed, progress, error, notice } = flow;
  const running = status === "running";
  const now = useNow(Boolean(error?.retryAt));
  const waitSeconds = error?.retryAt ? Math.max(0, Math.ceil((error.retryAt - now) / 1000)) : 0;

  // Checked in the browser before anything is sent: first the file kind and IFC version, then the model's content.
  // The size limit is the server's; while it is unknown (or unreadable) the browser check falls back to its own ceiling.
  const limits = useAsyncData("ifc-upload-limits", (signal) => buildingsApi.ifcUploadLimits(accessToken as string, signal), open && Boolean(accessToken));
  const precheck = useIfcPrecheck(file, limits.data?.maxBytes);
  const checked = precheck.phase === "done" ? precheck.result : null;
  const fileProblem = checked?.stage === "header" ? checked.problem : null;
  const criteria = checked?.stage === "content" ? checked.criteria : null;
  const contentBlocked = checked?.stage === "content" && checked.status === "blocked";
  const fileReady = precheck.phase === "unreadable" || checked?.status === "passed";
  const labelTooLong = versionLabel.trim().length > 100;
  const canStart = Boolean(accessToken && file && fileReady && versionLabel.trim() && !labelTooLong);
  const locked = running || status === "done";
  const blockedRetry = status === "error" && Boolean(error) && ((error?.retryAt ? waitSeconds > 0 : false) || (!error?.retryable && !error?.restart));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canStart && !blockedRetry) void flow.start();
  };
  const close = (next: boolean) => {
    if (running) return;
    if (!next && status === "done") flow.reset();
    onOpenChange(next);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) flow.setFile(dropped);
  };

  const startLabel = status === "error" ? (error?.restart ? "Bắt đầu lại" : error?.fileStored ? "Gửi lại yêu cầu xử lý" : "Thử lại") : "Tải lên và xử lý";

  return <Modal open={open} onOpenChange={close} size="md" title="Tải IFC mới" description="Mỗi lần tải tạo một bản IFC mới. Tệp được kiểm tra ngay trên máy bạn rồi tải thẳng lên kho lưu trữ." data-testid="ifc-upload-modal"
    footer={<>
      <Button type="button" variant="ghost" onClick={() => close(false)} disabled={running}>{status === "done" ? "Đóng" : "Hủy"}</Button>
      {status === "done"
        ? <Button type="button" variant="secondary" onClick={flow.reset}><FileUp size={16} aria-hidden="true" />Tải IFC khác</Button>
        : <Button type="submit" form="ifc-upload-form" disabled={!canStart || running || blockedRetry}>
          {running ? <Spinner size={16} /> : status === "error" ? <RotateCcw size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}{running ? "Đang xử lý…" : startLabel}{waitSeconds > 0 && ` (còn ${waitSeconds} giây)`}
        </Button>}
    </>}>
    <form id="ifc-upload-form" onSubmit={submit} className="ops-stack" noValidate>
      <div className={cn("ifc-dropzone", dragging && "is-dragging", file && fileReady && "has-file")} data-disabled={locked || undefined} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <input ref={fileInput} type="file" accept=".ifc" className="ops-sr-only" disabled={locked} data-focus-target aria-label="Chọn tệp IFC" onChange={(event) => flow.setFile(event.target.files?.[0] ?? null)} />
        <span className="ifc-dropzone-icon" aria-hidden="true"><Upload size={18} /></span>
        {file && !fileProblem ? <>
          <strong>{file.name}</strong>
          <span>{formatBytes(file.size)}{!locked && <> · <button type="button" className="ifc-dropzone-link" onClick={() => fileInput.current?.click()}>chọn tệp khác</button></>}</span>
        </> : <>
          <strong>Kéo thả tệp .ifc vào đây</strong>
          <span>hoặc <button type="button" className="ifc-dropzone-link" disabled={locked} onClick={() => fileInput.current?.click()}>bấm để chọn tệp</button> · chỉ nhận .ifc không rỗng</span>
        </>}
        {fileProblem && <span className="ops-field-error" role="alert">{fileProblem}</span>}
      </div>

      {!file && <p className="ops-muted" data-testid="ifc-requirements">Tệp hợp lệ: mô hình kiến trúc IFC2x3, IFC4 hoặc IFC4x3, có tầng, phòng, cửa, tường hoặc sàn. Tệp được kiểm tra ngay trên máy bạn; tệp không đạt sẽ không được tải lên.</p>}
      {precheck.phase === "checking" && <div className="ops-progress-row" role="status">
        <label htmlFor={`${progressId}-check`}>Đang kiểm tra nội dung tệp</label>
        <progress id={`${progressId}-check`} max={100} value={Math.round(precheck.fraction * 100)} />
        <span aria-hidden="true">{Math.round(precheck.fraction * 100)}%</span>
      </div>}
      {criteria && !locked && <IfcCriteriaList items={criteria} />}
      {contentBlocked && !locked && <Alert tone="danger" title="Tệp chưa đủ điều kiện để tải lên">Mô hình thiếu các mục đánh dấu không đạt ở trên. Hãy sửa trong phần mềm thiết kế, xuất lại IFC rồi chọn tệp mới. Tệp này chưa được gửi đi.</Alert>}

      <Field label="Tên bản IFC" required error={labelTooLong ? "Tên bản IFC tối đa 100 ký tự." : undefined}>
        {(p) => <Input {...p} maxLength={120} value={versionLabel} disabled={locked} placeholder="VD: Bản IFC tháng 10 — tối đa 100 ký tự" onChange={(event) => flow.setVersionLabel(event.target.value)} />}
      </Field>

      <Stepper completed={completed} running={running} failedStep={status === "error" && error ? error.step : null} />

      {running && progress && <div className="ops-progress-row">
        <label htmlFor={progressId}>{progress.stage === "hash" ? "Đang kiểm tra tệp" : "Đang tải lên kho lưu trữ"}</label>
        <progress id={progressId} max={100} value={Math.round(progress.fraction * 100)} />
        <span aria-hidden="true">{Math.round(progress.fraction * 100)}%</span>
      </div>}
      {running && !progress && <p className="ops-muted" role="status">{runningText(completed)}</p>}

      {status === "error" && error && <Alert tone="danger" title={error.fileStored ? "IFC đã lưu, nhưng chưa gửi được xử lý" : "Tải lên chưa hoàn tất"}>
        {error.message}
        {error.retryable && !error.restart && !error.fileStored && " Nội dung bạn đã chọn được giữ nguyên; thử lại sẽ tiếp tục đúng yêu cầu cũ, không tạo bản trùng."}
        {waitSeconds > 0 && ` Hệ thống yêu cầu chờ ${waitSeconds} giây trước khi thử lại.`}
        <SupportCode code={error.code} />
      </Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}
      {status === "done" && <Alert tone="success" title="Đã gửi xử lý IFC">Hệ thống đã nhận yêu cầu, nhưng mô hình chưa xử lý xong. Tiến trình và kết quả kiểm tra tự động hiển thị ở mục Tiến trình và tự cập nhật.</Alert>}
      {running && <p className="ops-muted"><Button type="button" size="sm" variant="quiet" onClick={flow.cancel}>Hủy tải lên</Button></p>}
    </form>
  </Modal>;
}
