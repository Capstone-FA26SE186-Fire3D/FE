"use client";

import { Archive, MoreHorizontal, Pencil, QrCode, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "@/api/use-polling";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { RowMenu } from "@/components/ui/dropdown-menu";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { Skeleton, SkeletonDetail, SkeletonReveal } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubTabs, SubTabsContent } from "@/components/ui/sub-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { billingApi } from "@/features/billing/api";
import { BuildingServicesTab } from "@/features/billing/components/building-services-tab";
import { summarizeEntitlements } from "@/features/billing/entitlements";
import { formatDate } from "@/features/billing/format";
import { rememberRecentBuilding } from "@/features/command-palette/recent-buildings";
import { buildingsApi } from "../api";
import { describeApiError, isStatus } from "../format";
import { derivePipelineProgress, emptyPipeline, isTerminalJob, isUnsettledRevision, revisionLabel, type PipelineAction, type RevisionPipeline } from "../pipeline";
import type { QaAction } from "../qa-codes";
import type { BuildingRevision, ProcessingJob, ProcessingLog } from "../types";
import { useProcessingActions } from "../use-processing-actions";
import { AnnotationsPanel } from "./annotations-panel";
import { BuildingAccessPanel } from "./building-access-panel";
import { ConfirmTrainingPanel } from "./confirm-training-panel";
import { EquipmentPanel } from "./equipment-panel";
import { IfcUploadModal } from "./ifc-upload-modal";
import { JourneyOverview } from "./journey-overview";
import { PipelineProgress } from "./pipeline-progress";
import { PreviewPanel } from "./preview-panel";
import { ProcessingStatusPanel } from "./processing-status-panel";
import { QrPanel } from "./qr-panel";
import { RevisionDetailsPanel } from "./revision-details-panel";
import { ScenariosPanel } from "./scenarios-panel";
import "../building-v2.css";

export const buildingTabs = ["journey", "ifc", "scenarios", "access", "services"] as const;
export type BuildingTab = (typeof buildingTabs)[number];
const tabLabels: Record<BuildingTab, string> = { journey: "Hành trình", ifc: "IFC", scenarios: "Kịch bản", access: "Truy cập", services: "Dịch vụ" };
const tabTour: Partial<Record<BuildingTab, string>> = { journey: "tab-journey", ifc: "tab-ifc" };
/** Old links and bookmarks: `?tab=overview` → journey, `?tab=qr` → access with the QR sub-tab. */
const tabAliases: Record<string, { tab: BuildingTab; sub?: string }> = { overview: { tab: "journey" }, qr: { tab: "access", sub: "qr" } };
const ifcSubTabs = ["progress", "preview", "equipment", "technical", "annotations"] as const;
type IfcSub = (typeof ifcSubTabs)[number];
const ifcSubLabels: Record<IfcSub, string> = { progress: "Tiến trình", preview: "Preview 3D", equipment: "Thiết bị", technical: "Kỹ thuật", annotations: "Annotation" };
const SCENARIO_PAGE_SIZE = 20;
// After a Succeeded job the revision is re-read until QA moved it out of Uploaded/Processing; ~1 minute at most.
const MAX_SETTLE_POLLS = 20;

/** `revision` is a fresh read, taken only while the listed status still waits for QA. */
type PipelineSnapshot = { revisionId: string; jobs: ProcessingJob[]; pipeline: RevisionPipeline; revision?: BuildingRevision };

function newestLog(logs: ProcessingLog[], jobId: string) {
  return logs.filter((log) => log.jobId === jobId).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0] ?? null;
}

/**
 * Scrolls to a section and focuses its first `[data-focus-target]`. A freshly opened sub-tab may still be loading, so
 * the target is awaited for a short while before falling back to the section itself.
 */
function focusSection(id: string, attempt = 0, scrolled = false) {
  const section = document.getElementById(id);
  if (!section) {
    if (attempt < FOCUS_POLLS) window.setTimeout(() => focusSection(id, attempt + 1), 100);
    return;
  }
  if (!scrolled) section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const target = section.querySelector<HTMLElement>("[data-focus-target]:not([disabled])");
  if (!target && attempt < FOCUS_POLLS) {
    window.setTimeout(() => focusSection(id, attempt + 1, true), 100);
    return;
  }
  (target ?? section).focus({ preventScroll: true });
}
const FOCUS_POLLS = 20;

