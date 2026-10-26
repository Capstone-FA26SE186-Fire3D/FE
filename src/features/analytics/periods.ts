import type { GroupBy, TrainingCohort } from "./types";

type TimeGroup = Extract<GroupBy, "day" | "week" | "month">;

/** A day/week/month range of 90 days gives at most ~92 periods; anything far beyond means bad dates, so stop filling. */
const MAX_PERIODS = 400;

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Server key of the period holding `date` (UTC): `YYYY-MM-DD` for a day, the Monday for a week, `YYYY-MM` for a month. */
function periodStart(date: Date, group: TimeGroup) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), group === "month" ? 1 : date.getUTCDate()));
  if (group === "week") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

function next(date: Date, group: TimeGroup) {
  const step = new Date(date);
  if (group === "month") step.setUTCMonth(step.getUTCMonth() + 1);
  else step.setUTCDate(step.getUTCDate() + (group === "week" ? 7 : 1));
  return step;
}

const keyOf = (date: Date, group: TimeGroup) => (group === "month" ? iso(date).slice(0, 7) : iso(date));

const emptyCohort = (key: string): TrainingCohort => ({ key, label: key, plays: 0, uniqueTrainees: 0, completed: 0, abandoned: 0, awaitingSync: 0, assessed: 0, passed: 0, passRate: null, averageDurationSeconds: null });

/**
 * The server returns cohorts only for periods that had a session. A time axis must still show the quiet days, so every
 * period of the report's UTC `[from, to)` range is listed, with zero rows where the server sent none. Unknown dates or
 * a non-time grouping return the rows untouched.
 */
export function fillPeriods(rows: TrainingCohort[], group: GroupBy, from: string, to: string): TrainingCohort[] {
  if (group !== "day" && group !== "week" && group !== "month") return rows;
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const filled: TrainingCohort[] = [];
  for (let period = periodStart(start, group); period < end && filled.length < MAX_PERIODS; period = next(period, group)) {
    const key = keyOf(period, group);
    filled.push(byKey.get(key) ?? emptyCohort(key));
    byKey.delete(key);
  }
  // A row the range did not produce (clock skew, a key format change) is kept rather than silently dropped.
  return byKey.size ? [...filled, ...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)) : filled;
}

/** Axis tick for a period key: "24/09" for a day or the Monday of a week, "09/2026" for a month. */
export function periodTick(key: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (day) return `${day[3]}/${day[2]}`;
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  return month ? `${month[2]}/${month[1]}` : key;
}

/** Tooltip heading for a period key, spelled out per grouping. */
export function periodTitle(key: string, group: GroupBy) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (day) return `${group === "week" ? "Tuần từ " : "Ngày "}${day[3]}/${day[2]}/${day[1]}`;
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  return month ? `Tháng ${month[2]}/${month[1]}` : key;
}
