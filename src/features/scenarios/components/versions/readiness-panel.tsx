"use client";

import { BadgeCheck, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useAsyncData, type AsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

import type { VersionJobs } from "../../use-version-jobs";
import { describeError, isJobSucceeded, isUuid, missingText, shortHash, type DescribedError } from "../../version-readiness";
import type { ScenarioVersionDetail, VersionIssue, VersionReadiness } from "../../version-types";
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
export function ReadinessPanel({ accessToken, version, jobs, readiness, canAct, onConfirmed }: {
  accessToken: string;
  version: ScenarioVersionDetail;
  jobs: VersionJobs;
  /** Server-reported technical readiness of this version (survives reload; also names the confirmation). */
  readiness: AsyncData<VersionReadiness>;
  canAct: boolean;
  /** Called after a confirmation so the server state is re-read. */
  onConfirmed: () => void;
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
  const state = readiness.data;
  const confirmedId = state?.confirmationReviewId ?? null;
  const history = useAsyncData(`qa-history:${version.revisionId}`, (signal) => scenarioVersionsApi.listValidationRuns(accessToken, version.revisionId, 1, 20, signal));

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
      onConfirmed();
      history.reload();
      toast.notify({ tone: "success", title: "Đã xác nhận kỹ thuật", description: "Mã xác nhận " + shortHash(result.reviewId, 13) + ". Chưa phải duyệt nội dung." });
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
    <div className="ver-split">
      <div className="ops-stack">
    <Panel title="Lịch sử QA theo revision" description="Mọi validation run của revision, mới nhất trước." bodyClassName="ops-stack">
      {history.error !== undefined && <Alert tone="danger" title="Không tải được lịch sử QA" action={<Button size="sm" variant="secondary" className="mt-3" onClick={history.reload}>Thử lại</Button>}>{describeError(history.error).message}</Alert>}
      {history.loading && !history.data && <p className="ver-note" role="status">Đang tải lịch sử QA…</p>}
      {history.data && history.data.items.length === 0 && <p className="ver-note">Revision chưa có validation run nào.</p>}
      {history.data && history.data.items.length > 0 && <Table caption="Lịch sử validation run">
        <thead><tr><th>Run</th><th>Loại job</th><th>Kết quả</th><th>Hiện hành</th><th>Tạo lúc</th></tr></thead>
        <tbody>{history.data.items.map((item) => <tr key={item.id}>
          <td className="ver-hash">{shortHash(item.id, 13)}</td>
          <td>{item.jobKind}</td>
          <td><StatusBadge tone={item.outcome.toLowerCase() === "passed" ? "success" : "danger"}>{item.outcome}</StatusBadge></td>
          <td>{item.isCurrent ? "Có" : "Lịch sử"}</td>
          <td>{formatDateTime(item.createdAt)}</td>
        </tr>)}</tbody>
      </Table>}
      {history.data && history.data.totalCount > history.data.items.length && <p className="ver-note">Hiển thị {history.data.items.length}/{history.data.totalCount} run mới nhất.</p>}
    </Panel>

      </div>
      <div className="ops-stack">
    <Panel
      title="Job và QA của validation run"
      description="Kết quả kỹ thuật gắn với revision IFC của phiên bản. Không thay thế duyệt nội dung."
      actions={<Button size="sm" variant="quiet" onClick={() => { jobs.refresh(); readiness.reload(); history.reload(); }}><RefreshCw size={14} aria-hidden="true" />Làm mới</Button>}
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

      </div>
    </div>
    <div className="ver-two">
    <Panel title="Điều kiện còn thiếu (máy chủ báo)" description="Chỉ báo cáo; xác nhận kỹ thuật, tạo release và phát hành đều kiểm tra lại từng điều kiện." bodyClassName="ops-stack">
      {readiness.loading && !state && <p className="ver-note" role="status">Đang tải readiness…</p>}
      {readiness.error !== undefined && !state && <Alert tone="danger" title="Không tải được readiness" action={<Button size="sm" variant="secondary" className="mt-3" onClick={readiness.reload}>Thử lại</Button>}>{describeError(readiness.error).message}</Alert>}
      {state && <>
        <div className="ver-actions-row">
          <StatusBadge tone={state.technicalReady ? "success" : "warning"}>{state.technicalReady ? "Sẵn sàng kỹ thuật" : "Chưa sẵn sàng kỹ thuật"}</StatusBadge>
          {state.outcome && <StatusBadge tone={state.outcome.toLowerCase() === "passed" ? "success" : "danger"}>QA {state.outcome}</StatusBadge>}
          <span className="ver-note">{state.blockerCount} issue chặn (Error/Critical)</span>
        </div>
        {state.missing.length > 0 && <ul className="ver-list" data-testid="readiness-missing">{state.missing.map((code) => <li key={code}><strong>{code}</strong>: {missingText(code)}</li>)}</ul>}
        {state.missing.length === 0 && <p className="ver-note">Không còn điều kiện kỹ thuật nào thiếu. Đây chưa phải duyệt nội dung hay phát hành.</p>}
        {state.blockers.length > 0 && <Table caption="Issue chặn của phiên bản">
          <thead><tr><th>Mức độ</th><th>Mã</th><th>Nội dung</th></tr></thead>
          <tbody>{state.blockers.map((blocker, index) => <tr key={blocker.issueCode + "-" + index}>
            <td><StatusBadge tone={severityTone[severityKey(blocker.severity)] ?? "neutral"}>{severityLabel[severityKey(blocker.severity)] ?? blocker.severity}</StatusBadge></td>
            <td className="ops-cell-primary">{blocker.issueCode}</td>
            <td>{blocker.message}</td>
          </tr>)}</tbody>
        </Table>}
      </>}
    </Panel>

    <Panel title="Xác nhận sẵn sàng đào tạo" description="Gắn đúng phiên bản, package và validation run đã đạt QA. Không phải duyệt nội dung." bodyClassName="ops-stack">
      {confirmedId && <Alert tone="success" title="Đã xác nhận kỹ thuật">
        Mã xác nhận: <span className="ver-hash" data-testid="confirm-review-id">{confirmedId}</span>. Máy chủ giữ mã này; tab Release tự dùng khi tạo release.
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
        <Button onClick={() => void confirm()} disabled={busy || verdict?.kind !== "passed" || Boolean(annotationError) || !canAct || Boolean(confirmedId)}><BadgeCheck size={16} aria-hidden="true" />{busy ? "Đang xác nhận…" : confirmedId ? "Đã xác nhận" : "Xác nhận kỹ thuật"}</Button>
        {!confirmedId && verdict?.kind !== "passed" && <span className="ver-note">Chỉ bật khi QA Passed và không còn issue Error/Critical.</span>}
      </div>
    </Panel>
    </div>
  </div>;
}
