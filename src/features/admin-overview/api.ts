import { apiClient } from "@/api/client";

export type OperationsAnalytics = {
  asOf: string;
  from: string;
  to: string;
  accounts: Array<{ role: string; isActive: boolean; count: number }>;
  buildings: Array<{ isActive: boolean; count: number }>;
  ifcJobs: Array<{ status: string; count: number }>;
  tickets: Array<{ status: string; count: number }>;
};

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const asList = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const asCount = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const asText = (value: unknown, fallback = "Không rõ") => (typeof value === "string" && value ? value : fallback);

/**
 * BE#59: `buildings` currently serializes `{key,count}` instead of `{isActive,count}`. Accept both so the
 * screen keeps working when BE fixes the name. Anything that is not a boolean is treated as "unknown" and skipped.
 */
function asActive(item: Raw): boolean | null {
  const value = item.isActive ?? item.key;
  return typeof value === "boolean" ? value : null;
}

export function parseOperationsAnalytics(payload: unknown): OperationsAnalytics {
  if (!isRecord(payload)) throw new TypeError("Analytics response is not an object.");
  return {
    asOf: asText(payload.asOf, ""),
    from: asText(payload.from, ""),
    to: asText(payload.to, ""),
    accounts: asList(payload.accounts).map((item) => ({ role: asText(item.role), isActive: item.isActive !== false, count: asCount(item.count) })),
    buildings: asList(payload.buildings).flatMap((item) => {
      const isActive = asActive(item);
      return isActive === null ? [] : [{ isActive, count: asCount(item.count) }];
    }),
    ifcJobs: asList(payload.ifcJobs).map((item) => ({ status: asText(item.status), count: asCount(item.count) })),
    tickets: asList(payload.tickets).map((item) => ({ status: asText(item.status), count: asCount(item.count) })),
  };
}

export const operationsAnalyticsApi = {
  async get(accessToken: string, range: { from?: string; to?: string }, signal?: AbortSignal) {
    const payload = await apiClient.request<unknown>("/api/admin/analytics/operations", {
      headers: { Authorization: `Bearer ${accessToken}` },
      query: { from: range.from, to: range.to },
      signal,
    });
    return parseOperationsAnalytics(payload);
  },
};
