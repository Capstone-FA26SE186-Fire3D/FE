"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ParamValue = string | number | null | undefined;

export type UrlParamsSpec = { page?: number; pageSize?: number };

/**
 * Filters and pagination live in the URL so deep links, reload and back/forward work.
 * `setParams` merges values, drops empty ones, and resets to page 1 when a filter (anything but `page`) changes.
 * Discrete choices (page, select) push a history entry so Back works; typing should pass "replace".
 * Needs a Suspense boundary above it (the operations layouts provide one).
 */
export function useUrlParams(defaults: UrlParamsSpec = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const defaultPageSize = defaults.pageSize ?? 20;

  const page = useMemo(() => {
    const value = Number(search.get("page"));
    return Number.isInteger(value) && value >= 1 ? value : 1;
  }, [search]);

  const get = useCallback((key: string) => search.get(key) ?? "", [search]);

  const setParams = useCallback((patch: Record<string, ParamValue>, mode: "push" | "replace" = "push") => {
    const next = new URLSearchParams(search.toString());
    let filterChanged = false;
    for (const [key, value] of Object.entries(patch)) {
      const normalized = value === null || value === undefined || value === "" ? null : String(value);
      if (key !== "page" && (next.get(key) ?? null) !== normalized) filterChanged = true;
      if (normalized === null || (key === "page" && normalized === "1")) next.delete(key);
      else next.set(key, normalized);
    }
    if (filterChanged && !("page" in patch)) next.delete("page");
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (mode === "replace") router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [pathname, router, search]);

  return { page, pageSize: defaultPageSize, get, setParams, setPage: (value: number) => setParams({ page: value }) };
}

/**
 * Search box bound to a URL param: typing is debounced into the URL (replace, so Back is not flooded),
 * while an external URL change (Back/Forward, deep link) updates the box.
 */
export function useUrlSearch(urlValue: string, setParams: (patch: Record<string, ParamValue>, mode?: "push" | "replace") => void, key = "q", delayMs = 300) {
  const [text, setText] = useState(urlValue);
  const [seenUrlValue, setSeenUrlValue] = useState(urlValue);
  const [pushed, setPushed] = useState(urlValue);

  if (urlValue !== seenUrlValue) {
    setSeenUrlValue(urlValue);
    if (urlValue !== pushed) {
      setPushed(urlValue);
      setText(urlValue);
    }
  }

  useEffect(() => {
    if (text.trim() === urlValue) return;
    const timer = window.setTimeout(() => {
      setPushed(text.trim());
      setParams({ [key]: text.trim() }, "replace");
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [text, urlValue, setParams, key, delayMs]);

  return [text, setText] as const;
}
