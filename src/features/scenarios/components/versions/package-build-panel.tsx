"use client";

import { Hammer, RefreshCw, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useIdempotencyKey } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

import type { VersionJobs } from "../../use-version-jobs";
import { describeError, isJobSucceeded, isJobTerminal, shortHash, type DescribedError } from "../../version-readiness";
import type { PackageKind, ScenarioVersionDetail } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { formatDateTime } from "./version-content";

const kindLabel: Record<string, string> = { ReleasePackage: "Release package", PlaytestPackage: "Playtest package" };

export function jobTone(status: string | undefined): Tone {
  switch (status?.toLowerCase()) {
    case "succeeded": return "success";
    case "failed": return "danger";
    case "cancelled": case "canceled": return "neutral";
    case "running": return "info";
    default: return "pending";
  }
}

const jobStatusLabel: Record<string, string> = { queued: "Đang chờ", running: "Đang chạy", succeeded: "Job Succeeded", failed: "Thất bại", cancelled: "Đã hủy" };
export const jobStatusText = (status: string | undefined) => (status ? jobStatusLabel[status.toLowerCase()] ?? status : "—");

function JobTimeline({ status }: { status: string }) {
  const value = status.toLowerCase();
  const failed = value === "failed" || value === "cancelled" || value === "canceled";
  const steps = [
    { id: "queued", label: "Xếp hàng", state: value === "queued" ? "current" : "done" },
    { id: "running", label: "Đang chạy", state: value === "queued" ? "todo" : value === "running" ? "current" : "done" },
    { id: "final", label: failed ? (value === "failed" ? "Thất bại" : "Đã hủy") : "Job Succeeded", state: value === "succeeded" ? "done" : failed ? "failed" : "todo" },
  ];
  return <ol className="ver-timeline" aria-label="Tiến trình job">{steps.map((step) => <li key={step.id} data-state={step.state}>{step.label}</li>)}</ol>;
}

