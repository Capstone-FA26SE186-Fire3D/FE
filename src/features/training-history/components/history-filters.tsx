"use client";

import type { ReactNode } from "react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ChipPopover, FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { rangeError, hasFilters } from "../filters";
import { modeLabel, sessionStatusView } from "../labels";
import { FILTER_STATUSES, TRAINING_MODES, type HistoryFilters, type NamedRef } from "../types";

const shortDate = (day: string) => day ? day.split("-").reverse().join("/") : "";

function rangeText(from: string, to: string) {
  if (!from && !to) return "mọi lúc";
  if (from && to) return `${shortDate(from)} – ${shortDate(to)}`;
  return from ? `từ ${shortDate(from)}` : `đến ${shortDate(to)}`;
}

/**
 * Filter chips of the history (status, mode, building, period). Values live in the URL: the parent passes `onChange` that
 * writes them there. A period with from after to is shown under the chips and never sent.
 */
export function HistoryFilterBar({ filters, buildings, knownBuildingNames, onChange, onClear, actions }: {
  filters: HistoryFilters;
  buildings: NamedRef[];
  /** Names seen in the rows on screen, to label a `building=` from the URL that is not among the options. */
  knownBuildingNames: Map<string, string>;
  onChange: (patch: Partial<Record<keyof HistoryFilters, string>>) => void;
  onClear: () => void;
  actions?: ReactNode;
}) {
  const problem = rangeError(filters);
  const buildingOptions = buildings.map((building) => ({ value: building.id, label: building.name || "Tòa nhà chưa có tên" }));
  if (filters.buildingId && !buildings.some((building) => building.id === filters.buildingId)) {
    buildingOptions.unshift({ value: filters.buildingId, label: knownBuildingNames.get(filters.buildingId) ?? "Tòa nhà đã chọn" });
  }
  return <div>
    <FilterChips label="Bộ lọc lịch sử" className="th-chips">
      <FilterChip label="Trạng thái" value={filters.status} options={FILTER_STATUSES.map((status) => ({ value: status, label: sessionStatusView(status).label }))} onChange={(status) => onChange({ status })} />
      <FilterChip label="Chế độ" value={filters.mode} options={TRAINING_MODES.map((mode) => ({ value: mode, label: modeLabel(mode) }))} onChange={(mode) => onChange({ mode })} />
      <FilterChip label="Tòa nhà" value={filters.buildingId} options={buildingOptions} onChange={(buildingId) => onChange({ buildingId })} />
      <ChipPopover label="Thời gian" value={rangeText(filters.from, filters.to)} active={Boolean(filters.from || filters.to)} panelLabel="Khoảng thời gian">
        {() => <div className="ops-fchip-form">
          <Field label="Từ ngày">{(props) => <Input {...props} type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => onChange({ from: event.target.value })} />}</Field>
          <Field label="Đến ngày">{(props) => <Input {...props} type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => onChange({ to: event.target.value })} />}</Field>
          {(filters.from || filters.to) && <Button type="button" size="sm" variant="quiet" onClick={() => onChange({ from: "", to: "" })}>Mọi lúc</Button>}
        </div>}
      </ChipPopover>
      {hasFilters(filters) && <Button type="button" variant="quiet" onClick={onClear}>Xóa bộ lọc</Button>}
      {actions}
    </FilterChips>
    {problem && <p className="th-range-error" role="alert">{problem}</p>}
  </div>;
}
