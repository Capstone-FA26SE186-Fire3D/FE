import type { AiQuotaUnitBalance } from "@/features/billing/types";

import type { AiOperationLimit } from "./types";

/** A quota unit some active AI policy spends, with the operations that spend it. */
export type UnitInUse = { balance: AiQuotaUnitBalance; operations: string[] };

const key = (unit: string | null | undefined) => (unit ?? "").trim().toLowerCase();

/**
 * Splits the organization's balances into the units an active policy spends (`GET /api/ai/organization/limits`) and the
 * rest. A unit no operation spends (e.g. an old grant in a unit the AI service does not meter) can never be used, so the
 * headline numbers leave it out; the quota tab still lists it. Until the limits are known, or when no policy is active,
 * every balance counts as in use so nothing silently disappears.
 */
export function splitUnits(units: AiQuotaUnitBalance[], limits: AiOperationLimit[] | undefined): { inUse: UnitInUse[]; unused: AiQuotaUnitBalance[] } {
  const active = (limits ?? []).filter((item) => item.policyActive && key(item.quotaUnit));
  if (active.length === 0) return { inUse: units.map((balance) => ({ balance, operations: [] })), unused: [] };
  const inUse: UnitInUse[] = [];
  const unused: AiQuotaUnitBalance[] = [];
  for (const balance of units) {
    const operations = active.filter((item) => key(item.quotaUnit) === key(balance.quotaUnit)).map((item) => item.operation);
    if (operations.length) inUse.push({ balance, operations }); else unused.push(balance);
  }
  // A policy may name a unit the organization holds nothing of yet: show it as 0 rather than hide that the AI is blocked.
  for (const item of active) {
    if (!units.some((balance) => key(balance.quotaUnit) === key(item.quotaUnit)) && !inUse.some((entry) => key(entry.balance.quotaUnit) === key(item.quotaUnit))) {
      inUse.push({ balance: { quotaUnit: item.quotaUnit!, granted: 0, reserved: 0, consumed: 0, expired: 0, available: 0, scheduled: 0 }, operations: active.filter((other) => key(other.quotaUnit) === key(item.quotaUnit)).map((other) => other.operation) });
    }
  }
  return { inUse, unused };
}
