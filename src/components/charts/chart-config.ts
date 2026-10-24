/**
 * Chart kit colours and sizes. Every colour is a CSS variable from `.ops-theme`, so a chart flips with the theme
 * without re-rendering (EvilCharts pattern); the series order below is the default palette for unnamed series.
 */
export const chartPalette = ["var(--info)", "var(--ember)", "var(--success)", "var(--warning)", "var(--danger)", "var(--dim)"] as const;

export const seriesColor = {
  plays: "var(--info)",
  completed: "var(--ember)",
  passed: "var(--success)",
  notPassed: "var(--danger)",
  incomplete: "var(--warning)",
  notAssessed: "var(--dim)",
  revenue: "var(--success)",
  neutral: "var(--dim)",
} as const;

export const chartTheme = {
  grid: "var(--line)",
  axis: "var(--dim)",
  fontSize: 11,
  fontFamily: "inherit",
  radius: 4,
  animationMs: 650,
} as const;

export type Series = { key: string; label: string; color?: string };

export const fmtNumber = (value: number) => value.toLocaleString("vi-VN");

/** "24/09" style tick for ISO dates; week/month keys fall back to the raw label. */
export function shortDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}` : iso;
}

export function colorAt(index: number) {
  return chartPalette[index % chartPalette.length];
}
