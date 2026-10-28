"use client";

import { useEffect, useRef } from "react";

/*
 * Looping pixel scene behind the sign-in heading: a firefighter points people out of a burning glass building towards the
 * assembly point. The canvas fills the whole art panel and its sky is transparent, so the panel's own background (and the
 * heading on it) shows through: dark theme = night, light theme = day. The pixel grid follows the panel size (3-6 CSS px
 * per pixel), so the scene is rebuilt, not stretched, when the panel resizes.
 * Drawn in code (no download), decorative only. With reduced motion it draws one still frame; off screen or in a hidden
 * tab it pauses.
 */

const FPS = 12;
const PLAZA = 24;
const FLOOR = 26;

type Mode = "night" | "day";
type Look = { hair: string; skin: string; top: string; pants: string; torso: number; legs: number; speed: number; longHair?: boolean; bag?: string; mouth: string };
type Runner = { x: number; y: number; lane: number; look: Look; stopX: number; stopped: number; frame: number };
type Puff = { x: number; y: number; vx: number; vy: number; size: number; age: number; life: number };
type Ember = { x: number; y: number; age: number };
type Fire = { a: number; b: number; bottom: number; base: number; amp: number };

const PAL = {
  night: {
    glassA: [14, 34, 44], glassB: [66, 116, 128], slab: "#6f7f88", slabHi: "#9aabb3", mullion: "#12222a",
    plaza: "rgba(8,12,18,.72)", plazaLine: "rgba(255,255,255,.05)", edge: "rgba(255,255,255,.16)",
    bush: ["#1d3524", "#26442e"], smoke: "98,103,110", glow: 0.42, ink: "#0b1016", pole: "#3a4048",
  },
  day: {
    glassA: [92, 146, 174], glassB: [202, 230, 242], slab: "#8996a0", slabHi: "#bcc7cf", mullion: "#4f7389",
    plaza: "rgba(120,132,142,.34)", plazaLine: "rgba(255,255,255,.45)", edge: "rgba(50,64,78,.28)",
    bush: ["#3f8a52", "#5cb06d"], smoke: "78,83,90", glow: 0.16, ink: "#1b2531", pole: "#7a838c",
  },
} as const;

const LOOKS: Look[] = [
  { hair: "#c9c9c9", skin: "#e8b48f", top: "#a8545f", pants: "#8b7b68", torso: 6, legs: 6, speed: 1, bag: "#7a4a26", mouth: "#8a2f2f" },
  { hair: "#1d1a1a", skin: "#e2a77f", top: "#2f4a7a", pants: "#1f2228", torso: 6, legs: 6, speed: 1.7, mouth: "#7a2a2a" },
  { hair: "#2a1c14", skin: "#efbd98", top: "#efe9e0", pants: "#5d7598", torso: 6, legs: 6, speed: 1.5, longHair: true, bag: "#3a2a20", mouth: "#9a3a3a" },
  { hair: "#3b2a1a", skin: "#d99a72", top: "#3f8a5a", pants: "#2b2f3a", torso: 5, legs: 4, speed: 1.3, mouth: "#8a2f2f" },
  { hair: "#111111", skin: "#e0a47c", top: "#d8a23a", pants: "#3a3f4a", torso: 6, legs: 6, speed: 1.6, mouth: "#7a2a2a" },
  { hair: "#4a3020", skin: "#e9b896", top: "#7b5ea7", pants: "#2e3440", torso: 6, legs: 6, speed: 1.3, longHair: true, mouth: "#9a3a3a" },
];

const hash = (n: number) => Math.abs((Math.sin(n * 12.9898) * 43758.5453) % 1);

