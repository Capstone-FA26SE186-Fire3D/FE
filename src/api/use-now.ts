"use client";

import { useEffect, useState } from "react";

/** Wall-clock ticker for countdowns. Only runs while `active`; renders with the server-independent client clock. */
export function useNow(active: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    // Catch up immediately when the tab returns from the background.
    const onVisible = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [active, intervalMs]);
  return now;
}
