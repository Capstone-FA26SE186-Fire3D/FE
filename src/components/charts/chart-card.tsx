"use client";

import { ChartNoAxesCombined } from "lucide-react";
import type { ReactNode } from "react";
import { SkeletonChart } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

export type LegendItem = { label: string; color: string; value?: ReactNode };

/**
 * Frame shared by every chart: title, one-line description, legend chips, actions, and the empty/loading states
 * drawn at the chart's height so the card never changes size. `table` is the collapsible number table that keeps
 * each chart readable without colour or a pointer.
 */
export function ChartCard({ title, description, legend, actions, loading, empty, emptyText = "Chưa có dữ liệu trong khoảng này", height = 220, children, table, className, footer, ...rest }: {
  title: string;
  description?: string;
  legend?: LegendItem[];
  actions?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  height?: number;
  children: ReactNode;
  table?: ReactNode;
  footer?: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return <section className={cn("ops-chart-card", className)} data-testid={rest["data-testid"]} aria-busy={loading || undefined}>
    <header className="ops-chart-head">
      <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
      {actions && <div className="ops-actions">{actions}</div>}
    </header>
    {legend && legend.length > 0 && <ul className="ops-chart-legend" aria-label="Chú giải">
      {legend.map((item) => <li key={item.label}><span className="ops-chart-swatch" style={{ background: item.color }} aria-hidden="true" />{item.label}{item.value !== undefined && <strong>{item.value}</strong>}</li>)}
    </ul>}
    <div className="ops-chart-body" style={{ minHeight: height }}>
      {loading ? <SkeletonChart height={height} /> : empty ? <div className="ops-chart-empty" style={{ height }} role="status"><ChartNoAxesCombined size={26} strokeWidth={1.6} aria-hidden="true" /><p>{emptyText}</p></div> : children}
    </div>
    {footer && <div className="ops-chart-foot">{footer}</div>}
    {table && !loading && !empty && <details className="ops-chart-table"><summary>Xem bảng số liệu</summary>{table}</details>}
  </section>;
}

/** Legend entries from a series list (one call site per chart keeps colours and labels in sync). */
export function legendOf(series: Array<{ label: string; color?: string }>, fallback: (index: number) => string): LegendItem[] {
  return series.map((item, index) => ({ label: item.label, color: item.color ?? fallback(index) }));
}
