"use client";

import { Hammer, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useIdempotencyKey } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

import type { VersionJobs } from "../../use-version-jobs";
import { describeError, isJobSucceeded, isJobTerminal, shortHash, type DescribedError } from "../../version-readiness";
import type { PackageKind, ScenarioVersionDetail } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { scrollToSection } from "./scroll";
import { SupportCode } from "./support-code";
import { formatDateTime } from "./version-content";

const kindLabel: Record<string, string> = { ReleasePackage: "Gói phát hành", PlaytestPackage: "Gói chạy thử" };

/**
 * The Unity package runs in the Android app and the build worker serves `Android` only (`ProcessingWorker:PackageBuildTargets`,
 * default Android): any other target answers 400 BUILD_TARGET_UNSUPPORTED or is never leased. Add targets here when the BE serves them.
 */
const BUILD_TARGETS = ["Android"] as const;
const PACKAGE_KINDS: PackageKind[] = ["ReleasePackage", "PlaytestPackage"];
/** A queued job with no worker attempt for this long most likely means the build machine is off. */
const WORKER_WAIT_MS = 10 * 60 * 1000;

export function jobTone(status: string | undefined): Tone {
  switch (status?.toLowerCase()) {
    case "succeeded": return "success";
    case "failed": return "danger";
    case "cancelled": case "canceled": return "neutral";
    case "running": return "info";
    default: return "pending";
  }
}

const jobStatusLabel: Record<string, string> = { queued: "Đang chờ máy dựng", running: "Đang dựng", succeeded: "Dựng xong", failed: "Dựng lỗi", cancelled: "Đã hủy" };
export const jobStatusText = (status: string | undefined) => (status ? jobStatusLabel[status.toLowerCase()] ?? status : "—");

