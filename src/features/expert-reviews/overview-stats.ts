import type { ExpertReviewItem } from "./api";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Monday 00:00 local time of the week holding `date`. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

const dayMonth = (date: Date) => `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

export type WeekRow = { week: string; approved: number; rejected: number };

/** Decisions per week (Monday start) over the last `weeks` weeks, oldest first; weeks without a decision read 0. */
export function decisionsByWeek(items: readonly ExpertReviewItem[], now: Date, weeks = 8): WeekRow[] {
  const current = weekStart(now);
  const rows: Array<WeekRow & { start: number }> = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = new Date(current);
    start.setDate(start.getDate() - index * 7);
    rows.push({ start: start.getTime(), week: dayMonth(start), approved: 0, rejected: 0 });
  }
  for (const item of items) {
    if (!item.decidedAt) continue;
    const at = weekStart(new Date(item.decidedAt)).getTime();
    const row = rows.find((candidate) => candidate.start === at);
    if (!row) continue;
    if (item.status === "Approved") row.approved += 1;
    else if (item.status === "Rejected") row.rejected += 1;
  }
  return rows.map(({ week, approved, rejected }) => ({ week, approved, rejected }));
}

/** Time from assignment (or, for items older than the assignment rule, from submission) to the decision. */
export function handlingMs(item: ExpertReviewItem): number | null {
  if (!item.decidedAt) return null;
  const from = Date.parse(item.assignedAt ?? item.submittedAt);
  const to = Date.parse(item.decidedAt);
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? to - from : null;
}

export const HANDLING_BUCKETS = [
  { key: "hour", label: "Dưới 1 giờ", max: HOUR },
  { key: "day", label: "1–24 giờ", max: DAY },
  { key: "days", label: "1–3 ngày", max: 3 * DAY },
  { key: "longer", label: "Trên 3 ngày", max: Number.POSITIVE_INFINITY },
] as const;

export function handlingBuckets(items: readonly ExpertReviewItem[]): Array<{ bucket: string; count: number }> {
  const counts = HANDLING_BUCKETS.map(() => 0);
  for (const item of items) {
    const ms = handlingMs(item);
    if (ms === null) continue;
    counts[HANDLING_BUCKETS.findIndex((bucket) => ms < bucket.max)] += 1;
  }
  return HANDLING_BUCKETS.map((bucket, index) => ({ bucket: bucket.label, count: counts[index] }));
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** "45 phút", "5,5 giờ", "2,1 ngày". */
export function formatDuration(ms: number): string {
  const number = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} phút`;
  if (ms < DAY) return `${number(ms / HOUR)} giờ`;
  return `${number(ms / DAY)} ngày`;
}

/** Items per organization, most first, at most `limit` rows. */
export function topOrganizations(items: readonly ExpertReviewItem[], limit = 5): Array<{ key: string; label: string; value: number }> {
  const counts = new Map<string, { label: string; value: number }>();
  for (const item of items) {
    const row = counts.get(item.organizationId) ?? { label: item.organizationName, value: 0 };
    row.value += 1;
    counts.set(item.organizationId, row);
  }
  return [...counts.entries()].map(([key, row]) => ({ key, ...row })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "vi")).slice(0, limit);
}
