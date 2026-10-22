"use client";

import { useAsyncData } from "@/api/use-async-data";
import { Field, Select } from "@/components/ui/field";
import { buildingsApi } from "@/features/buildings/api";
import { GROUP_BY, type GroupBy, type TrainingFilters } from "../types";
import styles from "./analytics.module.css";

export const GROUP_LABELS: Record<GroupBy, string> = { day: "Theo ngày", week: "Theo tuần", month: "Theo tháng", building: "Theo công trình", scenario: "Theo kịch bản" };

/** Filters read from the URL. A scenario only counts while its building is chosen (the scenario list depends on it). */
export function readTrainingFilters(get: (key: string) => string): TrainingFilters {
  const buildingId = get("building");
  const scenarioId = buildingId ? get("scenario") : "";
  const group = get("groupBy");
  return { buildingId: buildingId || undefined, scenarioId: scenarioId || undefined, groupBy: (GROUP_BY as readonly string[]).includes(group) ? (group as GroupBy) : undefined };
}

/**
 * Building / scenario / grouping of the training report. Options come from the tenant's own lists (buildings, then the
 * scenarios of the chosen building); the server re-checks both ids inside the tenant.
 */
export function TrainingFilterBar({ accessToken, filters, onChange }: { accessToken: string | null; filters: TrainingFilters; onChange: (patch: Record<string, string | null>) => void }) {
  const buildings = useAsyncData("analytics:filter-buildings", (signal) => buildingsApi.list(accessToken as string, { page: 1, pageSize: 100 }, signal), Boolean(accessToken));
  const scenarios = useAsyncData(`analytics:filter-scenarios:${filters.buildingId}`, (signal) => buildingsApi.listScenarios(accessToken as string, filters.buildingId as string, 1, 100, signal), Boolean(accessToken && filters.buildingId), { keepPrevious: false });
  const buildingItems = buildings.data?.items ?? [];
  const scenarioItems = scenarios.data?.items ?? [];
  const hasOption = (items: Array<{ id: string }>, id?: string) => !id || items.some((item) => item.id === id);

  return <div className={styles.filters} role="group" aria-label="Bộ lọc báo cáo huấn luyện">
    <Field label="Công trình" error={buildings.error ? "Không tải được danh sách công trình." : undefined}>{(p) =>
      <Select {...p} value={filters.buildingId ?? ""} onChange={(event) => onChange({ building: event.target.value || null, scenario: null })}>
        <option value="">Tất cả công trình</option>
        {!buildings.data && filters.buildingId && <option value={filters.buildingId}>Đang tải…</option>}
        {buildings.data && !hasOption(buildingItems, filters.buildingId) && <option value={filters.buildingId}>Công trình đã chọn</option>}
        {buildingItems.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? "" : " (đã lưu trữ)"}</option>)}
      </Select>}
    </Field>
    <Field label="Kịch bản" hint={filters.buildingId ? undefined : "Chọn công trình trước"} error={scenarios.error ? "Không tải được kịch bản." : undefined}>{(p) =>
      <Select {...p} value={filters.scenarioId ?? ""} disabled={!filters.buildingId} onChange={(event) => onChange({ scenario: event.target.value || null })}>
        <option value="">Tất cả kịch bản</option>
        {scenarios.data && !hasOption(scenarioItems, filters.scenarioId) && <option value={filters.scenarioId}>Kịch bản đã chọn</option>}
        {!scenarios.data && filters.scenarioId && <option value={filters.scenarioId}>Đang tải…</option>}
        {scenarioItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>}
    </Field>
    <Field label="Nhóm theo" hint="Thêm bảng nhóm số liệu; cũng áp dụng cho CSV.">{(p) =>
      <Select {...p} value={filters.groupBy ?? ""} onChange={(event) => onChange({ groupBy: event.target.value || null })}>
        <option value="">Không nhóm</option>
        {GROUP_BY.map((key) => <option key={key} value={key}>{GROUP_LABELS[key]}</option>)}
      </Select>}
    </Field>
  </div>;
}
