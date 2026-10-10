"use client";

import { BadgeCheck, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

import type { VersionJobs } from "../../use-version-jobs";
import type { VersionMemory } from "../../use-version-memory";
import { describeError, isJobSucceeded, isUuid, shortHash, type DescribedError } from "../../version-readiness";
import type { ScenarioVersionDetail, VersionIssue } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { formatDateTime } from "./version-content";
import { jobStatusText, jobTone } from "./package-build-panel";

const SEVERITIES = ["Critical", "Error", "Warning", "Info"] as const;
const severityTone: Record<string, Tone> = { critical: "danger", error: "danger", warning: "warning", info: "info" };
const severityLabel: Record<string, string> = { critical: "Nghiêm trọng", error: "Lỗi", warning: "Cảnh báo", info: "Thông tin" };

function severityKey(severity: string) {
  return severity.toLowerCase();
}

function IssueTable({ issues }: { issues: VersionIssue[] }) {
  const ordered = [...issues].sort((a, b) => SEVERITIES.findIndex((s) => s.toLowerCase() === severityKey(a.severity)) - SEVERITIES.findIndex((s) => s.toLowerCase() === severityKey(b.severity)));
  return <Table caption="Issue của validation run">
    <thead><tr><th>Mức độ</th><th>Mã</th><th>Nội dung</th><th>Lần chạy</th></tr></thead>
    <tbody>{ordered.map((issue) => <tr key={issue.id}>
      <td><StatusBadge tone={severityTone[severityKey(issue.severity)] ?? "neutral"}>{severityLabel[severityKey(issue.severity)] ?? issue.severity}</StatusBadge></td>
      <td className="ops-cell-primary">{issue.issueCode}</td>
      <td>{issue.message}</td>
      <td>{issue.isCurrentAttempt ? "Hiện hành" : "Lịch sử"}</td>
    </tr>)}</tbody>
  </Table>;
}

/**
 * Technical readiness: the job's validation run and its Error/Critical issues decide QA. A Succeeded job without a
 * Passed run (or with Error/Critical issues) is not ready. Confirming records a technical attestation only; it never
 * approves the scenario content.
 */
export function ReadinessPanel({ accessToken, version, jobs, memory, remember, canAct }: {
  accessToken: string;
  version: ScenarioVersionDetail;
  jobs: VersionJobs;
  memory: VersionMemory;
  remember: (patch: VersionMemory) => void;
  canAct: boolean;
}) {
  const toast = useToast();
  const [annotationSetId, setAnnotationSetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DescribedError | null>(null);

  const detail = jobs.detail;
  const verdict = jobs.verdict;
  const runs = jobs.qa?.validationRuns.items ?? [];
  const run = verdict && verdict.kind !== "none" ? verdict.run : undefined;
  const runIssues = (jobs.issues?.items ?? []).filter((issue) => run && issue.validationRunId === run.id);
  const issuesTruncated = (jobs.issues?.totalCount ?? 0) > (jobs.issues?.items.length ?? 0);
  const counts = SEVERITIES.map((severity) => ({ severity, count: runIssues.filter((issue) => severityKey(issue.severity) === severity.toLowerCase()).length }));
  const annotationError = annotationSetId.trim() && !isUuid(annotationSetId) ? "Mã annotation set phải là UUID." : undefined;
  const confirmedHere = Boolean(memory.confirmReviewId) && memory.confirmRunId === run?.id;

  const confirm = async () => {
    if (busy || !run || verdict?.kind !== "passed" || annotationError || !canAct) return;
    setBusy(true);
    setError(null);
    try {
      const result = await scenarioVersionsApi.confirmForTraining(accessToken, version.revisionId, {
        scenarioVersionId: version.id,
        validationRunId: run.id,
        ...(annotationSetId.trim() ? { annotationSetId: annotationSetId.trim() } : {}),
      });
      remember({ confirmReviewId: result.reviewId, confirmRunId: run.id });
      toast.notify({ tone: "success", title: "Đã xác nhận kỹ thuật", description: "Chưa phải duyệt nội dung." });
    } catch (cause) {
      setError(describeError(cause, "Không xác nhận được."));
    } finally {
      setBusy(false);
    }
  };

  if (!jobs.selectedJobId) {
    return <Alert tone="info" title="Chưa có kết quả kỹ thuật">Chưa có job package build cho phiên bản này. Hãy chạy package build ở tab &quot;Package build&quot;.</Alert>;
  }

  return <div className="ops-stack">
    <Panel
      title="Job và QA của validation run"
      description="Kết quả kỹ thuật gắn với revision IFC của phiên bản. Không thay thế duyệt nội dung."
      actions={<Button size="sm" variant="quiet" onClick={jobs.refresh}><RefreshCw size={14} aria-hidden="true" />Làm mới</Button>}
      bodyClassName="ops-stack"
    >
      {!detail && <p className="ver-note" role="status">Đang tải trạng thái job…</p>}
      {detail && <div className="ver-actions-row">
        <span className="ver-note">Job:</span><StatusBadge tone={jobTone(detail.job.status)}>{jobStatusText(detail.job.status)}</StatusBadge>
        <span className="ver-note">QA:</span>
        {!isJobSucceeded(detail.job.status)
          ? <StatusBadge tone="neutral">Chưa có</StatusBadge>
          : !verdict || verdict.kind === "none"
            ? <StatusBadge tone="warning">{jobs.qaMissing ? "Chưa có validation run" : "Đang chờ kết quả QA"}</StatusBadge>
            : <StatusBadge tone={verdict.kind === "passed" ? "success" : "danger"}>{verdict.kind === "passed" ? "QA Passed" : "QA Failed"}</StatusBadge>}
      </div>}
      {detail && isJobSucceeded(detail.job.status) && <Alert tone="info" title="Job Succeeded không có nghĩa là QA Passed">QA chỉ đạt khi validation run có trạng thái Passed và không còn issue Error/Critical.</Alert>}
      {jobs.qaMissing && <Alert tone="warning" title="Chưa có validation run cho job này" action={<Button size="sm" variant="secondary" className="mt-3" onClick={jobs.refresh}>Tải lại kết quả QA</Button>}>Job đã Succeeded nhưng BE chưa trả validation run nào. Không thể xem là QA Passed.</Alert>}
      {detail && !isJobSucceeded(detail.job.status) && <p className="ver-note">Job chưa Succeeded nên chưa có kết quả QA. Xem tab &quot;Package build&quot; để theo dõi.</p>}

      {runs.length > 0 && <Table caption="Validation run của job">
        <thead><tr><th>Run</th><th>Validator</th><th>Kết quả</th><th>Hoàn tất</th></tr></thead>
        <tbody>{runs.map((item) => <tr key={item.id} className={item.id === run?.id ? "ver-row-selected" : undefined}>
          <td className="ver-hash">{shortHash(item.id, 13)}</td>
          <td>{item.validatorVersion}</td>
          <td><StatusBadge tone={item.status.toLowerCase() === "passed" ? "success" : "danger"}>{item.status.toLowerCase() === "passed" ? "Passed" : item.status}</StatusBadge></td>
          <td>{formatDateTime(item.finishedAt)}</td>
        </tr>)}</tbody>
      </Table>}
    </Panel>

    {run && <Panel title="Issue theo mức độ" description="Chỉ tính issue của validation run đang xét. Error và Critical chặn xác nhận kỹ thuật và release." bodyClassName="ops-stack">
      <div className="ver-actions-row" aria-label="Số issue theo mức độ">
        {counts.map(({ severity, count }) => <StatusBadge key={severity} tone={count ? severityTone[severity.toLowerCase()] : "neutral"}>{severityLabel[severity.toLowerCase()]}: {count}</StatusBadge>)}
      </div>
      {issuesTruncated && <Alert tone="warning" title="Danh sách issue bị cắt">Chỉ hiển thị {jobs.issues?.items.length} trên {jobs.issues?.totalCount} issue của revision. Kết luận cuối cùng do BE quyết định khi xác nhận.</Alert>}
      {runIssues.length ? <IssueTable issues={runIssues} /> : <p className="ver-note">Validation run này không có issue.</p>}
    </Panel>}

    <Panel title="Xác nhận kỹ thuật (confirm-for-training)" description="Ghi nhận rằng đúng revision, version, validation run và artifact đã đạt QA. Không phải duyệt nội dung." bodyClassName="ops-stack">
      {confirmedHere && <Alert tone="success" title="Đã xác nhận kỹ thuật (trong phiên này)">
        Mã xác nhận: <span className="ver-hash" data-testid="confirm-review-id">{memory.confirmReviewId}</span>. Mã này cần khi tạo release; BE chưa có API đọc lại (BE#53). Nếu mất mã, bấm xác nhận lại với cùng validation run sẽ trả lại đúng mã.
      </Alert>}
      {verdict?.kind === "failed" && <Alert tone="danger" title="QA chưa đạt, không thể xác nhận">
        {verdict.blockingIssues.length ? `${verdict.blockingIssues.length} issue Error/Critical trong validation run.` : "Validation run không ở trạng thái Passed."} Sửa nguyên nhân rồi chạy package build mới.
      </Alert>}
      {(!verdict || verdict.kind === "none") && <p className="ver-note">Chưa thể xác nhận: chưa có validation run Passed.</p>}
      {run && <dl className="ver-dl">
        <dt>Validation run</dt><dd className="ver-hash">{run.id}</dd>
        <dt>Artifact ứng viên</dt><dd className="ver-hash">{run.artifactId ?? "—"}</dd>
      </dl>}
      <Field label="Annotation set (nếu validation run có gắn)" error={annotationError} hint="Để trống nếu run không gắn annotation set. Sai giá trị sẽ báo READINESS_PROVENANCE_MISMATCH.">
        {(p) => <Input {...p} value={annotationSetId} placeholder="UUID (không bắt buộc)" autoComplete="off" spellCheck={false} onChange={(event) => setAnnotationSetId(event.target.value)} />}
      </Field>
      {error && <Alert tone="danger" title={error.message}>{error.code && <>Mã lỗi: {error.code}.</>}</Alert>}
      <div className="ver-actions-row">
        <Button onClick={() => void confirm()} disabled={busy || verdict?.kind !== "passed" || Boolean(annotationError) || !canAct}><BadgeCheck size={16} aria-hidden="true" />{busy ? "Đang xác nhận…" : confirmedHere ? "Xác nhận lại để lấy mã" : "Xác nhận kỹ thuật"}</Button>
        {verdict?.kind !== "passed" && <span className="ver-note">Chỉ bật khi QA Passed và không còn issue Error/Critical.</span>}
      </div>
    </Panel>
  </div>;
}
