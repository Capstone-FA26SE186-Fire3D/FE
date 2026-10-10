"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { BuildingServicesTab } from "@/features/billing/components/building-services-tab";
import { buildingsApi } from "../api";
import { describeApiError, isStatus } from "../format";
import { emptyPipeline, isTerminalJob, revisionLabel, type RevisionPipeline } from "../pipeline";
import type { ProcessingJob } from "../types";
import { AnnotationsPanel } from "./annotations-panel";
import { BuildingAccessPanel } from "./building-access-panel";
import { ConfirmTrainingPanel } from "./confirm-training-panel";
import { IfcUploadPanel } from "./ifc-upload-panel";
import { OverviewTab } from "./overview-tab";
import { PreviewPanel } from "./preview-panel";
import { ProcessingStatusPanel } from "./processing-status-panel";
import { RevisionDetailsPanel } from "./revision-details-panel";
import { ScenariosPanel } from "./scenarios-panel";

export const buildingTabs = ["overview", "ifc", "scenarios", "access", "services"] as const;
export type BuildingTab = (typeof buildingTabs)[number];
const tabLabels: Record<BuildingTab, string> = { overview: "Tổng quan", ifc: "IFC & xử lý", scenarios: "Kịch bản", access: "Quyền tham gia", services: "Dịch vụ" };
const SCENARIO_PAGE_SIZE = 20;

type PipelineSnapshot = { revisionId: string; jobs: ProcessingJob[]; pipeline: RevisionPipeline };

function isTab(value: string): value is BuildingTab {
  return (buildingTabs as readonly string[]).includes(value);
}

