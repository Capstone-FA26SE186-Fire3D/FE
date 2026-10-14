"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { parseLearnQuery, toSearchParams, type LearnQuery } from "./query";

export type LearnQueryPatch = Partial<LearnQuery>;

/**
 * The whole Learn list state lives in the URL (`search`, repeated `kind` / `situation`, `page`) so reload, Back/Forward and
 * shared links restore it. Changing any filter returns to page 1. Needs a Suspense boundary above it (`useSearchParams`).
 */
export function useLearnQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = useMemo(() => parseLearnQuery(params), [params]);
  // Two quick changes before the router has applied the first one (two chips clicked in a row) must both survive.
  const latest = useRef(query);
  useEffect(() => { latest.current = query; }, [query]);

  const update = useCallback((patch: LearnQueryPatch, mode: "push" | "replace" = "push") => {
    const next: LearnQuery = { ...latest.current, ...patch };
    if (!("page" in patch)) next.page = 1;
    latest.current = next;
    const search = toSearchParams(next).toString();
    const href = search ? `${pathname}?${search}` : pathname;
    if (mode === "replace") router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [pathname, router]);

  return { query, update };
}
