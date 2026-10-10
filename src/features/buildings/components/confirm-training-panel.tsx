"use client";

import { ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { buildingsApi } from "../api";
import { describeApiError } from "../format";
import { pickPassedRun, type RevisionPipeline } from "../pipeline";
import type { BuildingRevision, ProcessingJob, ScenarioVersionSummary } from "../types";

/**
 * `confirm-for-training` records TECHNICAL readiness of one exact revision + scenario version + validation run.
 * It is separate from content approval (review by PlatformAdmin) and from publishing.
 */
export function ConfirmTrainingPanel({ accessToken, buildingId, revision, pipeline, jobs, onConfirmed }: {
  accessToken: string;
  buildingId: string;
  revision: BuildingRevision;
  pipeline: RevisionPipeline;
  jobs: ProcessingJob[];
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
  const alreadyConfirmed = revision.status === "ConfirmedForTraining";

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

  return <Panel title="Xác nhận sẵn sàng kỹ thuật" description="Ghi nhận revision, phiên bản kịch bản và kết quả QA khớp nhau về mặt kỹ thuật." bodyClassName="ops-stack">
    <Alert tone="info" title="Không phải duyệt nội dung">Xác nhận kỹ thuật không thay thế việc PlatformAdmin duyệt nội dung kịch bản và không phát hành kịch bản.</Alert>
    {alreadyConfirmed && <Alert tone="success" title="Revision đã được xác nhận kỹ thuật" />}
    {versions.error !== undefined && <Alert tone="danger" title="Không tải được phiên bản kịch bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={versions.reload}>Thử lại</Button>}>{describeApiError(versions.error, "Hãy thử lại sau.")}</Alert>}
    {versions.data && options.length === 0 && <p className="ops-muted">Chưa có phiên bản (snapshot) kịch bản nào gắn với revision này. Hãy tạo kịch bản và snapshot ở tab “Kịch bản” trước.</p>}
    {options.length > 0 && <Field label="Phiên bản kịch bản">{(p) => <Select {...p} value={versionId} onChange={(event) => setVersionId(event.target.value)}>
      <option value="">Chọn phiên bản…</option>
      {options.map((version) => <option key={version.id} value={version.id}>{version.name} · v{version.versionNumber}</option>)}
    </Select>}</Field>}
    <div className="ops-actions"><Button variant="secondary" disabled={!selected || working || alreadyConfirmed} onClick={() => { setError(""); setOpen(true); }}><ShieldCheck size={16} aria-hidden="true" />Xác nhận sẵn sàng kỹ thuật</Button></div>

    <Modal
      open={open}
      onOpenChange={(next) => { if (!next && !working) setOpen(false); }}
      title="Xác nhận sẵn sàng kỹ thuật?"
      description={selected ? `Revision “${revision.versionLabel}” và phiên bản “${selected.name} v${selected.versionNumber}” sẽ được ghi nhận khớp với kết quả QA hiện hành.` : undefined}
      footer={<><Button variant="quiet" onClick={() => setOpen(false)} disabled={working}>Hủy</Button><Button onClick={() => void confirm()} disabled={working}>{working ? "Đang xác nhận…" : "Xác nhận"}</Button></>}
    >
      <div className="ops-stack">
        <p className="ops-muted">Thao tác này chỉ xác nhận về kỹ thuật. Nội dung kịch bản vẫn cần được duyệt riêng trước khi phát hành.</p>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Modal>
  </Panel>;
}
