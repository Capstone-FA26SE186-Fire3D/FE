import { analyticsApi } from "@/features/analytics/api";
import { parseOperations } from "@/features/analytics/parse";
import type { OperationsReport } from "@/features/analytics/types";

export type OperationsAnalytics = OperationsReport;
export const parseOperationsAnalytics = parseOperations;

/** Kept for callers of the previous overview module; the screen now uses `analyticsApi` directly. */
export const operationsAnalyticsApi = {
  get(accessToken: string, range: { from?: string; to?: string }, signal?: AbortSignal) {
    return analyticsApi.operations(accessToken, { kind: "platform" }, range, signal);
  },
};
