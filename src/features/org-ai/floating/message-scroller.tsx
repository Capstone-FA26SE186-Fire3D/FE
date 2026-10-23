"use client";

import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/utils/cn";

/** How close to the bottom (px) still counts as "reading the latest": new content keeps the view pinned to the end. */
export const FOLLOW_THRESHOLD_PX = 56;

/**
 * Scroll container that follows new output ("follow output" pattern): while the reader is within `FOLLOW_THRESHOLD_PX` of
 * the bottom, every growth of the content (ResizeObserver) scrolls to the end. Scrolling up with the wheel, a touch,
 * ArrowUp/PageUp/Home pauses following; a small "↓ Mới" button (or scrolling back down) re-enables it.
 */
export function MessageScroller({ children, className, label, newLabel = "Mới", ...rest }: { children: ReactNode; className?: string; label: string; newLabel?: string; "data-testid"?: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  // Stays true while the browser applies our own scrollTo, so the scroll event it fires is not read as the user scrolling up.
  const programmatic = useRef(false);

  const setFollow = useCallback((value: boolean) => { followingRef.current = value; setFollowing(value); }, []);

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = viewport.current;
    if (!node) return;
    programmatic.current = true;
    node.scrollTo({ top: node.scrollHeight, behavior });
    window.setTimeout(() => { programmatic.current = false; }, behavior === "smooth" ? 400 : 60);
  }, []);

  const nearBottom = () => {
    const node = viewport.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight <= FOLLOW_THRESHOLD_PX;
  };

  // Content growth while following → stay at the end. Pause on first paint too so a reopened panel shows the latest line.
  useLayoutEffect(() => {
    const node = content.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { if (followingRef.current) scrollToEnd(); });
    observer.observe(node);
    scrollToEnd();
    return () => observer.disconnect();
  }, [scrollToEnd]);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    // Wheel up and a touch drag are explicit intents; the scroll event only re-enables following when the user reaches the end.
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) setFollow(false); };
    const onTouchMove = () => { if (!nearBottom()) setFollow(false); };
    const onScroll = () => {
      if (programmatic.current) return;
      if (nearBottom()) setFollow(true);
      else if (followingRef.current) setFollow(false);
    };
    node.addEventListener("wheel", onWheel, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: true });
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => { node.removeEventListener("wheel", onWheel); node.removeEventListener("touchmove", onTouchMove); node.removeEventListener("scroll", onScroll); };
  }, [setFollow]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home") setFollow(false);
    if (event.key === "End") { setFollow(true); scrollToEnd("smooth"); }
  };

  return <div className={cn("ai-scroller", className)}>
    <div ref={viewport} className="ai-scroller-viewport" tabIndex={0} role="region" aria-label={label} onKeyDown={onKeyDown} data-following={following} data-testid={rest["data-testid"]}>
      <div ref={content} className="ai-scroller-content">{children}</div>
    </div>
    {!following && <button type="button" className="ai-scroller-new" onClick={() => { setFollow(true); scrollToEnd("smooth"); }} data-testid="ai-scroll-new">
      <ArrowDown size={14} aria-hidden="true" />{newLabel}
    </button>}
  </div>;
}
