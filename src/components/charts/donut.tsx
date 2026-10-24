"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useReducedMotion } from "@/components/ui/motion";
import { chartTheme, colorAt, fmtNumber } from "./chart-config";
import { ChartTooltip } from "./chart-tooltip";

export type DonutSlice = { key: string; label: string; value: number; color?: string };

export type DonutProps = {
  slices: DonutSlice[];
  /** Big number in the hole; defaults to the sum. */
  center?: { value: string; caption?: string };
  size?: number;
  thickness?: number;
  format?: (value: number) => string;
  /** Hide the side legend when the caller lists the values itself. */
  legend?: boolean;
};

/** Donut with a centre label and a value legend (Figma "Chart / Donut + legend"). Zero slices are kept in the legend, not the ring. */
export default function DonutView({ slices, center, size = 150, thickness = 16, format = fmtNumber, legend = true }: DonutProps) {
  const reduced = useReducedMotion();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const ring = slices.filter((slice) => slice.value > 0);
  return <div className="ops-donut">
    <div className="ops-donut-ring" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={ring} dataKey="value" nameKey="label" innerRadius={size / 2 - thickness} outerRadius={size / 2} paddingAngle={ring.length > 1 ? 2 : 0} stroke="none" isAnimationActive={!reduced} animationDuration={chartTheme.animationMs} animationEasing="ease-out">
            {ring.map((slice) => <Cell key={slice.key} fill={slice.color ?? colorAt(slices.indexOf(slice))} />)}
          </Pie>
          <Tooltip content={<ChartTooltip format={(value) => format(value)} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="ops-donut-center" aria-hidden="true"><strong>{center?.value ?? format(total)}</strong>{center?.caption && <span>{center.caption}</span>}</div>
    </div>
    {legend && <ul className="ops-donut-legend" aria-label="Giá trị">
      {slices.map((slice, index) => <li key={slice.key}><span className="ops-chart-swatch" style={{ background: slice.color ?? colorAt(index) }} aria-hidden="true" /><span>{slice.label}</span><strong>{format(slice.value)}</strong></li>)}
    </ul>}
  </div>;
}