function JobTimeline({ status }: { status: string }) {
  const value = status.toLowerCase();
  const failed = value === "failed" || value === "cancelled" || value === "canceled";
  const steps = [
    { id: "queued", label: "Chờ máy dựng", state: value === "queued" ? "current" : "done" },
    { id: "running", label: "Đang dựng", state: value === "queued" ? "todo" : value === "running" ? "current" : "done" },
    { id: "final", label: failed ? (value === "failed" ? "Dựng lỗi" : "Đã hủy") : "Dựng xong", state: value === "succeeded" ? "done" : failed ? "failed" : "todo" },
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
  const [buildTarget, setBuildTarget] = useState<string>(BUILD_TARGETS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DescribedError | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryReason, setRetryReason] = useState("");
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<DescribedError | null>(null);

  const target = buildTarget.trim();
  const targetError = !target ? "Chọn nền tảng." : target.length > 100 ? "Tối đa 100 ký tự." : undefined;

  // The build form is only offered while it can do something. The BE runs one job per revision at a time and answers the
  // same build input with its existing job, so a second click while a job is queued/running, or after it succeeded, would
  // only queue work behind it (or return the same job). The form therefore hides in those cases, and a failed job offers
  // "Chạy lại job" instead of a new build.
  const [startedKind, setStartedKind] = useState<PackageKind | null>(null);
  // Clock for "has this job waited too long for a worker"; ticking keeps the hint appearing without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const ordered = [...jobs.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const jobsOfKind = (value: PackageKind) => ordered.filter((job) => job.kind === value);
  const activeJob = ordered.find((job) => !isJobTerminal(job.status));
  const builtKinds = PACKAGE_KINDS.filter((value) => jobsOfKind(value).some((job) => isJobSucceeded(job.status)));
  const failedKinds = PACKAGE_KINDS.filter((value) => !builtKinds.includes(value) && jobsOfKind(value)[0]?.status.toLowerCase() === "failed");
  // Just accepted (202) but not in the list yet: treat it as running so the form does not flash back.
  const justStarted = startedKind !== null && jobsOfKind(startedKind).length === 0;
  const startable = PACKAGE_KINDS.filter((value) => !builtKinds.includes(value) && !failedKinds.includes(value) && !(justStarted && value === startedKind));
  const kindNow: PackageKind = startable.includes(kind) ? kind : startable[0] ?? kind;
  const jobsKnown = !jobs.jobsLoading || jobs.jobs.length > 0 || jobs.jobsError !== undefined;
  const showForm = jobsKnown && !activeJob && !justStarted && startable.length > 0;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || targetError || !canAct) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { kind: kindNow, buildTarget: target };
      const accepted = await scenarioVersionsApi.startPackageBuild(accessToken, version.id, payload, buildKey.keyFor({ versionId: version.id, ...payload }));
      buildKey.done();
      toast.notify({ tone: "info", title: "Đã gửi yêu cầu dựng gói", description: "Máy dựng sẽ nhận và xử lý; trang tự cập nhật." });
      setStartedKind(kindNow);
      jobs.reloadJobs();
      onStarted(accepted.jobId);
    } catch (cause) {
      setError(describeError(cause, "Không gửi được yêu cầu dựng gói."));
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
      toast.notify({ tone: "info", title: "Đã gửi yêu cầu dựng lại", description: "Máy dựng sẽ chạy lại lượt dựng này." }); void result;
      jobs.reloadJobs();
      jobs.selectJob(result.jobId);
    } catch (cause) {
      setRetryError(describeError(cause, "Không dựng lại được."));
    } finally {
      setRetryBusy(false);
    }
  };

  const detail = jobs.detail;
  const attempt = detail?.currentAttempt;

  return <div className="ops-stack">
    <Panel title="Dựng gói" description="Hệ thống dựng gói mô phỏng từ phiên bản này để ứng dụng Android tải về, rồi tự kiểm tra gói." bodyClassName="ops-stack">
      {!jobsKnown && <SkeletonRows rows={2} label="Đang kiểm tra lượt dựng…" />}

      {(activeJob || justStarted) && <Alert tone="info" title={`${kindLabel[activeJob?.kind ?? startedKind ?? ""] ?? "Gói"}: ${activeJob ? jobStatusText(activeJob.status) : "Đang chờ máy dựng"}`} action={activeJob ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => { jobs.selectJob(activeJob.id); scrollToSection("ver-job-monitor"); }}>Xem tiến trình</Button> : undefined}>
        Mỗi lần chỉ dựng một gói, nên nút dựng ẩn cho tới khi xong. Nếu dựng lỗi sẽ có nút dựng lại.
      </Alert>}

      {!activeJob && !justStarted && builtKinds.length > 0 && <Alert tone="success" title={`${builtKinds.map((value) => kindLabel[value]).join(" và ")} đã dựng xong`}>
        Mỗi phiên bản chỉ cần dựng một lần cho mỗi loại gói. Dựng xong chưa có nghĩa là gói dùng được: xem kết quả kiểm tra ở tab &quot;Kiểm tra&quot;. Muốn dựng từ nội dung khác, hãy tạo phiên bản mới.
      </Alert>}

      {!activeJob && !justStarted && failedKinds.length > 0 && <Alert tone="danger" title={`${failedKinds.map((value) => kindLabel[value]).join(" và ")} dựng bị lỗi`} action={canAct ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => { const job = jobsOfKind(failedKinds[0])[0]; jobs.selectJob(job.id); scrollToSection("ver-job-monitor"); }}>Xem lượt dựng lỗi</Button> : undefined}>
        Mở lượt dựng lỗi và bấm &quot;Dựng lại&quot;, ghi ngắn lý do.
      </Alert>}

      {showForm && <form className="ops-stack" onSubmit={submit} noValidate>
        <div className="ops-form-grid">
          <Field label="Loại gói" required hint={kindNow === "ReleasePackage" ? "Gói dùng để phát hành cho học viên." : "Gói để tự chạy thử trên điện thoại, không phát hành."}>
            {(p) => <Select {...p} value={kindNow} onChange={(event) => setKind(event.target.value as PackageKind)}>
              {startable.map((value) => <option key={value} value={value}>{kindLabel[value]}</option>)}
            </Select>}
          </Field>
          <Field label="Nền tảng" required error={targetError} hint="Hiện chỉ có ứng dụng Android.">
            {(p) => <Select {...p} value={buildTarget} onChange={(event) => setBuildTarget(event.target.value)}>
              {BUILD_TARGETS.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>}
          </Field>
        </div>
        {error && <Alert tone="danger" title={error.message} action={<div className="ver-actions-row" style={{ marginTop: 10 }}>
          <Button size="sm" variant="secondary" type="submit" disabled={busy}><RefreshCw size={14} aria-hidden="true" />Thử lại</Button>
        </div>}>
          Bấm thử lại an toàn: hệ thống không tạo thêm lượt dựng trùng.
          <SupportCode code={error.code} />
        </Alert>}
        <div className="ver-actions-row">
          <Button type="submit" disabled={busy || Boolean(targetError) || !canAct}><Hammer size={16} aria-hidden="true" />{busy ? "Đang gửi…" : "Dựng gói"}</Button>
          {!canAct && <span className="ver-note">Tài khoản của bạn chỉ có quyền xem.</span>}
        </div>
      </form>}
      <p className="ver-note">Dựng xong, hệ thống tự kiểm tra gói. Kết quả xem ở tab &quot;Kiểm tra&quot;.</p>
    </Panel>

    <Panel
      title="Các lượt dựng của phiên bản này"
      description="Vẫn còn khi bạn tải lại trang hoặc mở ở máy khác."
      actions={<Button size="sm" variant="quiet" onClick={jobs.reloadJobs} disabled={jobs.jobsLoading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>}
      bodyClassName="ops-stack"
    >
      {jobs.jobsError !== undefined && <Alert tone="danger" title="Không tải được danh sách lượt dựng" action={<Button size="sm" variant="secondary" className="mt-3" onClick={jobs.reloadJobs}>Thử lại</Button>}>{describeError(jobs.jobsError).message}</Alert>}
      <Table caption="Các lượt dựng gói">
        <thead><tr><th>Loại</th><th>Trạng thái</th><th>Tạo lúc</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>
          {jobs.jobsLoading && jobs.jobs.length === 0 && <TableMessage colSpan={4}><SkeletonRows rows={3} label="Đang tải lượt dựng…" /></TableMessage>}
          {jobs.jobs.map((job) => <tr key={job.id} className={job.id === jobs.selectedJobId ? "ver-row-selected" : undefined}>
            <td className="ops-cell-primary">{kindLabel[job.kind] ?? job.kind}</td>
            <td><StatusBadge tone={jobTone(job.status)}>{jobStatusText(job.status)}</StatusBadge></td>
            <td>{formatDateTime(job.createdAt)}</td>
            <td className="ops-cell-actions">{job.id === jobs.selectedJobId
              ? <StatusBadge tone="info">Đang xem</StatusBadge>
              : <Button size="sm" variant="quiet" onClick={() => { jobs.selectJob(job.id); scrollToSection("ver-job-monitor"); }}>Theo dõi</Button>}</td>
          </tr>)}
          {!jobs.jobsLoading && jobs.jobsError === undefined && jobs.jobs.length === 0 && <TableMessage colSpan={4}><EmptyState icon={Hammer} title="Chưa dựng gói nào" description="Bấm Dựng gói ở trên; xong sẽ có kết quả kiểm tra cho phiên bản này." /></TableMessage>}
        </tbody>
      </Table>
    </Panel>

    {jobs.selectedJobId && <Panel
      id="ver-job-monitor"
      tabIndex={-1}
      title="Tiến trình dựng"
      description={jobs.watching ? "Tự cập nhật vài giây một lần cho tới khi xong." : "Lượt dựng đã kết thúc."}
      actions={<Button size="sm" variant="quiet" onClick={jobs.refresh}><RefreshCw size={14} aria-hidden="true" />Làm mới</Button>}
      bodyClassName="ops-stack"
    >
      {!detail && jobs.watchError === undefined && <SkeletonRows rows={2} label="Đang tải tiến trình…" />}
      {jobs.watchError !== undefined && <Alert tone={detail ? "warning" : "danger"} title={detail ? "Chưa cập nhật được trạng thái mới" : "Không tải được tiến trình"}>
        {describeError(jobs.watchError).message} Sẽ tự thử lại{describeError(jobs.watchError).retryAfterSeconds ? ` sau ${describeError(jobs.watchError).retryAfterSeconds} giây` : " với khoảng chờ tăng dần"}.
      </Alert>}
      {detail && <>
        <div className="ver-actions-row">
          <StatusBadge tone={jobTone(detail.job.status)}>{jobStatusText(detail.job.status)}</StatusBadge>
          <span className="ver-note">{kindLabel[detail.job.kind] ?? detail.job.kind}</span>
        </div>
        <JobTimeline status={detail.job.status} />
        <dl className="ver-dl">
          <dt>Máy dựng</dt><dd>{attempt ? `Đã nhận (lần ${attempt.attemptNumber})` : "Chưa có máy dựng nhận"}</dd>
          <dt>Bắt đầu</dt><dd>{formatDateTime(attempt?.startedAt)}</dd>
          <dt>Kết thúc</dt><dd>{formatDateTime(attempt?.finishedAt)}</dd>
        </dl>
        <details className="ver-support">
          <summary>Thông tin cho bộ phận hỗ trợ</summary>
          <span>Lượt dựng: <code className="ver-hash">{detail.job.id}</code></span>
          <span>Đầu vào: <code className="ver-hash">{shortHash(detail.inputHash, 20)}</code></span>
          {attempt && <span>Máy dựng: <code className="ver-hash">{attempt.toolchainVersion} · {attempt.status}</code></span>}
          {attempt?.outputHash && <span>Đầu ra: <code className="ver-hash">{shortHash(attempt.outputHash, 20)}</code></span>}
        </details>
        {!isJobTerminal(detail.job.status) && <Alert tone="info" title="Đang chờ kết quả">Gói chưa dựng xong. Trang tự cập nhật khi xong.</Alert>}
        {detail.job.status.toLowerCase() === "queued" && !attempt && now - Date.parse(detail.job.createdAt) > WORKER_WAIT_MS && <Alert tone="warning" title="Chưa có máy dựng nhận">
          Đã chờ hơn {Math.round(WORKER_WAIT_MS / 60000)} phút mà chưa có máy dựng nào nhận. Máy dựng có thể đang tắt: bật máy rồi trang sẽ tự cập nhật.
        </Alert>}
        {isJobSucceeded(detail.job.status) && <Alert tone="info" title="Gói đã dựng xong">Hệ thống tự kiểm tra gói. Xem kết quả và chốt gói ở tab &quot;Kiểm tra&quot;.</Alert>}
        {failedJob && <Alert tone="danger" title="Dựng gói bị lỗi" action={canAct ? <Button size="sm" variant="secondary" className="mt-3" onClick={() => { setRetryError(null); setRetrying(true); }}><RotateCcw size={14} aria-hidden="true" />Dựng lại</Button> : undefined}>
          Máy dựng chưa gửi lý do chi tiết. Bấm Dựng lại để thử một lần mới; nếu vẫn lỗi, gửi phần &quot;Thông tin cho bộ phận hỗ trợ&quot; cho đội kỹ thuật.
        </Alert>}
      </>}
    </Panel>}

    <Modal
      open={retrying}
      onOpenChange={(open) => { if (!retryBusy) setRetrying(open); }}
      title="Dựng lại gói?"
      description="Máy dựng sẽ chạy lại lượt dựng này. Bấm lại khi mạng lỗi không tạo lần dựng trùng."
      footer={<><Button variant="quiet" onClick={() => setRetrying(false)} disabled={retryBusy}>Hủy</Button><Button onClick={() => void retryFailed()} disabled={retryBusy || !retryReason.trim()}>{retryBusy ? "Đang gửi…" : "Xác nhận dựng lại"}</Button></>}
    >
      <div className="ops-stack">
        <Field label="Lý do dựng lại" required hint="Ví dụ: đã bật lại máy dựng. Tối đa 1000 ký tự." error={retryReason.length > 1000 ? "Tối đa 1000 ký tự." : undefined}>
          {(p) => <Textarea {...p} rows={3} maxLength={1100} value={retryReason} onChange={(event) => setRetryReason(event.target.value)} />}
        </Field>
        {retryError && <Alert tone="danger" title={retryError.message}><SupportCode code={retryError.code} /></Alert>}
      </div>
    </Modal>
  </div>;
}
