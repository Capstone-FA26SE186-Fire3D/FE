"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { m, presets } from "@/components/ui/motion";
import { usePortalContainer } from "@/features/theme/theme-scope";
import { TOUR_NEEDS_BUILDING_TEXT, tourSteps, type TourStep } from "./tour-steps";

type Rect = { top: number; left: number; width: number; height: number };
type Layout = { rect: Rect | null; viewport: { width: number; height: number }; mobile: boolean };

const RING_PAD = 6;
const RING_RADIUS = 12;
const POPOVER_WIDTH = 320;
const GUTTER = 16;
const GAP = 12;
/** Approximate popover height used to decide above/below before it is measured. */
const POPOVER_ESTIMATE = 220;

/** The target element of a step, or null when it is absent or has no box (hidden sidebar on a phone). */
export function findTourTarget(key: TourStep["key"]): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const element = document.querySelector<HTMLElement>(`[data-tour="${key}"]`);
  if (!element || !element.isConnected) return null;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? element : null;
}

function roundedRectPath(rect: Rect, radius: number) {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  const { top: y, left: x, width: w, height: h } = rect;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Spotlight overlay: an SVG dim (70%) with an even-odd hole around the target, an ember ring, and the step popover.
 * The hole lets pointer events through to the target; the dim swallows them. Re-measured on resize/scroll (rAF-throttled)
 * and whenever the target resizes. `step === null` renders the closing card ("open a building to continue").
 */
export function TourSpotlight({ step, index, onNext, onSkip, onTargetLost }: {
  step: TourStep | null;
  /** 0-based index of the step (also used for the closing card chip). */
  index: number;
  onNext: () => void;
  onSkip: () => void;
  /** The target disappeared (navigation, tab change): the provider decides where to go. */
  onTargetLost: () => void;
}) {
  const container = usePortalContainer();
  const titleId = useId();
  const textId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>({ rect: null, viewport: { width: 0, height: 0 }, mobile: false });
  const [popoverHeight, setPopoverHeight] = useState(POPOVER_ESTIMATE);
  const stepKey = step?.key ?? null;
  const total = tourSteps.length;

  useEffect(() => {
    let frame = 0;
    let lostReported = false;
    const measure = () => {
      frame = 0;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      const target = stepKey ? findTourTarget(stepKey) : null;
      if (stepKey && !target) {
        setLayout({ rect: null, viewport, mobile });
        if (!lostReported) { lostReported = true; onTargetLost(); }
        return;
      }
      const box = target?.getBoundingClientRect();
      setLayout({ rect: box ? { top: box.top - RING_PAD, left: box.left - RING_PAD, width: box.width + RING_PAD * 2, height: box.height + RING_PAD * 2 } : null, viewport, mobile });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };

    const target = stepKey ? findTourTarget(stepKey) : null;
    target?.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    measure();
    const settle = window.setTimeout(schedule, 160);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (target && observer) observer.observe(target);
    if (observer) observer.observe(document.documentElement);
    return () => {
      window.clearTimeout(settle);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      observer?.disconnect();
    };
  }, [stepKey, onTargetLost]);

  // Keyboard users land on the popover; the step text is announced through aria-live.
  useEffect(() => {
    const node = popoverRef.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    setPopoverHeight(node.getBoundingClientRect().height || POPOVER_ESTIMATE);
  }, [stepKey]);

  const { rect, viewport, mobile } = layout;
  const position = (() => {
    if (mobile || !rect || viewport.width === 0) return undefined;
    const left = Math.max(GUTTER, Math.min(rect.left, viewport.width - POPOVER_WIDTH - GUTTER));
    const below = rect.top + rect.height + GAP;
    if (below + popoverHeight + GUTTER <= viewport.height || rect.top - GAP - popoverHeight < GUTTER) return { left, top: Math.min(below, Math.max(GUTTER, viewport.height - popoverHeight - GUTTER)) };
    return { left, bottom: viewport.height - rect.top + GAP };
  })();
  const placement = mobile ? "dock" : rect && viewport.width > 0 ? "anchored" : "center";

  const maskPath = `M0 0H${viewport.width}V${viewport.height}H0Z` + (rect ? roundedRectPath(rect, RING_RADIUS) : "");
  const stepNumber = Math.min(index + 1, total);
  const last = step !== null && index === total - 1;

  const node = <div className="ops-tour" data-testid="tour-overlay" data-step={stepKey ?? "closing"}>
    <svg className="ops-tour-mask" width={viewport.width || "100%"} height={viewport.height || "100%"} aria-hidden="true">
      <path d={maskPath} fillRule="evenodd" className="ops-tour-dim" />
    </svg>
    {rect && <div className="ops-tour-ring" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
    <m.div
      key={stepKey ?? "closing"}
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={textId}
      tabIndex={-1}
      data-tour-popover=""
      data-placement={placement}
      className="ops-tour-popover"
      style={position}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={presets.fade}
    >
      <span className="ops-tour-chip">Bước {stepNumber}/{total}</span>
      <h2 id={titleId} className="ops-tour-title">{step ? step.title : TOUR_NEEDS_BUILDING_TEXT}</h2>
      <p id={textId} className="ops-tour-text" aria-live="polite">{step ? step.text : "Các bước còn lại diễn ra trong trang công trình: tab Hành trình, tab IFC và nút tải IFC."}</p>
      <ol className="ops-tour-dots" aria-label={`Tiến độ hướng dẫn: bước ${stepNumber} trên ${total}`}>
        {tourSteps.map((item, position) => <li key={item.key} data-state={position < index ? "done" : position === index ? "current" : "todo"} aria-current={position === index ? "step" : undefined} />)}
      </ol>
      <div className="ops-tour-actions">
        {step ? <>
          <Button type="button" variant="ghost" onClick={onSkip}>Bỏ qua</Button>
          <Button type="button" onClick={onNext}>{last ? "Xong" : "Tiếp"}</Button>
        </> : <Button type="button" onClick={onNext}>Xong</Button>}
      </div>
    </m.div>
  </div>;

  // Portal into the theme scope so the overlay inherits the ops tokens (dark/light).
  if (!container) return null;
  return createPortal(node, container);
}
