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
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { PlaytestPanel } from "@/features/playtest/components/playtest-panel";
import { usePlaytestPackage } from "@/features/playtest/use-playtest-package";

import "./versions.css";
import type { JourneyInput } from "../../journey";
import { useVersionJobs } from "../../use-version-jobs";
import { useVersionServerState } from "../../use-version-server-state";
import { approvalGate, describeError, releaseGate, shortHash, technicalGate } from "../../version-readiness";
import type { ScenarioDetail, ScenarioVersionDetail } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { GateStepper } from "./gate-stepper";
import { JourneyPanel } from "./journey-panel";
import { PackageBuildPanel } from "./package-build-panel";
import { ReadinessPanel } from "./readiness-panel";
import { ReleasePanel } from "./release-panel";
import { ReviewPanel } from "./review-panel";
import { SnapshotDrawer } from "./snapshot-drawer";
import { VersionContent, formatDateTime } from "./version-content";
import { LoadingBlock } from "@/components/ui/spinner";

const PAGE_SIZE = 20;
const TABS = ["content", "build", "playtest", "readiness", "review", "release"] as const;
type TabId = (typeof TABS)[number];
const tabLabels: Record<TabId, string> = {
  content: "Nội dung và rubric",
  build: "Package build",
  playtest: "Playtest",
  readiness: "Kết quả kỹ thuật",
  review: "Gửi duyệt",
  release: "Release",
};

