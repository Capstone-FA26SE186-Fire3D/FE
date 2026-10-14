"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./types/common";

export type AsyncData<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
};

export type AsyncDataOptions = {
  /**
   * Default true: while a new key loads, the previous data stays visible so lists do not flash empty between pages (if the
   * new key then fails, or the failure is 401/403/404, that data is dropped and only the error is shown).
   * Pass false for a detail view whose key names ONE resource (a drawer opened from `?quotation=`, `?item=`…): data and
   * error of another resource must never be shown under the new one, not even while it loads, and `loading` is true from
   * the first render with the new key.
   */
  keepPrevious?: boolean;
  /**
   * Identity of the tenant/resource the key belongs to when only PART of the key is a filter (`orgId` of a list that also
   * has page/status in its key). Previous data is kept while the key changes within one scope (paging, filters) and
   * dropped the moment the scope changes (another organization), so nobody else's rows stay on screen while loading.
   */
  scope?: string;
  /**
   * Default false: a 401/403/404 means the session lost the right to read this, so the data is dropped and only the error
   * shows. Pass true for a report that deliberately keeps its last numbers under a warning (analytics).
   */
  keepWhenDenied?: boolean;
};

/**
 * Loads data for a screen. `key` identifies the query (route + filters): when it changes the previous
 * request is aborted and its late response is ignored. By default the previous data stays visible while
 * reloading (see `keepPrevious`).
 */
export function useAsyncData<T>(key: string, load: (signal: AbortSignal) => Promise<T>, enabled = true, options: AsyncDataOptions = {}): AsyncData<T> {
  const keepPrevious = options.keepPrevious ?? true;
  const scope = options.scope ?? "";
  const keepWhenDenied = options.keepWhenDenied ?? false;
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(enabled);
  // The key each piece of state belongs to: a resource-scoped view ignores state that was produced for another key.
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [dataScope, setDataScope] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    // Deferred so the effect body does not set state synchronously.
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      loadRef.current(controller.signal)
        .then((value) => { if (!controller.signal.aborted) { setData(value); setDataKey(key); setDataScope(scope); } })
        .catch((cause: unknown) => { if (!controller.signal.aborted) { setError(cause); setErrorKey(key); } })
        .finally(() => { if (!controller.signal.aborted) { setLoading(false); setSettledKey(key); } });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, scope, enabled, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const foreign = dataScope !== null && dataScope !== scope; // what is stored belongs to another tenant/resource scope
  if (keepPrevious) {
    // A failed read must not leave rows on screen that answer another query (the previous page or filter), nor rows the
    // session just lost the right to read: only a failed refresh of the SAME query with a transient error keeps its data.
    const failedNow = error !== undefined && errorKey === key;
    const lostAccess = !keepWhenDenied && error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404);
    const hide = foreign || (failedNow && (dataKey !== key || lostAccess));
    return {
      data: hide ? undefined : data,
      error: foreign && errorKey !== key ? undefined : error,
      loading: foreign && enabled ? loading || settledKey !== key : loading,
      reload,
    };
  }
  return {
    data: dataKey === key ? data : undefined,
    error: errorKey === key ? error : undefined,
    loading: enabled && (loading || settledKey !== key),
    reload,
  };
}
