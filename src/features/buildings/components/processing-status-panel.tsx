"use client";

import { RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { describeApiError, formatDateTime, shortHash } from "../format";
import { deriveQaVerdict, isTerminalJob, jobLabel, revisionLabel, type RevisionPipeline } from "../pipeline";
import type { BuildingRevision, RevisionIssue } from "../types";

/** Worker status and QA of the selected revision. Starting and retrying live in the progress view above. */
export function ProcessingStatusPanel({ revision, pipeline, issues, polling, pollError, onRefresh }: {
  revision: BuildingRevision;
  pipeline: RevisionPipeline;
  issues: RevisionIssue[] | undefined;
  polling: boolean;
  pollError: unknown;
  onRefresh: () => void;
}) {
  const { job, detail, qa } = pipeline;
  const attempt = detail?.currentAttempt ?? null;
  const rev = revisionLabel(revision.status);
  const jl = jobLabel(job?.status);
  const verdict = deriveQaVerdict(pipeline, issues?.filter((issue) => issue.isCurrentAttempt));
  const runs = qa?.validationRuns.items ?? [];

  return <Panel
    id="ifc-processing"
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

    <Alert tone={verdict.tone === "success" ? "success" : verdict.tone === "danger" ? "danger" : verdict.tone === "warning" ? "warning" : "info"} title={verdict.label}
      action={pipeline.qaError !== undefined ? <Button size="sm" variant="secondary" className="mt-3" onClick={onRefresh}>Tải lại kết quả QA</Button> : undefined}>
      {verdict.detail}
      {pipeline.qaError !== undefined && ` ${describeApiError(pipeline.qaError, "")}`}
      {job?.status === "Succeeded" && verdict.state !== "passed" && " Trạng thái job “Worker chạy xong” không có nghĩa là QA đạt."}
    </Alert>

    {runs.length > 0 && <Table caption="Validation run của lần chạy hiện hành">
      <thead><tr><th>Phạm vi</th><th>Validator</th><th>Kết quả</th><th>Kết thúc</th></tr></thead>
      <tbody>{runs.map((run) => <tr key={run.id}><td>{run.scope}</td><td>{run.validatorVersion}</td><td><StatusBadge tone={run.status === "Passed" ? "success" : run.status === "Failed" ? "danger" : "warning"}>{run.status}</StatusBadge></td><td>{formatDateTime(run.finishedAt)}</td></tr>)}</tbody>
    </Table>}
  </Panel>;
}