/**
 * Building detail for OrganizationUser and PlatformAdmin. The tab (`?tab=`) and the selected revision (`?revision=`)
 * live in the URL. The newest processing job of the selected revision is polled every 3s until it ends.
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

  const building = useAsyncData(`building:${buildingId}`, (signal) => buildingsApi.get(token, buildingId, signal), enabled);
  const revisions = useAsyncData(`revisions:${buildingId}`, (signal) => buildingsApi.listRevisions(token, buildingId, 1, 50, signal), enabled);
  const scenarios = useAsyncData(`scenarios:${buildingId}:${scenarioPage}`, (signal) => buildingsApi.listScenarios(token, buildingId, scenarioPage, SCENARIO_PAGE_SIZE, signal), enabled);

  const revisionItems = revisions.data?.items;
  const urlRevision = get("revision");
  const revision = (revisionItems ?? []).find((item) => item.id === urlRevision) ?? revisionItems?.[0] ?? null;
  const revisionId = revision?.id ?? "";
  const revisionStatus = revision?.status;

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
      // QA is read from the validation run of the CURRENT attempt, and only once the worker is done.
      const qa = detail.job.status === "Succeeded" ? await buildingsApi.getJobQa(token, newest.id, signal).catch((error: unknown) => { if (signal.aborted) throw error; return null; }) : null;
      return { revisionId, jobs, pipeline: { job: detail.job, detail, qa } };
    },
    // No job yet: keep polling only while the revision is waiting for one to appear.
    isDone: (snapshot) => (snapshot.pipeline.job ? isTerminalJob(snapshot.pipeline.job.status) : revisionStatus !== "Uploaded" && revisionStatus !== "Processing"),
  });
  const snapshot = pipelineState.data?.revisionId === revisionId ? pipelineState.data : undefined;
  const pipeline = snapshot?.pipeline ?? emptyPipeline;
  const jobs = snapshot?.jobs ?? [];
  const jobStatus = pipeline.job?.status ?? "";
  const reloadKey = `${jobStatus}:${pipeline.detail?.currentAttemptId ?? ""}`;
  const pollError = pipelineState.data?.revisionId === revisionId || pipelineState.data === undefined ? pipelineState.error : undefined;

  const issues = useAsyncData(`issues:${revisionId}:${reloadKey}`, (signal) => buildingsApi.listIssues(token, revisionId, 1, 100, signal), pollEnabled && (tab === "ifc" || tab === "overview"));

  // When the worker finishes, the revision status changes on the server: refresh the list once.
  const previousStatus = useRef<string>("");
  const reloadRevisions = revisions.reload;
  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = jobStatus;
    if (before && !isTerminalJob(before) && isTerminalJob(jobStatus)) reloadRevisions();
  }, [jobStatus, reloadRevisions]);

  const refreshAll = useCallback(() => {
    building.reload();
    revisions.reload();
    scenarios.reload();
    pipelineState.refresh();
  }, [building, revisions, scenarios, pipelineState]);

  const selectRevision = (id: string) => setParams({ revision: id });
  const selectTab = (next: string) => { if (isTab(next)) setParams({ tab: next }); };

  const onRevisionChanged = (id: string, phase: "uploaded" | "processing") => {
    // The new revision becomes the one on screen; the list reloads so it appears in the selector.
    revisions.reload();
    if (phase === "uploaded") setParams({ revision: id });
    else pipelineState.refresh();
  };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;

  const crumbs: Crumb[] = isAdmin && building.data
    ? [{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức", href: routes.adminOrganizations }, { label: "Công trình", href: `${routes.adminOrganizations}/${building.data.organizationId}/buildings` }, { label: building.data.name }]
    : isAdmin
      ? [{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức", href: routes.adminOrganizations }, { label: "Công trình" }]
      : [{ label: "Công trình", href: routes.workspaceBuildings }, { label: building.data?.name ?? "Chi tiết" }];

  if (building.error !== undefined && !building.data) {
    const notFound = isStatus(building.error, 404);
    return <>
      <PageHeader title={notFound ? "Không tìm thấy công trình" : "Không tải được công trình"} breadcrumbs={crumbs} />
      <Alert tone={notFound ? "warning" : "danger"} title={notFound ? "Công trình không tồn tại" : "Có lỗi khi tải công trình"} action={<div className="ops-actions" style={{ marginTop: 12 }}>{!notFound && <Button size="sm" variant="secondary" onClick={building.reload}>Thử lại</Button>}</div>}>
        {describeApiError(building.error, "Hãy thử lại sau.")}
      </Alert>
    </>;
  }

  const data = building.data;
  const rev = revision ? revisionLabel(revision.status) : null;

  return <>
    <PageHeader
      title={data?.name ?? "Đang tải công trình…"}
      description={data ? `${data.buildingType || "Công trình"} · ${data.totalFloors} tầng` : undefined}
      breadcrumbs={crumbs}
      actions={<Button variant="quiet" onClick={refreshAll}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>}
    />

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
        {!data ? <Skeleton style={{ height: 240 }} /> : <OverviewTab accessToken={token} building={data} revision={revision} pipeline={pipeline} issues={issues.data?.items} scenarioCount={scenarios.data?.totalCount} isAdmin={isAdmin} onSaved={building.reload} onGoTo={selectTab} />}
      </TabsContent>

      <TabsContent value="ifc">
        <div className="ops-stack">
          <IfcUploadPanel accessToken={accessToken} buildingId={buildingId} onRevisionChanged={onRevisionChanged} />
          {revisions.loading && !revisions.data && <Skeleton style={{ height: 160 }} />}
          {revision && accessToken && <>
            <ProcessingStatusPanel accessToken={accessToken} revision={revision} pipeline={pipeline} issues={issues.data?.items} polling={pipelineState.polling} pollError={pollError} onRefresh={pipelineState.refresh} onChanged={() => { revisions.reload(); pipelineState.refresh(); }} />
            <PreviewPanel accessToken={accessToken} buildingId={buildingId} revisionId={revision.id} reloadKey={reloadKey} />
            <RevisionDetailsPanel accessToken={accessToken} revisionId={revision.id} issues={{ data: issues.data?.items, error: issues.error, loading: issues.loading, reload: issues.reload }} reloadKey={reloadKey} />
            <AnnotationsPanel accessToken={accessToken} revisionId={revision.id} />
            <ConfirmTrainingPanel accessToken={accessToken} buildingId={buildingId} revision={revision} pipeline={pipeline} jobs={jobs} onConfirmed={revisions.reload} />
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

      <TabsContent value="services">
        <BuildingServicesTab buildingId={buildingId} />
      </TabsContent>
    </Tabs>
  </>;
}
