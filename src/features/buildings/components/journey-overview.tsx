"use client";

import { Check, Lock, Pencil, Upload, PenLine, FileCheck, Rocket, BarChart3, Clock, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import type { EntitlementSummary } from "@/features/billing/entitlements";
import { scenarioVersionsApi } from "@/features/scenarios/versions-api";
import type { ScenarioSummary } from "@/features/scenarios/types";
import { buildingConflict, buildingsApi, sameBuildingVersion } from "../api";
import { buildJourney, journeyConditions, type JourneyScenarioFacts, type JourneyStepModel } from "../building-journey";
import { describeBuildingWriteError, formatDateTime } from "../format";
import type { RevisionPipeline } from "../pipeline";
import type { Building, BuildingRevision, RevisionIssue } from "../types";
import { BuildingConflictAlert, BuildingForm, buildingFormToInput, formFromBuilding, validateBuildingForm, type FormState } from "./building-form";
import "../journey.css";

function StepMarker({ step }: { step: JourneyStepModel }) {
  if (step.state === "done") return <Check size={14} strokeWidth={2.4} aria-hidden="true" />;
  if (step.state === "locked") return <Lock size={12} aria-hidden="true" />;
  return <span aria-hidden="true">{step.index}</span>;
}

const STATE_TEXT = { done: "Hoàn tất", current: "Đang làm", locked: "Khoá" } as const;

/**
 * "Hoàn tất" must be true. The scenario step is "done" as soon as a draft is saved, but the server does not keep draft
 * validation, so the draft may still miss required fields (runtime, time limit, objectives, rubric, spawn, goal). That
 * step therefore says what is known: a draft exists.
 */
function stateText(step: JourneyStepModel) {
  if (step.state === "done" && step.key === "scenario") return "Đã có bản nháp";
  return STATE_TEXT[step.state];
}

type NextCard = { eyebrow: string; title: string; detail: string; label: string; icon: ReactNode; href?: string; onClick?: () => void; passive?: boolean };

/**
 * Figma "Chi tiết · Hành trình": the 6-step stepper (connectors green when done), one "Việc tiếp theo" card with a single
 * CTA, three release-condition cards (IFC QA / content review / service), and the building info card with "Sửa thông tin"
 * (modal). Every state is derived from server fields; nothing unlocks from a guess.
 */
export function JourneyOverview({ accessToken, building, etag, revision, pipeline, scenarios, scenarioCount, service, isAdmin, onGoTo, onSaved, onUpload }: {
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
  onGoTo: (tab: string, sub?: string) => void;
  onSaved: () => void;
  onUpload: () => void;
}) {
  const newest = useMemo(() => [...(scenarios ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [scenarios]);
  const scenarioId = newest?.id ?? "";
  const detail = useAsyncData(`journey:scenario:${scenarioId}`, (signal) => scenarioVersionsApi.getScenario(accessToken, scenarioId, signal), Boolean(scenarioId), { keepPrevious: false });
  const versions = useAsyncData(`journey:versions:${scenarioId}`, (signal) => scenarioVersionsApi.listVersions(accessToken, scenarioId, 1, 1, signal), Boolean(scenarioId), { keepPrevious: false });
  const releases = useAsyncData(`journey:releases:${building.id}`, (signal) => scenarioVersionsApi.listReleases(accessToken, { buildingId: building.id }, 1, 1, signal), true, { keepPrevious: false });

  const latestVersion = versions.data?.items[0];
  const scenario: JourneyScenarioFacts | null = newest ? {
    id: newest.id,
    name: newest.name,
    draftCount: detail.data?.draftCount,
    versionNumber: latestVersion?.versionNumber ?? detail.data?.latestVersionNumber ?? null,
    reviewStatus: latestVersion?.reviewStatus ?? null,
    rejectReason: latestVersion?.rejectReason ?? null,
  } : null;
  const input = { building, revision, scenarioCount, scenario, releaseStatus: releases.data?.items[0]?.status ?? null, service: service?.state };
  const steps = buildJourney(input);
  const conditions = journeyConditions(input);
  const current = steps.find((step) => step.state === "current") ?? null;
  const firstLocked = steps.findIndex((step) => step.state === "locked");
  const focus = current ?? (firstLocked > 0 ? steps[firstLocked - 1] : null);
  const waiting = !current && focus !== null;

  const base = `${routes.workspaceBuildings}/${building.id}`;
  const editorHref = newest ? `${base}/scenarios/${newest.id}` : null;
  const versionsHref = newest ? `${base}/scenarios/${newest.id}/versions` : null;
  const jobRunning = pipeline.job?.status === "Running" || pipeline.job?.status === "Queued";

  // One card, one action: what moves the building forward right now (Figma "Việc tiếp theo · Bước n").
  const next: NextCard | null = (() => {
    if (waiting && focus) {
      const review = scenario?.reviewStatus?.toLowerCase();
      const title = review === "submitted" ? `Đang chờ quản trị FET3D duyệt v${scenario?.versionNumber}` : review === "rejected" ? `Phiên bản v${scenario?.versionNumber} bị từ chối` : "Tiếp theo: gửi duyệt nội dung";
      const text = review === "rejected" && scenario?.rejectReason ? `Lý do: ${scenario.rejectReason}` : "Bạn vẫn xem và sửa bản nháp; sửa sau khi gửi sẽ tạo phiên bản mới và duyệt lại.";
      return versionsHref ? { eyebrow: `Việc tiếp theo · bước ${focus.index}`, title, detail: text, label: "Xem phiên bản", icon: <Clock size={18} />, href: versionsHref, passive: review === "submitted" } : null;
    }
    if (!current) return null;
    const eyebrow = `Việc tiếp theo · bước ${current.index}`;
    switch (current.key) {
      case "ifc":
        if (!revision) return { eyebrow, title: "Tải lên mô hình IFC đầu tiên", detail: "Kéo thả tệp .ifc; hệ thống dựng mô hình 3D và kiểm tra tự động, bạn theo dõi ở tab IFC.", label: "Tải IFC", icon: <Upload size={18} />, onClick: onUpload };
        if (jobRunning) return { eyebrow, title: `Đang dựng mô hình 3D từ ${revision.versionLabel}`, detail: "Không cần thao tác. Khi mô hình qua kiểm tra tự động, bước Soạn kịch bản sẽ mở.", label: "Mở tab IFC", icon: <Upload size={18} />, onClick: () => onGoTo("ifc"), passive: true };
        return { eyebrow, title: `Hoàn tất mô hình IFC (${revision.versionLabel})`, detail: current.detail, label: "Mở tab IFC", icon: <Upload size={18} />, onClick: () => onGoTo("ifc") };
      case "scenario": return editorHref
        ? { eyebrow, title: `Tiếp tục soạn kịch bản “${scenario?.name}”`, detail: current.detail, label: "Mở trình soạn", icon: <PenLine size={18} />, href: editorHref }
        : { eyebrow, title: "Tạo kịch bản đầu tiên", detail: "Đặt điểm xuất phát, nguồn lửa và đường thoát trong trình soạn.", label: "Tạo kịch bản", icon: <PenLine size={18} />, onClick: () => onGoTo("scenarios") };
      case "version": return versionsHref
        ? { eyebrow, title: "Tạo phiên bản từ bản nháp", detail: current.detail, label: "Mở phiên bản", icon: <FileCheck size={18} />, href: versionsHref }
        : { eyebrow, title: "Tạo phiên bản từ bản nháp", detail: current.detail, label: "Mở kịch bản", icon: <FileCheck size={18} />, onClick: () => onGoTo("scenarios") };
      case "release": return versionsHref ? { eyebrow, title: "Chuẩn bị phát hành", detail: current.detail, label: "Mở phát hành", icon: <Rocket size={18} />, href: versionsHref } : null;
      case "usage": return { eyebrow, title: "Theo dõi sử dụng", detail: current.detail, label: "Xem báo cáo", icon: <BarChart3 size={18} />, href: routes.workspaceAnalytics };
      default: return null;
    }
  })();

  const address = [building.location?.address, building.location?.district, building.location?.city].filter(Boolean).join(", ");

  return <div className="jr-stack">
    <section className="org-card jr-journey" aria-label="Hành trình công trình">
      <ol className="jr-steps" aria-label="Các bước của công trình">
        {steps.map((step) => <li key={step.key} className="jr-step" data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
          <Tooltip content={step.detail}><span className="jr-step-dot" tabIndex={0} role="img" aria-label={`${step.title}: ${stateText(step)}`}><StepMarker step={step} /></span></Tooltip>
          <span className="jr-step-title">{step.title}</span>
          <span className="jr-step-state" data-state={step.state}>{step.state === "locked" ? step.lockReason ?? STATE_TEXT.locked : stateText(step)}</span>
        </li>)}
      </ol>
    </section>

    {next && <section className="jr-next" data-passive={next.passive || undefined} aria-label="Việc tiếp theo" data-testid="journey-next">
      <span className="jr-next-icon" aria-hidden="true">{next.icon}</span>
      <div className="jr-next-text"><span className="jr-next-eyebrow">{next.eyebrow}</span><strong>{next.title}</strong><span>{next.detail}</span></div>
      {next.href ? <Button asChild variant={next.passive ? "secondary" : "primary"}><Link href={next.href}>{next.label}</Link></Button> : <Button variant={next.passive ? "secondary" : "primary"} onClick={next.onClick}>{next.label}</Button>}
    </section>}

    <div className="jr-conditions">
      {conditions.map((item) => <section key={item.key} className="org-card jr-cond-card" aria-label={item.title}>
        <h2 className="org-card-title">{item.title}</h2>
        <StatusBadge tone={item.tone}>{item.label}</StatusBadge>
        <p className="ops-muted">{item.description}</p>
      </section>)}
    </div>

    <InfoCard accessToken={accessToken} building={building} etag={etag} address={address} isAdmin={isAdmin} onSaved={onSaved} />
    {versionsHref && !next?.href && <p className="jr-info-link"><Link href={versionsHref} className="jr-link">Xem phiên bản và phát hành <ChevronRight size={14} aria-hidden="true" /></Link></p>}
  </div>;
}

/** "Thông tin công trình" card + "Sửa thông tin" modal (If-Match; a 412 keeps the edits and offers the newer version). */
function InfoCard({ accessToken, building, etag, address, isAdmin, onSaved }: { accessToken: string; building: Building; etag: string | null; address: string; isAdmin: boolean; onSaved: () => void }) {
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
      if (!ifMatch) { setFormError("Chưa xác định được bản thông tin công trình đang sửa. Hãy tải lại trang rồi thử lại."); return; }
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

  return <section className="org-card" id="building-info" tabIndex={-1} aria-labelledby="building-info-title">
    <div className="org-row" style={{ marginBottom: 14 }}>
      <h2 id="building-info-title" className="org-card-title" style={{ margin: 0 }}>Thông tin công trình</h2>
      <Button size="sm" variant="secondary" onClick={openEdit}><Pencil size={14} aria-hidden="true" />Sửa thông tin</Button>
    </div>
    <dl className="jr-kv">
      <div><dt>Tên</dt><dd>{building.name}</dd></div>
      <div><dt>Loại công trình</dt><dd>{building.buildingType || "Chưa phân loại"}</dd></div>
      <div><dt>Số tầng</dt><dd>{building.totalFloors}</dd></div>
      <div><dt>Địa chỉ</dt><dd>{address || "Chưa nhập"}</dd></div>
      <div><dt>Trạng thái</dt><dd><StatusBadge tone={building.isActive ? "success" : "neutral"}>{building.isActive ? "Đang dùng" : "Đã lưu trữ"}</StatusBadge></dd></div>
      <div><dt>Cập nhật</dt><dd>{formatDateTime(building.updatedAt)}</dd></div>
    </dl>

    <Modal open={open} onOpenChange={(next) => { if (!next && !saving) setOpen(false); }} size="md" title="Sửa thông tin công trình" description="Tọa độ và liên hệ không hiển thị ở đây được giữ nguyên."
      footer={<><Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Hủy</Button><SubmitButton type="submit" form="building-info-form" state={saving ? "busy" : "idle"}>Lưu thay đổi</SubmitButton></>}>
      <form id="building-info-form" onSubmit={(event) => void submit(event)} noValidate className="ops-stack">
        {stale && !stale.adopted && <BuildingConflictAlert current={stale.current} onUseLatest={() => { setForm(formFromBuilding(stale.current)); setStale({ ...stale, adopted: true }); }} />}
        <BuildingForm form={form} errors={errors} autoFocus onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
        {formError && <Alert tone="danger">{formError}</Alert>}
      </form>
    </Modal>
  </section>;
}
