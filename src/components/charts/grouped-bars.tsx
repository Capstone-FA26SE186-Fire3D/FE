"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "@/components/ui/motion";
import { chartTheme, colorAt, fmtNumber, type Series } from "./chart-config";
import { ChartTooltip } from "./chart-tooltip";

export type GroupedBarsProps = {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Series[];
  height?: number;
  formatY?: (value: number) => string;
  /** One series whose bars take a colour per category (e.g. accounts by role). */
  colorByCategory?: boolean;
  horizontal?: boolean;
  /**
   * Draw the series on top of each other in one column instead of side by side, first series at the back. Meant for
   * nested counts (passed ⊂ completed ⊂ plays) so every column stays readable on a 90-day axis.
   */
  overlap?: boolean;
  /** Category tick text; when given, ticks thin out to fit instead of printing every category. */
  formatX?: (value: string) => string;
  /** Tooltip heading for a category. */
  tooltipLabel?: (value: string) => string;
};

/** Grouped/single bars with rounded tops (Figma "Chart / Grouped bars", "Bar"). */
export default function GroupedBarsView({ data, xKey, series, height = 200, formatY = fmtNumber, colorByCategory, horizontal, overlap, formatX, tooltipLabel }: GroupedBarsProps) {
  const reduced = useReducedMotion();
  const tick = { fill: chartTheme.axis, fontSize: chartTheme.fontSize };
  return <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={overlap ? "22%" : "28%"} barGap={6}>
      <CartesianGrid vertical={Boolean(horizontal)} horizontal={!horizontal} stroke={chartTheme.grid} strokeDasharray="3 4" />
      {horizontal ? <>
        <XAxis type="number" tickFormatter={formatY} tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey={xKey} tick={tick} axisLine={false} tickLine={false} width={110} />
      </> : <>
        <XAxis dataKey={xKey} tick={tick} axisLine={false} tickLine={false} {...(formatX ? { tickFormatter: formatX, interval: "preserveStartEnd" as const, minTickGap: 18 } : { interval: 0 })} />
        {/* Overlap: each later series sits on its own hidden copy of the category axis, so its columns land exactly on the first. */}
        {overlap && series.slice(1).map((item, index) => <XAxis key={item.key} xAxisId={index + 1} dataKey={xKey} hide />)}
        <YAxis tickFormatter={formatY} tick={tick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
      </>}
      <Tooltip content={<ChartTooltip labelFormat={tooltipLabel && ((label) => tooltipLabel(String(label)))} format={(value) => formatY(value)} />} cursor={{ fill: "var(--hover)" }} />
      {series.map((item, index) => <Bar key={item.key} xAxisId={overlap && !horizontal ? index : undefined} dataKey={item.key} name={item.label} fill={item.color ?? colorAt(index)} radius={horizontal ? [0, chartTheme.radius, chartTheme.radius, 0] : [chartTheme.radius, chartTheme.radius, 0, 0]} maxBarSize={44} isAnimationActive={!reduced} animationDuration={chartTheme.animationMs} animationEasing="ease-out">
        {colorByCategory && data.map((_, cellIndex) => <Cell key={cellIndex} fill={colorAt(cellIndex)} />)}
      </Bar>)}
    </BarChart>
  </ResponsiveContainer>;
}
