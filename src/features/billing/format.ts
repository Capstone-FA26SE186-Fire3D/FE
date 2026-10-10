const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

/** Money is whole VND from the backend; displayed as returned, never recomputed. */
export function formatVnd(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? vnd.format(value) : "—";
}

/** BE `DateTime` values are UTC but may arrive without a designator; treat those as UTC, not local time. */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = /(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined) {
  const date = parseUtc(value);
  return date ? date.toLocaleDateString("vi-VN") : "—";
}

export function formatDateTime(value: string | null | undefined) {
  const date = parseUtc(value);
  return date ? date.toLocaleString("vi-VN") : "—";
}

const DAY_MS = 86_400_000;

/** Whole days left until `value` (negative once past). Null when unparseable. */
export function daysUntil(value: string | null | undefined, now = Date.now()): number | null {
  const date = parseUtc(value);
  return date ? Math.ceil((date.getTime() - now) / DAY_MS) : null;
}

export function isPast(value: string | null | undefined, now = Date.now()) {
  const date = parseUtc(value);
  return date ? date.getTime() <= now : false;
}

/** Same format BE issues: `"billing-<id without dashes>-<revision>"`. Prefer the header ETag when a read gave one. */
export function billingEtag(id: string, revision: number) {
  return `"billing-${id.replace(/-/g, "").toLowerCase()}-${revision}"`;
}

/** `<input type="datetime-local">` value (local time) -> ISO UTC string with `Z`. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isoToLocalInput(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