function isTab(value: string): value is BuildingTab {
  return (buildingTabs as readonly string[]).includes(value);
}
function isIfcSub(value: string): value is IfcSub {
  return (ifcSubTabs as readonly string[]).includes(value);
}

/**
 * Building detail (Figma "Chi tiết" v2): compact header (name, type · floors · address, visibility/service chips, "Mã QR
 * công trình", "···" menu), five tabs Hành trình · IFC · Kịch bản · Truy cập · Dịch vụ. The tab (`?tab=`), the IFC/access
 * sub-tab (`?sub=`) and the selected revision (`?revision=`) live in the URL; `?upload=1` / `?create=1` open the modals
 * (⌘K and the list's "Việc tiếp theo"). The newest processing job of the selected revision is polled every 3s until it ends.
 */
export function BuildingDetailWorkspace({ buildingId, defaultTab = "journey" }: { buildingId: string; defaultTab?: BuildingTab }) {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const token = accessToken ?? "";
  const enabled = Boolean(accessToken) && ready;
  const isAdmin = user?.role === 0;

  const urlTab = get("tab");
  const alias = tabAliases[urlTab];
  const tab: BuildingTab = isTab(urlTab) ? urlTab : alias?.tab ?? defaultTab;
  const urlSub = get("sub") || alias?.sub || "";
  const ifcSub: IfcSub = isIfcSub(urlSub) ? urlSub : "progress";
  const accessSub = urlSub === "qr" ? "qr" : "rights";
  const [scenarioPage, setScenarioPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const wantUpload = get("upload") === "1";
  const wantCreate = get("create") === "1";
  // The QR panel stays mounted once opened: a freshly issued token exists only in its memory and must survive tab switches.
  const [qrOpened, setQrOpened] = useState(false);
  // IFC elements emphasized in the preview, bound to the revision they were chosen on.
  const [highlight, setHighlight] = useState<{ revisionId: string; ids: string[] }>({ revisionId: "", ids: [] });
  const showInPreview = (revisionId: string, ids: string[]) => {
    setHighlight({ revisionId, ids });
    setParams({ tab: "ifc", sub: "preview" }, "replace");
  };
  if (tab === "access" && accessSub === "qr" && !qrOpened) setQrOpened(true);

  // ?upload=1 (⌘K, list button) opens the modal directly; closing it clears the param so a reload does not reopen it.
  const uploadModalOpen = uploadOpen || wantUpload;
  const setUploadModal = (next: boolean) => { setUploadOpen(next); if (!next && wantUpload) setParams({ upload: null }, "replace"); };

  const building = useAsyncData(`building:${buildingId}`, (signal) => buildingsApi.getVersioned(token, buildingId, signal), enabled);
  const revisions = useAsyncData(`revisions:${buildingId}`, (signal) => buildingsApi.listRevisions(token, buildingId, 1, 50, signal), enabled);
  // Header chips: visibility and the service period. Both are optional context; a failed read just hides the chip.
  const access = useAsyncData(`building-access:${buildingId}`, (signal) => buildingsApi.getAccess(token, buildingId, signal), enabled && !isAdmin);
  const entitlements = useAsyncData(`billing:entitlements:${buildingId}`, (signal) => billingApi.listEntitlements(token, { buildingId, pageSize: 50 }, signal), enabled && !isAdmin);
  const service = useMemo(() => (entitlements.data ? summarizeEntitlements(entitlements.data.items) : undefined), [entitlements.data]);
  const scenarios = useAsyncData(`scenarios:${buildingId}:${scenarioPage}`, (signal) => buildingsApi.listScenarios(token, buildingId, scenarioPage, SCENARIO_PAGE_SIZE, signal), enabled);

  const data = building.data?.data;
  useEffect(() => {
    if (data && !isAdmin) rememberRecentBuilding({ id: data.id, name: data.name, floors: data.totalFloors });
  }, [data, isAdmin]);

  const revisionItems = revisions.data?.items;
  const urlRevision = get("revision");
  const listedRevision = (revisionItems ?? []).find((item) => item.id === urlRevision) ?? revisionItems?.[0] ?? null;
  const revisionId = listedRevision?.id ?? "";
  const listedStatus = listedRevision?.status;
  const latestRevision = useMemo(() => [...(revisionItems ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [revisionItems]);
  const settlePolls = useRef({ revisionId: "", count: 0 });

  // --- Processing job of the selected revision (polled) ---
  const pollEnabled = enabled && Boolean(revisionId);
  const pipelineState = usePolling<PipelineSnapshot>({
    enabled: pollEnabled,
    resetKey: revisionId,
    fetcher: async (signal) => {
      const list = await buildingsApi.listProcessingJobs(token, revisionId, 1, 20, signal);
      const jobs = [...list.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const newest = jobs[0];
      if (!newest) return { revisionId, jobs, pipeline: emptyPipeline };
      const detail = await buildingsApi.getJob(token, newest.id, signal);
      const pipeline: RevisionPipeline = { job: detail.job, detail, qa: null };
      if (detail.job.status === "Running") {
        // Logs are optional progress detail (the worker may not write any): a failure here never hides the job.
        const logs = await buildingsApi.listProcessingLogs(token, revisionId, 1, 20, signal).catch((error: unknown) => { if (signal.aborted) throw error; return null; });
        pipeline.latestLog = logs ? newestLog(logs.items, newest.id) : null;
      }
      let revision: BuildingRevision | undefined;
      if (detail.job.status === "Succeeded") {
        // QA is read from the validation run of the CURRENT attempt, and only once the worker is done; a failed read is surfaced.
        try { pipeline.qa = await buildingsApi.getJobQa(token, newest.id, signal); } catch (error) { if (signal.aborted) throw error; pipeline.qaError = error; }
        if (isUnsettledRevision(listedStatus)) {
          if (settlePolls.current.revisionId !== revisionId) settlePolls.current = { revisionId, count: 0 };
          settlePolls.current.count += 1;
          revision = await buildingsApi.getRevision(token, revisionId, signal);
        }
      }
      return { revisionId, jobs, pipeline, revision };
    },
    isDone: (snapshot) => {
      const job = snapshot.pipeline.job;
      const status = snapshot.revision?.status ?? listedStatus;
      // No job yet: keep polling only while the revision is waiting for one to appear.
      if (!job) return !isUnsettledRevision(status);
      if (!isTerminalJob(job.status)) return false;
      // A failed job leaves the revision Uploaded on the BE, so only a Succeeded job waits for the status to settle.
      if (job.status !== "Succeeded" || snapshot.pipeline.qaError !== undefined) return true;
      return !isUnsettledRevision(status) || settlePolls.current.count >= MAX_SETTLE_POLLS;
    },
  });
  const snapshot = pipelineState.data?.revisionId === revisionId ? pipelineState.data : undefined;
  const freshRevision = snapshot?.revision;
  const revision = listedRevision && freshRevision && freshRevision.id === listedRevision.id ? { ...listedRevision, ...freshRevision } : listedRevision;
  const pipeline = snapshot?.pipeline ?? emptyPipeline;
  const jobs = snapshot?.jobs ?? [];
  const jobStatus = pipeline.job?.status ?? "";
  const reloadKey = `${jobStatus}:${pipeline.detail?.currentAttemptId ?? ""}`;
  const pollError = pipelineState.data?.revisionId === revisionId || pipelineState.data === undefined ? pipelineState.error : undefined;

  const issues = useAsyncData(`issues:${revisionId}:${reloadKey}`, (signal) => buildingsApi.listIssues(token, revisionId, 1, 100, signal), pollEnabled && (tab === "ifc" || tab === "journey"));

  // When the worker finishes, the revision status changes on the server: refresh the list once, and again whenever a
  // fresh read of the revision disagrees with the list.
  const previousStatus = useRef<string>("");
  const reloadRevisions = revisions.reload;
  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = jobStatus;
    if (before && !isTerminalJob(before) && isTerminalJob(jobStatus)) reloadRevisions();
  }, [jobStatus, reloadRevisions]);
  const freshStatus = freshRevision?.status;
  useEffect(() => {
    if (freshStatus && listedStatus && freshStatus !== listedStatus) reloadRevisions();
  }, [freshStatus, listedStatus, reloadRevisions]);

  const [detailsTab, setDetailsTab] = useState("issues");
  const processing = useProcessingActions({ accessToken: token, revision, job: pipeline.job, onChanged: () => { revisions.reload(); pipelineState.refresh(); } });
  const progress = revision ? derivePipelineProgress({
    revision,
    pipeline,
    currentIssues: issues.data?.items.filter((item) => item.isCurrentAttempt),
    loaded: snapshot !== undefined,
    hasNewerRevision: Boolean(latestRevision && latestRevision.id !== revision.id),
  }) : null;

  const refreshAll = useCallback(() => {
    building.reload();
    revisions.reload();
    scenarios.reload();
    pipelineState.refresh();
  }, [building, revisions, scenarios, pipelineState]);

  const selectRevision = (id: string) => setParams({ revision: id });
  const selectTab = (next: string, sub?: string) => { if (isTab(next)) setParams({ tab: next, sub: sub ?? null }); };
  const selectIfcSub = (sub: string) => setParams({ tab: "ifc", sub: sub === "progress" ? null : sub }, "replace");

  const runAction = (action: PipelineAction | QaAction) => {
    switch (action) {
      case "upload": case "reupload": setUploadOpen(true); break;
      case "process": void processing.start(); break;
      case "retry": processing.openRetry(); break;
      case "refresh": pipelineState.refresh(); break;
      case "issues": setDetailsTab("issues"); selectIfcSub("technical"); window.setTimeout(() => focusSection("ifc-details"), 60); break;
      case "exit": case "equipment": selectIfcSub("equipment"); window.setTimeout(() => focusSection("ifc-equipment"), 60); break;
      case "author": case "editor": setParams({ tab: "scenarios", sub: null, revision: revisionId || null }); break;
      case "latest": if (latestRevision) selectRevision(latestRevision.id); break;
    }
  };

  const onRevisionChanged = (id: string, phase: "uploaded" | "processing") => {
    // The new revision becomes the one on screen; the list reloads so it appears in the selector.
    revisions.reload();
    if (phase === "uploaded") setParams({ revision: id, sub: null }, "replace");
    else pipelineState.refresh();
  };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;

  const crumbs: Crumb[] = isAdmin && data
    ? [{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức", href: routes.adminOrganizations }, { label: "Công trình", href: `${routes.adminOrganizations}/${data.organizationId}/buildings` }, { label: data.name }]
    : isAdmin
      ? [{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức", href: routes.adminOrganizations }, { label: "Công trình" }]
      : [{ label: "Công trình", href: routes.workspaceBuildings }, { label: data?.name ?? "Chi tiết" }];

  if (building.error !== undefined && !building.data) {
    const notFound = isStatus(building.error, 404);
    return <>
      <PageHeader title={notFound ? "Không tìm thấy công trình" : "Không tải được công trình"} breadcrumbs={crumbs} />
      <Alert tone={notFound ? "warning" : "danger"} title={notFound ? "Công trình không tồn tại" : "Có lỗi khi tải công trình"} action={<div className="ops-actions" style={{ marginTop: 12 }}>{!notFound && <Button size="sm" variant="secondary" onClick={building.reload}>Thử lại</Button>}</div>}>
        {describeApiError(building.error, "Hãy thử lại sau.")}
      </Alert>
    </>;
  }

  const rev = revision ? revisionLabel(revision.status) : null;
  const address = data ? [data.location?.district, data.location?.city].filter(Boolean).join(", ") : "";
  const revisionOptions = (revisionItems ?? []).map((item) => ({ value: item.id, label: `${item.versionLabel} · ${revisionLabel(item.status).label}` }));

  return <div className="org bd">
    <PageHeader
      title={data?.name ?? "Đang tải công trình…"}
      eyebrow="Công trình"
      description={data ? [data.buildingType || "Công trình", `${data.totalFloors} tầng`, address].filter(Boolean).join(" · ") : undefined}
      breadcrumbs={crumbs}
      actions={<>
        {!isAdmin && <Button variant="secondary" onClick={() => selectTab("access", "qr")}><QrCode size={16} aria-hidden="true" />Mã QR công trình</Button>}
        <RowMenu label="Thêm thao tác" trigger={<Button variant="secondary" size="icon" aria-label="Thêm thao tác"><MoreHorizontal size={18} aria-hidden="true" /></Button>} items={[
          { label: "Sửa thông tin", icon: Pencil, onSelect: () => { selectTab("journey"); window.setTimeout(() => document.getElementById("building-info")?.querySelector<HTMLButtonElement>("button")?.click(), 80); } },
          { label: "Tải IFC mới", icon: Upload, onSelect: () => setUploadOpen(true) },
          { label: "Tải lại dữ liệu", icon: RefreshCw, onSelect: refreshAll },
          ...(!isAdmin && data?.isActive ? [{ label: "Lưu trữ công trình", icon: Archive, tone: "danger" as const, separator: true, hint: "Thực hiện ở danh sách công trình", disabled: true, onSelect: () => undefined }] : []),
        ]} />
      </>}
    />
    {!isAdmin && (access.data || service) && <div className="ops-chips bd-chips" aria-label="Tình trạng công trình">
      {access.data && <StatusBadge tone="neutral">{access.data.visibility === "Public" ? "Công khai" : "Riêng tư"}</StatusBadge>}
      {service?.current && <StatusBadge tone={service.state === "expiring" ? "warning" : "success"}>Dịch vụ đến {formatDate(service.current.endsAt)}{service.daysLeft !== null ? ` · còn ${Math.max(service.daysLeft, 0)} ngày` : ""}</StatusBadge>}
      {service && !service.current && <StatusBadge tone={service.state === "expired" ? "danger" : "warning"}>{service.state === "expired" ? "Dịch vụ đã hết hạn" : service.state === "upcoming" ? "Dịch vụ chưa đến kỳ" : "Chưa có dịch vụ"}</StatusBadge>}
    </div>}

    <Tabs value={tab} onValueChange={(next) => selectTab(next)}>
      <TabsList aria-label="Chi tiết công trình">
        {buildingTabs.map((value) => <TabsTrigger key={value} value={value} data-tour={tabTour[value]} data-testid={`building-tab-${value}`}>{tabLabels[value]}</TabsTrigger>)}
      </TabsList>

      <TabsContent value="journey">
        <SkeletonReveal loading={!data} skeleton={<><Skeleton style={{ height: 120 }} /><SkeletonDetail rows={4} /></>} label="Đang tải hành trình…">
          {data && <JourneyOverview accessToken={token} building={data} etag={building.data?.etag ?? null} revision={revision} pipeline={pipeline} issues={issues.data?.items} scenarios={scenarios.data?.items} scenarioCount={scenarios.data?.totalCount} service={service} isAdmin={isAdmin} onGoTo={selectTab} onSaved={building.reload} onUpload={() => setUploadOpen(true)} />}
        </SkeletonReveal>
      </TabsContent>

      <TabsContent value="ifc">
        <div className="ops-stack">
          <div className="bd-revision-bar">
            <div className="ops-field bd-revision-field">
              <label htmlFor="revision-select">Revision đang xem</label>
              <Combobox id="revision-select" value={revisionId} options={revisionOptions} placeholder={revisions.loading && !revisionItems ? "Đang tải…" : "Chưa có revision"} searchPlaceholder="Tìm revision…" groupLabel="Revision" disabled={!revisionItems?.length} onChange={selectRevision} aria-label="Revision đang xem" />
            </div>
            {rev && <StatusBadge tone={rev.tone}>{rev.label}</StatusBadge>}
            <Button onClick={() => setUploadOpen(true)} data-tour="upload-ifc" data-testid="ifc-upload-open"><Upload size={16} aria-hidden="true" />Tải IFC</Button>
          </div>
          {revisions.error !== undefined && <Alert tone="danger" title="Không tải được danh sách revision" action={<Button size="sm" variant="secondary" className="mt-3" onClick={revisions.reload}>Thử lại</Button>}>{describeApiError(revisions.error, "Hãy thử lại sau.")}</Alert>}
          {revisions.data && !revision && <Alert tone="info" title="Chưa có revision nào">Tải lên tệp IFC đầu tiên bằng nút “Tải IFC”. Sau khi tải xong, tiến trình xử lý, QA và preview hiển thị ở đây.</Alert>}

          {revision && accessToken && <SubTabs label="Mục IFC" value={ifcSub} onValueChange={selectIfcSub} items={ifcSubTabs.map((value) => ({ value, label: ifcSubLabels[value], "data-testid": `ifc-sub-${value}` }))}>
            <SubTabsContent value="progress">
              <div className="ops-stack">
                {progress && <PipelineProgress model={progress} versionLabel={revision.versionLabel} onAction={runAction} busy={processing.working} actionError={processing.actionError} />}
                <div className="bd-two-col">
                  <ProcessingStatusPanel revision={revision} pipeline={pipeline} issues={issues.data?.items} polling={pipelineState.polling} pollError={pollError} onRefresh={pipelineState.refresh} />
                  <ConfirmTrainingPanel accessToken={accessToken} buildingId={buildingId} revision={revision} pipeline={pipeline} jobs={jobs} issues={issues.data?.items} onConfirmed={revisions.reload} />
                </div>
              </div>
            </SubTabsContent>
            <SubTabsContent value="preview">
              <PreviewPanel accessToken={accessToken} buildingId={buildingId} revisionId={revision.id} reloadKey={reloadKey} highlight={highlight.revisionId === revision.id ? highlight.ids : undefined} onClearHighlight={() => setHighlight({ revisionId: "", ids: [] })} onUploadNew={() => setUploadOpen(true)} />
            </SubTabsContent>
            <SubTabsContent value="equipment">
              <EquipmentPanel key={revision.id} accessToken={accessToken} revisionId={revision.id} onChanged={() => { revisions.reload(); pipelineState.refresh(); }} onHighlight={(ids) => showInPreview(revision.id, ids)} />
            </SubTabsContent>
            <SubTabsContent value="technical">
              <RevisionDetailsPanel accessToken={accessToken} revisionId={revision.id} issues={{ data: issues.data?.items, error: issues.error, loading: issues.loading, reload: issues.reload }} reloadKey={reloadKey} onHighlight={(ids) => showInPreview(revision.id, ids)} onIssueAction={runAction} tab={detailsTab} onTabChange={setDetailsTab} />
            </SubTabsContent>
            <SubTabsContent value="annotations">
              <AnnotationsPanel accessToken={accessToken} revisionId={revision.id} />
            </SubTabsContent>
          </SubTabs>}
          {processing.modal}
        </div>
      </TabsContent>

      <TabsContent value="scenarios">
        {accessToken && <ScenariosPanel accessToken={accessToken} buildingId={buildingId} revisionLabel={revision?.versionLabel} scenarios={{ ...scenarios, page: scenarioPage, setPage: setScenarioPage }} onChanged={scenarios.reload} openCreate={wantCreate} onCreateHandled={() => setParams({ create: null }, "replace")} />}
      </TabsContent>

      <TabsContent value="access" forceMount hidden={tab !== "access"}>
        {tab === "access" && <SubTabs label="Mục truy cập" value={accessSub} onValueChange={(sub) => setParams({ tab: "access", sub: sub === "qr" ? "qr" : null }, "replace")} items={[{ value: "rights", label: "Quyền tham gia", "data-testid": "access-sub-rights" }, { value: "qr", label: "Mã QR", "data-testid": "access-sub-qr" }]} />}
        <div hidden={tab !== "access" || accessSub !== "rights"} className="ops-subtabs-content">{accessToken && tab === "access" && accessSub === "rights" && <BuildingAccessPanel accessToken={accessToken} buildingId={buildingId} />}</div>
        <div hidden={tab !== "access" || accessSub !== "qr"} className="ops-subtabs-content">{qrOpened && accessToken && <QrPanel accessToken={accessToken} buildingId={buildingId} buildingName={data?.name ?? "Công trình"} />}</div>
      </TabsContent>

      <TabsContent value="services">
        <BuildingServicesTab buildingId={buildingId} />
      </TabsContent>
    </Tabs>

    <IfcUploadModal open={uploadModalOpen} onOpenChange={setUploadModal} accessToken={accessToken} buildingId={buildingId} onRevisionChanged={onRevisionChanged} />
  </div>;
}
