"use client";

import { usePathname } from "next/navigation";

import { useAsyncData } from "@/api/use-async-data";
import { buildingsApi } from "@/features/buildings/api";
import { scenarioVersionsApi } from "@/features/scenarios/versions-api";

/** What the user is looking at, read from the pathname: `/workspace/buildings/[id]` and `/workspace/buildings/[id]/scenarios/[scenarioId]`. */
export type PageContext = {
  buildingId: string | null;
  scenarioId: string | null;
  buildingName: string | null;
  scenarioName: string | null;
  loading: boolean;
};

const BUILDING_PATH = /^\/workspace\/buildings\/([^/]+)(?:\/scenarios\/([^/]+))?/;

export function parsePageContext(pathname: string): { buildingId: string | null; scenarioId: string | null } {
  const match = BUILDING_PATH.exec(pathname);
  if (!match) return { buildingId: null, scenarioId: null };
  const buildingId = decodeURIComponent(match[1]);
  const scenarioId = match[2] ? decodeURIComponent(match[2]) : null;
  return { buildingId, scenarioId };
}

/**
 * Names for the context strip ("Đang xem · Tòa nhà A › Thoát hiểm tầng 3"). The ids are the scope a request is sent with
 * (a scenario draft pins the Building); the names are display only and come from the same endpoints the pages use.
 */
export function usePageContext(accessToken: string, enabled: boolean): PageContext {
  const pathname = usePathname();
  const { buildingId, scenarioId } = parsePageContext(pathname ?? "");
  const building = useAsyncData(`ai-bubble:building:${buildingId ?? ""}`, (signal) => buildingsApi.get(accessToken, buildingId!, signal), enabled && Boolean(buildingId), { keepPrevious: false });
  const scenario = useAsyncData(`ai-bubble:scenario:${scenarioId ?? ""}`, (signal) => scenarioVersionsApi.getScenario(accessToken, scenarioId!, signal), enabled && Boolean(scenarioId), { keepPrevious: false });
  return {
    buildingId,
    scenarioId,
    buildingName: buildingId ? building.data?.name ?? null : null,
    scenarioName: scenarioId ? scenario.data?.name ?? null : null,
    loading: Boolean(buildingId) && building.loading && !building.data,
  };
}
