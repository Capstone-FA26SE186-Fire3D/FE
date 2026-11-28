/**
 * Page numbers still to read after page 1 answered with `total` rows: 2..ceil(total / pageSize), capped at `maxPages`.
 * Lets a "read every page" loader fetch the rest in parallel instead of one request after another.
 */
export function pagesAfterFirst(total: number, pageSize: number, maxPages: number): number[] {
  if (!(total > 0) || !(pageSize > 0)) return [];
  const last = Math.min(Math.ceil(total / pageSize), maxPages);
  return Array.from({ length: Math.max(last - 1, 0) }, (_, index) => index + 2);
}