function createScene(ctx: CanvasRenderingContext2D, W: number, H: number, mode: Mode) {
  const P = PAL[mode];
  const night = mode === "night";
  const GROUND = H - PLAZA;
  const floors = Math.max(3, Math.min(6, Math.floor((GROUND - 52) / FLOOR)));
  const bw = Math.max(72, Math.min(112, Math.round(W * 0.6)));
  const x1 = W - 6;
  const x0 = Math.max(34, x1 - bw);
  const width = x1 - x0;
  const doorX = x0 + Math.round(width * 0.42) - 7;
  const topFloorTop = GROUND - floors * FLOOR;
  const fires: Fire[] = [{ a: x0 + 4, b: x1 - 4, bottom: topFloorTop + FLOOR - 3, base: 9, amp: 1 }];
  if (floors >= 4) fires.push({ a: x0 + Math.round(width * 0.55), b: x1 - 4, bottom: topFloorTop + FLOOR * 2 - 3, base: 6, amp: 0.7 });
  const fighter = { x: doorX - 22, y: GROUND + 9 };
  const stars = Array.from({ length: 34 }, (_, i) => ({ x: Math.floor(hash(i + 1) * W), y: Math.floor(hash(i + 50) * (GROUND - 30)), phase: i % 5 }))
    .filter((s) => s.x > W * 0.55 || s.y > 46);
  // Below the heading (it ends around row 40), so a cloud never passes behind the text.
  const clouds = [{ x: W * 0.2, y: 50, w: 26, speed: 0.1 }, { x: W * 0.65, y: 62, w: 20, speed: 0.06 }, { x: W * 0.95, y: 46, w: 16, speed: 0.08 }];

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

  const flameHeight = (c: number, f: Fire) => {
    const t = (c - f.a) / (f.b - f.a);
    const taper = 0.45 + 0.55 * Math.min(1, Math.min(t, 1 - t) * 6);
    const wave = 4.5 * Math.sin(c * 0.33 + tick * 0.8) + 3.5 * Math.sin(c * 0.12 - tick * 0.5) + 2.5 * Math.sin(c * 0.9 + tick * 1.4);
    return Math.max(3, Math.round((f.base + f.amp * wave) * taper));
  };

  function step() {
    tick += 1;
    if (tick >= next) {
      const look = LOOKS[lookIndex % LOOKS.length];
      lookIndex += 1;
      const lane = GROUND + 6 + ((lookIndex * 5) % (PLAZA - 12));
      const room = Math.max(24, fighter.x - 30);
      runners.push({ x: doorX + 3, y: GROUND + 5, lane, look, stopX: 12 + ((lookIndex * 13) % room), stopped: 0, frame: 0 });
      next = tick + 16 + ((lookIndex * 7) % 10);
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
    for (let i = runners.length - 1; i >= 0; i -= 1) if (runners[i].stopped > 56) runners.splice(i, 1);

    const top = fires[0];
    if (tick % 2 === 0) puffs.push({ x: top.a + hash(tick) * (top.b - top.a), y: top.bottom - 14, vx: -0.4 - (tick % 3) * 0.12, vy: -0.45, size: 3, age: 0, life: 70 });
    if (tick % 4 === 0 && fires[1]) puffs.push({ x: fires[1].a + hash(tick + 9) * (fires[1].b - fires[1].a), y: fires[1].bottom - 8, vx: -0.3, vy: -0.3, size: 2, age: 0, life: 40 });
    for (const p of puffs) { p.x += p.vx; p.y += p.vy; p.age += 1; p.size += 0.1; }
    for (let i = puffs.length - 1; i >= 0; i -= 1) if (puffs[i].age > puffs[i].life) puffs.splice(i, 1);

    if (tick % 2 === 0) embers.push({ x: top.a + hash(tick + 3) * (top.b - top.a), y: top.bottom - 12, age: 0 });
    for (const e of embers) { e.y -= 0.9; e.x += Math.sin((e.age + e.x) * 0.7) * 0.6; e.age += 1; }
    for (let i = embers.length - 1; i >= 0; i -= 1) if (embers[i].age > 26) embers.splice(i, 1);
    for (const c of clouds) { c.x -= c.speed; if (c.x < -c.w) c.x = W + c.w; }
  }

  function sky() {
    if (night) {
      for (const s of stars) if ((tick + s.phase * 3) % 16 < 13) px(s.x, s.y, 1, 1, s.phase === 0 ? "#f3e9c6" : "#8796a8");
      const mx = W - 26;
      px(mx, 11, 5, 1, "#ece5cb");
      px(mx - 1, 12, 7, 5, "#ece5cb");
      px(mx, 17, 5, 1, "#ece5cb");
      ctx.clearRect(mx + 3, 12, 4, 5);
      return;
    }
    const sx = W - 24;
    ctx.globalAlpha = 0.18 + 0.06 * Math.sin(tick * 0.4);
    for (let dy = -10; dy <= 10; dy += 1) {
      const half = Math.floor(Math.sqrt(100 - dy * dy));
      px(sx - half, 14 + dy, half * 2 + 1, 1, "#ffd96a");
    }
    ctx.globalAlpha = 1;
    px(sx - 3, 8, 7, 1, "#ffc83a");
    px(sx - 5, 9, 11, 1, "#ffc83a");
    px(sx - 6, 10, 13, 9, "#ffc83a");
    px(sx - 5, 19, 11, 1, "#ffc83a");
    px(sx - 3, 20, 7, 1, "#ffc83a");
    px(sx - 3, 11, 5, 4, "#ffe58a");
    for (const c of clouds) {
      const x = Math.round(c.x);
      px(x + 3, c.y, c.w - 8, 3, "#e9f0f5");
      px(x, c.y + 3, c.w, 3, "#e9f0f5");
      px(x + 5, c.y - 2, Math.round(c.w / 2), 2, "#e9f0f5");
      px(x, c.y + 6, c.w, 1, "#c9d7e1");
    }
  }

  function glassColumn(u: number): string {
    const shade = Math.sin(Math.PI * u);
    const mix = (a: number, b: number) => Math.round(a + (b - a) * shade);
    return `rgb(${mix(P.glassA[0], P.glassB[0])},${mix(P.glassA[1], P.glassB[1])},${mix(P.glassA[2], P.glassB[2])})`;
  }

  function building() {
    for (let f = 0; f < floors; f += 1) {
      const top = GROUND - (f + 1) * FLOOR;
      for (let c = x0; c < x1; c += 1) {
        px(c, top + 2, 1, FLOOR - 2, glassColumn((c - x0) / width));
        if ((c - x0) % 9 === 0) px(c, top + 2, 1, FLOOR - 2, P.mullion);
      }
      for (let c = x0 + 4; c < x1 - 3; c += 9) {
        const lit = hash(c * 3 + f * 17) > 0.45;
        if (night && lit) px(c, top + 6, 1, 8, (c + f) % 3 === 0 ? "#fbe6a2" : "#d7ecef");
        if (!night && lit) { px(c, top + 5, 1, 6, "rgba(255,255,255,.55)"); px(c + 1, top + 8, 1, 4, "rgba(255,255,255,.35)"); }
      }
      px(x0 + 3, top + FLOOR - 6, width - 6, 1, night ? "rgba(255,226,160,.16)" : "rgba(255,255,255,.4)");
      px(x0 - 2, top, width + 4, 2, P.slab);
      px(x0 - 1, top, width + 2, 1, P.slabHi);
    }
    px(x0 - 2, GROUND - 2, width + 4, 2, P.slab);
    px(x0 - 1, GROUND - 2, width + 2, 1, P.slabHi);
    px(x0 + 6, topFloorTop - 5, 12, 5, P.slab);
    px(x0 + 7, topFloorTop - 4, 10, 1, P.slabHi);

    // Fire: long, undulating strips inside the floors, tongues licking above the slab.
    for (const f of fires) {
      const floorTop = f.bottom - FLOOR + 3;
      ctx.globalAlpha = 0.34;
      px(f.a, floorTop + 3, f.b - f.a, FLOOR - 6, "#ff7a2a");
      ctx.globalAlpha = 1;
      px(f.a, f.bottom - 2, f.b - f.a, 2, "#7a2410");
    }
    const glow = ctx.createRadialGradient((x0 + x1) / 2, fires[0].bottom - 6, 4, (x0 + x1) / 2, fires[0].bottom - 6, width * 0.85);
    glow.addColorStop(0, `rgba(255,140,40,${P.glow})`);
    glow.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, GROUND);
    for (const f of fires) {
      for (let c = f.a; c < f.b; c += 1) {
        const h = flameHeight(c, f);
        for (let i = 0; i < h; i += 1) {
          const ratio = i / h;
          if (ratio > 0.72 && (c * 7 + i * 3 + tick) % 9 === 0) continue;
          px(c, f.bottom - 3 - i, 1, 1, ratio < 0.3 ? "#fff0b0" : ratio < 0.62 ? "#ffa030" : "#e2471d");
        }
      }
    }
    for (const e of embers) px(e.x, e.y, 1, 1, e.age % 4 < 2 ? "#ffcf6a" : "#ff7a2a");

    // Door with the green exit sign.
    px(doorX - 1, GROUND - 25, 16, 23, "#2c3b44");
    px(doorX, GROUND - 24, 14, 22, night ? "#f4dc9c" : "#cfe6ee");
    px(doorX + 1, GROUND - 23, 5, 20, night ? "#ffeec4" : "#e4f2f7");
    px(doorX + 8, GROUND - 23, 5, 20, night ? "#ffeec4" : "#e4f2f7");
    px(doorX + 6, GROUND - 24, 2, 22, "#2c3b44");
    px(doorX + 2, GROUND - 31, 10, 5, "#17a34a");
    px(doorX + 4, GROUND - 30, 1, 1, "#ffffff");
    px(doorX + 5, GROUND - 29, 2, 1, "#ffffff");
    px(doorX + 7, GROUND - 30, 1, 2, "#ffffff");
    px(doorX + 9, GROUND - 29, 1, 1, "#ffffff");
  }

  function smoke() {
    for (const p of puffs) {
      const s = Math.round(p.size);
      ctx.globalAlpha = Math.max(0, 0.6 * (1 - p.age / p.life));
      px(p.x - s / 2, p.y - s / 2 + 1, s, Math.max(1, s - 2), `rgb(${P.smoke})`);
      px(p.x - s / 2 + 1, p.y - s / 2, Math.max(1, s - 2), s, `rgb(${P.smoke})`);
    }
    ctx.globalAlpha = 1;
  }

  function ground() {
    px(0, GROUND, W, PLAZA, P.plaza);
    px(0, GROUND, W, 1, P.edge);
    for (let x = 0; x < W; x += 16) px(x, GROUND + 1, 1, PLAZA - 1, P.plazaLine);
    if (night) {
      ctx.globalAlpha = 0.2;
      for (let c = x0 + 4; c < x1 - 3; c += 9) px(c, GROUND + 1, 1, 5, "#fbe6a2");
      for (let c = doorX + 1; c < doorX + 13; c += 2) px(c, GROUND + 1, 1, 4 + (c % 3), "#f4dc9c");
      ctx.globalAlpha = 0.2 + 0.08 * Math.sin(tick * 0.9);
      for (let c = fires[0].a + 1; c < fires[0].b; c += 3) px(c, GROUND + 1, 1, 3 + ((c + tick) % 6), "#ff8a2a");
      ctx.globalAlpha = 1;
    }

    // Bushes, lamps and the assembly-point sign on the left.
    for (let x = 0; x < x0 - 12; x += 9) {
      const h = 5 + Math.floor(hash(x) * 5);
      px(x, GROUND - h, 10, h, P.bush[0]);
      px(x + 2, GROUND - h - 1, 6, 1, P.bush[1]);
    }
    for (const lx of [Math.round(x0 * 0.55), Math.round(x0 * 0.85)]) {
      px(lx, GROUND - 20, 1, 20, P.pole);
      px(lx - 1, GROUND - 22, 3, 2, night ? "#fff1c0" : P.pole);
      if (night) { ctx.globalAlpha = 0.16; px(lx - 5, GROUND - 24, 11, 8, "#ffe7a0"); ctx.globalAlpha = 1; }
    }
    px(9, GROUND - 24, 1, 24, P.pole);
    px(2, GROUND - 36, 15, 12, "#17a34a");
    px(3, GROUND - 35, 13, 10, "#1fbf5a");
    for (const [hx, hy] of [[4, 33], [8, 34], [12, 33]] as const) {
      px(hx + 1, GROUND - hy, 1, 1, "#ffffff");
      px(hx, GROUND - hy + 1, 3, 4, "#ffffff");
    }
  }

  function person(r: Runner) {
    const { look } = r;
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const legTop = y - look.legs;
    const torsoTop = legTop - look.torso;
    const headTop = torsoTop - 7;
    ctx.globalAlpha = r.stopped > 44 ? Math.max(0, 1 - (r.stopped - 44) / 12) : 1;
    px(x - 1, y, 8, 1, "rgba(0,0,0,.28)");
    // Legs (running: one reaches forward, one trails).
    const run = r.stopped === 0 && r.frame === 0;
    px(run ? x - 1 : x + 1, legTop, 2, look.legs, look.pants);
    px(run ? x + 5 : x + 4, legTop, 2, look.legs, look.pants);
    px(run ? x - 2 : x + 1, y - 1, run ? 3 : 2, 1, "#111111");
    px(run ? x + 5 : x + 4, y - 1, run ? 3 : 2, 1, "#111111");
    // Torso and arms.
    px(x, torsoTop, 7, look.torso, look.top);
    px(x, torsoTop + look.torso - 1, 7, 1, "rgba(0,0,0,.18)");
    if (run) {
      px(x - 2, torsoTop, 2, 2, look.top);
      px(x - 3, torsoTop + 1, 1, 2, look.skin);
      px(x + 7, torsoTop + 2, 1, 3, look.top);
    } else {
      px(x + 7, torsoTop + 1, 1, 3, look.top);
      px(x - 1, torsoTop + 1, 1, 3, look.top);
    }
    if (look.bag) { px(x + 6, torsoTop + 2, 3, 3, look.bag); px(x + 1, torsoTop, 1, 3, look.bag); }
    // Head 7x7, facing left: hair, forehead, eyes, worried mouth, chin.
    px(x + 1, headTop, 5, 1, look.hair);
    px(x, headTop + 1, 7, 2, look.hair);
    px(x, headTop + 3, 6, 4, look.skin);
    px(x + 6, headTop + 3, 1, look.longHair ? 7 : 3, look.hair);
    if (look.longHair) px(x, headTop + 3, 1, 1, look.hair);
    px(x + 1, headTop + 3, 1, 1, "#ffffff");
    px(x + 3, headTop + 3, 1, 1, "#ffffff");
    px(x + 1, headTop + 4, 1, 1, "#14100e");
    px(x + 3, headTop + 4, 1, 1, "#14100e");
    px(x + 1, headTop + 2, 2, 1, look.hair);
    px(x + 3, headTop + 2, 2, 1, look.hair);
    px(x + 1, headTop + 6, 2, 1, look.mouth);
    ctx.globalAlpha = 1;
  }

  function firefighter() {
    const { x, y } = fighter;
    const coat = "#1f2849";
    const wave = Math.floor(tick / 6) % 2;
    const legTop = y - 7;
    const torsoTop = legTop - 9;
    const headTop = torsoTop - 7;
    px(x - 2, y, 15, 1, "rgba(0,0,0,.3)");
    // Air tank on the back (right).
    px(x + 11, torsoTop + 1, 3, 9, "#9aa3ad");
    px(x + 11, torsoTop + 1, 1, 9, "#c4ccd4");
    // Legs, reflective bands, boots.
    px(x + 1, legTop, 4, 7, coat);
    px(x + 6, legTop, 4, 7, coat);
    px(x + 1, y - 3, 4, 1, "#d8f03a");
    px(x + 6, y - 3, 4, 1, "#d8f03a");
    px(x + 1, y - 2, 4, 1, "#b9bec4");
    px(x + 6, y - 2, 4, 1, "#b9bec4");
    px(x, y - 1, 5, 1, "#0c0c0c");
    px(x + 6, y - 1, 5, 1, "#0c0c0c");
    // Torso with yellow-grey-yellow reflective bands and belt.
    px(x, torsoTop, 11, 9, coat);
    px(x, torsoTop + 2, 11, 1, "#d8f03a");
    px(x, torsoTop + 3, 11, 1, "#b9bec4");
    px(x, torsoTop + 4, 11, 1, "#d8f03a");
    px(x, torsoTop + 7, 11, 1, "#0c0c0c");
    // Arm pointing towards the assembly point, lifting a pixel every half second; the other arm hangs down.
    const ay = torsoTop + 1 - wave;
    px(x - 11, ay, 11, 3, coat);
    px(x - 8, ay, 1, 3, "#d8f03a");
    px(x - 5, ay, 1, 3, "#d8f03a");
    px(x - 14, ay, 3, 3, "#0c0c0c");
    px(x - 17, ay + 1, 3, 1, "#0c0c0c");
    px(x + 10, torsoTop + 2, 2, 7, coat);
    // Head: helmet, glasses, shouting mouth.
    px(x + 1, headTop - 3, 8, 2, "#d8432b");
    px(x - 1, headTop - 1, 12, 2, "#ee5a35");
    px(x + 3, headTop - 3, 3, 2, "#ffd24a");
    px(x + 1, headTop + 1, 8, 6, "#e2a77f");
    px(x + 8, headTop + 1, 2, 6, "#14100e");
    for (const lx of [x + 1, x + 5]) {
      px(lx, headTop + 2, 3, 3, "#14100e");
      px(lx + 1, headTop + 3, 1, 1, "#cfe6f2");
    }
    px(x + 4, headTop + 3, 1, 1, "#14100e");
    px(x + 2, headTop + 6, 3, 1, "#8a2f2f");
    px(x, headTop + 2, 1, 4, "#e2a77f");
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    sky();
    building();
    smoke();
    ground();
    const actors: Array<{ y: number; draw: () => void }> = runners.map((r) => ({ y: r.y, draw: () => person(r) }));
    actors.push({ y: fighter.y, draw: firefighter });
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
      const scale = Math.max(3, Math.min(6, Math.round(cw / 150)));
      const w = Math.ceil(cw / scale);
      const h = Math.ceil(ch / scale);
      const mode: Mode = scope?.dataset.resolvedTheme === "light" ? "day" : "night";
      const key = `${w}x${h}:${mode}`;
      if (key === sceneKey) return;
      sceneKey = key;
      canvas.width = w;
      canvas.height = h;
      scene = createScene(ctx, w, h, mode);
      // Start mid-evacuation so the first frame already has people on the plaza.
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
  }, []);

  return <canvas ref={ref} className={className} width={1} height={1} aria-hidden="true" data-testid="login-pixel-scene" />;
}
