import { daysUntil, parseUtc } from "./format";
import type { Entitlement, PurchaseAction } from "./types";

/** Reminder window agreed in Docs: remind 5 days before the period ends. */
export const EXPIRY_REMINDER_DAYS = 5;

export type ServiceState = "effective" | "expiring" | "expired" | "upcoming" | "none";

export type EntitlementSummary = {
  state: ServiceState;
  /** The period the Building is served by right now (server `isEffective`), if any. */
  current: Entitlement | null;
  /** Most recent period by end date, for "expired on …" messages. */
  latest: Entitlement | null;
  daysLeft: number | null;
  /** BE picks `New` vs `Renewal` from paid history (Trial does not count). Mirrors its rule. */
  purchaseAction: PurchaseAction;
};

export function hasPaidHistory(entitlements: Entitlement[]) {
  return entitlements.some((item) => item.paymentTransactionId !== null && item.status !== "Trial");
}

/** Never infers effectiveness from dates: `isEffective` is the server's verdict; dates only drive reminders. */
export function summarizeEntitlements(entitlements: Entitlement[], now = Date.now()): EntitlementSummary {
  const byEnd = [...entitlements].sort((a, b) => (parseUtc(b.endsAt)?.getTime() ?? 0) - (parseUtc(a.endsAt)?.getTime() ?? 0));
  const current = byEnd.find((item) => item.isEffective) ?? null;
  const latest = byEnd[0] ?? null;
  const upcoming = byEnd.find((item) => item.status === "Active" && (parseUtc(item.startsAt)?.getTime() ?? 0) > now) ?? null;
  const daysLeft = current ? daysUntil(current.endsAt, now) : null;
  let state: ServiceState = "none";
  if (current) state = daysLeft !== null && daysLeft <= EXPIRY_REMINDER_DAYS ? "expiring" : "effective";
  else if (upcoming) state = "upcoming";
  else if (latest) state = "expired";
  return { state, current, latest, daysLeft, purchaseAction: hasPaidHistory(entitlements) ? "Renewal" : "New" };
}
