"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuthSession } from "@/features/auth/auth-session";
import { useLocalPreference } from "@/utils/local-preference";
import { BUILDING_ROUTE, findTourTarget, isTourPreference, TOUR_STORAGE_KEY, tourSteps, type TourPreference } from "./tour-steps";

// The spotlight (SVG dim, popover, motion) loads only once a tour starts; returning users never download it.
const TourSpotlight = dynamic(() => import("./tour-spotlight").then((module) => module.TourSpotlight), { ssr: false });

type TourApi = { active: boolean; start: () => void; stop: () => void };
const TourContext = createContext<TourApi>({ active: false, start: () => undefined, stop: () => undefined });

export function useTour() {
  return useContext(TourContext);
}

/** `closing` is the "open a building to continue" card shown instead of steps 3–5. */
type TourState = { index: number; closing: boolean } | null;
type Resolution = { kind: "step"; index: number } | { kind: "needs-building" } | { kind: "finish" };

/** First step at or after `from` whose target is on screen; steps that need a building end the tour when none is open. */
function resolveStep(from: number, pathname: string): Resolution {
  const onBuilding = BUILDING_ROUTE.test(pathname);
  for (let index = from; index < tourSteps.length; index += 1) {
    const step = tourSteps[index];
    if (step.requiresBuilding && !onBuilding) return { kind: "needs-building" };
    if (findTourTarget(step.key)) return { kind: "step", index };
  }
  return { kind: "finish" };
}

function readStoredPreference(): TourPreference | null {
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    return raw !== null && isTourPreference(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Spotlight tour of the Organization workspace. Auto-starts once for an OrganizationUser (role 1) on the first
 * `/workspace/*` visit; `fire3d-org-tour` remembers "done" | "skipped". `HelpTrigger` restarts it any time.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, user } = useAuthSession();
  const [preference, setPreference] = useLocalPreference<TourPreference>(TOUR_STORAGE_KEY, "new", isTourPreference);
  const [state, setState] = useState<TourState>(null);
  const stateRef = useRef<TourState>(null);
  const autoStarted = useRef(false);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const update = useCallback((next: TourState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const finish = useCallback((outcome: "done" | "skipped") => {
    setPreference(outcome);
    update(null);
  }, [setPreference, update]);

  /** Moves to the first available step at or after `from`, or ends the tour. */
  const goTo = useCallback((from: number, current: TourState) => {
    const resolved = resolveStep(from, pathnameRef.current);
    if (resolved.kind === "step") update({ index: resolved.index, closing: false });
    else if (resolved.kind === "needs-building") update({ index: current ? current.index : 0, closing: true });
    else finish("done");
  }, [finish, update]);

  const start = useCallback(() => {
    const resolved = resolveStep(0, pathnameRef.current);
    if (resolved.kind === "step") update({ index: resolved.index, closing: false });
    else if (resolved.kind === "needs-building") update({ index: 0, closing: true });
    // "finish": nothing on this screen can be shown; the preference stays untouched so the tour can still auto-start later.
  }, [update]);

  const stop = useCallback(() => update(null), [update]);

  const next = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    if (current.closing) { finish("done"); return; }
    goTo(current.index + 1, current);
  }, [finish, goTo]);

  const skip = useCallback(() => finish("skipped"), [finish]);

  // The target vanished (navigation, tab change): continue from the same position, or end gracefully.
  const onTargetLost = useCallback(() => {
    const current = stateRef.current;
    if (!current || current.closing) return;
    goTo(current.index, current);
  }, [goTo]);

  // Auto-start once per session for OrganizationUser on the first workspace visit (after the shell has rendered).
  useEffect(() => {
    if (autoStarted.current || !ready || user?.role !== 1 || !pathname.startsWith("/workspace") || preference !== "new") return;
    // The hydration snapshot is "new" until the stored value is applied; read storage directly before deciding.
    const stored = readStoredPreference();
    if (stored === "done" || stored === "skipped") return;
    autoStarted.current = true;
    const timer = window.setTimeout(start, 400);
    return () => window.clearTimeout(timer);
  }, [ready, user?.role, pathname, preference, start]);

  // Keyboard: Esc skips, Enter/→ advance (not while typing, and not when Enter already activates a tour button).
  useEffect(() => {
    if (!state) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "Escape") { event.preventDefault(); skip(); return; }
      const onTourButton = target?.tagName === "BUTTON" && Boolean(target.closest("[data-tour-popover]"));
      if (event.key === "ArrowRight" || (event.key === "Enter" && !onTourButton)) { event.preventDefault(); next(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, next, skip]);

  const api = useMemo<TourApi>(() => ({ active: state !== null, start, stop }), [state, start, stop]);

  return <TourContext.Provider value={api}>
    {children}
    {state && <TourSpotlight step={state.closing ? null : tourSteps[state.index]} index={state.index} onNext={next} onSkip={skip} onTargetLost={onTargetLost} />}
  </TourContext.Provider>;
}
