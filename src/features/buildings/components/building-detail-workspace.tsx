"use client";

import { QrCode, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "@/api/use-polling";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { Select } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { billingApi } from "@/features/billing/api";
import { BuildingServicesTab } from "@/features/billing/components/building-services-tab";
import { summarizeEntitlements } from "@/features/billing/entitlements";
import { formatDate } from "@/features/billing/format";
import { buildingsApi } from "../api";
import { describeApiError, isStatus } from "../format";
import { derivePipelineProgress, emptyPipeline, isTerminalJob, isUnsettledRevision, revisionLabel, type PipelineAction, type RevisionPipeline } from "../pipeline";
import type { QaAction } from "../qa-codes";
import type { BuildingRevision, ProcessingJob, ProcessingLog } from "../types";
import { useProcessingActions } from "../use-processing-actions";
import { AnnotationsPanel } from "./annotations-panel";
import { BuildingAccessPanel } from "./building-access-panel";
import { EquipmentPanel } from "./equipment-panel";
import { ConfirmTrainingPanel } from "./confirm-training-panel";
import { IfcUploadPanel } from "./ifc-upload-panel";
import { OverviewTab } from "./overview-tab";
import { PipelineProgress } from "./pipeline-progress";
import { PreviewPanel } from "./preview-panel";
import { ProcessingStatusPanel } from "./processing-status-panel";
import { QrPanel } from "./qr-panel";
import { RevisionDetailsPanel } from "./revision-details-panel";
import { ScenariosPanel } from "./scenarios-panel";

export const buildingTabs = ["overview", "ifc", "scenarios", "access", "qr", "services"] as const;
export type BuildingTab = (typeof buildingTabs)[number];
const tabLabels: Record<BuildingTab, string> = { overview: "Hành trình", ifc: "IFC & xử lý", scenarios: "Kịch bản", access: "Quyền tham gia", qr: "QR", services: "Dịch vụ" };
const tabEyebrow: Record<BuildingTab, string> = { overview: "Công trình", ifc: "Bước 2 · IFC và xử lý", scenarios: "Bước 3 · Soạn kịch bản", access: "Công trình · Quyền tham gia", qr: "Công trình · Mã QR", services: "Công trình · Dịch vụ" };
const SCENARIO_PAGE_SIZE = 20;
// After a Succeeded job the revision is re-read until QA moved it out of Uploaded/Processing; ~1 minute at most.
const MAX_SETTLE_POLLS = 20;

/** `revision` is a fresh read, taken only while the listed status still waits for QA. */
type PipelineSnapshot = { revisionId: string; jobs: ProcessingJob[]; pipeline: RevisionPipeline; revision?: BuildingRevision };

function newestLog(logs: ProcessingLog[], jobId: string) {
  return logs.filter((log) => log.jobId === jobId).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0] ?? null;
}

function focusSection(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const target = section.querySelector<HTMLElement>("[data-focus-target]:not([disabled])") ?? section;
  target.focus({ preventScroll: true });
}

function isTab(value: string): value is BuildingTab {
  return (buildingTabs as readonly string[]).includes(value);
}

/**
 * Building detail for OrganizationUser and PlatformAdmin. The tab (`?tab=`) and the selected revision (`?revision=`)
 * live in the URL. The newest processing job of the selected revision is polled every 3s until it ends and the revision
 * status has settled.
 */
