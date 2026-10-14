import type { ReactNode } from "react";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { fmt } from "../format";
import { OUTCOMES, type Outcome } from "../types";
import styles from "./analytics.module.css";

export const outcomeLabels: Record<Outcome, string> = { Passed: "Đạt", NotPassed: "Chưa đạt", Incomplete: "Chưa hoàn tất", NotAssessed: "Không chấm điểm" };

/** Collapsible table with the same numbers as the chart above it: the non-visual way to read every chart. */
export function DataTable({ caption, summary = "Xem bảng số liệu", children }: { caption: string; summary?: string; children: ReactNode }) {
  return <details className={styles.tableToggle}>
    <summary>{summary}</summary>
    <Table caption={caption}>{children}</Table>
  </details>;
}

/**
 * Server outcomes of the cohort as one 100 % bar. Segments differ by fill pattern as well as colour and every one is
 * named with its count in the legend, so the chart never depends on colour alone.
 */
export function OutcomeBar({ outcomes, total }: { outcomes: Record<Outcome, number>; total: number }) {
  const sum = OUTCOMES.reduce((acc, outcome) => acc + outcomes[outcome], 0);
  return <div>
    <div className={styles.stack} role="img" aria-label={`Kết quả của ${fmt(sum)} phiên có kết quả: ${OUTCOMES.map((outcome) => `${outcomeLabels[outcome]} ${fmt(outcomes[outcome])}`).join(", ")}`}>
      {OUTCOMES.filter((outcome) => outcomes[outcome] > 0).map((outcome) => <span key={outcome} data-outcome={outcome} style={{ flex: `${outcomes[outcome]} 1 0` }} />)}
    </div>
    <ul className={styles.legend} aria-label="Chú giải kết quả">
      {OUTCOMES.map((outcome) => <li key={outcome}>
        <span className={styles.swatch} data-outcome={outcome} aria-hidden="true" />
        <span>{outcomeLabels[outcome]}</span>
        <strong>{fmt(outcomes[outcome])}{sum > 0 && <small>{((outcomes[outcome] / sum) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</small>}</strong>
      </li>)}
    </ul>
    {sum < total && <p className={styles.note} style={{ marginTop: 10, marginBottom: 0 }}>{fmt(total - sum)} phiên chưa có kết quả được máy chủ nhận nên chưa nằm trong các nhóm trên.</p>}
  </div>;
}

/** Plays and completed per row as two thin bars sharing one scale; the numbers are printed, the bars only decorate. */
export function PairBars({ rows, label }: { rows: Array<{ key: string; label: string; plays: number; completed: number }>; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.plays));
  return <ul className={styles.rows} aria-label={label}>
    {rows.map((row) => <li key={row.key} className={styles.row}>
      <span>{row.label}</span>
      <strong>{fmt(row.plays)} lượt</strong>
      <span className={styles.track} aria-hidden="true"><span style={{ width: `${(row.plays / max) * 100}%` }} /></span>
      <span className={styles.track} aria-hidden="true"><span data-series="done" style={{ width: `${(row.completed / max) * 100}%` }} /></span>
      <small>Hoàn thành {fmt(row.completed)}</small>
    </li>)}
  </ul>;
}

/** Daily columns of one currency. Values live in the table below; the SVG is a summary with an accessible name. */
export function DayColumns({ days, format, label }: { days: Array<{ date: string; amount: number }>; format: (amount: number) => string; label: string }) {
  const max = Math.max(1, ...days.map((day) => day.amount));
  const step = 100 / Math.max(1, days.length);
  return <div>
    <div className={styles.chartHead}><span>Cao nhất trong ngày: <strong>{format(max)}</strong></span><span>{days.length} ngày có phát sinh</span></div>
    <svg className={styles.columns} viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label}>
      {days.map((day, index) => {
        const height = Math.max(0.8, (day.amount / max) * 38);
        const width = Math.min(step * 0.76, 6); // a few days must not turn into slabs
        return <rect key={day.date} x={index * step + (step - width) / 2} width={width} y={40 - height} height={height} rx="0.6"><title>{`${day.date}: ${format(day.amount)}`}</title></rect>;
      })}
    </svg>
    <div className={styles.axis}><span>{days[0]?.date}</span><span>{days.at(-1)?.date}</span></div>
  </div>;
}

/** Counts per status: the status is a text badge, the count is printed and the bar only decorates. */
export function CountRows({ rows, label, empty }: { rows: Array<{ key: string; label: string; count: number; tone: Tone }>; label: string; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <p className={styles.muted}>{empty}</p>;
  return <ul className={styles.rows} aria-label={label}>
    {rows.map((row) => <li key={row.key} className={styles.row}>
      <span><StatusBadge tone={row.tone}>{row.label}</StatusBadge></span>
      <strong>{fmt(row.count)}</strong>
      <span className={styles.count} data-tone={row.tone === "neutral" ? undefined : row.tone} aria-hidden="true"><span style={{ width: `${(row.count / max) * 100}%` }} /></span>
    </li>)}
  </ul>;
}

export function EmptyReport({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.empty}><h3>{title}</h3><p>{children}</p></div>;
}
