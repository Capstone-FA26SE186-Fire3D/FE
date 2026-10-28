"use client";

import { useEffect, useRef } from "react";
import { createScene, type Mode, type SceneOptions } from "./scene";

/*
 * Looping pixel scene drawn in code (no download), decorative only. The canvas fills its box and its sky is transparent,
 * so the page background shows through: dark theme = night, light theme = day (it follows `data-resolved-theme` live).
 * The pixel grid follows the box size (3-5 CSS px per pixel), so the scene is rebuilt, not stretched, on resize.
 * With reduced motion it draws one still frame; off screen or in a hidden tab it pauses.
 */

const FPS = 12;

export type SceneVariant = "evacuation" | "hose";

/** Layout per variant; `wide` is the box being at least 960 CSS px across (the form or the copy beside the scene). */
const LAYOUT: Record<SceneVariant, (wide: boolean) => SceneOptions> = {
  // Sign-in page: the building left of centre, the slim firefighter with glasses points the way, people run right, a fire engine, rain.
  evacuation: (wide) => ({ cx: wide ? 0.27 : 0.5, pose: "point", direction: 1, truck: true, rain: true, headroom: 52, fighter: "glasses", cast: 0 }),
  // Overview banner: the building right of centre, the chubby firefighter hoses the fire, people run left (another crowd).
  hose: (wide) => ({ cx: wide ? 0.6 : 0.55, pose: "hose", direction: -1, truck: false, rain: false, headroom: 36, fighter: "chubby", cast: 3 }),
};

export function PixelScene({ variant, className, testId }: { variant: SceneVariant; className?: string; testId?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scope = canvas.closest<HTMLElement>("[data-resolved-theme]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scene: ReturnType<typeof createScene> | null = null;
    let sceneKey = "";
    let visible = true;
    let frame = 0;
    let last = 0;

    const build = () => {
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (!cw || !ch) return;
      const scale = Math.max(3, Math.min(5, Math.floor(Math.min(cw / 300, ch / 180))));
      const w = Math.ceil(cw / scale);
      const h = Math.ceil(ch / scale);
      const mode: Mode = scope?.dataset.resolvedTheme === "light" ? "day" : "night";
      const options = LAYOUT[variant](cw >= 960);
      const key = `${w}x${h}:${mode}:${options.cx}`;
      if (key === sceneKey) return;
      sceneKey = key;
      canvas.width = w;
      canvas.height = h;
      scene = createScene(ctx, w, h, mode, options);
      // Start mid-evacuation so the first frame already has people on the plaza (and water in the air).
      for (let i = 0; i < 100; i += 1) scene.step();
      scene.draw();
    };
    build();

    const resize = new ResizeObserver(build);
    resize.observe(canvas);
    const theme = new MutationObserver(build);
    if (scope) theme.observe(scope, { attributes: true, attributeFilter: ["data-resolved-theme"] });

    let intersect: IntersectionObserver | null = null;
    if (!reduced) {
      const loop = (now: number) => {
        frame = requestAnimationFrame(loop);
        if (!scene || !visible || document.hidden || now - last < 1000 / FPS) return;
        last = now;
        scene.step();
        scene.draw();
      };
      intersect = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
      intersect.observe(canvas);
      frame = requestAnimationFrame(loop);
    }
    return () => { cancelAnimationFrame(frame); resize.disconnect(); theme.disconnect(); intersect?.disconnect(); };
  }, [variant]);

  return <canvas ref={ref} className={className} width={1} height={1} aria-hidden="true" data-testid={testId} data-variant={variant} />;
}
