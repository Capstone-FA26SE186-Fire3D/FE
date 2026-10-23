"use client";

import { useSyncExternalStore } from "react";

/** Live `matchMedia` result; `serverValue` is used during SSR and the first hydration pass. */
export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
