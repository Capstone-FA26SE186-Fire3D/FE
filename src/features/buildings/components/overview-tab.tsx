"use client";

import { Pencil } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { buildingConflict, buildingsApi, sameBuildingVersion } from "../api";
import { describeBuildingWriteError, formatDateTime } from "../format";
import type { EntitlementSummary } from "@/features/billing/entitlements";
import type { ScenarioSummary } from "@/features/scenarios/types";
import type { RevisionPipeline } from "../pipeline";
import type { Building, BuildingRevision, RevisionIssue } from "../types";
import { JourneyOverview } from "./journey-overview";
import { BuildingConflictAlert, BuildingForm, buildingFormToInput, formFromBuilding, validateBuildingForm, type FormState } from "./building-form";

export function OverviewTab({ accessToken, building, etag, revision, pipeline, issues, scenarios, scenarioCount, service, isAdmin, onSaved, onGoTo }: {
  accessToken: string;
  building: Building;
  /** ETag of `building` from the last GET; null when the header was not readable (the save then reads it again). */
  etag: string | null;
  revision: BuildingRevision | null;
  pipeline: RevisionPipeline;
  issues: RevisionIssue[] | undefined;
  scenarios: ScenarioSummary[] | undefined;
  scenarioCount: number | undefined;
  service: EntitlementSummary | undefined;
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
  // After a 412 the save targets the server's newer version (body `current` + new ETag) until the page reloads the detail.
  const [stale, setStale] = useState<{ current: Building; etag: string | null; adopted?: boolean } | null>(null);
  const base = stale?.current ?? building;

  const openEdit = () => { setForm(formFromBuilding(building)); setErrors({}); setFormError(""); setStale(null); setOpen(true); };

  const focusInfo = () => {
    const panel = document.getElementById("building-info");
    panel?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    panel?.focus({ preventScroll: true });
  };

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
      let ifMatch = stale ? stale.etag : etag;
      if (!ifMatch) {
        // No ETag for the version on screen: read data and ETag together, and only use that ETag if the data is the same
        // version the form was built from; otherwise show the newer version instead of overwriting it with old fields.
        const fresh = await buildingsApi.getVersioned(accessToken, building.id);
        if (!sameBuildingVersion(fresh.data, base)) { setStale({ current: fresh.data, etag: fresh.etag }); return; }
        ifMatch = fresh.etag;
      }
      if (!ifMatch) { setFormError("Không đọc được phiên bản công trình (ETag). Hãy tải lại trang rồi thử lại."); return; }
      // PlatformAdmin edits on behalf of the building's organization; an OrganizationUser never sends the parameter.
      await buildingsApi.update(accessToken, building.id, buildingFormToInput(form, base), ifMatch, isAdmin ? building.organizationId : undefined);
      setOpen(false);
      setStale(null);
      toast.notify({ tone: "success", title: "Đã lưu công trình" });
      onSaved();
    } catch (cause) {
      const conflict = buildingConflict(cause);
      if (conflict) setStale({ current: conflict.current ?? base, etag: conflict.etag });
      else setFormError(`${describeBuildingWriteError(cause, "Không thể lưu công trình.")} Nội dung bạn nhập vẫn được giữ lại.`);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const address = [building.location?.address, building.location?.district, building.location?.city].filter(Boolean).join(", ");

  return <div className="ops-stack">
    <JourneyOverview accessToken={accessToken} building={building} revision={revision} pipeline={pipeline} issues={issues} scenarios={scenarios} scenarioCount={scenarioCount} service={service} onGoTo={onGoTo} onFocusInfo={focusInfo} />

    <Panel id="building-info" tabIndex={-1} title="Thông tin công trình" actions={<Button size="sm" variant="secondary" onClick={openEdit}><Pencil size={14} aria-hidden="true" />Sửa nhanh</Button>}>
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
        {stale && !stale.adopted && <BuildingConflictAlert current={stale.current} onUseLatest={() => { setForm(formFromBuilding(stale.current)); setStale({ ...stale, adopted: true }); }} />}
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
