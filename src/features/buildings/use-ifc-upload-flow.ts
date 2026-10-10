"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { buildingsApi } from "./api";
import { IfcUploadError, classifyUploadError, isAbortError, uploadIfcRevision, validateIfcFile, type IfcUploadSession, type IfcUploadStage } from "./ifc-upload";

export type UploadFlowStatus = "idle" | "running" | "error" | "done";

/** Steps shown in the stepper, in order. `completed` counts how many are finished. */
export const uploadSteps = [
  { id: "select", label: "Chọn tệp" },
  { id: "check", label: "Kiểm tra" },
  { id: "upload", label: "Tải lên" },
  { id: "confirm", label: "Xác nhận" },
  { id: "process", label: "Xử lý" },
] as const;

export type UploadFlowError = {
  message: string;
  /** Which step failed (index into `uploadSteps`). */
  step: number;
  retryable: boolean;
  restart: boolean;
  code?: string;
  retryAfterSeconds?: number;
  /** Epoch ms before which retry should wait (server Retry-After). */
  retryAt?: number;
  /** Failed after the file was safely stored: retrying only repeats the remaining steps. */
  fileStored: boolean;
};

export type UploadProgressState = { stage: "hash" | "upload"; fraction: number } | null;

const stageToStep: Record<IfcUploadStage, number> = { hash: 1, initiate: 2, upload: 2, complete: 3 };

