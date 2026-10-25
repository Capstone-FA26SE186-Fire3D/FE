"use client";

import { Camera, GitCommitVertical, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/table";
import { SkeletonRows } from "@/components/ui/skeleton";
import { LoadingBlock } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { usePlaytestPackage } from "@/features/playtest/use-playtest-package";

import "./versions.css";
import type { JourneyInput } from "../../journey";
import { useVersionJobs } from "../../use-version-jobs";
import { useVersionServerState } from "../../use-version-server-state";
import { approvalGate, describeError, isJobTerminal, releaseGate, shortHash, technicalGate } from "../../version-readiness";
import type { ScenarioDetail, ScenarioVersionDetail, ScenarioVersionSummary } from "../../version-types";
import { scenarioVersionsApi } from "../../versions-api";
import { GateStepper } from "./gate-stepper";
import { JourneyPanel } from "./journey-panel";
import { scrollToSection } from "./scroll";
import { VersionContent, formatDateTime } from "./version-content";

// Only the open tab's panel is needed: each one (and the create-version dialog) is its own chunk, fetched on demand.
const TabLoading = () => <SkeletonRows rows={4} label="Đang tải…" />;
const PackageBuildPanel = dynamic(() => import("./package-build-panel").then((m) => m.PackageBuildPanel), { loading: TabLoading });
const ReadinessPanel = dynamic(() => import("./readiness-panel").then((m) => m.ReadinessPanel), { loading: TabLoading });
const ReviewPanel = dynamic(() => import("./review-panel").then((m) => m.ReviewPanel), { loading: TabLoading });
const ReleasePanel = dynamic(() => import("./release-panel").then((m) => m.ReleasePanel), { loading: TabLoading });
const PlaytestPanel = dynamic(() => import("@/features/playtest/components/playtest-panel").then((m) => m.PlaytestPanel), { loading: TabLoading });
const loadSnapshotDialog = () => import("./snapshot-drawer");
const SnapshotDrawer = dynamic(() => loadSnapshotDialog().then((m) => m.SnapshotDrawer));

const PAGE_SIZE = 20;
const TABS = ["content", "build", "readiness", "review", "release", "playtest"] as const;
type TabId = (typeof TABS)[number];
const tabLabels: Record<TabId, string> = {
  content: "Tổng quan",
  build: "Dựng gói",
  readiness: "Kiểm tra",
  review: "Gửi duyệt",
  release: "Phát hành",
  playtest: "Chạy thử",
};

function VersionSummary({ version }: { version: ScenarioVersionDetail }) {
  const gate = approvalGate(version.reviewStatus, version.rejectReason);
  const criteria = version.rubric?.criteria?.length ?? 0;
  return <section className="ver-card" aria-labelledby="ver-summary-title">
    <div className="ver-card-head">
      <div>
        <h2 id="ver-summary-title" className="ver-card-title">v{version.versionNumber} · {version.name}</h2>
        <p className="ver-card-sub">Nội dung đã khóa, không sửa được</p>
      </div>
      <StatusBadge tone={gate.tone}>{gate.label}</StatusBadge>
    </div>
    <dl className="ver-meta">
      <div><dt>Tạo lúc</dt><dd>{formatDateTime(version.createdAt)}</dd></div>
      <div><dt>Mã nội dung</dt><dd className="ver-hash" title="Dùng để đối chiếu khi duyệt">#{shortHash(version.scenarioHash, 8)}</dd></div>
      <div><dt>Thời gian làm bài</dt><dd>{version.timeLimitSeconds} giây</dd></div>
      <div><dt>Tiêu chí chấm</dt><dd>{version.rubric ? `${criteria} tiêu chí · đạt từ ${version.rubric.pass_threshold ?? "—"}` : "Chưa có"}</dd></div>
    </dl>
    <Alert tone="info" title={`Phiên bản v${version.versionNumber} chỉ đọc`}>Nội dung đã khóa khi tạo phiên bản. Muốn sửa, hãy sửa bản nháp rồi tạo phiên bản mới; v{version.versionNumber} giữ nguyên để đối chiếu.</Alert>
  </section>;
}

function Workbench({ accessToken, buildingId, scenario, versionCount, editorHref, version, versionList, tab, onTab, canAct, canSubmit, canPlaytest, playtestId, onPlaytestId, onSnapshot, onVersionChanged }: {
  accessToken: string;
  buildingId: string;
  scenario: ScenarioDetail | undefined;
  versionCount: number;
  editorHref: string;
  version: ScenarioVersionDetail;
  /** The version history, shown next to the version on the overview tab. */
  versionList: ReactNode;
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
  // When the watched build finishes (or its check result arrives) the server's readiness and the playtest package change:
  // read them again so "Còn thiếu gì" never keeps saying the package is missing after it passed.
  const outcomeKey = `${jobs.detail?.job.status ?? ""}:${jobs.verdict?.kind ?? ""}`;
  const lastOutcome = useRef(outcomeKey);
  const { reload: reloadReadiness } = server.readiness;
  const { reload: reloadPlaytestPackage } = playtestPackage;
  useEffect(() => {
    if (lastOutcome.current === outcomeKey) return;
    lastOutcome.current = outcomeKey;
    if (isJobTerminal(jobs.detail?.job.status)) { reloadReadiness(); reloadPlaytestPackage(); }
  }, [outcomeKey, jobs.detail?.job.status, reloadReadiness, reloadPlaytestPackage]);
  // The journey sits above the tabs: after switching (or when already on the right tab) bring the work into view.
  const goToTab = (next: TabId, focus?: "monitor") => {
    onTab(next);
    scrollToSection(focus === "monitor" && jobs.selectedJobId ? "ver-job-monitor" : "ver-workbench");
  };

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
    <JourneyPanel input={journey} editorHref={editorHref} onTab={goToTab} onSnapshot={onSnapshot} canAct={canAct} gates={<GateStepper gates={[
      { id: "technical", title: "Kiểm tra kỹ thuật", state: technical },
      { id: "approval", title: "Duyệt nội dung", state: approvalGate(version.reviewStatus, version.rejectReason) },
      { id: "release", title: "Phát hành", state: releaseGate(server.releaseView.release) },
    ]} />} />
    {server.readiness.error !== undefined && !readiness && <Alert tone="danger" title="Không đọc được điều kiện phát hành" action={<Button size="sm" variant="secondary" className="mt-3" onClick={server.readiness.reload}>Thử lại</Button>}>{describeError(server.readiness.error).message} Các cổng ở trên chỉ phản ánh phần đã tải được.</Alert>}
    <div id="ver-workbench" className="ver-workbench" tabIndex={-1}>
      <Tabs value={tab} onValueChange={(value) => onTab(value as TabId)}>
        <TabsList aria-label="Các bước của phiên bản">
          {TABS.map((id) => <TabsTrigger key={id} value={id}>{tabLabels[id]}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="content">
          <div className="ver-overview">
            {versionList}
            <div className="ver-overview-main">
              <VersionSummary version={version} />
              <VersionContent version={version} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="build">
          <PackageBuildPanel accessToken={accessToken} version={version} jobs={jobs} canAct={canAct} onStarted={(jobId) => { jobs.selectJob(jobId); server.readiness.reload(); playtestPackage.reload(); }} />
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
      </Tabs>
    </div>
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
  const selected: ScenarioVersionSummary | undefined = detailForSelection ?? items.find((item) => item.id === selectedId);

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
  const openSnapshot = () => setSnapshotOpen(true);
  const selectedGate = selected ? approvalGate(selected.reviewStatus, selected.rejectReason) : undefined;

  const versionList = <aside aria-label="Lịch sử phiên bản" className="ver-card ver-history">
    <div className="ver-card-head">
      <div>
        <h2 className="ver-card-title">Các phiên bản</h2>
        <p className="ver-card-sub">{scenario.data ? `Của “${scenario.data.name}”, mới nhất ở trên` : "Mới nhất ở trên"}</p>
      </div>
    </div>
    {versions.loading && !versions.data && <SkeletonRows rows={4} label="Đang tải phiên bản…" />}
    {versions.data && items.length === 0 && <EmptyState icon={GitCommitVertical} title="Chưa có phiên bản nào" description="Hoàn tất bản nháp ở trình soạn kịch bản rồi tạo phiên bản bất biến đầu tiên." action={<Button onClick={openSnapshot} onPointerEnter={() => void loadSnapshotDialog()} disabled={!canAct}><Camera size={16} aria-hidden="true" />Tạo phiên bản đầu tiên</Button>} />}
    <ul className="ver-version-list">
      {items.map((item) => {
        const gate = item.reviewStatus ? approvalGate(item.reviewStatus, item.rejectReason) : undefined;
        return <li key={item.id}>
          <button type="button" className="ver-version-btn" aria-current={item.id === selectedId} onClick={() => setParams({ version: item.id, playtest: "" })}>
            <strong>v{item.versionNumber} · {item.name}</strong>
            <span>{formatDateTime(item.createdAt)}</span>
            
            {gate && <StatusBadge tone={gate.tone}>{gate.label}</StatusBadge>}
          </button>
        </li>;
      })}
    </ul>
    {(versions.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={versions.data?.totalCount ?? 0} onPageChange={setPage} disabled={versions.loading} />}
  </aside>;

  return <div className="org ver-page">
    <Breadcrumbs items={crumbs} />
    <header className="ops-page-header ver-head">
      <div>
        <p className="ops-eyebrow">Bước 4–5 · Phiên bản và phát hành</p>
        <div className="ver-head-title">
          <h1>{scenario.data?.name ?? "Phiên bản và phát hành"}</h1>
          {selected && selectedGate && <StatusBadge tone={selectedGate.tone}>v{selected.versionNumber} · {selectedGate.label}</StatusBadge>}
        </div>
        <p>{selected ? <>Nội dung đã khóa · tạo {formatDateTime(selected.createdAt)}</> : "Mỗi phiên bản được đóng băng khi tạo. Sửa nội dung sẽ tạo phiên bản mới và duyệt lại."}</p>
      </div>
      <div className="ops-actions">
        <Button variant="secondary" size="icon" onClick={reloadAll} disabled={versions.loading} aria-label="Tải lại" title="Tải lại"><RefreshCw size={16} aria-hidden="true" /></Button>
        {selected && tab !== "content" && <Button variant="secondary" onClick={() => setParams({ tab: "" })}>Đổi phiên bản</Button>}
        <Button onClick={openSnapshot} onPointerEnter={() => void loadSnapshotDialog()} onFocus={() => void loadSnapshotDialog()} disabled={!canAct}><Camera size={16} aria-hidden="true" />Tạo phiên bản mới</Button>
      </div>
    </header>

    {scenario.error !== undefined && <Alert tone="danger" title={describeError(scenario.error).status === 404 ? "Không tìm thấy kịch bản" : "Không tải được kịch bản"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={scenario.reload}>Thử lại</Button>}>{describeError(scenario.error).message}</Alert>}
    {versions.error !== undefined && <Alert tone="danger" title="Không tải được danh sách phiên bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={versions.reload}>Thử lại</Button>}>{describeError(versions.error).message}</Alert>}

    {selectedId && detail.loading && !detailForSelection && <SkeletonRows rows={6} label="Đang tải chi tiết phiên bản…" />}
    {selectedId && detail.error !== undefined && !detailForSelection && <Alert tone="danger" title={describeError(detail.error).status === 404 ? "Không tìm thấy phiên bản" : "Không tải được phiên bản"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{describeError(detail.error).message}</Alert>}
    {!selectedId && (versions.data || versions.error !== undefined) && <>
      {versions.data && <JourneyPanel
        input={{ scenario: scenario.data, versionsLoaded: true, versionCount: versions.data.totalCount, releaseKnown: false }}
        editorHref={editorHref}
        onTab={() => undefined}
        onSnapshot={openSnapshot}
        canAct={canAct}
      />}
      <div className="ver-overview">
        {versionList}
        <div className="ver-overview-main">
          <Alert tone="info" title="Chọn hoặc tạo một phiên bản">Dựng gói, kiểm tra, gửi duyệt và phát hành đều làm trên một phiên bản cụ thể.</Alert>
        </div>
      </div>
    </>}
    {detailForSelection && accessToken && <Workbench
      key={detailForSelection.id}
      accessToken={accessToken}
      buildingId={buildingId}
      scenario={scenario.data}
      versionCount={versions.data?.totalCount ?? items.length}
      editorHref={editorHref}
      version={detailForSelection}
      versionList={versionList}
      tab={tab}
      onTab={(next) => setParams({ tab: next === "content" ? "" : next })}
      canAct={canAct}
      canSubmit={canSubmit}
      canPlaytest={user?.role === 1}
      playtestId={get("playtest")}
      onPlaytestId={(id) => setParams({ playtest: id, tab: "playtest" })}
      onSnapshot={openSnapshot}
      onVersionChanged={reloadVersion}
    />}

    {accessToken && snapshotOpen && <SnapshotDrawer
      open
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
