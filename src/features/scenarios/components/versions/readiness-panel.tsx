"use client";

import { BadgeCheck, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useAsyncData, type AsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

import type { VersionJobs } from "../../use-version-jobs";
import { describeError, isJobSucceeded, missingText, type DescribedError } from "../../version-readiness";
import type { ScenarioVersionDetail, VersionIssue, VersionReadiness } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { formatDateTime } from "./version-content";
import { jobStatusText, jobTone } from "./package-build-panel";
import { SupportCode } from "./support-code";

const SEVERITIES = ["Critical", "Error", "Warning", "Info"] as const;
const severityTone: Record<string, Tone> = { critical: "danger", error: "danger", warning: "warning", info: "info" };
const severityLabel: Record<string, string> = { critical: "Nghiêm trọng", error: "Lỗi", warning: "Cảnh báo", info: "Thông tin" };

function severityKey(severity: string) {
  return severity.toLowerCase();
}

function IssueTable({ issues }: { issues: VersionIssue[] }) {
  const ordered = [...issues].sort((a, b) => SEVERITIES.findIndex((s) => s.toLowerCase() === severityKey(a.severity)) - SEVERITIES.findIndex((s) => s.toLowerCase() === severityKey(b.severity)));
  return <Table caption="Lỗi phát hiện khi kiểm tra">
    <thead><tr><th>Mức độ</th><th>Nội dung</th></tr></thead>
    <tbody>{ordered.map((issue) => <tr key={issue.id}>
      <td><StatusBadge tone={severityTone[severityKey(issue.severity)] ?? "neutral"}>{severityLabel[severityKey(issue.severity)] ?? issue.severity}</StatusBadge></td>
      <td>{issue.message}<small className="ver-code-hint">{issue.issueCode}{issue.isCurrentAttempt ? "" : " · lần dựng trước"}</small></td>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DescribedError | null>(null);

  const detail = jobs.detail;
  const verdict = jobs.verdict;
  const runs = jobs.qa?.validationRuns.items ?? [];
  const run = verdict && verdict.kind !== "none" ? verdict.run : undefined;
  const runIssues = (jobs.issues?.items ?? []).filter((issue) => run && issue.validationRunId === run.id);
  const issuesTruncated = (jobs.issues?.totalCount ?? 0) > (jobs.issues?.items.length ?? 0);
  const counts = SEVERITIES.map((severity) => ({ severity, count: runIssues.filter((issue) => severityKey(issue.severity) === severity.toLowerCase()).length }));
  const state = readiness.data;
  const confirmedId = state?.confirmationReviewId ?? null;
  const history = useAsyncData(`qa-history:${version.revisionId}`, (signal) => scenarioVersionsApi.listValidationRuns(accessToken, version.revisionId, 1, 20, signal));

  const confirm = async () => {
    if (busy || !run || verdict?.kind !== "passed" || !canAct) return;
    setBusy(true);
    setError(null);
    try {
      const result = await scenarioVersionsApi.confirmForTraining(accessToken, version.revisionId, {
        scenarioVersionId: version.id,
        // A package-build run never carries an annotation set (the worker records none), so none is sent.
        validationRunId: run.id,
      });
      onConfirmed();
      history.reload();
      void result;
      toast.notify({ tone: "success", title: "Đã chốt gói phát hành", description: "Tab Phát hành sẽ dùng đúng gói này." });
    } catch (cause) {
      setError(describeError(cause, "Không chốt được gói."));
    } finally {
      setBusy(false);
    }
  };

  if (!jobs.selectedJobId) {
    return <Alert tone="info" title="Chưa có kết quả kiểm tra">Phiên bản này chưa dựng gói. Hãy dựng gói ở tab &quot;Dựng gói&quot;; xong hệ thống sẽ tự kiểm tra.</Alert>;
  }

  const qaBadge = !detail ? null
    : !isJobSucceeded(detail.job.status) ? <StatusBadge tone="neutral">Chưa có</StatusBadge>
    : !verdict || verdict.kind === "none" ? <StatusBadge tone="warning">{jobs.qaMissing ? "Chưa có kết quả" : "Đang kiểm tra"}</StatusBadge>
    : <StatusBadge tone={verdict.kind === "passed" ? "success" : "danger"}>{verdict.kind === "passed" ? "Kiểm tra đạt" : "Kiểm tra không đạt"}</StatusBadge>;
  const outcomeLabel = (value: string) => value.toLowerCase() === "passed" ? "Đạt" : value.toLowerCase() === "failed" ? "Không đạt" : value;
  const kindName: Record<string, string> = { ReleasePackage: "Gói phát hành", PlaytestPackage: "Gói chạy thử", Geometry: "Mô hình IFC" };

  return <div className="ops-stack">
    <div className="ver-split">
      <div className="ops-stack">
        <Panel title="Lịch sử kiểm tra" description="Mọi lần kiểm tra tự động của bản IFC này, mới nhất ở trên." bodyClassName="ops-stack">
          {history.error !== undefined && <Alert tone="danger" title="Không tải được lịch sử kiểm tra" action={<Button size="sm" variant="secondary" className="mt-3" onClick={history.reload}>Thử lại</Button>}>{describeError(history.error).message}</Alert>}
          {history.loading && !history.data && <p className="ver-note" role="status">Đang tải lịch sử…</p>}
          {history.data && history.data.items.length === 0 && <p className="ver-note">Chưa có lần kiểm tra nào.</p>}
          {history.data && history.data.items.length > 0 && <Table caption="Lịch sử kiểm tra">
            <thead><tr><th>Đối tượng</th><th>Kết quả</th><th>Lúc</th></tr></thead>
            <tbody>{history.data.items.map((item) => <tr key={item.id} title={item.isCurrent ? "Lần mới nhất" : "Lần trước"}>
              <td>{kindName[item.jobKind] ?? item.jobKind}{item.isCurrent ? "" : <small className="ver-code-hint">lần trước</small>}</td>
              <td><StatusBadge tone={item.outcome.toLowerCase() === "passed" ? "success" : "danger"}>{outcomeLabel(item.outcome)}</StatusBadge></td>
              <td>{formatDateTime(item.createdAt)}</td>
            </tr>)}</tbody>
          </Table>}
          {history.data && history.data.totalCount > history.data.items.length && <p className="ver-note">Hiển thị {history.data.items.length}/{history.data.totalCount} lần mới nhất.</p>}
        </Panel>
      </div>
      <div className="ops-stack">
        <Panel
          title="Kết quả kiểm tra tự động"
          description="Dựng xong, hệ thống tự kiểm tra gói. Gói chỉ dùng được khi kiểm tra đạt và không có lỗi chặn."
          actions={<Button size="sm" variant="quiet" onClick={() => { jobs.refresh(); readiness.reload(); history.reload(); }}><RefreshCw size={14} aria-hidden="true" />Làm mới</Button>}
          bodyClassName="ops-stack"
        >
          {!detail && <p className="ver-note" role="status">Đang tải…</p>}
          {detail && <div className="ver-actions-row">
            <span className="ver-note">Dựng gói:</span><StatusBadge tone={jobTone(detail.job.status)}>{jobStatusText(detail.job.status)}</StatusBadge>
            <span className="ver-note">Kiểm tra:</span>{qaBadge}
          </div>}
          {jobs.qaMissing && <Alert tone="warning" title="Chưa có kết quả kiểm tra" action={<Button size="sm" variant="secondary" className="mt-3" onClick={jobs.refresh}>Tải lại kết quả</Button>}>Gói đã dựng xong nhưng hệ thống chưa gửi kết quả kiểm tra. Thử tải lại sau ít phút.</Alert>}
          {detail && !isJobSucceeded(detail.job.status) && <p className="ver-note">Gói chưa dựng xong nên chưa có kết quả. Theo dõi ở tab &quot;Dựng gói&quot;.</p>}
          {runs.length > 0 && <Table caption="Các lần kiểm tra của lượt dựng này">
            <thead><tr><th>Lần kiểm tra</th><th>Kết quả</th><th>Xong lúc</th></tr></thead>
            <tbody>{runs.map((item, index) => <tr key={item.id} className={item.id === run?.id ? "ver-row-selected" : undefined}>
              <td>{index === 0 ? "Mới nhất" : `Lần ${runs.length - index}`}</td>
              <td><StatusBadge tone={item.status.toLowerCase() === "passed" ? "success" : "danger"}>{outcomeLabel(item.status)}</StatusBadge></td>
              <td>{formatDateTime(item.finishedAt)}</td>
            </tr>)}</tbody>
          </Table>}
        </Panel>

        {run && <Panel title="Lỗi phát hiện" description="Lỗi và Nghiêm trọng chặn việc chốt gói; Cảnh báo và Thông tin chỉ để biết." bodyClassName="ops-stack">
          <div className="ver-actions-row" aria-label="Số lỗi theo mức độ">
            {counts.map(({ severity, count }) => <StatusBadge key={severity} tone={count ? severityTone[severity.toLowerCase()] : "neutral"}>{severityLabel[severity.toLowerCase()]}: {count}</StatusBadge>)}
          </div>
          {issuesTruncated && <Alert tone="warning" title="Danh sách lỗi bị cắt">Chỉ hiển thị {jobs.issues?.items.length} trên {jobs.issues?.totalCount} lỗi. Kết luận cuối cùng do hệ thống kiểm tra lại khi chốt gói.</Alert>}
          {runIssues.length ? <IssueTable issues={runIssues} /> : <p className="ver-note">Không phát hiện lỗi nào.</p>}
        </Panel>}
      </div>
    </div>
    <div className="ver-two">
      <Panel title="Còn thiếu gì để phát hành?" description="Hệ thống tự kiểm tra lại từng điều kiện khi chốt gói, tạo bản phát hành và phát hành." bodyClassName="ops-stack">
        {readiness.loading && !state && <p className="ver-note" role="status">Đang tải…</p>}
        {readiness.error !== undefined && !state && <Alert tone="danger" title="Không tải được tình trạng sẵn sàng" action={<Button size="sm" variant="secondary" className="mt-3" onClick={readiness.reload}>Thử lại</Button>}>{describeError(readiness.error).message}</Alert>}
        {state && <>
          <div className="ver-actions-row">
            <StatusBadge tone={state.technicalReady ? "success" : "warning"}>{state.technicalReady ? "Kỹ thuật đã sẵn sàng" : "Kỹ thuật chưa sẵn sàng"}</StatusBadge>
            {state.blockerCount > 0 && <span className="ver-note">{state.blockerCount} lỗi chặn</span>}
          </div>
          {state.missing.length > 0 && <ul className="ver-list" data-testid="readiness-missing">{state.missing.map((code) => <li key={code} data-code={code}>{missingText(code)}</li>)}</ul>}
          {state.missing.length === 0 && <p className="ver-note">Phần kỹ thuật đã đủ. Còn duyệt nội dung và phát hành ở các tab sau.</p>}
          {state.blockers.length > 0 && <Table caption="Lỗi đang chặn">
            <thead><tr><th>Mức độ</th><th>Nội dung</th></tr></thead>
            <tbody>{state.blockers.map((blocker, index) => <tr key={blocker.issueCode + "-" + index}>
              <td><StatusBadge tone={severityTone[severityKey(blocker.severity)] ?? "neutral"}>{severityLabel[severityKey(blocker.severity)] ?? blocker.severity}</StatusBadge></td>
              <td>{blocker.message}<small className="ver-code-hint">{blocker.issueCode}</small></td>
            </tr>)}</tbody>
          </Table>}
        </>}
      </Panel>

      <Panel title="Chốt gói phát hành" description="Bạn xác nhận dùng đúng gói vừa kiểm tra đạt này khi tạo bản phát hành. Đây không phải duyệt nội dung: phần đó do quản trị FET3D làm ở tab Gửi duyệt." bodyClassName="ops-stack">
        {confirmedId && <Alert tone="success" title="Đã chốt gói">
          Tab Phát hành sẽ dùng đúng gói này. Muốn đổi gói, hãy tạo phiên bản mới và dựng lại.
          <details className="ver-support"><summary>Thông tin cho bộ phận hỗ trợ</summary><span>Mã chốt: <code className="ver-hash" data-testid="confirm-review-id">{confirmedId}</code></span></details>
        </Alert>}
        {verdict?.kind === "failed" && <Alert tone="danger" title="Kiểm tra chưa đạt nên chưa chốt được">
          {verdict.blockingIssues.length ? `Có ${verdict.blockingIssues.length} lỗi chặn.` : "Lần kiểm tra mới nhất không đạt."} Sửa nội dung trong trình soạn, tạo phiên bản mới rồi dựng lại gói.
        </Alert>}
        {!confirmedId && (!verdict || verdict.kind === "none") && <p className="ver-note">Chưa chốt được: cần một lần kiểm tra đạt.</p>}
        {error && <Alert tone="danger" title={error.message}><SupportCode code={error.code} /></Alert>}
        <div className="ver-actions-row">
          <Button onClick={() => void confirm()} disabled={busy || verdict?.kind !== "passed" || !canAct || Boolean(confirmedId)}><BadgeCheck size={16} aria-hidden="true" />{busy ? "Đang chốt…" : confirmedId ? "Đã chốt gói" : "Chốt gói phát hành"}</Button>
          {!confirmedId && verdict?.kind !== "passed" && <span className="ver-note">Nút bật khi kiểm tra đạt và không còn lỗi chặn.</span>}
          {!canAct && <span className="ver-note">Tài khoản của bạn chỉ có quyền xem.</span>}
        </div>
      </Panel>
    </div>
  </div>;
}
