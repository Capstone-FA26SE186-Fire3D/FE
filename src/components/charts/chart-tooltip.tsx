"use client";

import type { ReactNode } from "react";

type Row = { name?: string | number; value?: number | string | ReadonlyArray<number | string>; color?: string; dataKey?: string | number };

/** Recharts tooltip content in the ops look: label on top, one line per series with its swatch. */
export function ChartTooltip({ active, payload, label, format, labelFormat }: { active?: boolean; payload?: ReadonlyArray<Row>; label?: string | number; format?: (value: number, key: string) => ReactNode; labelFormat?: (label: string | number) => ReactNode }) {
  if (!active || !payload?.length) return null;
  return <div className="ops-chart-tip" role="presentation">
    {label !== undefined && <div className="ops-chart-tip-label">{labelFormat ? labelFormat(label) : label}</div>}
    {payload.map((row) => {
      const value = Array.isArray(row.value) ? row.value.join(" – ") : row.value;
      const numeric = typeof value === "number" ? value : Number(value);
      return <div key={String(row.dataKey ?? row.name)} className="ops-chart-tip-row">
        <span className="ops-chart-swatch" style={{ background: row.color }} aria-hidden="true" />
        <span>{row.name}</span>
        <strong>{format && Number.isFinite(numeric) ? format(numeric, String(row.dataKey ?? row.name)) : typeof value === "number" ? value.toLocaleString("vi-VN") : value}</strong>
      </div>;
    })}
  </div>;
}