function Workbench({ accessToken, buildingId, scenario, versionCount, editorHref, version, tab, onTab, canAct, canSubmit, canPlaytest, playtestId, onPlaytestId, onSnapshot, onVersionChanged }: {
  accessToken: string;
  buildingId: string;
  scenario: ScenarioDetail | undefined;
  versionCount: number;
  editorHref: string;
  version: ScenarioVersionDetail;
  tab: TabId;
  onTab: (tab: TabId) => void;
  canAct: boolean;
  canSubmit: boolean;
  /** OrganizationUser only: PlatformAdmin is not a playtest actor. */
  canPlaytest: boolean;
  /** `?playtest=` of the page; the playtest itself is always re-read from the server. */
  playtestId: string;
  onPlaytestId: (id: string) => void;
  onSnapshot: () => void;
  /** A command changed server state the page header/list also shows (review status): reload version detail and list. */
  onVersionChanged: () => void;
}) {
  const server = useVersionServerState({ accessToken, version });
  const readiness = server.readiness.data;
  const jobs = useVersionJobs({ accessToken, revisionId: version.revisionId, versionId: version.id, preferredJobId: readiness?.packageJob?.jobId });
  const playtestPackage = usePlaytestPackage({ accessToken, revisionId: version.revisionId, versionId: version.id });
  const refreshAll = () => { server.refresh(); onVersionChanged(); };

  const technical = technicalGate({ job: jobs.detail, verdict: jobs.verdict, readiness, hasJobs: jobs.jobs.length > 0 || Boolean(readiness?.packageJob) });

  const release = server.releaseView.release ?? server.releaseView.summary;
  const journey: JourneyInput = {
    scenario,
    versionsLoaded: true,
    versionCount,
    version,
    readiness,
    releaseKnown: Boolean(release) || (!server.releaseView.loading && server.releaseView.error === undefined),
    release,
    playtestPackage: playtestPackage.state,
  };

  return <>
    <Alert tone="info" title={`Phiên bản v${version.versionNumber} là bản chụp bất biến: chỉ đọc`}>Hash nội dung <span className="ver-hash">#{shortHash(version.scenarioHash, 12)}</span> được ghim khi tạo phiên bản. Muốn sửa, hãy sửa bản nháp rồi tạo phiên bản mới; v{version.versionNumber} giữ nguyên để đối chiếu.</Alert>
    <JourneyPanel input={journey} editorHref={editorHref} onTab={onTab} onSnapshot={onSnapshot} canAct={canAct} />
    {server.readiness.error !== undefined && !readiness && <Alert tone="danger" title="Không đọc được readiness từ máy chủ" action={<Button size="sm" variant="secondary" className="mt-3" onClick={server.readiness.reload}>Thử lại</Button>}>{describeError(server.readiness.error).message} Các cổng bên dưới chỉ phản ánh phần đã tải được.</Alert>}
    <section className="org-card org-gates-card" aria-labelledby="ver-gates-title">
      <h2 id="ver-gates-title" className="org-card-title">Chuẩn bị phát hành v{version.versionNumber}</h2>
      <GateStepper gates={[
        { id: "technical", title: "Kết quả kỹ thuật", state: technical },
        { id: "approval", title: "Duyệt nội dung", state: approvalGate(version.reviewStatus, version.rejectReason) },
        { id: "release", title: "Release", state: releaseGate(server.releaseView.release) },
      ]} />
    </section>
    <Tabs value={tab} onValueChange={(value) => onTab(value as TabId)}>
      <TabsList aria-label="Các bước của phiên bản">
        {TABS.map((id) => <TabsTrigger key={id} value={id}>{tabLabels[id]}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="content"><VersionContent version={version} /></TabsContent>
      <TabsContent value="build">
        <PackageBuildPanel accessToken={accessToken} version={version} jobs={jobs} canAct={canAct} onStarted={(jobId) => { jobs.selectJob(jobId); server.readiness.reload(); playtestPackage.reload(); }} />
      </TabsContent>
      <TabsContent value="playtest">
        <PlaytestPanel
          accessToken={accessToken}
          version={{ id: version.id, revisionId: version.revisionId, scenarioId: version.scenarioId, buildingId }}
          packageWatch={playtestPackage}
          canPlaytest={canPlaytest}
          playtestId={playtestId}
          onPlaytestIdChange={onPlaytestId}
          buildHref={`${editorHref}/versions?version=${version.id}&tab=build`}
        />
      </TabsContent>
      <TabsContent value="readiness">
        <ReadinessPanel accessToken={accessToken} version={version} jobs={jobs} readiness={server.readiness} canAct={canAct} onConfirmed={server.refresh} />
      </TabsContent>
      <TabsContent value="review">
        <ReviewPanel accessToken={accessToken} version={version} review={server.review} canSubmit={canSubmit} onSubmitted={refreshAll} />
      </TabsContent>
      <TabsContent value="release">
        <ReleasePanel accessToken={accessToken} buildingId={buildingId} version={version} readiness={server.readiness} view={server.releaseView} noteRelease={server.noteRelease} canAct={canAct} />
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

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;

  const reloadAll = () => { versions.reload(); detail.reload(); scenario.reload(); };
  const reloadVersion = () => { versions.reload(); detail.reload(); };

  return <div className="org">
    <PageHeader
      eyebrow="Bước 4–5 · Phiên bản và phát hành"
      title="Phiên bản và phát hành"
      description="Mỗi phiên bản được đóng băng khi tạo. Sửa nội dung sẽ tạo phiên bản mới và duyệt lại."
      breadcrumbs={crumbs}
      actions={<>
        <Button variant="quiet" size="icon" onClick={reloadAll} disabled={versions.loading} aria-label="Tải lại" title="Tải lại"><RefreshCw size={16} aria-hidden="true" /></Button>
        <Button variant="secondary" onClick={() => setSnapshotOpen(true)} disabled={!canAct}><Camera size={16} aria-hidden="true" />Tạo phiên bản mới từ draft</Button>
      </>}
    />

    {scenario.error !== undefined && <Alert tone="danger" title={describeError(scenario.error).status === 404 ? "Không tìm thấy kịch bản" : "Không tải được kịch bản"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={scenario.reload}>Thử lại</Button>}>{describeError(scenario.error).message}</Alert>}
    {versions.error !== undefined && <Alert tone="danger" title="Không tải được danh sách phiên bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={versions.reload}>Thử lại</Button>}>{describeError(versions.error).message}</Alert>}

    <div className="ver-layout" style={{ marginTop: 16 }}>
      <aside aria-label="Lịch sử phiên bản" className="org-card ops-stack">
        <h2 className="org-card-title" style={{ margin: 0 }}>{scenario.data ? `Phiên bản của “${scenario.data.name}”` : "Lịch sử snapshot"}</h2>
        {versions.loading && !versions.data && <SkeletonRows rows={4} label="Đang tải phiên bản…" />}
        {versions.data && items.length === 0 && <EmptyState icon={GitCommitVertical} title="Chưa có phiên bản nào" description="Hoàn tất draft ở trình soạn kịch bản rồi tạo snapshot để có phiên bản bất biến đầu tiên." action={<Button onClick={() => setSnapshotOpen(true)} disabled={!canAct}><Camera size={16} aria-hidden="true" />Tạo snapshot từ draft</Button>} />}
        <ul className="ver-version-list">
          {items.map((item) => <li key={item.id}>
            <button type="button" className="ver-version-btn" aria-current={item.id === selectedId} onClick={() => setParams({ version: item.id, playtest: "" })}>
              <strong>v{item.versionNumber} · {item.name}</strong>
              <span>{formatDateTime(item.createdAt)}</span>
              <span className="ver-hash">#{shortHash(item.scenarioHash, 12)}</span>
              {item.reviewStatus && <StatusBadge tone={approvalGate(item.reviewStatus, item.rejectReason).tone}>{approvalGate(item.reviewStatus, item.rejectReason).label}</StatusBadge>}
            </button>
          </li>)}
        </ul>
        {(versions.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={versions.data?.totalCount ?? 0} onPageChange={setPage} disabled={versions.loading} />}
      </aside>

      <div style={{ minWidth: 0 }}>
        {selectedId && detail.loading && !detailForSelection && <SkeletonRows rows={6} label="Đang tải chi tiết phiên bản…" />}
        {selectedId && detail.error !== undefined && !detailForSelection && <Alert tone="danger" title={describeError(detail.error).status === 404 ? "Không tìm thấy phiên bản" : "Không tải được phiên bản"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{describeError(detail.error).message}</Alert>}
        {!selectedId && versions.data && <>
          <JourneyPanel
            input={{ scenario: scenario.data, versionsLoaded: true, versionCount: versions.data.totalCount, releaseKnown: false }}
            editorHref={editorHref}
            onTab={() => undefined}
            onSnapshot={() => setSnapshotOpen(true)}
            canAct={canAct}
          />
          <Alert tone="info" title="Chọn hoặc tạo một phiên bản">Các bước package build, kết quả kỹ thuật, gửi duyệt và release hoạt động trên một phiên bản cụ thể.</Alert>
        </>}
        {detailForSelection && accessToken && <Workbench
          key={detailForSelection.id}
          accessToken={accessToken}
          buildingId={buildingId}
          scenario={scenario.data}
          versionCount={versions.data?.totalCount ?? items.length}
          editorHref={editorHref}
          version={detailForSelection}
          tab={tab}
          onTab={(next) => setParams({ tab: next === "content" ? "" : next })}
          canAct={canAct}
          canSubmit={canSubmit}
          canPlaytest={user?.role === 1}
          playtestId={get("playtest")}
          onPlaytestId={(id) => setParams({ playtest: id, tab: "playtest" })}
          onSnapshot={() => setSnapshotOpen(true)}
          onVersionChanged={reloadVersion}
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
      preferredDraftId={scenario.data?.currentDraftId ?? ""}
      editorHref={editorHref}
      onCreated={(versionId) => { versions.reload(); setParams({ version: versionId, tab: "build", page: "" }); }}
    />}
  </div>;
}
