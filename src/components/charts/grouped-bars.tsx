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
};

/** Grouped/single bars with rounded tops (Figma "Chart / Grouped bars", "Bar"). */
export default function GroupedBarsView({ data, xKey, series, height = 200, formatY = fmtNumber, colorByCategory, horizontal }: GroupedBarsProps) {
  const reduced = useReducedMotion();
  const tick = { fill: chartTheme.axis, fontSize: chartTheme.fontSize };
  return <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={6}>
      <CartesianGrid vertical={Boolean(horizontal)} horizontal={!horizontal} stroke={chartTheme.grid} strokeDasharray="3 4" />
      {horizontal ? <>
        <XAxis type="number" tickFormatter={formatY} tick={tick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey={xKey} tick={tick} axisLine={false} tickLine={false} width={110} />
      </> : <>
        <XAxis dataKey={xKey} tick={tick} axisLine={false} tickLine={false} interval={0} />
        <YAxis tickFormatter={formatY} tick={tick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
      </>}
      <Tooltip content={<ChartTooltip format={(value) => formatY(value)} />} cursor={{ fill: "var(--hover)" }} />
      {series.map((item, index) => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color ?? colorAt(index)} radius={horizontal ? [0, chartTheme.radius, chartTheme.radius, 0] : [chartTheme.radius, chartTheme.radius, 0, 0]} maxBarSize={44} isAnimationActive={!reduced} animationDuration={chartTheme.animationMs} animationEasing="ease-out">
        {colorByCategory && data.map((_, cellIndex) => <Cell key={cellIndex} fill={colorAt(cellIndex)} />)}
      </Bar>)}
    </BarChart>
  </ResponsiveContainer>;
}
