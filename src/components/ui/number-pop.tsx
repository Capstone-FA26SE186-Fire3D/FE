"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/ui/motion";

/**
 * Counts a KPI up to `value` the first time it appears (Figma "số KPI pop-in"). Reduced motion prints the number
 * directly; the DOM text always ends on the final value, within ~0.7 s, so tests can read it.
 */
export function NumberPop({ value, format = (n: number) => n.toLocaleString("vi-VN"), duration = 650, className }: { value: number; format?: (value: number) => string; duration?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(() => (reduced ? value : 0));
  // Last painted number, kept in a ref (written in the animation callback, not during render) so a new target
  // continues from where the previous count stopped.
  const current = useRef(shown);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const from = current.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, duration]);

  const text = reduced ? value : shown;
  return <span className={className} data-value={value} style={{ fontVariantNumeric: "tabular-nums" }}>{format(text)}</span>;
}
