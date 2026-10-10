/**
 * Remembers the checkout the user left for (PayOS is an external page). After the return/cancel URL the app
 * only uses this to know WHICH payment to poll — the URL itself is navigation, never evidence of payment.
 */
const KEY = "fet3d:billing:pending-checkout:v1";

export type PendingCheckout = {
  checkoutId: string;
  paymentRequestId: string | null;
  quotationId: string;
  /** Where the user came from (Building tab or billing workspace), so the return page can send them back. */
  returnTo: string;
  savedAt: number;
};

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function savePendingCheckout(value: Omit<PendingCheckout, "savedAt">) {
  try {
    safeStorage()?.setItem(KEY, JSON.stringify({ ...value, savedAt: Date.now() }));
  } catch {
    // Storage can be blocked; the checkout still works, only the automatic resume after return is lost.
  }
}

export function readPendingCheckout(): PendingCheckout | null {
  try {
    const raw = safeStorage()?.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.checkoutId !== "string" || typeof record.quotationId !== "string" || typeof record.returnTo !== "string") return null;
    // Only same-origin app paths: this value feeds a redirect.
    if (!record.returnTo.startsWith("/") || record.returnTo.startsWith("//")) return null;
    return {
      checkoutId: record.checkoutId,
      paymentRequestId: typeof record.paymentRequestId === "string" ? record.paymentRequestId : null,
      quotationId: record.quotationId,
      returnTo: record.returnTo,
      savedAt: typeof record.savedAt === "number" ? record.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearPendingCheckout() {
  try {
    safeStorage()?.removeItem(KEY);
  } catch {
    // Nothing to clean when storage is unavailable.
  }
}