export function PackageBuildPanel({ accessToken, version, jobs, canAct, onStarted }: {
  accessToken: string;
  version: ScenarioVersionDetail;
  jobs: VersionJobs;
  canAct: boolean;
  /** Called with the accepted job id so the page can remember it. */
  onStarted: (jobId: string) => void;
}) {
  const toast = useToast();
  const buildKey = useIdempotencyKey();
  const retryKey = useIdempotencyKey();
  const [kind, setKind] = useState<PackageKind>("ReleasePackage");
  const [buildTarget, setBuildTarget] = useState("Windows");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DescribedError | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryReason, setRetryReason] = useState("");
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<DescribedError | null>(null);

  const target = buildTarget.trim();
  const targetError = !target ? "Nhập nền tảng dựng (build target)." : target.length > 100 ? "Tối đa 100 ký tự." : undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || targetError || !canAct) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { kind, buildTarget: target };
      const accepted = await scenarioVersionsApi.startPackageBuild(accessToken, version.id, payload, buildKey.keyFor({ versionId: version.id, ...payload }));
      buildKey.done();
      toast.notify({ tone: "info", title: "Đã xếp hàng package build", description: "202 chỉ xác nhận job đã được nhận, chưa phải kết quả." });
      jobs.reloadJobs();
      onStarted(accepted.jobId);
    } catch (cause) {
      setError(describeError(cause, "Không gửi được yêu cầu package build."));
    } finally {
      setBusy(false);
    }
  };

  const failedJob = jobs.detail && jobs.detail.job.status.toLowerCase() === "failed" ? jobs.detail.job : undefined;

  const retryFailed = async () => {
    if (!failedJob || retryBusy || !retryReason.trim()) return;
    setRetryBusy(true);
    setRetryError(null);
    try {
      const reason = retryReason.trim();
      // One requestId per retry intent: it stays the same when this exact retry is resent after a lost response.
      const requestId = retryKey.keyFor({ jobId: failedJob.id, reason });
      const result = await scenarioVersionsApi.retryJob(accessToken, failedJob.id, { requestId, reason });
      retryKey.done();
      setRetrying(false);
      setRetryReason("");
      toast.notify({ tone: "info", title: "Đã xếp hàng chạy lại job", description: `Kết quả: ${result.outcome}` });
      jobs.reloadJobs();
      jobs.selectJob(result.jobId);
    } catch (cause) {
      setRetryError(describeError(cause, "Không chạy lại được job."));
    } finally {
      setRetryBusy(false);
    }
  };

  const detail = jobs.detail;
  const attempt = detail?.currentAttempt;

  return <div className="ops-stack">
    <Panel title="Chạy package build" description="Dựng gói Unity từ snapshot đã đóng băng. Cần revision IFC đã xác minh upload." bodyClassName="ops-stack">
      <form className="ops-stack" onSubmit={submit} noValidate>
        <div className="ops-form-grid">
          <Field label="Loại package" required hint={kind === "ReleasePackage" ? "Dùng để tạo release." : "Chạy thử, không dùng để phát hành."}>
            {(p) => <Select {...p} value={kind} onChange={(event) => setKind(event.target.value as PackageKind)}>
              <option value="ReleasePackage">Release package</option>
              <option value="PlaytestPackage">Playtest package</option>
            </Select>}
          </Field>
          <Field label="Nền tảng dựng" required error={targetError} hint="Ví dụ: Windows.">
            {(p) => <Input {...p} value={buildTarget} maxLength={100} onChange={(event) => setBuildTarget(event.target.value)} />}
          </Field>
        </div>
        {error && <Alert tone="danger" title={error.message} action={<div className="ver-actions-row" style={{ marginTop: 10 }}>
          <Button size="sm" variant="secondary" type="submit" disabled={busy}><RefreshCw size={14} aria-hidden="true" />Thử lại (cùng khóa)</Button>
        </div>}>
          {error.code && <>Mã lỗi: {error.code}. </>}Thử lại dùng cùng Idempotency-Key nên không tạo job trùng.
        </Alert>}
        <div className="ver-actions-row">
          <Button type="submit" disabled={busy || Boolean(targetError) || !canAct}><Hammer size={16} aria-hidden="true" />{busy ? "Đang gửi…" : "Chạy package build"}</Button>
          {!canAct && <span className="ver-note">Tài khoản của bạn chỉ có quyền xem.</span>}
        </div>
      </form>
      <p className="ver-note">Phản hồi 202 chỉ nghĩa là job đã vào hàng đợi. Job Succeeded cũng chưa phải QA Passed: xem tab &quot;Kết quả kỹ thuật&quot;.</p>
    </Panel>

    <Panel
      title="Các job của phiên bản này"
      description="Lấy từ danh sách job của revision, nên vẫn thấy sau khi tải lại trang."
      actions={<Button size="sm" variant="quiet" onClick={jobs.reloadJobs} disabled={jobs.jobsLoading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>}
      bodyClassName="ops-stack"
    >
      {jobs.jobsError !== undefined && <Alert tone="danger" title="Không tải được danh sách job" action={<Button size="sm" variant="secondary" className="mt-3" onClick={jobs.reloadJobs}>Thử lại</Button>}>{describeError(jobs.jobsError).message}</Alert>}
      <Table caption="Job package build">
        <thead><tr><th>Loại</th><th>Trạng thái</th><th>Tạo lúc</th><th aria-label="Thao tác" /></tr></thead>
        <tbody>
          {jobs.jobsLoading && jobs.jobs.length === 0 && <TableMessage colSpan={4}><SkeletonRows rows={3} label="Đang tải job…" /></TableMessage>}
          {jobs.jobs.map((job) => <tr key={job.id} className={job.id === jobs.selectedJobId ? "ver-row-selected" : undefined}>
            <td className="ops-cell-primary">{kindLabel[job.kind] ?? job.kind}</td>
            <td><StatusBadge tone={jobTone(job.status)}>{jobStatusText(job.status)}</StatusBadge></td>
            <td>{formatDateTime(job.createdAt)}</td>
            <td className="ops-cell-actions"><Button size="sm" variant="quiet" aria-pressed={job.id === jobs.selectedJobId} onClick={() => jobs.selectJob(job.id)}>{job.id === jobs.selectedJobId ? "Đang xem" : "Theo dõi"}</Button></td>
          </tr>)}
          {!jobs.jobsLoading && jobs.jobsError === undefined && jobs.jobs.length === 0 && <TableMessage colSpan={4}><EmptyState icon={Hammer} title="Chưa có job package build" description="Chạy package build ở trên để có kết quả kỹ thuật cho phiên bản này." /></TableMessage>}
        </tbody>
      </Table>
    </Panel>

    {jobs.selectedJobId && <Panel
      title="Theo dõi job"
      description={jobs.watching ? "Đang cập nhật mỗi 3 giây; tự giãn khi lỗi và dừng khi job kết thúc." : "Đã dừng theo dõi vì job đã kết thúc."}
      actions={<Button size="sm" variant="quiet" onClick={jobs.refresh}><RefreshCw size={14} aria-hidden="true" />Làm mới</Button>}
      bodyClassName="ops-stack"
    >
      {!detail && jobs.watchError === undefined && <SkeletonRows rows={2} label="Đang tải trạng thái job…" />}
      {jobs.watchError !== undefined && <Alert tone={detail ? "warning" : "danger"} title={detail ? "Chưa cập nhật được trạng thái mới" : "Không tải được job"}>
        {describeError(jobs.watchError).message} Sẽ tự thử lại{describeError(jobs.watchError).retryAfterSeconds ? ` sau ${describeError(jobs.watchError).retryAfterSeconds} giây` : " với khoảng chờ tăng dần"}.
      </Alert>}
      {detail && <>
        <div className="ver-actions-row">
          <StatusBadge tone={jobTone(detail.job.status)}>{jobStatusText(detail.job.status)}</StatusBadge>
          <span className="ver-note">{kindLabel[detail.job.kind] ?? detail.job.kind}</span>
        </div>
        <JobTimeline status={detail.job.status} />
        <dl className="ver-dl">
          <dt>Mã job</dt><dd className="ver-hash">{detail.job.id}</dd>
          <dt>Input hash</dt><dd className="ver-hash">{shortHash(detail.inputHash, 20)}</dd>
          <dt>Lần chạy</dt><dd>{attempt ? `#${attempt.attemptNumber} · ${attempt.status} · ${attempt.toolchainVersion}` : "Chưa có worker nhận job"}</dd>
          <dt>Bắt đầu</dt><dd>{formatDateTime(attempt?.startedAt)}</dd>
          <dt>Kết thúc</dt><dd>{formatDateTime(attempt?.finishedAt)}</dd>
          <dt>Output hash</dt><dd className="ver-hash">{shortHash(attempt?.outputHash, 20)}</dd>
        </dl>
        {!isJobTerminal(detail.job.status) && <Alert tone="info" title="Đang chờ kết quả">Chưa có kết quả QA. Trang sẽ tự cập nhật khi job kết thúc.</Alert>}
        {isJobSucceeded(detail.job.status) && <Alert tone="warning" title="Job Succeeded chưa phải QA Passed">Hãy mở tab &quot;Kết quả kỹ thuật&quot; để xem validation run và issue Error/Critical trước khi tiếp tục.</Alert>}
        {failedJob && <Alert tone="danger" title="Job thất bại" action={canAct ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => { setRetryError(null); setRetrying(true); }}><RotateCcw size={14} aria-hidden="true" />Chạy lại job</Button> : undefined}>
          BE không trả log lỗi chi tiết. Chạy lại tạo một lần thử mới cho job này; mỗi lần cần một lý do.
        </Alert>}
      </>}
    </Panel>}

    <Modal
      open={retrying}
      onOpenChange={(open) => { if (!retryBusy) setRetrying(open); }}
      title="Chạy lại job thất bại?"
      description="Job được xếp hàng lại cho worker. Gửi lại đúng yêu cầu này khi mạng lỗi sẽ không tạo lần chạy trùng."
      footer={<><Button variant="quiet" onClick={() => setRetrying(false)} disabled={retryBusy}>Hủy</Button><Button onClick={() => void retryFailed()} disabled={retryBusy || !retryReason.trim()}>{retryBusy ? "Đang gửi…" : "Chạy lại"}</Button></>}
    >
      <div className="ops-stack">
        <Field label="Lý do" required hint="1–1000 ký tự." error={retryReason.length > 1000 ? "Tối đa 1000 ký tự." : undefined}>
          {(p) => <Textarea {...p} rows={3} maxLength={1100} value={retryReason} onChange={(event) => setRetryReason(event.target.value)} />}
        </Field>
        {retryError && <Alert tone="danger" title={retryError.message}>{retryError.code && <>Mã lỗi: {retryError.code}.</>}</Alert>}
      </div>
    </Modal>
  </div>;
}
