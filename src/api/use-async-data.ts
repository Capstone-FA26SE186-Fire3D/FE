"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncData<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
};

/**
 * Loads data for a screen. `key` identifies the query (route + filters): when it changes the previous
 * request is aborted and its late response is ignored. The previous data stays visible while reloading
 * so lists do not flash empty between pages.
 */
export function useAsyncData<T>(key: string, load: (signal: AbortSignal) => Promise<T>, enabled = true): AsyncData<T> {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(enabled);
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
        .then((value) => { if (!controller.signal.aborted) setData(value); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, enabled, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  return { data, error, loading, reload };
}
