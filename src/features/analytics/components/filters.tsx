"use client";

import { useAsyncData } from "@/api/use-async-data";
import { FilterChip } from "@/components/ui/filter-chip";
import { buildingsApi } from "@/features/buildings/api";
import { GROUP_BY, type GroupBy, type TrainingFilters } from "../types";
import styles from "./analytics.module.css";

export const GROUP_LABELS: Record<GroupBy, string> = { day: "Ngày", week: "Tuần", month: "Tháng", building: "Công trình", scenario: "Kịch bản" };

/** Grouping used when the URL names none: the "Phiên theo ngày" chart and the KPI sparklines read the daily cohorts. */
export const DEFAULT_GROUP_BY: GroupBy = "day";

/**
 * Filters read from the URL. A scenario only counts while its building is chosen (the scenario list depends on it).
 * `groupBy` is left undefined for the default grouping (no URL param, or `day` written explicitly) so the chip and the
 * URL stay at their default; `withDefaultGroup` fills it in for the request.
 */
export function readTrainingFilters(get: (key: string) => string): TrainingFilters {
  const buildingId = get("building");
  const scenarioId = buildingId ? get("scenario") : "";
  const group = get("groupBy");
  const groupBy = (GROUP_BY as readonly string[]).includes(group) && group !== DEFAULT_GROUP_BY ? (group as GroupBy) : undefined;
  return { buildingId: buildingId || undefined, scenarioId: scenarioId || undefined, groupBy };
}

export const withDefaultGroup = (filters: TrainingFilters): TrainingFilters => ({ ...filters, groupBy: filters.groupBy ?? DEFAULT_GROUP_BY });

/**
 * Building / scenario / grouping chips of the training report (rendered inside the report's chip row). Options come from the tenant's own lists (buildings, then the
 * scenarios of the chosen building); the server re-checks both ids inside the tenant.
 */
export function TrainingFilterBar({ accessToken, filters, onChange }: { accessToken: string | null; filters: TrainingFilters; onChange: (patch: Record<string, string | null>) => void }) {
  const buildings = useAsyncData("analytics:filter-buildings", (signal) => buildingsApi.list(accessToken as string, { page: 1, pageSize: 100 }, signal), Boolean(accessToken));
  const scenarios = useAsyncData(`analytics:filter-scenarios:${filters.buildingId}`, (signal) => buildingsApi.listScenarios(accessToken as string, filters.buildingId as string, 1, 100, signal), Boolean(accessToken && filters.buildingId), { keepPrevious: false });
  const buildingItems = buildings.data?.items ?? [];
  const scenarioItems = scenarios.data?.items ?? [];
  const hasOption = (items: Array<{ id: string }>, id?: string) => !id || items.some((item) => item.id === id);

  const buildingOptions = buildingItems.map((item) => ({ value: item.id, label: `${item.name}${item.isActive ? "" : " (đã lưu trữ)"}` }));
  if (filters.buildingId && !hasOption(buildingItems, filters.buildingId)) buildingOptions.unshift({ value: filters.buildingId, label: buildings.data ? "Công trình đã chọn" : "Đang tải…" });
  const scenarioOptions = scenarioItems.map((item) => ({ value: item.id, label: item.name }));
  if (filters.scenarioId && !hasOption(scenarioItems, filters.scenarioId)) scenarioOptions.unshift({ value: filters.scenarioId, label: scenarios.data ? "Kịch bản đã chọn" : "Đang tải…" });
  const errors = [buildings.error && "Không tải được danh sách công trình.", scenarios.error && "Không tải được kịch bản."].filter(Boolean);

  return <>
    <FilterChip label="Công trình" value={filters.buildingId ?? ""} options={buildingOptions} onChange={(value) => onChange({ building: value || null, scenario: null })} />
    <FilterChip label="Kịch bản" value={filters.scenarioId ?? ""} options={scenarioOptions} disabled={!filters.buildingId} hint={filters.buildingId ? undefined : "Chọn công trình trước"} onChange={(value) => onChange({ scenario: value || null })} />
    <FilterChip label="Nhóm theo" allLabel={GROUP_LABELS[DEFAULT_GROUP_BY]} value={filters.groupBy ?? ""} options={GROUP_BY.filter((key) => key !== DEFAULT_GROUP_BY).map((key) => ({ value: key, label: GROUP_LABELS[key] }))} hint="Trục thời gian của biểu đồ và bảng nhóm số liệu; cũng áp dụng cho CSV." onChange={(value) => onChange({ groupBy: value || null })} />
    {errors.length > 0 && <p className={styles.filterError} role="alert">{errors.join(" ")}</p>}
  </>;
}
