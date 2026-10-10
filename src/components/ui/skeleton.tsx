import type { CSSProperties } from "react";
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
