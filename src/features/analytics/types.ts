/** Reports returned by the analytics endpoints. All ranges are UTC [from,to), default 30 days, at most 90. */

export const OUTCOMES = ["Passed", "NotPassed", "Incomplete", "NotAssessed"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type QuotaAmount = { quotaUnit: string; units: number };

export type AiUsage = {
  settledUnits: QuotaAmount[];
  openReservations: QuotaAmount[];
  needsReconcile: { requests: number; reservedUnits: number };
  requests: Record<string, number>;
};

export type TrainingReport = {
  asOf: string;
  from: string;
  to: string;
  activeWindowSeconds: number | null;
  definitions: Record<string, string>;
  plays: number;
  uniqueTrainees: number;
  completed: number;
  /** `null` means no sample (zero plays), which is not the same as 0 %. */
  completionRate: number | null;
  activeSessions: number;
  outcomes: Record<Outcome, number>;
  assessment: { assessed: number; passed: number; passRate: number | null };
  duration: { sessions: number; averageSeconds: number | null; medianSeconds: number | null };
  byMode: Array<{ mode: string; plays: number; completed: number }>;
  byTraining: Array<{ trainingId: string; plays: number; completed: number; passed: number }>;
  /** Platform report only. */
  byOrganization: Array<{ organizationId: string; plays: number; uniqueTrainees: number; completed: number }> | null;
  /** Admin per-organization report only. */
  organization: { id: string; name: string; isActive: boolean } | null;
  aiUsage: AiUsage | null;
};

export type MoneyTotal = { currency: string; amount: number; transactions: number };
export type RevenueReport = {
  asOf: string;
  from: string;
  to: string;
  definitions: Record<string, string>;
  totals: MoneyTotal[];
  byPurpose: Array<MoneyTotal & { purpose: string }>;
  byDay: Array<MoneyTotal & { date: string }>;
  payingOrganizations: number;
};

export type OperationsReport = {
  asOf: string;
  from: string;
  to: string;
  definitions: Record<string, string>;
  organization: { id: string; name: string; isActive: boolean } | null;
  /** Platform report only. */
  accounts: Array<{ role: string; isActive: boolean; count: number }> | null;
  organizations: Array<{ isActive: boolean; count: number }> | null;
  buildings: Array<{ isActive: boolean; count: number }>;
  processingJobs: Array<{ kind: string; status: string; count: number }>;
  tickets: Array<{ status: string; count: number }>;
  created: Record<string, number>;
};

/** Where a report is read from. `organization` is the caller's own tenant; `admin-organization` needs a PlatformAdmin. */
export type AnalyticsScope = { kind: "organization" } | { kind: "platform" } | { kind: "admin-organization"; organizationId: string };
export type AnalyticsRange = { from?: string; to?: string };
