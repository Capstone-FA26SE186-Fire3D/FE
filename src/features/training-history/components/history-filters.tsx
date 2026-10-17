"use client";

import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { rangeError, hasFilters } from "../filters";
import { modeLabel, sessionStatusView } from "../labels";
import { FILTER_STATUSES, TRAINING_MODES, type HistoryFilters, type NamedRef } from "../types";

/** Filters live in the URL (status, mode, building, from, to): the parent passes `onChange` that writes them there. */
export function HistoryFilterBar({ filters, buildings, knownBuildingNames, onChange, onClear }: {
  filters: HistoryFilters;
  buildings: NamedRef[];
  /** Names seen in the rows on screen, to label a `building=` from the URL that is not among the options. */
  knownBuildingNames: Map<string, string>;
  onChange: (patch: Partial<Record<keyof HistoryFilters, string>>) => void;
  onClear: () => void;
}) {
  const problem = rangeError(filters);
  const selectedMissing = filters.buildingId && !buildings.some((building) => building.id === filters.buildingId);
  return <form className="th-filters" aria-label="Bộ lọc lịch sử" onSubmit={(event) => event.preventDefault()}>
    <Field label="Trạng thái phiên">{(props) => <Select {...props} value={filters.status} onChange={(event) => onChange({ status: event.target.value })}>
      <option value="">Mọi trạng thái</option>
      {FILTER_STATUSES.map((status) => <option key={status} value={status}>{sessionStatusView(status).label}</option>)}
    </Select>}</Field>
    <Field label="Chế độ">{(props) => <Select {...props} value={filters.mode} onChange={(event) => onChange({ mode: event.target.value })}>
      <option value="">Mọi chế độ</option>
      {TRAINING_MODES.map((mode) => <option key={mode} value={mode}>{modeLabel(mode)}</option>)}
    </Select>}</Field>
    <Field label="Building">{(props) => <Select {...props} value={filters.buildingId} onChange={(event) => onChange({ buildingId: event.target.value })}>
      <option value="">Mọi Building</option>
      {selectedMissing && <option value={filters.buildingId}>{knownBuildingNames.get(filters.buildingId) ?? `Building đã chọn (${filters.buildingId.slice(0, 8)}…)`}</option>}
      {buildings.map((building) => <option key={building.id} value={building.id}>{building.name || building.id.slice(0, 8)}</option>)}
    </Select>}</Field>
    <Field label="Từ ngày">{(props) => <Input {...props} type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => onChange({ from: event.target.value })} />}</Field>
    <Field label="Đến ngày" error={problem}>{(props) => <Input {...props} type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => onChange({ to: event.target.value })} />}</Field>
    {hasFilters(filters) && <div className="th-filters-actions"><Button type="button" variant="quiet" onClick={onClear}>Xóa bộ lọc</Button></div>}
  </form>;
}
