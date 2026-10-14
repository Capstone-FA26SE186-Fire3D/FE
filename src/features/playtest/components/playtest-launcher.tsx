"use client";

import { FlaskConical } from "lucide-react";
import { useState } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { SkeletonRows } from "@/components/ui/skeleton";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { describeError } from "@/features/scenarios/version-readiness";
import { scenarioVersionsApi } from "@/features/scenarios/versions-api";

import { usePlaytestPackage } from "../use-playtest-package";
import { PlaytestPanel } from "./playtest-panel";

function LauncherBody({ accessToken, scenarioId, versionId, canPlaytest }: { accessToken: string; scenarioId: string; versionId: string; canPlaytest: boolean }) {
  const { get, setParams } = useUrlParams();
  const version = useAsyncData(`playtest-launcher-version:${versionId}`, (signal) => scenarioVersionsApi.getVersion(accessToken, versionId, signal));
  const packageWatch = usePlaytestPackage({ accessToken, revisionId: version.data?.revisionId ?? "", versionId, enabled: Boolean(version.data) });

  if (version.error !== undefined && !version.data) {
    return <Alert tone="danger" title="Không tải được phiên bản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={version.reload}>Thử lại</Button>}>{describeError(version.error).message}</Alert>;
  }
  if (!version.data) return <SkeletonRows rows={4} label="Đang tải phiên bản…" />;
  const data = version.data;
  const buildHref = `${routes.workspaceBuildings}/${data.buildingId}/scenarios/${scenarioId}/versions?version=${versionId}&tab=build`;
  return <PlaytestPanel
    accessToken={accessToken}
    version={{ id: data.id, revisionId: data.revisionId, scenarioId, buildingId: data.buildingId }}
    packageWatch={packageWatch}
    canPlaytest={canPlaytest}
    playtestId={get("playtest")}
    onPlaytestIdChange={(id) => setParams({ playtest: id })}
    buildHref={buildHref}
  />;
}

/**
 * Reusable "Playtest" button for a scenario version (the editor's Playtest button mounts this). It opens the same panel as
 * the versions page; the playtest id is kept in `?playtest=` so a reload reopens it from the server. It needs a Suspense
 * boundary above it (the operations layouts provide one) because it reads the URL.
 */
export function PlaytestLauncher({ scenarioId, versionId }: { scenarioId: string; versionId: string }) {
  const { accessToken, ready, user } = useAuthSession();
  const { get } = useUrlParams();
  const [open, setOpen] = useState(() => Boolean(get("playtest")));
  const canPlaytest = user?.role === 1;

  return <>
    <Button type="button" variant="quiet" onClick={() => setOpen(true)} disabled={!ready || !accessToken} data-testid="playtest-launcher"><FlaskConical size={16} aria-hidden="true" />Playtest</Button>
    <Drawer open={open} onOpenChange={setOpen} title="Playtest trên Mobile" description="Chuẩn bị, chuyển sang Mobile và theo dõi kết quả.">
      {accessToken && <LauncherBody accessToken={accessToken} scenarioId={scenarioId} versionId={versionId} canPlaytest={canPlaytest} />}
    </Drawer>
  </>;
}
