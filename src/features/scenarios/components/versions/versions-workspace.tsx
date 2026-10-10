"use client";

import { Camera, GitCommitVertical, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/table";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";

import "./versions.css";
import { useVersionJobs } from "../../use-version-jobs";
import { useVersionMemory } from "../../use-version-memory";
import { approvalGate, describeError, releaseGate, shortHash, technicalGate } from "../../version-readiness";
import type { ScenarioVersionDetail } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { GateStepper } from "./gate-stepper";
import { PackageBuildPanel } from "./package-build-panel";
import { ReadinessPanel } from "./readiness-panel";
import { ReleasePanel, type ReleaseView } from "./release-panel";
import { ReviewPanel } from "./review-panel";
import { SnapshotDrawer } from "./snapshot-drawer";
import { VersionContent, formatDateTime } from "./version-content";

const PAGE_SIZE = 20;
const TABS = ["content", "build", "readiness", "review", "release"] as const;
type TabId = (typeof TABS)[number];
const tabLabels: Record<TabId, string> = {
  content: "Nội dung và rubric",
  build: "Package build",
  readiness: "Kết quả kỹ thuật",
  review: "Gửi duyệt",
  release: "Release",
};

function Workbench({ accessToken, buildingId, version, tab, onTab, canAct, canSubmit }: {
  accessToken: string;
  buildingId: string;
  version: ScenarioVersionDetail;
  tab: TabId;
  onTab: (tab: TabId) => void;
  canAct: boolean;
  canSubmit: boolean;
}) {
  const { memory, remember } = useVersionMemory(version.id);
  const jobs = useVersionJobs({ accessToken, revisionId: version.revisionId, versionId: version.id, rememberedJobId: memory.jobId });

  const releaseQuery = useAsyncData(
    `release:${memory.releaseId ?? "none"}`,
    (signal) => scenarioVersionsApi.getRelease(accessToken, memory.releaseId as string, signal),
    Boolean(memory.releaseId),
  );
  const loaded = memory.releaseId ? releaseQuery.data : undefined;
  const foreign = Boolean(loaded && loaded.scenarioVersionId !== version.id);
  const view: ReleaseView = {
    release: loaded && !foreign ? loaded : undefined,
    foreign,
    loading: Boolean(memory.releaseId) && releaseQuery.loading,
    error: memory.releaseId ? releaseQuery.error : undefined,
    reload: releaseQuery.reload,
  };

  const technical = technicalGate({
    job: jobs.detail,
    verdict: jobs.verdict,
    confirmReviewId: memory.confirmReviewId && memory.confirmRunId && jobs.verdict && jobs.verdict.kind !== "none" && jobs.verdict.run.id === memory.confirmRunId ? memory.confirmReviewId : undefined,
    hasJobs: jobs.jobs.length > 0,
  });

  return <>
    <GateStepper gates={[
      { id: "technical", title: "Kết quả kỹ thuật", state: technical },
      { id: "approval", title: "Duyệt nội dung", state: approvalGate(memory.submission) },
      { id: "release", title: "Release", state: releaseGate(view.release) },
    ]} />
    <Tabs value={tab} onValueChange={(value) => onTab(value as TabId)}>
      <TabsList aria-label="Các bước của phiên bản">
        {TABS.map((id) => <TabsTrigger key={id} value={id}>{tabLabels[id]}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="content"><VersionContent version={version} /></TabsContent>
      <TabsContent value="build">
        <PackageBuildPanel accessToken={accessToken} version={version} jobs={jobs} canAct={canAct} onStarted={(jobId) => { remember({ jobId }); jobs.selectJob(jobId); }} />
      </TabsContent>
      <TabsContent value="readiness">
        <ReadinessPanel accessToken={accessToken} version={version} jobs={jobs} memory={memory} remember={remember} canAct={canAct} />
      </TabsContent>
      <TabsContent value="review">
        <ReviewPanel accessToken={accessToken} version={version} memory={memory} remember={remember} canSubmit={canSubmit} />
      </TabsContent>
      <TabsContent value="release">
        <ReleasePanel accessToken={accessToken} buildingId={buildingId} version={version} jobs={jobs} memory={memory} remember={remember} canAct={canAct} view={view} />
      </TabsContent>
    </Tabs>
  </>;
}

export function VersionsWorkspace({ buildingId, scenarioId }: { buildingId: string; scenarioId: string }) {
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const enabled = Boolean(accessToken) && ready;
  const token = accessToken as string;

  const scenario = useAsyncData(`scenario:${scenarioId}`, (signal) => scenarioVersionsApi.getScenario(token, scenarioId, signal), enabled);
  const versions = useAsyncData(`versions:${scenarioId}:${page}`, (signal) => scenarioVersionsApi.listVersions(token, scenarioId, page, PAGE_SIZE, signal), enabled);

  const items = useMemo(() => versions.data?.items ?? [], [versions.data]);
  const urlVersion = get("version");
  const selectedId = urlVersion || items[0]?.id || "";
  const rawTab = get("tab");
  const tab: TabId = (TABS as readonly string[]).includes(rawTab) ? (rawTab as TabId) : "content";

  const detail = useAsyncData(`version:${selectedId}`, (signal) => scenarioVersionsApi.getVersion(token, selectedId, signal), enabled && Boolean(selectedId));
  const detailForSelection = detail.data && detail.data.id === selectedId ? detail.data : undefined;

  const canAct = user?.role === 1 || user?.role === 0;
  const canSubmit = user?.role === 1;
  const editorHref = `${routes.workspaceBuildings}/${buildingId}/scenarios/${scenarioId}`;
  const crumbs = [
    { label: "Công trình", href: routes.workspaceBuildings },
    { label: "Kịch bản", href: `${routes.workspaceBuildings}/${buildingId}/scenarios` },
    { label: scenario.data?.name ?? "Kịch bản", href: editorHref },
    { label: "Phiên bản" },
  ];

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;

  const reloadAll = () => { versions.reload(); detail.reload(); scenario.reload(); };

  return <>
    <PageHeader
      title="Phiên bản và readiness"
      description={scenario.data ? `Kịch bản “${scenario.data.name}”: tạo snapshot, dựng package, kiểm tra kỹ thuật, gửi duyệt và tạo release.` : "Tạo snapshot, dựng package, kiểm tra kỹ thuật, gửi duyệt và tạo release."}
      breadcrumbs={crumbs}
      actions={<>
        <Button variant="quiet" onClick={reloadAll} disabled={versions.loading}><RefreshCw size={16} aria-hidden="true" />{versions.loading ? "Đang tải…" : "Tải lại"}</Button>
        <Button onClick={() => setSnapshotOpen(true)} disabled={!canAct}><Camera size={16} aria-hidden="true" />Tạo snapshot từ draft</Button>
      </>}
    />

    {scenario.error !== undefined && <Alert tone="danger" title={describeError(scenario.error).status === 404 ? "Không tìm thấy kịch bản" : "Không tải được kịch bản"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={scenario.reload}>Thử lại</Button>}>{describeError(scenario.error).message}</Alert>}
    {versions.error !== undefined && <Alert tone="danger" title="Không tải được danh sách phiên bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={versions.reload}>Thử lại</Button>}>{describeError(versions.error).message}</Alert>}

    <div className="ver-layout" style={{ marginTop: 16 }}>
      <aside aria-label="Lịch sử phiên bản" className="ops-stack">
        <h2 className="ver-section-title" style={{ margin: 0 }}>Lịch sử snapshot</h2>
        {versions.loading && !versions.data && <SkeletonRows rows={4} label="Đang tải phiên bản…" />}
        {versions.data && items.length === 0 && <EmptyState icon={GitCommitVertical} title="Chưa có phiên bản nào" description="Hoàn tất draft ở trình soạn kịch bản rồi tạo snapshot để có phiên bản bất biến đầu tiên." action={<Button onClick={() => setSnapshotOpen(true)} disabled={!canAct}><Camera size={16} aria-hidden="true" />Tạo snapshot từ draft</Button>} />}
        <ul className="ver-version-list">
          {items.map((item) => <li key={item.id}>
            <button type="button" className="ver-version-btn" aria-current={item.id === selectedId} onClick={() => setParams({ version: item.id })}>
              <strong>v{item.versionNumber} · {item.name}</strong>
              <span>{formatDateTime(item.createdAt)}</span>
              <span className="ver-hash">#{shortHash(item.scenarioHash, 12)}</span>
            </button>
          </li>)}
        </ul>
        {(versions.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={versions.data?.totalCount ?? 0} onPageChange={setPage} disabled={versions.loading} />}
      </aside>

      <div style={{ minWidth: 0 }}>
        {selectedId && detail.loading && !detailForSelection && <SkeletonRows rows={6} label="Đang tải chi tiết phiên bản…" />}
        {selectedId && detail.error !== undefined && !detailForSelection && <Alert tone="danger" title={describeError(detail.error).status === 404 ? "Không tìm thấy phiên bản" : "Không tải được phiên bản"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{describeError(detail.error).message}</Alert>}
        {!selectedId && versions.data && <Alert tone="info" title="Chọn hoặc tạo một phiên bản">Các bước package build, kết quả kỹ thuật, gửi duyệt và release hoạt động trên một phiên bản cụ thể.</Alert>}
        {detailForSelection && accessToken && <Workbench
          key={detailForSelection.id}
          accessToken={accessToken}
          buildingId={buildingId}
          version={detailForSelection}
          tab={tab}
          onTab={(next) => setParams({ tab: next === "content" ? "" : next })}
          canAct={canAct}
          canSubmit={canSubmit}
        />}
      </div>
    </div>

    {accessToken && <SnapshotDrawer
      key={snapshotOpen ? "open" : "closed"}
      open={snapshotOpen}
      onOpenChange={setSnapshotOpen}
      accessToken={accessToken}
      scenarioId={scenarioId}
      initialDraftId={get("draft")}
      onCreated={(versionId) => { versions.reload(); setParams({ version: versionId, tab: "build", page: "" }); }}
    />}
  </>;
}
