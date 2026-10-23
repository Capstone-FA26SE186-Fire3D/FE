import type { ReactNode } from "react";
import { fmtNumber } from "./chart-config";

export type RankedRow = { key: string; label: ReactNode; value: number; hint?: ReactNode };

/**
 * Top-N horizontal bars with the number printed (Figma "Chart / Ranked bars"). Plain HTML: the bar is decoration,
 * the label and value carry the data, so this needs no chart library and renders on the server.
 */
export function RankedBars({ rows, format = fmtNumber, color = "var(--ember)", label }: { rows: RankedRow[]; format?: (value: number) => string; color?: string; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <ol className="ops-ranked" aria-label={label}>
    {rows.map((row) => <li key={row.key} className="ops-ranked-row">
      <span className="ops-ranked-label">{row.label}</span>
      <strong className="ops-ranked-value">{format(row.value)}</strong>
      <span className="ops-ranked-track" aria-hidden="true"><span style={{ width: `${(row.value / max) * 100}%`, background: color }} /></span>
      {row.hint && <small className="ops-ranked-hint">{row.hint}</small>}
    </li>)}
  </ol>;
}
