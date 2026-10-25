"use client";

import { RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { describeApiError, formatDateTime } from "../format";
import { deriveQaVerdict, isTerminalJob, jobKindLabel, jobLabel, revisionLabel, runStatusLabel, type RevisionPipeline } from "../pipeline";
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
    title="Xử lý và kiểm tra tự động"
    description="Xử lý xong chưa có nghĩa là mô hình đạt: hãy xem kết quả kiểm tra bên dưới."
    actions={<>
      {polling && <span className="ops-muted" role="status" aria-live="polite">Tự cập nhật mỗi 3 giây…</span>}
      <Button size="sm" variant="quiet" onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>
    </>}
    bodyClassName="ops-stack"
  >
    {pollError !== undefined && <Alert tone="danger" title="Không cập nhật được trạng thái xử lý" action={<Button size="sm" variant="secondary" className="mt-3" onClick={onRefresh}>Thử lại</Button>}>{describeApiError(pollError, "Hệ thống sẽ tự thử lại; bạn cũng có thể tải lại thủ công.")}</Alert>}

    <dl className="ops-kv">
      <dt>Bản IFC</dt><dd>{revision.versionLabel} <StatusBadge tone={rev.tone}>{rev.label}</StatusBadge></dd>
      <dt>Lượt xử lý</dt><dd>{job ? <>{jobKindLabel(job.kind)} <StatusBadge tone={jl.tone}>{jl.label}</StatusBadge></> : <span className="ops-muted">Chưa được xử lý.</span>}</dd>
      {job && <><dt>Tạo lúc</dt><dd>{formatDateTime(job.createdAt)}</dd></>}
      {attempt && <>
        <dt>Lần chạy mới nhất</dt>
        <dd>Lần thứ {attempt.attemptNumber} · {jobLabel(attempt.status).label}<br /><span className="ops-muted">Bắt đầu {formatDateTime(attempt.startedAt)}{attempt.finishedAt ? ` · kết thúc ${formatDateTime(attempt.finishedAt)}` : ""}</span></dd>
      </>}
      {job && !attempt && !isTerminalJob(job.status) && <><dt>Lần chạy mới nhất</dt><dd><span className="ops-muted">Đang chờ máy xử lý nhận tệp.</span></dd></>}
    </dl>

    <Alert tone={verdict.tone === "success" ? "success" : verdict.tone === "danger" ? "danger" : verdict.tone === "warning" ? "warning" : "info"} title={verdict.label}
      action={pipeline.qaError !== undefined ? <Button size="sm" variant="secondary" className="mt-3" onClick={onRefresh}>Tải lại kết quả kiểm tra</Button> : undefined}>
      {verdict.detail}
      {pipeline.qaError !== undefined && ` ${describeApiError(pipeline.qaError, "")}`}
      {job?.status === "Succeeded" && verdict.state !== "passed" && " “Đã xử lý xong” không có nghĩa là mô hình đã đạt kiểm tra."}
    </Alert>

    {runs.length > 0 && <Table caption="Các lần kiểm tra tự động của lượt xử lý mới nhất">
      <thead><tr><th>Lần kiểm tra</th><th>Kết quả</th><th>Kết thúc</th></tr></thead>
      <tbody>{runs.map((run, index) => { const result = runStatusLabel(run.status); return <tr key={run.id}><td>Lần {runs.length - index}</td><td><StatusBadge tone={result.tone}>{result.label}</StatusBadge></td><td>{formatDateTime(run.finishedAt)}</td></tr>; })}</tbody>
    </Table>}
  </Panel>;
}
