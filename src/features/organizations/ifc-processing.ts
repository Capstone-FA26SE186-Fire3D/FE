import { apiClient } from "@/api/client";

/**
 * Daily limit of IFC processing runs of an Organization (BE#219, `docs/processing-worker.md`). PlatformAdmin sets it as
 * immutable policy versions: a default for every Organization and an optional override per Organization; 0 stops new runs.
 */
export type IfcProcessingSource = "Organization" | "Default" | "Configuration";
export type IfcProcessingUsage = { organizationId: string; dailyLimit: number; source: IfcProcessingSource; policyId: string | null; used: number; remaining: number; resetsAt: string };
export type IfcProcessingPolicy = { id: string; organizationId: string | null; policyKind: string; dailyLimit: number | null; effectiveFrom: string; note: string | null; createdAt: string };
/** `organizationId` absent: the default for every Organization. `dailyLimit: null` (with an Organization) removes its override. */
export type IfcProcessingPolicyInput = { organizationId?: string; dailyLimit: number | null; note?: string };

export const DAILY_LIMIT_MAX = 100_000;

const auth = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

export const ifcProcessingApi = {
  /** PlatformAdmin: limit in effect and today's use of one Organization. */
  usageOf: (accessToken: string, organizationId: string, signal?: AbortSignal) =>
    apiClient.request<IfcProcessingUsage>(`/api/admin/organizations/${encodeURIComponent(organizationId)}/ifc-processing`, { headers: auth(accessToken), signal }),
  /** OrganizationUser: own limit and use. */
  myUsage: (accessToken: string, signal?: AbortSignal) => apiClient.request<IfcProcessingUsage>("/api/organizations/me/ifc-processing", { headers: auth(accessToken), signal }),
  /** A new policy version; the server audits it. */
  createPolicy: (accessToken: string, input: IfcProcessingPolicyInput) =>
    apiClient.request<IfcProcessingPolicy>("/api/admin/ifc-processing/policies", { headers: auth(accessToken), method: "POST", json: input }),
};

/** Text typed by the admin → a whole number 0..100000, or null when it is not one. */
export function parseDailyLimit(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= DAILY_LIMIT_MAX ? value : null;
}

/** Where the limit in effect comes from, in plain words. */
export function sourceText(source: IfcProcessingSource): string {
  if (source === "Organization") return "mức riêng của tổ chức này";
  return "mức chung cho mọi tổ chức";
}

/** One line for the Organization: how many runs are left today, or why none is. */
export function usageText(usage: Pick<IfcProcessingUsage, "dailyLimit" | "used" | "remaining">): string {
  if (usage.dailyLimit === 0) return "FET3D đang tạm dừng xử lý mô hình mới cho tổ chức này.";
  if (usage.remaining <= 0) return `Tổ chức đã dùng hết ${usage.dailyLimit} lượt xử lý mô hình của hôm nay. Lượt mới có lại vào ngày mai.`;
  return `Hôm nay còn ${usage.remaining} trong ${usage.dailyLimit} lượt xử lý mô hình.`;
}
