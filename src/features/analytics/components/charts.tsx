"use client";

import type { ReactNode } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import { NumberPop } from "@/components/ui/number-pop";
import type { Tone } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { cn } from "@/utils/cn";
import type { Outcome } from "../types";
import styles from "./analytics.module.css";

export const outcomeLabels: Record<Outcome, string> = { Passed: "Đạt", NotPassed: "Chưa đạt", Incomplete: "Chưa hoàn tất", NotAssessed: "Không chấm" };

/** Status tones mapped to the chart palette so a badge and its slice always share one colour. */
export const toneColor: Record<Tone, string> = { success: "var(--success)", info: "var(--info)", warning: "var(--warning)", danger: "var(--danger)", ember: "var(--ember)", neutral: "var(--dim)", pending: "var(--dim)" };

/**
 * Number table with the same figures as the chart it sits under (`ChartCard`'s `table` slot folds it behind
 * "Xem bảng số liệu"). Also used on its own for breakdowns that are only a table. `Num` marks a numeric column.
 */
export function ReportTable({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return <Table caption={caption} className={cn(styles.reportTable, className)}>{children}</Table>;
}

export function Num({ children, header }: { children: ReactNode; header?: boolean }) {
  return header ? <th className={styles.num}>{children}</th> : <td className={styles.num}>{children}</td>;
}

/**
 * KPI tile (Figma "KPI tile / Sparkline"): label, counted-up number, optional trend from the period series and a
 * one-line hint. The sparkline is decorative; the number and hint carry the data.
 */
export function KpiTile({ label, value, hint, spark, sparkColor = "var(--info)", format, className, ...rest }: {
  label: string;
  /** A number counts up on first paint; anything else (money, "chưa có mẫu") prints as given. */
  value: number | ReactNode;
  hint?: ReactNode;
  spark?: number[];
  sparkColor?: string;
  format?: (value: number) => string;
  className?: string;
  "data-testid"?: string;
}) {
  const trend = spark && spark.length >= 2 ? spark : null;
  return <div className={cn("ops-kpi", className)} data-testid={rest["data-testid"]}>
    <span className="ops-kpi-label">{label}</span>
    <div className="ops-kpi-row"><strong className="ops-kpi-value">{typeof value === "number" ? <NumberPop value={value} format={format} /> : value}</strong></div>
    {trend && <Sparkline className="ops-kpi-spark" values={trend} height={36} color={sparkColor} />}
    {hint && <span className="ops-kpi-hint">{hint}</span>}
  </div>;
}

/** Small figure inside a card (duration average / median, AI quota). */
export function MiniStat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return <div className={styles.miniStat}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

/** A valid empty period is an explanation, never an error. */
export function EmptyReport({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.empty} role="status"><h3>{title}</h3><p>{children}</p></div>;
}

export const sumCounts = (items: Array<{ count: number }>) => items.reduce((total, item) => total + item.count, 0);
