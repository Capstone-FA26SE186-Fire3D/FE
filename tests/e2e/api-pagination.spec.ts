import { expect, test } from "@playwright/test";

import { normalizePage } from "../../src/api/pagination";
import { toPageResponse } from "../../src/features/billing/types";

/** Pure logic: BE uses two page envelopes (`totalCount` and `total`); both must normalize to one shape. */
test.describe("normalizePage", () => {
  test("accepts the totalCount envelope", () => {
    expect(normalizePage({ items: [1, 2], totalCount: 40, page: 2, pageSize: 2 })).toEqual({ items: [1, 2], totalCount: 40, page: 2, pageSize: 2 });
  });

  test("accepts the total envelope used by billing and support", () => {
    expect(normalizePage({ items: ["a"], total: 7, page: 1, pageSize: 20 })).toEqual({ items: ["a"], totalCount: 7, page: 1, pageSize: 20 });
    expect(toPageResponse({ items: ["a"], total: 7, page: 1, pageSize: 20 })).toEqual({ items: ["a"], totalCount: 7, page: 1, pageSize: 20 });
  });

  test("prefers totalCount when both are present", () => {
    expect(normalizePage({ items: [1], totalCount: 5, total: 9, page: 1, pageSize: 1 }).totalCount).toBe(5);
  });

  test("never reports fewer rows than the page carries and tolerates missing fields", () => {
    expect(normalizePage({ items: [1, 2, 3], totalCount: 1, page: 1, pageSize: 3 }).totalCount).toBe(3);
    expect(normalizePage({}, { page: 4, pageSize: 20 })).toEqual({ items: [], totalCount: 0, page: 4, pageSize: 20 });
    expect(normalizePage({ items: null, total: Number.NaN })).toEqual({ items: [], totalCount: 0, page: 1, pageSize: 0 });
  });
});
