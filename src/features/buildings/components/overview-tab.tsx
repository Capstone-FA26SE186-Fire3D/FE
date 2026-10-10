"use client";

import { Pencil } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Panel, Stat } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { buildingsApi } from "../api";
import { describeApiError, formatDateTime } from "../format";
import { deriveQaVerdict, jobLabel, revisionLabel, type RevisionPipeline } from "../pipeline";
import type { Building, BuildingRevision, RevisionIssue } from "../types";
import { BuildingForm, buildingFormToInput, formFromBuilding, validateBuildingForm, type FormState } from "./building-form";

export function OverviewTab({ accessToken, building, revision, pipeline, issues, scenarioCount, isAdmin, onSaved, onGoTo }: {
  accessToken: string;
  building: Building;
  revision: BuildingRevision | null;
  pipeline: RevisionPipeline;
  issues: RevisionIssue[] | undefined;
  scenarioCount: number | undefined;
  isAdmin: boolean;
  onSaved: () => void;
  onGoTo: (tab: string) => void;
}) {
  const toast = useToast();
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => formFromBuilding(building));
  const [errors, setErrors] = useState<ReturnType<typeof validateBuildingForm>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openEdit = () => { setForm(formFromBuilding(building)); setErrors({}); setFormError(""); setOpen(true); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const found = validateBuildingForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    submitting.current = true;
    setSaving(true);
    setFormError("");
    try {
      // PlatformAdmin edits on behalf of the building's organization; an OrganizationUser never sends the parameter.
      await buildingsApi.update(accessToken, building.id, buildingFormToInput(form, building), isAdmin ? building.organizationId : undefined);
      setOpen(false);
      toast.notify({ tone: "success", title: "Đã lưu công trình" });
      onSaved();
    } catch (cause) {
      setFormError(`${describeApiError(cause, "Không thể lưu công trình.")} Nội dung bạn nhập vẫn được giữ lại.`);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const rev = revision ? revisionLabel(revision.status) : null;
  const job = jobLabel(pipeline.job?.status);
  const verdict = deriveQaVerdict(pipeline, issues?.filter((issue) => issue.isCurrentAttempt));
  const blocking = (issues ?? []).filter((issue) => issue.isCurrentAttempt && (issue.severity === "Error" || issue.severity === "Critical")).length;
  const address = [building.location?.address, building.location?.district, building.location?.city].filter(Boolean).join(", ");

  return <div className="ops-stack">
    <div className="ops-grid ops-grid-4">
      <Stat label="Revision đang xem" value={revision ? revision.versionLabel : "—"} hint={rev?.label ?? "Chưa có revision"} />
      <Stat label="Xử lý IFC" value={<StatusBadge tone={job.tone}>{job.label}</StatusBadge>} hint={pipeline.job ? pipeline.job.kind : "Chưa có job"} />
      <Stat label="QA" value={<StatusBadge tone={verdict.tone}>{verdict.label}</StatusBadge>} hint={blocking > 0 ? `${blocking} issue Error/Critical` : undefined} />
      <Stat label="Kịch bản" value={scenarioCount ?? "—"} hint="Trong công trình" />
    </div>

    {!revision && <Alert tone="info" title="Công trình chưa có mô hình IFC" action={<Button className="mt-3" onClick={() => onGoTo("ifc")}>Tải IFC đầu tiên</Button>}>Tải lên một tệp IFC để worker xử lý, kiểm tra và tạo mô hình xem trước. Sau đó bạn có thể soạn kịch bản sơ tán.</Alert>}

    <Panel title="Thông tin công trình" actions={<Button size="sm" variant="secondary" onClick={openEdit}><Pencil size={14} aria-hidden="true" />Sửa nhanh</Button>}>
      <dl className="ops-kv">
        <dt>Tên</dt><dd>{building.name}</dd>
        <dt>Loại công trình</dt><dd>{building.buildingType || "Chưa phân loại"}</dd>
        <dt>Số tầng</dt><dd>{building.totalFloors}</dd>
        <dt>Địa chỉ</dt><dd>{address || "Chưa nhập"}</dd>
        <dt>Trạng thái</dt><dd><StatusBadge tone={building.isActive ? "success" : "neutral"}>{building.isActive ? "Hoạt động" : "Đã lưu trữ"}</StatusBadge></dd>
        <dt>Tạo lúc</dt><dd>{formatDateTime(building.createdAt)}</dd>
        <dt>Cập nhật</dt><dd>{formatDateTime(building.updatedAt)}</dd>
      </dl>
    </Panel>

    <Drawer open={open} onOpenChange={(next) => { if (!next && !saving) setOpen(false); }} title="Sửa nhanh công trình" description="Tọa độ và liên hệ không hiển thị ở đây được giữ nguyên.">
      <form onSubmit={(event) => void submit(event)} noValidate className="ops-stack">
        <BuildingForm form={form} errors={errors} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
          <Button type="button" variant="quiet" onClick={() => setOpen(false)} disabled={saving}>Hủy</Button>
          <Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</Button>
        </div>
      </form>
    </Drawer>
  </div>;
}
