"use client";

import { useAsyncData } from "@/api/use-async-data";
import type { Tone } from "@/components/ui/status-badge";
import { buildingsApi } from "./api";
import { revisionLabel } from "./pipeline";
import type { BuildingTab } from "./components/building-detail-workspace";

/** The list's "Bước hiện tại" chip + "Việc tiếp theo" button, from two light reads per visible row. */
export type BuildingStep = {
  label: string;
  tone: Tone;
  /** Next action for the row button. */
  action: { label: string; icon: "upload" | "progress" | "author" | "open"; tab: BuildingTab; sub?: string; upload?: boolean };
};

function deriveStep(revisionStatus: string | null, scenarioCount: number): BuildingStep {
  if (!revisionStatus) return { label: "Chưa có IFC", tone: "neutral", action: { label: "Tải IFC", icon: "upload", tab: "ifc", upload: true } };
  switch (revisionStatus) {
    case "Uploaded":
    case "Processing":
      return { label: "IFC đang xử lý", tone: "info", action: { label: "Xem tiến trình", icon: "progress", tab: "ifc" } };
    case "NeedsFix":
      return { label: "IFC cần sửa", tone: "warning", action: { label: "Xem tiến trình", icon: "progress", tab: "ifc" } };
    case "Failed":
    case "Rejected":
      return { label: "IFC lỗi", tone: "danger", action: { label: "Xem tiến trình", icon: "progress", tab: "ifc" } };
    case "ReadyForScenario":
    case "ConfirmedForTraining":
      return scenarioCount > 0
        ? { label: "Đang soạn kịch bản", tone: "ember", action: { label: "Soạn kịch bản", icon: "author", tab: "scenarios" } }
        : { label: "Sẵn sàng soạn kịch bản", tone: "success", action: { label: "Soạn kịch bản", icon: "author", tab: "scenarios" } };
    default:
      return { label: revisionLabel(revisionStatus).label, tone: revisionLabel(revisionStatus).tone, action: { label: "Mở công trình", icon: "open", tab: "journey" } };
  }
}

/**
 * Newest revision status + scenario count of one building. Both reads are tolerant: a failure leaves the chip at
 * "—" (the row still opens), so a list of 20 buildings never breaks because one revision read fails.
 */
export function useBuildingStep(accessToken: string, buildingId: string, enabled: boolean) {
  const state = useAsyncData<BuildingStep>(`building-step:${buildingId}`, async (signal) => {
    const [revisions, scenarios] = await Promise.all([
      buildingsApi.listRevisions(accessToken, buildingId, 1, 1, signal).catch(() => null),
      buildingsApi.listScenarios(accessToken, buildingId, 1, 1, signal).catch(() => null),
    ]);
    const newest = revisions ? [...revisions.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined;
    return deriveStep(newest?.status ?? null, scenarios?.totalCount ?? 0);
  }, enabled, { keepPrevious: true });
  return state;
}
