"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/utils/cn";

const visuallyHidden: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn("ops-skeleton", className)} style={style} aria-hidden="true" />;
}

/** Placeholder rows for tables/lists while data loads. Announces loading once to assistive tech. */
export function SkeletonRows({ rows = 5, label = "Đang tải dữ liệu…" }: { rows?: number; label?: string }) {
  return <div role="status" aria-live="polite" style={{ display: "grid", gap: 10, padding: 16 }}>
    <span style={visuallyHidden}>{label}</span>
    {Array.from({ length: rows }, (_, index) => <Skeleton key={index} style={{ height: 38, opacity: 1 - index * 0.12 }} />)}
  </div>;
}

/**
 * Skeleton that mirrors the real layout, then the content fades in once (Figma "skeleton → reveal"). Keeping the
 * skeleton the same height as the content avoids a layout shift when the data lands.
 */
export function SkeletonReveal({ loading, skeleton, children, label = "Đang tải…", className }: { loading: boolean; skeleton: ReactNode; children: ReactNode; label?: string; className?: string }) {
  if (loading) return <div className={cn("ops-skeleton-stage", className)} role="status" aria-live="polite"><span style={visuallyHidden}>{label}</span>{skeleton}</div>;
  return <div className={cn("ops-reveal", className)}>{children}</div>;
}

/** Table-shaped skeleton: header line + rows with a few cells of different widths. */
export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  const widths = [38, 14, 10, 18, 12, 8];
  return <div className="ops-skeleton-table" aria-hidden="true">
    <div className="ops-skeleton-table-row ops-skeleton-table-head">{Array.from({ length: columns }, (_, column) => <Skeleton key={column} style={{ height: 10, width: `${(widths[column % widths.length] ?? 12) * 0.7}%` }} />)}</div>
    {Array.from({ length: rows }, (_, row) => <div key={row} className="ops-skeleton-table-row" style={{ opacity: 1 - row * 0.1 }}>
      {Array.from({ length: columns }, (_, column) => <Skeleton key={column} style={{ height: 14, width: `${widths[column % widths.length] ?? 12}%` }} />)}
    </div>)}
  </div>;
}

/** KPI tiles: label, big number, hint. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return <div className="ops-skeleton-kpis" style={{ "--cols": count } as CSSProperties} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <div key={index} className="ops-skeleton-kpi"><Skeleton style={{ height: 10, width: "55%" }} /><Skeleton style={{ height: 30, width: "40%" }} /><Skeleton style={{ height: 10, width: "70%" }} /></div>)}
  </div>;
}

/** Key/value detail block (drawer body). */
export function SkeletonDetail({ rows = 5 }: { rows?: number }) {
  return <div className="ops-skeleton-detail" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => <div key={index}><Skeleton style={{ height: 11, width: 90 }} /><Skeleton style={{ height: 13, width: `${55 + ((index * 17) % 35)}%` }} /></div>)}
  </div>;
}

/** Chart card body placeholder with the same aspect so the chart never shifts the page when it arrives. */
export function SkeletonChart({ height = 200 }: { height?: number }) {
  return <div className="ops-skeleton-chart" style={{ height }} aria-hidden="true">
    {Array.from({ length: 12 }, (_, index) => <Skeleton key={index} style={{ height: `${28 + ((index * 23) % 60)}%` }} />)}
  </div>;
}
