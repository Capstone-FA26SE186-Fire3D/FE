/** BE analytics/audit accept `from`/`to` as a half-open range [from, to) that must not exceed 90 days. */
export const MAX_RANGE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

/** `yyyy-mm-dd` (UTC) → epoch ms at 00:00 UTC, or null for anything else (including impossible dates). */
export function parseDateOnly(value: string): number | null {
  if (!dateOnly.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? null : time;
}

export function toDateOnly(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function todayUtc(now = Date.now()): string {
  return toDateOnly(now);
}

export function addDays(value: string, days: number): string {
  const time = parseDateOnly(value);
  return toDateOnly((time ?? Date.parse(value)) + days * DAY_MS);
}

export type DateRangeResult = { ok: true; from: string; to: string } | { ok: false; field: "from" | "to" | "range"; message: string };

/**
 * Inclusive day pickers → API range. "Đến ngày" is inclusive, so `to` is the start of the next day.
 * Rejects empty/invalid dates, an end before the start and ranges longer than 90 days before any request is sent.
 */
export function buildRange(fromDay: string, toDay: string): DateRangeResult {
  const from = parseDateOnly(fromDay);
  const to = parseDateOnly(toDay);
  if (from === null) return { ok: false, field: "from", message: "Chọn ngày bắt đầu hợp lệ." };
  if (to === null) return { ok: false, field: "to", message: "Chọn ngày kết thúc hợp lệ." };
  if (to < from) return { ok: false, field: "to", message: "Ngày kết thúc phải từ ngày bắt đầu trở đi." };
  const days = Math.round((to - from) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) return { ok: false, field: "range", message: `Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày (đang chọn ${days} ngày).` };
  return { ok: true, from: new Date(from).toISOString(), to: new Date(to + DAY_MS).toISOString() };
}

export const formatDateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString("vi-VN") : "Chưa có");
