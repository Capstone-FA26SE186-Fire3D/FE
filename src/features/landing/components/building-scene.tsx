"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import type { LandingBranch } from "../types";
import type { LandingRuntime } from "../scene/runtime";

export type JourneyInput = { progress: number; branch: LandingBranch; orbit?: { yaw: number; pitch: number } };
type Props = {
  input: MutableRefObject<JourneyInput>;
  onStatus: (status: "ready" | "transitioning" | "settled" | "error", detail?: string) => void;
  snapshotRef: MutableRefObject<(() => string) | null>;
  choiceRefs: MutableRefObject<Partial<Record<NonNullable<LandingBranch>, HTMLButtonElement | null>>>;
};

export function BuildingScene({ input, onStatus, snapshotRef, choiceRefs }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(onStatus);
  useEffect(() => { statusRef.current = onStatus; }, [onStatus]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Each effect owns a fresh canvas, including Fast Refresh and StrictMode replays.
    const canvas = document.createElement("canvas");
    canvas.className = "building-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Công trình FET3D ba tầng, hành lang và cầu thang");
    let disposed = false, runtime: LandingRuntime | null = null, frame = 0;
    let visible = true, lastTime = 0, status = "", lastBranch: LandingBranch = null;
    const report = (value: Parameters<Props["onStatus"]>[0], detail?: string) => {
      if (status !== value) { status = value; statusRef.current(value, detail); }
    };
    function render(now: number) {
      if (!runtime || disposed || document.hidden || !visible) return;
      const delta = lastTime ? Math.min((now - lastTime) / 1000, .25) : 0;
      lastTime = now;
      try {
        const result = runtime.update(delta, input.current.progress, input.current.branch, input.current.orbit);
        for (const area of result.hitAreas) {
          const element = choiceRefs.current[area.branch];
          if (!element) continue;
          element.style.left = `${area.left * 100}%`; element.style.top = `${area.top * 100}%`;
          element.style.width = `${area.width * 100}%`; element.style.height = `${area.height * 100}%`;
        }
        if (lastBranch !== input.current.branch) { lastBranch = input.current.branch; report("transitioning"); }
        report(input.current.branch ? result.settled ? "settled" : "transitioning" : "ready");
        canvas!.dataset.state = status;
        frame = requestAnimationFrame(render);
      } catch (error) {
        console.error("[Fire3D:render]", error); report("error", "render");
      }
    }
    function resume() {
      cancelAnimationFrame(frame); lastTime = 0;
      if (!document.hidden && visible && runtime && !disposed) frame = requestAnimationFrame(render);
    }
    const resize = () => runtime?.resize(canvas.clientWidth, canvas.clientHeight);
    const resizeObserver = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); });
    const contextLost = (event: Event) => {
      event.preventDefault(); cancelAnimationFrame(frame);
      console.error("[Fire3D:context-lost]"); report("error", "context-lost");
    };
    // Deferral lets StrictMode cancel its probe effect before allocating a WebGL context.
    const timer = setTimeout(async () => {
      try {
        const { createLandingRuntime } = await import("../scene/runtime");
        if (disposed) return;
        host.appendChild(canvas);
        await document.fonts.load('600 65px "Be Vietnam Pro"');
        if (disposed) return;
        runtime = createLandingRuntime(canvas, window.matchMedia("(max-width: 767px)").matches);
        snapshotRef.current = runtime.snapshot;
        resize(); resizeObserver.observe(canvas); intersection.observe(canvas);
        canvas.addEventListener("webglcontextlost", contextLost);
        document.addEventListener("visibilitychange", resume);
        resume();
      } catch (error) {
        console.error("[Fire3D:init]", error);
        if (!disposed) report("error", error instanceof Error ? error.message : "init");
      }
    }, 0);
    return () => {
      disposed = true; clearTimeout(timer); cancelAnimationFrame(frame);
      resizeObserver.disconnect(); intersection.disconnect();
      document.removeEventListener("visibilitychange", resume);
      canvas.removeEventListener("webglcontextlost", contextLost);
      snapshotRef.current = null; runtime?.dispose(); canvas.remove();
    };
  }, [input, snapshotRef, choiceRefs]);

  return <div ref={hostRef} className="scene-canvas-host" />;
}
