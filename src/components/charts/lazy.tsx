"use client";

import dynamic from "next/dynamic";
import { SkeletonChart } from "@/components/ui/skeleton";

/**
 * Recharts-based charts are loaded on demand: the report page's first paint ships the KPI tiles and the card frames,
 * and the chart chunk arrives a moment later into a same-height skeleton (no layout shift). Server-rendered charts
 * (RankedBars, Sparkline, Stacked100) are imported directly from their files.
 */
export const AreaChart = dynamic(() => import("./area-chart"), { ssr: false, loading: () => <SkeletonChart /> });
export const GroupedBars = dynamic(() => import("./grouped-bars"), { ssr: false, loading: () => <SkeletonChart /> });
export const Donut = dynamic(() => import("./donut"), { ssr: false, loading: () => <SkeletonChart height={150} /> });
