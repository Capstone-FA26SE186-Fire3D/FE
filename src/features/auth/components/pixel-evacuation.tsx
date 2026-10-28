"use client";

import { useEffect, useRef } from "react";

/*
 * Looping pixel scene beside the sign-in form: a firefighter points people out of a burning glass building towards the
 * assembly point. Drawn on a small canvas and scaled up with `image-rendering: pixelated`, so it costs no download.
 * Decorative only (aria-hidden). With reduced motion it draws one still frame; off screen or in a hidden tab it pauses.
 */

const W = 240;
const H = 134;
const GROUND = 112;
const FPS = 12;
const DOOR_X = 172;
const FIRE = { x0: 198, x1: 228, top: 37, bottom: 58 };
const FIGHTER = { x: 150, y: 121 };

type Look = { hair: string; skin: string; top: string; pants: string; tall: number; speed: number; longHair?: boolean; bag?: string };
type Runner = { x: number; y: number; lane: number; look: Look; stopX: number; stopped: number; frame: number };
type Puff = { x: number; y: number; vx: number; vy: number; size: number; age: number; life: number };
type Ember = { x: number; y: number; vy: number; age: number };

const LOOKS: Look[] = [
  { hair: "#cfcfcf", skin: "#e8b48f", top: "#a8545f", pants: "#8b7b68", tall: 11, speed: 1, bag: "#7a4a26" },
  { hair: "#1d1a1a", skin: "#e2a77f", top: "#2f4a7a", pants: "#1f2228", tall: 12, speed: 1.7 },
  { hair: "#2a1c14", skin: "#efbd98", top: "#e9e4dc", pants: "#5d7598", tall: 11, speed: 1.5, longHair: true, bag: "#3a2a20" },
  { hair: "#3b2a1a", skin: "#d99a72", top: "#3f8a5a", pants: "#2b2f3a", tall: 9, speed: 1.4 },
  { hair: "#111111", skin: "#e0a47c", top: "#d8a23a", pants: "#3a3f4a", tall: 12, speed: 1.6 },
  { hair: "#4a3020", skin: "#e9b896", top: "#7b5ea7", pants: "#2e3440", tall: 11, speed: 1.3, longHair: true },
];

const STARS = Array.from({ length: 22 }, (_, i) => ({ x: (i * 53 + 17) % W, y: (i * 29 + 5) % 46, phase: i % 5 }));
const WINDOW_LIGHTS = [126, 135, 153, 171, 189, 207, 216];

/** Glass colour of a cylinder column: darker at both edges, lighter in the middle. */
function glass(u: number): string {
  const shade = Math.sin(Math.PI * u);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * shade);
  return `rgb(${mix(18, 64)},${mix(38, 112)},${mix(48, 122)})`;
}

