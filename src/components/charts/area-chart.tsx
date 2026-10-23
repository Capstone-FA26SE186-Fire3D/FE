"use client";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "@/components/ui/motion";
import { chartTheme, colorAt, fmtNumber, shortDate, type Series } from "./chart-config";
import { ChartTooltip } from "./chart-tooltip";

export type AreaChartProps = {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Series[];
  height?: number;
  formatX?: (value: string) => string;
  formatY?: (value: number) => string;
  /** Stack the series (shares of a whole) instead of overlaying them. */
  stacked?: boolean;
  /** Smooth "monotone" line like the Figma plot; false draws straight segments. */
  smooth?: boolean;
};

/** Line + gradient fill per series (Figma "Chart / Area"). Loaded through `charts/lazy` so recharts stays off the first paint. */
export default function AreaChartView({ data, xKey, series, height = 200, formatX = shortDate, formatY = fmtNumber, stacked, smooth = true }: AreaChartProps) {
  const reduced = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  return <ResponsiveContainer width="100%" height={height}>
    <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <defs>
        {series.map((item, index) => {
          const color = item.color ?? colorAt(index);
          return <linearGradient key={item.key} id={`${uid}-${item.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.32} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient>;
        })}
      </defs>
      <CartesianGrid vertical={false} stroke={chartTheme.grid} strokeDasharray="3 4" />
      <XAxis dataKey={xKey} tickFormatter={formatX} tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }} axisLine={false} tickLine={false} minTickGap={28} />
      <YAxis tickFormatter={formatY} tick={{ fill: chartTheme.axis, fontSize: chartTheme.fontSize }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
      <Tooltip content={<ChartTooltip labelFormat={(label) => formatX(String(label))} format={(value) => formatY(value)} />} cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }} />
      {series.map((item, index) => {
        const color = item.color ?? colorAt(index);
        return <Area key={item.key} type={smooth ? "monotone" : "linear"} dataKey={item.key} name={item.label} stroke={color} strokeWidth={2} fill={`url(#${uid}-${item.key})`} stackId={stacked ? "stack" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={!reduced} animationDuration={chartTheme.animationMs} animationEasing="ease-out" />;
      })}
    </AreaChart>
  </ResponsiveContainer>;
}