export function BuildingDetailWorkspace({ buildingId, defaultTab = "overview" }: { buildingId: string; defaultTab?: BuildingTab }) {
  const { accessToken, ready, user } = useAuthSession();
  const { get, setParams } = useUrlParams();
  const token = accessToken ?? "";
  const enabled = Boolean(accessToken) && ready;
  const isAdmin = user?.role === 0;

  const urlTab = get("tab");
  const tab: BuildingTab = isTab(urlTab) ? urlTab : defaultTab;
  const [scenarioPage, setScenarioPage] = useState(1);
  // The QR tab stays mounted once opened: a freshly issued token exists only in its memory and must survive tab switches.
  const [qrOpened, setQrOpened] = useState(false);
  // IFC elements emphasized in the preview, bound to the revision they were chosen on.
  const [highlight, setHighlight] = useState<{ revisionId: string; ids: string[] }>({ revisionId: "", ids: [] });
  const showInPreview = (revisionId: string, ids: string[]) => {
    setHighlight({ revisionId, ids });
    document.getElementById("revision-preview")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  if (tab === "qr" && !qrOpened) setQrOpened(true);

  const building = useAsyncData(`building:${buildingId}`, (signal) => buildingsApi.getVersioned(token, buildingId, signal), enabled);
  const revisions = useAsyncData(`revisions:${buildingId}`, (signal) => buildingsApi.listRevisions(token, buildingId, 1, 50, signal), enabled);
  // Header chips: visibility and the service period. Both are optional context; a failed read just hides the chip.
  const access = useAsyncData(`building-access:${buildingId}`, (signal) => buildingsApi.getAccess(token, buildingId, signal), enabled && !isAdmin);
  const entitlements = useAsyncData(`billing:entitlements:${buildingId}`, (signal) => billingApi.listEntitlements(token, { buildingId, pageSize: 50 }, signal), enabled && !isAdmin);
  const service = useMemo(() => (entitlements.data ? summarizeEntitlements(entitlements.data.items) : undefined), [entitlements.data]);
  const scenarios = useAsyncData(`scenarios:${buildingId}:${scenarioPage}`, (signal) => buildingsApi.listScenarios(token, buildingId, scenarioPage, SCENARIO_PAGE_SIZE, signal), enabled);

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

  const issues = useAsyncData(`issues:${revisionId}:${reloadKey}`, (signal) => buildingsApi.listIssues(token, revisionId, 1, 100, signal), pollEnabled && (tab === "ifc" || tab === "overview"));

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
  const selectTab = (next: string) => { if (isTab(next)) setParams({ tab: next }); };

  const runAction = (action: PipelineAction | QaAction) => {
    switch (action) {
      case "upload": case "reupload": focusSection("ifc-upload"); break;
      case "process": void processing.start(); break;
      case "retry": processing.openRetry(); break;
      case "refresh": pipelineState.refresh(); break;
      case "issues": setDetailsTab("issues"); focusSection("ifc-details"); break;
      case "exit": case "equipment": focusSection("ifc-equipment"); break;
      case "author": case "editor": setParams({ tab: "scenarios", revision: revisionId || null }); break;
      case "latest": if (latestRevision) selectRevision(latestRevision.id); break;
    }
  };

  const onRevisionChanged = (id: string, phase: "uploaded" | "processing") => {
    // The new revision becomes the one on screen; the list reloads so it appears in the selector.
    revisions.reload();
    if (phase === "uploaded") setParams({ revision: id });
    else pipelineState.refresh();
  };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;

  const crumbs: Crumb[] = isAdmin && building.data
    ? [{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức", href: routes.adminOrganizations }, { label: "Công trình", href: `${routes.adminOrganizations}/${building.data.data.organizationId}/buildings` }, { label: building.data.data.name }]
    : isAdmin
      ? [{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức", href: routes.adminOrganizations }, { label: "Công trình" }]
      : [{ label: "Công trình", href: routes.workspaceBuildings }, { label: building.data?.data.name ?? "Chi tiết" }];

  if (building.error !== undefined && !building.data) {
    const notFound = isStatus(building.error, 404);
    return <>
      <PageHeader title={notFound ? "Không tìm thấy công trình" : "Không tải được công trình"} breadcrumbs={crumbs} />
      <Alert tone={notFound ? "warning" : "danger"} title={notFound ? "Công trình không tồn tại" : "Có lỗi khi tải công trình"} action={<div className="ops-actions" style={{ marginTop: 12 }}>{!notFound && <Button size="sm" variant="secondary" onClick={building.reload}>Thử lại</Button>}</div>}>
        {describeApiError(building.error, "Hãy thử lại sau.")}
      </Alert>
    </>;
  }

  const data = building.data?.data;
  const rev = revision ? revisionLabel(revision.status) : null;

  return <>
    <PageHeader
      title={data?.name ?? "Đang tải công trình…"}
      eyebrow={tabEyebrow[tab]}
      description={data ? `${data.buildingType || "Công trình"} · ${data.totalFloors} tầng` : undefined}
      breadcrumbs={crumbs}
      actions={<>
        <Button variant="quiet" onClick={refreshAll}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
        {!isAdmin && <Button variant="secondary" onClick={() => selectTab("qr")}><QrCode size={16} aria-hidden="true" />Mã QR công trình</Button>}
        <Button variant="secondary" onClick={() => { selectTab("overview"); window.setTimeout(() => document.getElementById("building-info")?.scrollIntoView({ block: "start" }), 60); }}>Thông tin</Button>
      </>}
    />
    {!isAdmin && (access.data || service?.current) && <div className="ops-chips" aria-label="Tình trạng công trình">
      {access.data && <StatusBadge tone="neutral">{access.data.visibility === "Public" ? "Công khai" : "Riêng tư"}</StatusBadge>}
      {service?.current && <StatusBadge tone={service.state === "expiring" ? "warning" : "success"}>Dịch vụ hiệu lực đến {formatDate(service.current.endsAt)}{service.daysLeft !== null ? ` · còn ${Math.max(service.daysLeft, 0)} ngày` : ""}</StatusBadge>}
      {service && !service.current && <StatusBadge tone={service.state === "expired" ? "danger" : "neutral"}>{service.state === "expired" ? "Dịch vụ đã hết hạn" : service.state === "upcoming" ? "Dịch vụ chưa đến kỳ" : "Chưa có dịch vụ"}</StatusBadge>}
    </div>}

    <div className="ops-revision-bar">
      <div className="ops-field">
        <label htmlFor="revision-select">Revision IFC đang xem</label>
        <Select id="revision-select" value={revisionId} disabled={!revisionItems?.length} onChange={(event) => selectRevision(event.target.value)}>
          {!revisionItems?.length && <option value="">{revisions.loading ? "Đang tải…" : "Chưa có revision"}</option>}
          {revisionItems?.map((item) => <option key={item.id} value={item.id}>{item.versionLabel} · {revisionLabel(item.status).label}</option>)}
        </Select>
      </div>
      {rev && <StatusBadge tone={rev.tone}>{rev.label}</StatusBadge>}
      {revisions.error !== undefined && <span role="alert" className="ops-muted">Không tải được danh sách revision. <Button size="sm" variant="quiet" onClick={revisions.reload}>Thử lại</Button></span>}
    </div>

    <Tabs value={tab} onValueChange={selectTab}>
      <TabsList aria-label="Chi tiết công trình">
        {buildingTabs.map((value) => <TabsTrigger key={value} value={value}>{tabLabels[value]}</TabsTrigger>)}
      </TabsList>

      <TabsContent value="overview">
        {!data ? <Skeleton style={{ height: 240 }} /> : <OverviewTab accessToken={token} building={data} etag={building.data?.etag ?? null} revision={revision} pipeline={pipeline} issues={issues.data?.items} scenarios={scenarios.data?.items} scenarioCount={scenarios.data?.totalCount} service={service} isAdmin={isAdmin} onSaved={building.reload} onGoTo={selectTab} />}
      </TabsContent>

      <TabsContent value="ifc">
        <div className="ops-stack">
          {revision && progress && <PipelineProgress model={progress} versionLabel={revision.versionLabel} onAction={runAction} busy={processing.working} actionError={processing.actionError} />}
          <IfcUploadPanel accessToken={accessToken} buildingId={buildingId} onRevisionChanged={onRevisionChanged} />
          {revisions.loading && !revisions.data && <Skeleton style={{ height: 160 }} />}
          {revision && accessToken && <>
            <ProcessingStatusPanel revision={revision} pipeline={pipeline} issues={issues.data?.items} polling={pipelineState.polling} pollError={pollError} onRefresh={pipelineState.refresh} />
            <PreviewPanel accessToken={accessToken} buildingId={buildingId} revisionId={revision.id} reloadKey={reloadKey} highlight={highlight.revisionId === revision.id ? highlight.ids : undefined} onClearHighlight={() => setHighlight({ revisionId: "", ids: [] })} onUploadNew={() => focusSection("ifc-upload")} />
            <EquipmentPanel key={revision.id} accessToken={accessToken} revisionId={revision.id} onChanged={() => { revisions.reload(); pipelineState.refresh(); }} onHighlight={(ids) => showInPreview(revision.id, ids)} />
            <RevisionDetailsPanel accessToken={accessToken} revisionId={revision.id} issues={{ data: issues.data?.items, error: issues.error, loading: issues.loading, reload: issues.reload }} reloadKey={reloadKey} onHighlight={(ids) => showInPreview(revision.id, ids)} onIssueAction={runAction} tab={detailsTab} onTabChange={setDetailsTab} />
            <AnnotationsPanel accessToken={accessToken} revisionId={revision.id} />
            <ConfirmTrainingPanel accessToken={accessToken} buildingId={buildingId} revision={revision} pipeline={pipeline} jobs={jobs} onConfirmed={revisions.reload} />
            {processing.modal}
          </>}
          {revisions.data && !revision && <Alert tone="info" title="Chưa có revision nào">Tải lên tệp IFC đầu tiên ở trên. Sau khi tải xong, tiến trình xử lý, QA và preview sẽ hiển thị ở đây.</Alert>}
        </div>
      </TabsContent>

      <TabsContent value="scenarios">
        {accessToken && <ScenariosPanel accessToken={accessToken} buildingId={buildingId} revisionLabel={revision?.versionLabel} scenarios={{ ...scenarios, page: scenarioPage, setPage: setScenarioPage }} onChanged={scenarios.reload} />}
      </TabsContent>

      <TabsContent value="access">
        {accessToken && <BuildingAccessPanel accessToken={accessToken} buildingId={buildingId} />}
      </TabsContent>

      <TabsContent value="qr" forceMount hidden={tab !== "qr"}>
        {qrOpened && accessToken && <QrPanel accessToken={accessToken} buildingId={buildingId} buildingName={data?.name ?? "Công trình"} />}
      </TabsContent>

      <TabsContent value="services">
        <BuildingServicesTab buildingId={buildingId} />
      </TabsContent>
    </Tabs>
  </>;
}
