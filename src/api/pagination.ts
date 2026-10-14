import type { PageResponse } from "./types/common";

/**
 * BE paginates in two envelopes: `{ items, totalCount, page, pageSize }` (building, organization, account, scenario,
 * revision, release, review, learn) and `{ items, total, page, pageSize }` (support, billing). Both are accepted and
 * normalized to the shared `PageResponse`; a missing count falls back to the number of items so a page never claims
 * fewer rows than it carries.
 */
export type RawPage<T> = {
  items?: T[] | null;
  totalCount?: number | null;
  total?: number | null;
  page?: number | null;
  pageSize?: number | null;
};

export function normalizePage<T>(raw: RawPage<T>, fallback: { page?: number; pageSize?: number } = {}): PageResponse<T> {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const count = [raw.totalCount, raw.total].find((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    items,
    totalCount: Math.max(count ?? items.length, items.length),
    page: typeof raw.page === "number" ? raw.page : fallback.page ?? 1,
    pageSize: typeof raw.pageSize === "number" ? raw.pageSize : fallback.pageSize ?? items.length,
  };
}