export function useIfcUploadFlow({ accessToken, buildingId, onRevisionChanged }: {
  accessToken: string | null;
  buildingId: string;
  /** Called after upload-complete and after process is accepted so the revision list/selection can refresh. */
  onRevisionChanged: (revisionId: string, phase: "uploaded" | "processing", jobId?: string) => void;
}) {
  const initiateKey = useIdempotencyKey();
  const processKey = useIdempotencyKey();
  const session = useRef<IfcUploadSession>({});
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const callback = useRef(onRevisionChanged);

  const [file, setFileState] = useState<File | null>(null);
  const [versionLabel, setVersionLabelState] = useState("");
  const [status, setStatus] = useState<UploadFlowStatus>("idle");
  const [completed, setCompleted] = useState(0);
  const [progress, setProgress] = useState<UploadProgressState>(null);
  const [error, setError] = useState<UploadFlowError | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    callback.current = onRevisionChanged;
  });

  // Leaving mid-upload would silently drop it: warn, and stop work when the screen unmounts.
  useEffect(() => {
    if (status !== "running") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);
  useEffect(() => () => controller.current?.abort(), []);

  const resetProgress = useCallback((nextFile: File | null, label: string) => {
    setStatus("idle");
    setError(null);
    setProgress(null);
    setRevisionId(null);
    setJobId(null);
    setNotice(null);
    setCompleted(nextFile && !validateIfcFile(nextFile) && label.trim() ? 1 : 0);
  }, []);

  const setFile = useCallback((next: File | null) => {
    if (running.current) return;
    // A different file is a different intent: new hash, new Idempotency-Key (derived from the payload).
    session.current = {};
    setFileState(next);
    resetProgress(next, versionLabel);
  }, [resetProgress, versionLabel]);

  const setVersionLabel = useCallback((next: string) => {
    if (running.current) return;
    // The label is part of the initiate payload; keep the expensive hash but drop the stale intent.
    session.current = { sha256Hash: session.current.sha256Hash };
    setVersionLabelState(next);
    if (status !== "idle") resetProgress(file, next);
    else setCompleted(file && !validateIfcFile(file) && next.trim() ? 1 : 0);
  }, [file, resetProgress, status]);

  const start = useCallback(async () => {
    if (running.current || !accessToken || !file) return;
    const label = versionLabel.trim();
    const fileError = validateIfcFile(file);
    if (fileError || !label || label.length > 100) return;

    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setStatus("running");
    setError(null);
    setNotice(null);

    let failedStep = 1;
    try {
      const uploaded = await uploadIfcRevision({
        file,
        versionLabel: label,
        session: session.current,
        signal: abort.signal,
        onStage: (stage) => {
          failedStep = stageToStep[stage];
          setCompleted((count) => Math.max(count, stageToStep[stage]));
          if (stage === "complete") setProgress(null);
        },
        onProgress: ({ stage, loaded, total }) => {
          if (stage === "hash" || stage === "upload") setProgress({ stage, fraction: total > 0 ? loaded / total : 1 });
        },
        // Same payload → same key, so retries after a timeout/lost response/URL expiry replay the same upload intent.
        initiate: (input) => buildingsApi.initiateUpload(accessToken, buildingId, input, initiateKey.keyFor({ buildingId, ...input })),
        finalize: (id, input) => buildingsApi.finalizeUpload(accessToken, id, input),
      });
      initiateKey.done();
      setRevisionId(uploaded.revisionId);
      setCompleted(4);
      setProgress(null);
      callback.current(uploaded.revisionId, "uploaded");

      failedStep = 4;
      const accepted = await buildingsApi.processRevision(accessToken, uploaded.revisionId, processKey.keyFor({ revisionId: uploaded.revisionId }));
      processKey.done();
      setJobId(accepted.jobId);
      setCompleted(5);
      setStatus("done");
      callback.current(uploaded.revisionId, "processing", accepted.jobId);
    } catch (cause) {
      if (isAbortError(cause)) {
        setStatus("idle");
        setProgress(null);
        setNotice("Đã hủy. Chưa có gì được lưu trên máy chủ; bạn có thể bắt đầu lại.");
        setCompleted(1);
        session.current = { sha256Hash: session.current.sha256Hash };
        return;
      }
      const classified = failedStep >= 4
        ? new IfcUploadError("complete", describeProcessFailure(cause), processFlags(cause))
        : cause instanceof IfcUploadError ? cause : classifyUploadError(stageForStep(failedStep), cause);
      if (classified.restart) {
        // The server no longer honors this intent: a retry must be a new action with a new key.
        initiateKey.done();
        session.current = {};
        setCompleted(1);
      }
      setError({
        message: classified.message,
        step: failedStep,
        retryable: classified.retryable,
        restart: classified.restart,
        code: classified.code,
        retryAfterSeconds: classified.retryAfterSeconds,
        retryAt: classified.retryAfterSeconds ? Date.now() + classified.retryAfterSeconds * 1000 : undefined,
        fileStored: failedStep >= 4,
      });
      setStatus("error");
    } finally {
      running.current = false;
      controller.current = null;
    }
  }, [accessToken, buildingId, file, initiateKey, processKey, versionLabel]);

  const cancel = useCallback(() => controller.current?.abort(), []);

  const reset = useCallback(() => {
    if (running.current) return;
    session.current = {};
    initiateKey.done();
    processKey.done();
    setFileState(null);
    setVersionLabelState("");
    resetProgress(null, "");
  }, [initiateKey, processKey, resetProgress]);

  return { file, versionLabel, status, completed, progress, error, revisionId, jobId, notice, setFile, setVersionLabel, start, cancel, reset };
}

function stageForStep(step: number): IfcUploadStage {
  return step <= 1 ? "hash" : step === 2 ? "upload" : "complete";
}

type FailureCause = { status?: number; code?: string; retryAfterSeconds?: number; message?: string };

function processFlags(cause: unknown) {
  const info = cause as FailureCause;
  const transient = info?.status === undefined || info.status === 429 || info.status === 502 || info.status === 503 || info.status === 504 || cause instanceof TypeError;
  return { code: info?.code, status: info?.status, retryAfterSeconds: info?.retryAfterSeconds, retryable: transient };
}

function describeProcessFailure(cause: unknown) {
  const info = cause as FailureCause;
  if (info?.status === 409) return "IFC đã được lưu nhưng revision này không nhận thêm yêu cầu xử lý lúc này (có thể đã có job đang chạy).";
  if (info?.status === 400 && info.code === "IDEMPOTENCY_KEY_REQUIRED") return "Yêu cầu xử lý thiếu Idempotency-Key.";
  if (cause instanceof TypeError) return "IFC đã được lưu nhưng mất kết nối khi gửi yêu cầu xử lý. Hãy thử lại.";
  return "IFC đã được lưu nhưng chưa gửi được yêu cầu xử lý. Hãy thử lại.";
}
