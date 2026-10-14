import { parseDateOnly } from "@/utils/date-range";
import { SESSION_STATUSES, TRAINING_MODES, type HistoryFilters } from "./types";

export const PAGE_SIZE = 10;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => uuid.test(value);

/** The URL is user-editable: only known statuses/modes, a UUID Building and real calendar days survive; the rest is dropped. */
export function readFilters(get: (key: string) => string): HistoryFilters {
  const status = get("status");
  const mode = get("mode");
  const building = get("building");
  const from = get("from");
  const to = get("to");
  return {
    status: (SESSION_STATUSES as readonly string[]).includes(status) ? status : "",
    mode: (TRAINING_MODES as readonly string[]).includes(mode) ? mode : "",
    buildingId: isUuid(building) ? building.toLowerCase() : "",
    from: parseDateOnly(from) === null ? "" : from,
    to: parseDateOnly(to) === null ? "" : to,
  };
}

export const hasFilters = (filters: HistoryFilters) => Object.values(filters).some(Boolean);

/** The range is checked before any request: the server would answer 400 for an end before the start. */
export function rangeError(filters: Pick<HistoryFilters, "from" | "to">): string | undefined {
  return filters.from && filters.to && filters.to < filters.from ? "Ngày kết thúc phải từ ngày bắt đầu trở đi." : undefined;
}

function startOfLocalDay(day: string, plusDays = 0): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date + plusDays).toISOString();
}

/**
 * Days are the learner's own calendar days (the list shows local times). The API range is half-open on startedAt: `from`
 * inclusive, `to` exclusive, so the inclusive "Đến ngày" becomes the start of the next day.
 */
export function rangeQuery(from: string, to: string): { from?: string; to?: string } {
  return { from: from ? startOfLocalDay(from) : undefined, to: to ? startOfLocalDay(to, 1) : undefined };
}
