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

/** Render at most about 60 frames per second, even on 120/144/240 Hz displays. */
const TARGET_FRAME_MS = 1000 / 60;

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
    // Display refresh estimate: on fast displays render every nth tick, not every tick.
    let lastTick = 0, skip = 1, tick = 0, estimated = false;
    const tickSamples: number[] = [];
    // Last hit-area rectangles written to the DOM, so unchanged frames write nothing.
    const written: Partial<Record<NonNullable<LandingBranch>, { element: HTMLButtonElement; rect: number[] }>> = {};
    const report = (value: Parameters<Props["onStatus"]>[0], detail?: string) => {
      if (status !== value) { status = value; statusRef.current(value, detail); }
    };
    function estimateRefresh(now: number) {
      if (estimated) return;
      if (lastTick) {
        const gap = now - lastTick;
        if (gap > 1 && gap < 50) tickSamples.push(gap);
      }
      lastTick = now;
      if (tickSamples.length >= 24) {
        estimated = true;
        const median = [...tickSamples].sort((a, b) => a - b)[tickSamples.length >> 1];
        skip = Math.max(1, Math.floor(TARGET_FRAME_MS / median + .15));
      }
    }
    function render(now: number) {
      if (!runtime || disposed || document.hidden || !visible) return;
      estimateRefresh(now);
      if (skip > 1 && ++tick % skip !== 0) { frame = requestAnimationFrame(render); return; }
      const delta = lastTime ? Math.min((now - lastTime) / 1000, .25) : 0;
      lastTime = now;
      try {
        const result = runtime.update(delta, input.current.progress, input.current.branch, input.current.orbit);
        for (const area of result.hitAreas) {
          const element = choiceRefs.current[area.branch];
          if (!element) { delete written[area.branch]; continue; }
          const previous = written[area.branch];
          if (previous && previous.element === element && Math.abs(previous.rect[0] - area.left) + Math.abs(previous.rect[1] - area.top) + Math.abs(previous.rect[2] - area.width) + Math.abs(previous.rect[3] - area.height) < 1e-5) continue;
          written[area.branch] = { element, rect: [area.left, area.top, area.width, area.height] };
          element.style.left = `${area.left * 100}%`; element.style.top = `${area.top * 100}%`;
          element.style.width = `${area.width * 100}%`; element.style.height = `${area.height * 100}%`;
        }
        if (lastBranch !== input.current.branch) { lastBranch = input.current.branch; report("transitioning"); }
        report(input.current.branch ? result.settled ? "settled" : "transitioning" : "ready");
        if (canvas.dataset.state !== status) canvas.dataset.state = status;
        frame = requestAnimationFrame(render);
      } catch (error) {
        console.error("[Fire3D:render]", error); report("error", "render");
      }
    }
    function resume() {
      cancelAnimationFrame(frame); lastTime = 0; lastTick = 0;
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
