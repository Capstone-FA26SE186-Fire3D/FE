"use client";

import { Check, Lock, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { buildingsApi } from "../api";
import { describeApiError, formatDateTime, shortHash } from "../format";
import { deriveQaVerdict, pickPassedRun, type RevisionPipeline } from "../pipeline";
import type { BuildingRevision, ProcessingJob, RevisionIssue, ScenarioVersionSummary } from "../types";

/**
 * Figma "Xác nhận kỹ thuật · 3 trạng thái": Khóa (no QA pass / no version on this revision) → Sẵn sàng (QA passed, pick
 * a version) → Đã xác nhận (revision.status = ConfirmedForTraining, persisted; a new revision needs its own confirmation).
 * `confirm-for-training` records TECHNICAL readiness of one exact revision + scenario version + validation run; it is
 * separate from content approval by PlatformAdmin and from publishing.
 */
export function ConfirmTrainingPanel({ accessToken, buildingId, revision, pipeline, jobs, issues, onConfirmed }: {
  accessToken: string;
  buildingId: string;
  revision: BuildingRevision;
  pipeline: RevisionPipeline;
  jobs: ProcessingJob[];
  issues: RevisionIssue[] | undefined;
  onConfirmed: () => void;
}) {
  const toast = useToast();
  const busy = useRef(false);
  const [versionId, setVersionId] = useState("");
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const versions = useAsyncData<ScenarioVersionSummary[]>(`confirm-versions:${buildingId}:${revision.id}`, async (signal) => {
    const scenarios = await buildingsApi.listScenarios(accessToken, buildingId, 1, 20, signal);
    const pages = await Promise.all(scenarios.items.map((scenario) => buildingsApi.listScenarioVersions(accessToken, scenario.id, 1, 20, signal)));
    return pages.flatMap((page) => page.items).filter((version) => version.revisionId === revision.id);
  });
  const options = versions.data ?? [];
  const selected = options.find((version) => version.id === versionId) ?? null;
  const confirmed = revision.status === "ConfirmedForTraining";
  const verdict = deriveQaVerdict(pipeline, issues?.filter((issue) => issue.isCurrentAttempt));
  const qaPassed = verdict.state === "passed";
  const ready = !confirmed && qaPassed && options.length > 0;
  const lockReason = !qaPassed
    ? "Chưa thể xác nhận: chưa có kết quả QA “Đạt” cho lần chạy hiện hành."
    : versions.data && options.length === 0
      ? "Chưa thể xác nhận: chưa có phiên bản kịch bản gắn với revision này. Hãy tạo kịch bản ở tab Kịch bản trước."
      : null;

  const confirm = async () => {
    if (busy.current || !selected) return;
    busy.current = true;
    setWorking(true);
    setError("");
    try {
      // The validation run must belong to the chosen version when a job exists for it; otherwise use the revision's current QA.
      const matching = jobs.find((job) => job.scenarioVersionId === selected.id);
      const qa = matching && matching.id !== pipeline.job?.id ? await buildingsApi.getJobQa(accessToken, matching.id) : pipeline.qa;
      const run = pickPassedRun(qa);
      if (!run) {
        setError("Chưa có validation run đạt (Passed) cho lần chạy hiện hành của phiên bản này. Hãy chờ QA hoàn tất và sửa các issue Error/Critical trước.");
        return;
      }
      await buildingsApi.confirmForTraining(accessToken, revision.id, { scenarioVersionId: selected.id, validationRunId: run.id });
      toast.notify({ tone: "success", title: "Đã xác nhận sẵn sàng kỹ thuật", description: "Đây không phải duyệt nội dung kịch bản." });
      setOpen(false);
      onConfirmed();
    } catch (cause) {
      setError(describeApiError(cause, "Không thể xác nhận. Hãy thử lại sau."));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const confirmedRun = pickPassedRun(pipeline.qa);

  return <section className="org-card bd-confirm" data-state={confirmed ? "confirmed" : ready ? "ready" : "locked"} data-testid="confirm-training" aria-labelledby="bd-confirm-title">
    <h2 id="bd-confirm-title" className="org-card-title">Xác nhận sẵn sàng kỹ thuật</h2>
    <p className="org-card-sub">Không phải duyệt nội dung</p>

    {confirmed ? <>
      <div className="bd-confirm-state" data-tone="success"><Check size={18} aria-hidden="true" /><div><strong>Đã xác nhận cho huấn luyện</strong><span>Lúc {formatDateTime(confirmedRun?.finishedAt ?? revision.createdAt)}{confirmedRun ? ` · mã kiểm tra ${shortHash(confirmedRun.id, 8)}` : ""}</span></div></div>
      <p className="ops-muted">Tải IFC mới sẽ tạo revision mới và cần xác nhận lại.</p>
      <Button variant="secondary" disabled><Check size={16} aria-hidden="true" />Đã lưu</Button>
    </> : ready ? <>
      <div className="bd-confirm-state" data-tone="success"><Check size={18} aria-hidden="true" /><div><strong>QA đạt.</strong><span>Chọn phiên bản kịch bản cùng revision rồi xác nhận.</span></div></div>
      <Field label="Phiên bản kịch bản">{(p) => <Combobox {...p} value={versionId} placeholder="Chọn phiên bản…" searchPlaceholder="Tìm phiên bản…" groupLabel="Phiên bản cùng revision" options={options.map((version) => ({ value: version.id, label: `v${version.versionNumber} · ${version.name}` }))} onChange={setVersionId} aria-label="Phiên bản kịch bản" />}</Field>
      <Button disabled={!selected || working} onClick={() => { setError(""); setOpen(true); }} data-testid="confirm-training-button"><ShieldCheck size={16} aria-hidden="true" />Xác nhận sẵn sàng kỹ thuật</Button>
    </> : <>
      <div className="bd-confirm-state" data-tone="locked"><Lock size={16} aria-hidden="true" /><div><strong>{versions.loading && !versions.data ? "Đang kiểm tra phiên bản kịch bản…" : lockReason ?? "Chưa thể xác nhận."}</strong></div></div>
      {versions.error !== undefined && <Alert tone="danger" title="Không tải được phiên bản kịch bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={versions.reload}>Thử lại</Button>}>{describeApiError(versions.error, "Hãy thử lại sau.")}</Alert>}
      <Field label="Phiên bản kịch bản">{(p) => <Combobox {...p} value="" placeholder={options.length ? "Chọn phiên bản…" : "Chưa có phiên bản"} options={options.map((version) => ({ value: version.id, label: `v${version.versionNumber} · ${version.name}` }))} onChange={() => undefined} disabled aria-label="Phiên bản kịch bản" />}</Field>
      <Button variant="secondary" disabled><Lock size={14} aria-hidden="true" />Xác nhận sẵn sàng kỹ thuật</Button>
    </>}

    <ConfirmDialog
      open={open}
      onOpenChange={(next) => { if (!working) setOpen(next); }}
      title="Xác nhận sẵn sàng kỹ thuật?"
      description={selected ? `Revision “${revision.versionLabel}” và phiên bản “${selected.name} v${selected.versionNumber}” sẽ được ghi nhận khớp với kết quả QA hiện hành.` : undefined}
      confirmLabel="Xác nhận"
      busy={working}
      onConfirm={confirm}
    >
      <p className="ops-muted">Thao tác này chỉ xác nhận về kỹ thuật. Nội dung kịch bản vẫn cần được duyệt riêng trước khi phát hành.</p>
      {error && <Alert tone="danger">{error}</Alert>}
    </ConfirmDialog>
  </section>;
}
