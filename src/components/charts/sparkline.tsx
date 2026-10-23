import { useId } from "react";

/**
 * Tiny trend line with a gradient under it for KPI tiles (Figma "KPI tile / Sparkline"). Hand-rolled SVG so a row of
 * four tiles costs nothing; the trend is decorative and the tile prints the number and delta next to it.
 */
export function Sparkline({ values, width = 224, height = 44, color = "var(--info)", className }: { values: number[]; width?: number; height?: number; color?: string; className?: string }) {
  const uid = useId().replace(/:/g, "");
  if (values.length < 2) return <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 3;
  const points = values.map((value, index) => [
    pad + (index / (values.length - 1)) * (width - pad * 2),
    pad + (1 - (value - min) / span) * (height - pad * 2),
  ]);
  // Catmull-Rom → cubic Bézier for a soft line without a chart library.
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  const area = `${d} L ${points[points.length - 1][0]} ${height} L ${points[0][0]} ${height} Z`;
  return <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", maxWidth: "100%" }}>
    <defs><linearGradient id={`${uid}-g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
    <path d={area} fill={`url(#${uid}-g)`} />
    <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}
