"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

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

/**
 * Warns before unsaved work is lost:
 *  - `beforeunload` for reload/close/external navigation (browser dialog);
 *  - clicks on in-app links are intercepted (capture phase, before Next's Link handler) and routed through `pending`;
 *  - the browser Back button: a sentinel history entry is pushed once the draft is dirty, and a pop onto it asks first.
 * `proceed()` performs the held navigation; `stay()` cancels it.
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<{ href: string } | { back: true } | null>(null);
  const dirtyRef = useRef(dirty);
  const sentinels = useRef(0);
  const bypass = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || bypass.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || bypass.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ href: `${url.pathname}${url.search}${url.hash}` });
    };
    const onPopState = () => {
      if (bypass.current) return;
      if (sentinels.current > 0) {
        sentinels.current -= 1;
        if (dirtyRef.current) {
          // Back landed on the entry below the sentinel: put the sentinel back and ask.
          window.history.pushState(window.history.state, "", window.location.href);
          sentinels.current += 1;
          setPending({ back: true });
        } else {
          window.history.back(); // clean: skip the leftover sentinel
        }
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (dirty && sentinels.current === 0) {
      window.history.pushState(window.history.state, "", window.location.href);
      sentinels.current = 1;
    }
  }, [dirty]);

  const proceed = useCallback(() => {
    const target = pending;
    setPending(null);
    bypass.current = true;
    if (!target) return;
    if ("back" in target) window.history.go(-(sentinels.current + 1));
    else router.push(target.href);
  }, [pending, router]);

  const stay = useCallback(() => setPending(null), []);
  return { pending: pending !== null, proceed, stay };
}