function createScene(ctx: CanvasRenderingContext2D) {
  const runners: Runner[] = [];
  const puffs: Puff[] = [];
  const embers: Ember[] = [];
  let tick = 0;
  let next = 0;
  let lookIndex = 0;

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  const flame = (col: number) => {
    const n = Math.sin(col * 1.7 + tick * 0.9) + Math.sin(col * 0.6 - tick * 1.3) + Math.sin(col * 3.1 + tick * 0.4);
    return Math.max(2, Math.round(9 + n * 3.2));
  };

  function step() {
    tick += 1;
    if (tick >= next) {
      const look = LOOKS[lookIndex % LOOKS.length];
      lookIndex += 1;
      const lane = 116 + ((lookIndex * 5) % 13);
      runners.push({ x: DOOR_X + 4, y: GROUND, lane, look, stopX: 20 + ((lookIndex * 11) % 38), stopped: 0, frame: 0 });
      next = tick + 14 + ((lookIndex * 7) % 10);
    }
    for (const r of runners) {
      if (r.x > r.stopX) {
        r.x = Math.max(r.stopX, r.x - r.look.speed);
        r.y += (r.lane - r.y) * 0.25;
        if (tick % 2 === 0) r.frame = 1 - r.frame;
      } else {
        r.stopped += 1;
        r.frame = 1;
      }
    }
    for (let i = runners.length - 1; i >= 0; i -= 1) if (runners[i].stopped > 52) runners.splice(i, 1);

    if (tick % 2 === 0) {
      puffs.push({ x: FIRE.x0 + ((tick * 7) % (FIRE.x1 - FIRE.x0)), y: FIRE.top - 2, vx: -0.35 - (tick % 3) * 0.12, vy: -0.45, size: 3, age: 0, life: 60 });
      puffs.push({ x: 214 + (tick % 9), y: 70, vx: -0.25, vy: -0.3, size: 2, age: 0, life: 34 });
    }
    for (const p of puffs) { p.x += p.vx; p.y += p.vy; p.age += 1; p.size += 0.12; }
    for (let i = puffs.length - 1; i >= 0; i -= 1) if (puffs[i].age > puffs[i].life) puffs.splice(i, 1);

    if (tick % 3 === 0) embers.push({ x: FIRE.x0 + ((tick * 13) % (FIRE.x1 - FIRE.x0)), y: FIRE.top - 4, vy: -0.8, age: 0 });
    for (const e of embers) { e.y += e.vy; e.x += Math.sin((e.age + e.x) * 0.7) * 0.5; e.age += 1; }
    for (let i = embers.length - 1; i >= 0; i -= 1) if (embers[i].age > 22) embers.splice(i, 1);
  }

  function sky() {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, "#0b1016");
    g.addColorStop(1, "#1b2531");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND);
    for (const s of STARS) if ((tick + s.phase * 3) % 16 < 13) px(s.x, s.y, 1, 1, s.phase === 0 ? "#f3e9c6" : "#8796a8");
    px(26, 11, 4, 1, "#e9e2c8");
    px(25, 12, 6, 4, "#e9e2c8");
    px(26, 16, 4, 1, "#e9e2c8");
    px(27, 13, 1, 1, "#cfc7a8");
  }

  function building() {
    const x0 = 120;
    const x1 = 234;
    const floors = [34, 60, 86];
    for (const top of floors) {
      for (let c = x0; c < x1; c += 1) {
        const u = (c - x0) / (x1 - x0);
        px(c, top + 2, 1, 24, glass(u));
        if ((c - x0) % 9 === 0) px(c, top + 2, 1, 24, "#16262e");
      }
      for (const lx of WINDOW_LIGHTS) if (lx < x1 - 2) px(lx, top + 6, 1, 7, (lx + top) % 3 === 0 ? "#fbe6a2" : "#d7ecef");
      px(x0 + 4, top + 21, x1 - x0 - 8, 1, "rgba(255,226,160,.18)");
    }
    for (const top of [...floors, GROUND - 2]) {
      px(x0 - 2, top, x1 - x0 + 4, 2, "#6f7f88");
      px(x0 - 1, top, x1 - x0 + 2, 1, "#9aabb3");
    }
    px(x0 - 2, GROUND - 2, 1, 1, "#1b2531");
    px(x1 + 1, GROUND - 2, 1, 1, "#1b2531");

    // Fire inside the top floor, licking out above the slab.
    px(FIRE.x0, FIRE.top, FIRE.x1 - FIRE.x0, FIRE.bottom - FIRE.top, "#4a140c");
    const glow = ctx.createRadialGradient(213, 48, 2, 213, 48, 44);
    glow.addColorStop(0, "rgba(255,140,40,.45)");
    glow.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(160, 4, 80, 90);
    for (let c = FIRE.x0; c < FIRE.x1; c += 1) {
      const h = flame(c) + (c > 204 && c < 222 ? 6 : 0);
      for (let i = 0; i < h; i += 1) {
        const y = FIRE.bottom - 1 - i;
        const t = i / h;
        px(c, y, 1, 1, t < 0.35 ? "#ffe9a0" : t < 0.7 ? "#ff9a2e" : "#e2471d");
      }
    }
    for (const e of embers) px(e.x, e.y, 1, 1, e.age % 4 < 2 ? "#ffcf6a" : "#ff7a2a");

    // Door with the green exit sign.
    px(DOOR_X - 1, 91, 16, 21, "#2c3b44");
    px(DOOR_X, 92, 14, 20, "#f4dc9c");
    px(DOOR_X + 1, 93, 5, 18, "#ffeec4");
    px(DOOR_X + 8, 93, 5, 18, "#ffeec4");
    px(DOOR_X + 6, 92, 2, 20, "#2c3b44");
    px(DOOR_X + 3, 86, 8, 4, "#17a34a");
    px(DOOR_X + 5, 87, 1, 1, "#ffffff");
    px(DOOR_X + 6, 88, 2, 1, "#ffffff");
    px(DOOR_X + 8, 87, 1, 2, "#ffffff");
  }

  function smoke() {
    for (const p of puffs) {
      const a = 0.55 * (1 - p.age / p.life);
      const s = Math.round(p.size);
      ctx.globalAlpha = a;
      px(p.x - s / 2, p.y - s / 2 + 1, s, s - 2 > 0 ? s - 2 : 1, "#5c6168");
      px(p.x - s / 2 + 1, p.y - s / 2, s - 2 > 0 ? s - 2 : 1, s, "#6a7078");
    }
    ctx.globalAlpha = 1;
  }

  function grounds() {
    px(0, GROUND, W, H - GROUND, "#1a2027");
    for (let x = 0; x < W; x += 14) px(x, GROUND + 1, 1, H - GROUND, "#20272f");
    px(0, GROUND, W, 1, "#2b343d");
    // Wet reflections of the lit glass and the fire.
    ctx.globalAlpha = 0.22;
    for (const lx of WINDOW_LIGHTS) px(lx, GROUND + 2, 1, 6, "#fbe6a2");
    for (let c = DOOR_X + 1; c < DOOR_X + 13; c += 2) px(c, GROUND + 1, 1, 4 + (c % 3), "#f4dc9c");
    ctx.globalAlpha = 0.2 + 0.08 * Math.sin(tick * 0.9);
    for (let c = FIRE.x0 + 1; c < FIRE.x1; c += 3) px(c, GROUND + 1, 1, 3 + ((c + tick) % 5), "#ff8a2a");
    ctx.globalAlpha = 1;

    // Bushes, lamps and the assembly-point sign on the left.
    for (let x = 0; x < 118; x += 9) {
      const h = 5 + ((x * 7) % 5);
      px(x, GROUND - h, 10, h, "#1d3524");
      px(x + 2, GROUND - h - 1, 6, 1, "#26442e");
    }
    for (const lx of [74, 108]) {
      px(lx, 96, 1, 16, "#3a4048");
      px(lx - 1, 94, 3, 2, "#fff1c0");
      ctx.globalAlpha = 0.18;
      px(lx - 4, 92, 9, 6, "#ffe7a0");
      px(lx - 2, GROUND + 1, 5, 4, "#ffe7a0");
      ctx.globalAlpha = 1;
    }
    px(14, 96, 1, 16, "#8a939c");
    px(8, 86, 13, 10, "#17a34a");
    px(9, 87, 11, 8, "#1fbf5a");
    for (const [hx, hy] of [[10, 89], [13, 88], [16, 89]] as const) {
      px(hx + 1, hy, 1, 1, "#ffffff");
      px(hx, hy + 1, 3, 3, "#ffffff");
    }
  }

  function person(r: Runner) {
    const { look } = r;
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const top = y - look.tall;
    const torso = look.tall - 6;
    ctx.globalAlpha = r.stopped > 40 ? Math.max(0, 1 - (r.stopped - 40) / 12) : 1;
    px(x - 1, y, 5, 1, "rgba(0,0,0,.35)");
    px(x, top, 3, 1, look.hair);
    px(x, top + 1, 3, 2, look.skin);
    px(x + 2, top + 1, 1, look.longHair ? 4 : 2, look.hair);
    px(x, top + 3, 3, torso, look.top);
    const moving = r.stopped === 0;
    if (moving && r.frame === 0) {
      px(x - 1, top + 4, 1, 2, look.top);
      px(x - 1, top + 6, 1, 1, look.skin);
      px(x + 3, top + 3, 1, 2, look.top);
      px(x - 1, y - 3, 1, 3, look.pants);
      px(x + 2, y - 3, 1, 2, look.pants);
      px(x + 3, y - 2, 1, 1, look.pants);
      px(x - 2, y - 1, 1, 1, "#111111");
      px(x + 3, y - 1, 1, 1, "#111111");
    } else {
      px(x + 3, top + 4, 1, 2, look.top);
      px(x, y - 3, 1, 3, look.pants);
      px(x + 2, y - 3, 1, 3, look.pants);
      px(x, y - 1, 1, 1, "#111111");
      px(x + 2, y - 1, 1, 1, "#111111");
    }
    if (look.bag) px(x + 3, top + 5, 2, 2, look.bag);
    ctx.globalAlpha = 1;
  }

  function firefighter() {
    const { x, y } = FIGHTER;
    const wave = Math.floor(tick / 6) % 2;
    const coat = "#1d2440";
    const stripe = "#d8f03a";
    px(x - 2, y, 9, 1, "rgba(0,0,0,.4)");
    px(x + 5, y - 11, 2, 6, "#9aa3ad");
    px(x - 1, y - 4, 2, 4, coat);
    px(x + 3, y - 4, 2, 4, coat);
    px(x - 1, y - 2, 2, 1, stripe);
    px(x + 3, y - 2, 2, 1, stripe);
    px(x - 1, y, 2, 1, "#0c0c0c");
    px(x + 3, y, 2, 1, "#0c0c0c");
    px(x - 1, y - 11, 6, 7, coat);
    px(x - 1, y - 8, 6, 1, stripe);
    px(x - 1, y - 6, 6, 1, stripe);
    px(x, y - 13, 4, 2, "#e2a77f");
    px(x, y - 13, 2, 1, "#111111");
    px(x, y - 15, 5, 2, "#d8432b");
    px(x - 1, y - 14, 7, 1, "#ee5a35");
    px(x + 1, y - 15, 1, 1, "#ffb08a");
    // Pointing arm: "this way", lifting a pixel every half second.
    const ay = y - 10 - wave;
    px(x - 7, ay, 6, 2, coat);
    px(x - 4, ay, 1, 2, stripe);
    px(x - 9, ay, 2, 1, "#111111");
    px(x + 5, y - 9, 1, 3, coat);
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    sky();
    building();
    smoke();
    grounds();
    const actors: Array<{ y: number; draw: () => void }> = runners.map((r) => ({ y: r.y, draw: () => person(r) }));
    actors.push({ y: FIGHTER.y, draw: firefighter });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();
  }

  return { step, draw };
}

export function PixelEvacuation({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scene = createScene(ctx);
    // Start mid-evacuation so the first frame already has people on the plaza.
    for (let i = 0; i < 90; i += 1) scene.step();
    scene.draw();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = true;
    let frame = 0;
    let last = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 1000 / FPS) return;
      last = now;
      scene.step();
      scene.draw();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(canvas);
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  return <canvas ref={ref} className={className} width={W} height={H} aria-hidden="true" data-testid="login-pixel-scene" />;
}
