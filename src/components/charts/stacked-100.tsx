import { fmtNumber } from "./chart-config";

export type StackSegment = { key: string; label: string; value: number; color: string; /** Pattern so the segment is distinguishable without colour. */ pattern?: "stripes" | "dots" };

/** One 100 % bar with a legend of counts and shares (Figma "Chart / Stacked 100% + legend"). Server-renderable. */
export function Stacked100({ segments, label, format = fmtNumber }: { segments: StackSegment[]; label: string; format?: (value: number) => string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return <div className="ops-stack100">
    <div className="ops-stack100-bar" role="img" aria-label={`${label}: ${segments.map((segment) => `${segment.label} ${format(segment.value)}`).join(", ")}`}>
      {segments.filter((segment) => segment.value > 0).map((segment) => <span key={segment.key} data-pattern={segment.pattern} style={{ flex: `${segment.value} 1 0`, "--seg": segment.color } as React.CSSProperties} />)}
    </div>
    <ul className="ops-stack100-legend">
      {segments.map((segment) => <li key={segment.key}><span className="ops-chart-swatch" data-pattern={segment.pattern} style={{ "--seg": segment.color, background: segment.color } as React.CSSProperties} aria-hidden="true" /><span>{segment.label}</span><strong>{format(segment.value)}{total > 0 && <small>{((segment.value / total) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</small>}</strong></li>)}
    </ul>
  </div>;
}
