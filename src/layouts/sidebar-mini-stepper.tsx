"use client";

import { Check, Lock } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { billingApi } from "@/features/billing/api";
import { summarizeEntitlements } from "@/features/billing/entitlements";
import { buildingsApi } from "@/features/buildings/api";
import { buildJourney, buildingJourneyTag, type JourneyScenarioFacts, type JourneyStepKey, type JourneyStepModel } from "@/features/buildings/building-journey";
import { scenarioVersionsApi } from "@/features/scenarios/versions-api";

/** Short labels for the 248px sidebar (Figma 43:406); the journey titles are longer. */
const SHORT_LABELS: Record<JourneyStepKey, string> = {
  info: "Thông tin",
  ifc: "IFC và xử lý",
  scenario: "Soạn kịch bản",
  version: "Phiên bản",
  release: "Phát hành",
  usage: "Sử dụng",
};

const newestFirst = <T extends { createdAt: string }>(items: T[] | undefined) => [...(items ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

/**
 * Six-dot journey card under "Công trình" while a building is open. States come from `buildJourney` (server fields only),
 * loaded once per building page (route) and re-read when a screen that changed them says so (`buildingJourneyTag`):
 * switching tab on the detail page reads nothing.
 */
export function SidebarMiniStepper({ buildingId }: { buildingId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { accessToken, user } = useAuthSession();
  const token = accessToken ?? "";
  const enabled = Boolean(accessToken);
  const isAdmin = user?.role === 0;
  // The route (not the tab) is part of every key: coming back from the editor or the versions page re-reads the facts,
  // a tab click does not. Commands on the open page invalidate the tag instead.
  const scope = `${buildingId}:${pathname}`;
  const tags = useMemo(() => [buildingJourneyTag(buildingId)], [buildingId]);

  const building = useAsyncData(`mini:building:${scope}`, (signal) => buildingsApi.getVersioned(token, buildingId, signal), enabled, { scope: buildingId, tags });
  const revisions = useAsyncData(`mini:revisions:${scope}`, (signal) => buildingsApi.listRevisions(token, buildingId, 1, 50, signal), enabled, { scope: buildingId, tags });
  const scenarios = useAsyncData(`mini:scenarios:${scope}`, (signal) => buildingsApi.listScenarios(token, buildingId, 1, 20, signal), enabled, { scope: buildingId, tags });
  const releases = useAsyncData(`mini:releases:${scope}`, (signal) => scenarioVersionsApi.listReleases(token, { buildingId }, 1, 1, signal), enabled, { scope: buildingId, tags });
  const entitlements = useAsyncData(`mini:entitlements:${scope}`, (signal) => billingApi.listEntitlements(token, { buildingId, pageSize: 50 }, signal), enabled && !isAdmin, { scope: buildingId, tags });

  const newestScenario = useMemo(() => newestFirst(scenarios.data?.items), [scenarios.data]);
  const scenarioId = newestScenario?.id ?? "";
  const detail = useAsyncData(`mini:scenario:${scenarioId}:${pathname}`, (signal) => scenarioVersionsApi.getScenario(token, scenarioId, signal), enabled && Boolean(scenarioId), { scope: scenarioId, tags });
  const versions = useAsyncData(`mini:versions:${scenarioId}:${pathname}`, (signal) => scenarioVersionsApi.listVersions(token, scenarioId, 1, 1, signal), enabled && Boolean(scenarioId), { scope: scenarioId, tags });

  const revision = useMemo(() => newestFirst(revisions.data?.items), [revisions.data]);
  const service = useMemo(() => (entitlements.data ? summarizeEntitlements(entitlements.data.items).state : undefined), [entitlements.data]);
  const current = building.data?.data;

  const steps: JourneyStepModel[] | null = useMemo(() => {
    if (!current) return null;
    const latestVersion = versions.data?.items[0];
    const scenario: JourneyScenarioFacts | null = newestScenario ? {
      id: newestScenario.id,
      name: newestScenario.name,
      draftCount: detail.data?.draftCount,
      versionNumber: latestVersion?.versionNumber ?? detail.data?.latestVersionNumber ?? null,
      reviewStatus: latestVersion?.reviewStatus ?? null,
      rejectReason: latestVersion?.rejectReason ?? null,
    } : null;
    return buildJourney({ building: current, revision, scenarioCount: scenarios.data?.totalCount, scenario, releaseStatus: releases.data?.items[0]?.status ?? null, service });
  }, [current, revision, newestScenario, detail.data, versions.data, scenarios.data, releases.data, service]);

  const base = `${routes.workspaceBuildings}/${buildingId}`;
  const versionsHref = newestScenario ? `${base}/scenarios/${newestScenario.id}/versions` : null;
  const hrefFor = (key: JourneyStepKey) => {
    switch (key) {
      case "info": return `${base}?tab=journey`;
      case "ifc": return `${base}?tab=ifc`;
      case "scenario": return `${base}?tab=scenarios`;
      case "version": case "release": return versionsHref ?? `${base}?tab=scenarios`;
      default: return `${base}?tab=services`;
    }
  };
  const go = (key: JourneyStepKey) => {
    const href = hrefFor(key);
    if (href !== pathname + (params.size ? `?${params.toString()}` : "")) router.push(href);
  };

  if (!enabled) return null;
  if (!current || !steps) {
    if (building.error) return null;
    return <div className="ops-mini-stepper" data-building={buildingId} role="status" aria-label="Đang tải hành trình công trình">
      <Skeleton style={{ height: 14, width: "70%" }} />
      {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} style={{ height: 12, width: `${48 + (index % 3) * 14}%` }} />)}
    </div>;
  }

  return <div className="ops-mini-stepper" data-building={buildingId} data-testid="sidebar-mini-stepper">
    <p className="ops-mini-stepper-name" title={current.name}>{current.name}</p>
    <ol className="ops-mini-stepper-steps" aria-label={`Hành trình ${current.name}`}>
      {steps.map((step) => {
        const tip = <span className="ops-mini-stepper-tip"><strong>{step.index}. {step.title}</strong><span>{step.detail}</span></span>;
        return <li key={step.key} data-state={step.state}>
          <Tooltip content={tip} side="right">
            <button type="button" className="ops-mini-stepper-step" onClick={() => go(step.key)} aria-current={step.state === "current" ? "step" : undefined} aria-label={`${step.index}. ${step.title}: ${step.state === "done" ? "đã xong" : step.state === "current" ? "đang làm" : "đang khóa"}`}>
              <span className="ops-mini-stepper-dot" aria-hidden="true">{step.state === "done" ? <Check size={10} strokeWidth={3} /> : step.state === "locked" ? <Lock size={8} strokeWidth={2.5} /> : null}</span>
              <span className="ops-mini-stepper-label">{SHORT_LABELS[step.key]}</span>
              {step.state === "current" && <span className="ops-mini-stepper-note" aria-hidden="true">Đang làm</span>}
            </button>
          </Tooltip>
        </li>;
      })}
    </ol>
    <p className="ops-mini-stepper-hint">Hover chấm để xem bước tiếp theo</p>
  </div>;
}
