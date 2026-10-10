"use client";

import { Play, RefreshCw, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { newIdempotencyKey, useIdempotencyKey } from "@/api/idempotency";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { buildingsApi } from "../api";
import { describeApiError, formatDateTime, shortHash } from "../format";
import { deriveQaVerdict, isTerminalJob, jobLabel, revisionLabel, type RevisionPipeline } from "../pipeline";
import type { BuildingRevision, RevisionIssue } from "../types";

export function ProcessingStatusPanel({ accessToken, revision, pipeline, issues, polling, pollError, onRefresh, onChanged }: {
  accessToken: string;
  revision: BuildingRevision;
  pipeline: RevisionPipeline;
  issues: RevisionIssue[] | undefined;
  polling: boolean;
  pollError: unknown;
  onRefresh: () => void;
  onChanged: (jobId?: string) => void;
}) {
  const toast = useToast();
  const processKey = useIdempotencyKey();
  const retryKey = useIdempotencyKey();
  const busy = useRef(false);
  const [working, setWorking] = useState<"process" | "retry" | null>(null);
  const [actionError, setActionError] = useState("");
  const [retryOpen, setRetryOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [retryError, setRetryError] = useState("");

  const { job, detail, qa } = pipeline;
  const attempt = detail?.currentAttempt ?? null;
  const rev = revisionLabel(revision.status);
  const jl = jobLabel(job?.status);
  const verdict = deriveQaVerdict(pipeline, issues?.filter((issue) => issue.isCurrentAttempt));
  const canStart = !job && !["Processing"].includes(revision.status) && Boolean(revision.sourceDocument);

  const startProcessing = async () => {
    if (busy.current) return;
    busy.current = true;
    setWorking("process");
    setActionError("");
    try {
      const accepted = await buildingsApi.processRevision(accessToken, revision.id, processKey.keyFor({ revisionId: revision.id }));
      processKey.done();
      toast.notify({ tone: "success", title: "Đã gửi yêu cầu xử lý", description: "Yêu cầu được nhận (202); worker sẽ xử lý và trang tự cập nhật." });
      onChanged(accepted.jobId);
    } catch (error) {
      setActionError(describeApiError(error, "Không thể gửi yêu cầu xử lý. Hãy thử lại; yêu cầu lặp lại sẽ không tạo job trùng."));
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  const submitRetry = async () => {
    if (busy.current || !job) return;
    const text = reason.trim();
    if (!text) { setRetryError("Nhập lý do chạy lại."); return; }
    if (text.length > 1000) { setRetryError("Lý do tối đa 1000 ký tự."); return; }
    busy.current = true;
    setWorking("retry");
    setRetryError("");
    try {
      // requestId identifies one retry intent: same id + same reason is replayed by the server (AlreadyRequeued).
      const requestId = retryKey.keyFor({ jobId: job.id, reason: text });
      await buildingsApi.retryJob(accessToken, job.id, { requestId: isUuid(requestId) ? requestId : newIdempotencyKey(), reason: text });
      retryKey.done();
      setRetryOpen(false);
      setReason("");
      toast.notify({ tone: "success", title: "Đã yêu cầu chạy lại job", description: "Worker sẽ nhận lại job; chưa phải đã xử lý xong." });
      onChanged(job.id);
    } catch (error) {
      setRetryError(describeApiError(error, "Không thể yêu cầu chạy lại job này."));
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  const runs = qa?.validationRuns.items ?? [];

  return <Panel
    title="Xử lý và kiểm tra (QA)"
    description="Trạng thái worker và kết quả QA là hai thông tin khác nhau."
    actions={<>
      {polling && <span className="ops-muted" role="status" aria-live="polite">Tự cập nhật mỗi 3 giây…</span>}
      <Button size="sm" variant="quiet" onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>
    </>}
    bodyClassName="ops-stack"
  >
    {pollError !== undefined && <Alert tone="danger" title="Không cập nhật được trạng thái xử lý" action={<Button size="sm" variant="secondary" className="mt-3" onClick={onRefresh}>Thử lại</Button>}>{describeApiError(pollError, "Hệ thống sẽ tự thử lại; bạn cũng có thể tải lại thủ công.")}</Alert>}

    <dl className="ops-kv">
      <dt>Revision</dt><dd>{revision.versionLabel} <StatusBadge tone={rev.tone}>{rev.label}</StatusBadge></dd>
      <dt>Job xử lý</dt><dd>{job ? <>{job.kind} <StatusBadge tone={jl.tone}>{jl.label}</StatusBadge></> : <span className="ops-muted">Chưa có job xử lý.</span>}</dd>
      {job && <><dt>Tạo lúc</dt><dd>{formatDateTime(job.createdAt)}</dd></>}
      {attempt && <>
        <dt>Lần chạy hiện hành</dt>
        <dd>#{attempt.attemptNumber} · {attempt.status} · toolchain {attempt.toolchainVersion}<br /><span className="ops-muted">Bắt đầu {formatDateTime(attempt.startedAt)}{attempt.finishedAt ? ` · kết thúc ${formatDateTime(attempt.finishedAt)}` : ""}{attempt.outputHash ? ` · output ${shortHash(attempt.outputHash, 12)}` : ""}</span></dd>
      </>}
      {job && !attempt && !isTerminalJob(job.status) && <><dt>Lần chạy hiện hành</dt><dd><span className="ops-muted">Chưa có worker nhận job.</span></dd></>}
    </dl>

    <Alert tone={verdict.tone === "success" ? "success" : verdict.tone === "danger" ? "danger" : verdict.tone === "warning" ? "warning" : "info"} title={verdict.label}>
      {verdict.detail}
      {job?.status === "Succeeded" && verdict.state !== "passed" && " Trạng thái job “Worker chạy xong” không có nghĩa là QA đạt."}
    </Alert>

    {runs.length > 0 && <Table caption="Validation run của lần chạy hiện hành">
      <thead><tr><th>Phạm vi</th><th>Validator</th><th>Kết quả</th><th>Kết thúc</th></tr></thead>
      <tbody>{runs.map((run) => <tr key={run.id}><td>{run.scope}</td><td>{run.validatorVersion}</td><td><StatusBadge tone={run.status === "Passed" ? "success" : run.status === "Failed" ? "danger" : "warning"}>{run.status}</StatusBadge></td><td>{formatDateTime(run.finishedAt)}</td></tr>)}</tbody>
    </Table>}

    {actionError && <Alert tone="danger">{actionError}</Alert>}

    <div className="ops-actions">
      {canStart && <Button onClick={() => void startProcessing()} disabled={working !== null}><Play size={16} aria-hidden="true" />{working === "process" ? "Đang gửi…" : "Chạy xử lý IFC"}</Button>}
      {job?.status === "Failed" && <Button variant="secondary" onClick={() => { setRetryError(""); setRetryOpen(true); }} disabled={working !== null}><RotateCcw size={16} aria-hidden="true" />Chạy lại job thất bại</Button>}
    </div>

    <Modal
      open={retryOpen}
      onOpenChange={(open) => { if (!open && working !== "retry") setRetryOpen(false); }}
      title="Chạy lại job thất bại?"
      description="Job được đưa lại vào hàng đợi. Lý do được lưu để truy vết; gửi lại cùng lý do sẽ không tạo thêm yêu cầu."
      footer={<><Button variant="quiet" onClick={() => setRetryOpen(false)} disabled={working === "retry"}>Hủy</Button><Button onClick={() => void submitRetry()} disabled={working === "retry"}>{working === "retry" ? "Đang gửi…" : "Chạy lại"}</Button></>}
    >
      <Field label="Lý do chạy lại" required error={retryError || undefined}>{(p) => <Textarea {...p} rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>
    </Modal>
  </Panel>;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
