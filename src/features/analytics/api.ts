import { apiClient } from "@/api/client";
import { parseOperations, parseRevenue, parseTraining } from "./parse";
import type { AnalyticsRange, AnalyticsScope, TrainingFilters } from "./types";

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

/** Tenant scope is decided by the route and the session; the FE never sends an organization filter for its own tenant. */
function path(scope: AnalyticsScope, report: "training" | "operations") {
  if (scope.kind === "organization") return `/api/organizations/me/analytics/${report}`;
  if (scope.kind === "platform") return `/api/admin/analytics/${report}`;
  return `/api/admin/organizations/${encodeURIComponent(scope.organizationId)}/analytics/${report}`;
}

/** Only `from`/`to` are accepted (UTC, at most 90 days); omitting them asks for the server default of 30 days. */
const query = (range: AnalyticsRange) => ({ from: range.from, to: range.to });

/** Empty filters are never sent. */
const trainingQuery = (range: AnalyticsRange, filters: TrainingFilters = {}) => ({ ...query(range), buildingId: filters.buildingId || undefined, scenarioId: filters.scenarioId || undefined, groupBy: filters.groupBy || undefined });

export const analyticsApi = {
  async training(accessToken: string, scope: AnalyticsScope, range: AnalyticsRange, signal?: AbortSignal, filters?: TrainingFilters) {
    return parseTraining(await apiClient.request<unknown>(path(scope, "training"), { headers: auth(accessToken), query: trainingQuery(range, filters), signal }));
  },
  async operations(accessToken: string, scope: AnalyticsScope, range: AnalyticsRange, signal?: AbortSignal) {
    return parseOperations(await apiClient.request<unknown>(path(scope, "operations"), { headers: auth(accessToken), query: query(range), signal }));
  },
  /** `GET {training route}/export`: UTF-8 CSV of the same period (aggregate rows only). 422 over 10000 rows, 429 after 10 exports a day. */
  exportTraining(accessToken: string, scope: AnalyticsScope, range: AnalyticsRange, signal?: AbortSignal, filters?: TrainingFilters) {
    return apiClient.request<string>(`${path(scope, "training")}/export`, { headers: auth(accessToken), query: trainingQuery(range, filters), signal });
  },
  /** PlatformAdmin only. */
  async revenue(accessToken: string, range: AnalyticsRange, signal?: AbortSignal) {
    return parseRevenue(await apiClient.request<unknown>("/api/admin/analytics/revenue", { headers: auth(accessToken), query: query(range), signal }));
  },
};
