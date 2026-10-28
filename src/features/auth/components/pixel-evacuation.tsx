"use client";

import { useEffect, useRef } from "react";

/*
 * Looping pixel scene behind the whole sign-in page: a firefighter points people out of a burning glass building towards the
 * assembly point while a fire engine flashes in the corner; the sign-in card floats in front of it. The canvas fills the
 * page and its sky is transparent, so the page background shows through: dark theme = night, light theme = day. The pixel
 * grid follows the page size (3-6 CSS px per pixel), so the scene is rebuilt, not stretched, when the page resizes.
 *
 * Style: soft, painterly pixel art (muted palette, no black outlines, light pools built from hard-edged bands, thin rain
 * streaks, rain ripples on the wet plaza). Drawn in code (no download), decorative only. With reduced motion it draws one
 * still frame; off screen or in a hidden tab it pauses.
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
type Drop = { x: number; y: number; len: number; speed: number };
type Ripple = { x: number; y: number; age: number };

const PAL = {
  night: {
    glassA: [22, 44, 52], glassB: [86, 130, 134], slab: "#6d7c80", slabHi: "#a2b0aa", mullion: "rgba(18,34,38,.7)",
    plaza: "rgba(14,24,26,.74)", plazaLine: "rgba(230,228,178,.05)", edge: "rgba(230,228,178,.14)",
    bush: ["#1f3a2a", "#2c4e38"], smoke: "112,118,112", pole: "#4a5256", rain: "230,228,178", rainA: 0.5, cream: "#e6e3b4",
    skyline: "#16222a", warm: "250,222,150", glow: 0.24,
  },
  day: {
    glassA: [104, 150, 164], glassB: [210, 232, 234], slab: "#8d9a9c", slabHi: "#c3ccc6", mullion: "rgba(80,112,122,.55)",
    plaza: "rgba(126,140,142,.34)", plazaLine: "rgba(255,255,255,.4)", edge: "rgba(52,66,72,.26)",
    bush: ["#4c8b5c", "#68a874"], smoke: "96,102,104", pole: "#7b8587", rain: "150,172,186", rainA: 0.36, cream: "#f4efd0",
    skyline: "#c6d2d6", warm: "255,230,160", glow: 0.14,
  },
} as const;

const FLAME = ["#f7ebb4", "#f3c26a", "#e0813e", "#a8433a"];
const INK = "#2a2433";

const LOOKS: Look[] = [
  { hair: "#cfcdc4", skin: "#ebbb98", top: "#b8606a", pants: "#8e8070", torso: 6, legs: 6, speed: 1, bag: "#80542e", mouth: "#a04e4a" },
  { hair: "#2a2226", skin: "#e6ad86", top: "#3a5684", pants: "#2a2d36", torso: 6, legs: 6, speed: 1.7, mouth: "#9a4442" },
  { hair: "#3a261c", skin: "#f1c7a4", top: "#efe9de", pants: "#6b83a3", torso: 6, legs: 6, speed: 1.5, longHair: true, bag: "#4a362a", mouth: "#b0554f" },
  { hair: "#4a3420", skin: "#dca37c", top: "#4b9166", pants: "#343846", torso: 5, legs: 4, speed: 1.3, mouth: "#a04e4a" },
  { hair: "#221c1c", skin: "#e4ac84", top: "#dba843", pants: "#454a56", torso: 6, legs: 6, speed: 1.6, mouth: "#9a4442" },
  { hair: "#563a28", skin: "#edc0a0", top: "#8468b0", pants: "#363c4a", torso: 6, legs: 6, speed: 1.3, longHair: true, mouth: "#b0554f" },
];

const hash = (n: number) => Math.abs((Math.sin(n * 12.9898) * 43758.5453) % 1);

function createScene(ctx: CanvasRenderingContext2D, W: number, H: number, mode: Mode, cx: number) {
  const P = PAL[mode];
  const night = mode === "night";
  const GROUND = H - PLAZA;
  const floors = Math.max(3, Math.min(6, Math.floor((GROUND - 52) / FLOOR)));
  const bw = Math.max(72, Math.min(112, Math.round(W * 0.36)));
  const x0 = Math.max(8, Math.round(W * cx - bw / 2));
  const x1 = x0 + bw;
  const width = bw;
  const doorX = x0 + Math.round(width * 0.42) - 7;
  const assemblyX = Math.min(W - 22, x1 + 20);
  const truckX = W - 46;
  const showTruck = truckX > assemblyX + 24;
  // Sun / moon: top middle on a wide page (clear of the heading and the theme toggle), lower on a narrow one.
  const cel = cx >= 0.5 ? { x: Math.round(W * 0.5), y: 46 } : { x: Math.round(W * 0.44), y: 14 };
  const topFloorTop = GROUND - floors * FLOOR;
  const fires: Fire[] = [{ a: x0 + 4, b: x1 - 4, bottom: topFloorTop + FLOOR - 3, base: 9, amp: 1 }];
  if (floors >= 4) fires.push({ a: x0 + Math.round(width * 0.55), b: x1 - 4, bottom: topFloorTop + FLOOR * 2 - 3, base: 6, amp: 0.7 });
  const fighter = { x: doorX + 30, y: GROUND + 9 };
  const stars = Array.from({ length: 34 }, (_, i) => ({ x: Math.floor(hash(i + 1) * W), y: Math.floor(hash(i + 50) * (GROUND - 30)), phase: i % 5 }))
    .filter((s) => s.x > W * 0.55 || s.y > 46);
  // Below the heading (it ends around row 40), so a cloud never passes behind the text.
  const clouds = [{ x: W * 0.2, y: 50, w: 26, speed: 0.1 }, { x: W * 0.65, y: 62, w: 20, speed: 0.06 }, { x: W * 0.95, y: 46, w: 16, speed: 0.08 }];
  const rain: Drop[] = Array.from({ length: Math.round(W / 5) }, (_, i) => ({ x: Math.floor(hash(i + 90) * W), y: hash(i + 120) * H, len: 5 + Math.floor(hash(i + 150) * 6), speed: 3 + hash(i + 180) * 2.5 }));
  const ripples: Ripple[] = [];

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

  /** Soft light as four hard-edged ellipse bands (the painted-glow look of pixel art), each a little stronger towards the centre. */
  const pool = (px0: number, py0: number, rx: number, ry: number, rgb: string, strength: number) => {
    ctx.fillStyle = `rgba(${rgb},${(strength / 2.4).toFixed(3)})`;
    for (const f of [1, 0.74, 0.5, 0.28]) {
      const r1 = Math.max(1, Math.round(rx * f));
      const r2 = Math.max(1, Math.round(ry * f));
      for (let dy = -r2; dy <= r2; dy += 1) {
        const half = Math.floor(r1 * Math.sqrt(1 - (dy * dy) / (r2 * r2)));
        ctx.fillRect(Math.round(px0) - half, Math.round(py0) + dy, half * 2 + 1, 1);
      }
    }
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
      const from = fighter.x + 24;
      const room = Math.max(12, assemblyX - 6 - from);
      runners.push({ x: doorX + 8, y: GROUND + 5, lane, look, stopX: from + ((lookIndex * 13) % room), stopped: 0, frame: 0 });
      next = tick + 16 + ((lookIndex * 7) % 10);
    }
    for (const r of runners) {
      if (r.x < r.stopX) {
        r.x = Math.min(r.stopX, r.x + r.look.speed);
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

    rain.forEach((d, i) => {
      d.y += d.speed;
      if (d.y > H) { d.y = -d.len; d.x = Math.floor(hash(tick * 3 + i) * W); }
    });
    if (tick % 2 === 0) ripples.push({ x: Math.floor(hash(tick * 3 + 1) * W), y: GROUND + 4 + Math.floor(hash(tick * 5 + 2) * (PLAZA - 8)), age: 0 });
    for (const r of ripples) r.age += 1;
    for (let i = ripples.length - 1; i >= 0; i -= 1) if (ripples[i].age > 9) ripples.splice(i, 1);
  }

  function sky() {
    const dy = cel.y - 14;
    if (night) {
      for (const s of stars) if ((tick + s.phase * 3) % 16 < 13) px(s.x, s.y, 1, 1, s.phase === 0 ? P.cream : "#8d9a96");
      const mx = cel.x - 2;
      pool(mx + 2, 14 + dy, 13, 13, "230,228,178", 0.2);
      px(mx, 11 + dy, 5, 1, P.cream);
      px(mx - 1, 12 + dy, 7, 5, P.cream);
      px(mx, 17 + dy, 5, 1, P.cream);
      ctx.clearRect(mx + 3, 12 + dy, 4, 5);
      return;
    }
    const sx = cel.x;
    pool(sx, 14 + dy, 14, 14, "255,222,130", 0.5 + 0.1 * Math.sin(tick * 0.4));
    px(sx - 3, 8 + dy, 7, 1, "#f2c24a");
    px(sx - 5, 9 + dy, 11, 1, "#f2c24a");
    px(sx - 6, 10 + dy, 13, 9, "#f2c24a");
    px(sx - 5, 19 + dy, 11, 1, "#f2c24a");
    px(sx - 3, 20 + dy, 7, 1, "#f2c24a");
    px(sx - 3, 11 + dy, 5, 4, "#f8dc84");
    for (const c of clouds) {
      const x = Math.round(c.x);
      px(x + 3, c.y, c.w - 8, 3, "#eef3f2");
      px(x, c.y + 3, c.w, 3, "#eef3f2");
      px(x + 5, c.y - 2, Math.round(c.w / 2), 2, "#eef3f2");
      px(x, c.y + 6, c.w, 1, "#cfdcdc");
    }
  }

  function skyline() {
    for (let x = -4, i = 0; x < W; i += 1) {
      const w = 10 + Math.floor(hash(i + 7) * 10);
      const h = 14 + Math.floor(hash(i + 31) * 30);
      ctx.globalAlpha = night ? 0.92 : 0.78;
      px(x, GROUND - h, w, h, P.skyline);
      px(x + 1, GROUND - h - 1, w - 2, 1, P.skyline);
      ctx.globalAlpha = 1;
      for (let wy = GROUND - h + 3; wy < GROUND - 3; wy += 5) {
        for (let wx = x + 2; wx < x + w - 2; wx += 4) {
          if (hash(wx * 5 + wy * 3) > 0.6) px(wx, wy, 2, 2, night ? ((wx + wy) % 3 === 0 ? "#e8d28c" : "#5f7c82") : "#eaf1f1");
        }
      }
      x += w + 2;
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
      px(x0, top + FLOOR - 9, width, 7, night ? "rgba(8,22,26,.16)" : "rgba(40,84,100,.09)");
      for (let c = x0 + 4; c < x1 - 3; c += 9) {
        const lit = hash(c * 3 + f * 17) > 0.45;
        if (night && lit) { px(c, top + 6, 2, 8, "rgba(246,226,160,.8)"); px(c, top + 14, 2, 3, "rgba(246,226,160,.35)"); }
        if (!night && lit) { px(c, top + 5, 1, 6, "rgba(255,255,255,.55)"); px(c + 1, top + 8, 1, 4, "rgba(255,255,255,.32)"); }
      }
      px(x0 + 3, top + FLOOR - 6, width - 6, 1, night ? "rgba(246,226,160,.14)" : "rgba(255,255,255,.4)");
      px(x0 - 2, top, width + 4, 2, P.slab);
      px(x0 - 1, top, width + 2, 1, P.slabHi);
    }
    px(x0 - 2, GROUND - 2, width + 4, 2, P.slab);
    px(x0 - 1, GROUND - 2, width + 2, 1, P.slabHi);
    px(x0 + 6, topFloorTop - 5, 12, 5, P.slab);
    px(x0 + 7, topFloorTop - 4, 10, 1, P.slabHi);

    // Fire: long, undulating strips inside the floors, tongues licking above the slab, painted light around them.
    const flicker = 0.85 + 0.15 * Math.sin(tick * 0.9);
    for (const f of fires) {
      const floorTop = f.bottom - FLOOR + 3;
      ctx.globalAlpha = 0.34;
      px(f.a, floorTop + 3, f.b - f.a, FLOOR - 6, "#e8924c");
      ctx.globalAlpha = 1;
      px(f.a, f.bottom - 2, f.b - f.a, 2, "#8a3a2c");
    }
    for (const t of [0.22, 0.5, 0.78]) pool(x0 + width * t, fires[0].bottom - 8, width * 0.34, 22, "255,170,84", P.glow * flicker);
    for (const f of fires) {
      for (let c = f.a; c < f.b; c += 1) {
        const h = flameHeight(c, f);
        for (let i = 0; i < h; i += 1) {
          const ratio = i / h;
          if (ratio > 0.74 && (c * 7 + i * 3 + tick) % 9 === 0) continue;
          const u = ratio + (((c + i) & 1) === 0 ? 0.07 : -0.07);
          px(c, f.bottom - 3 - i, 1, 1, u < 0.28 ? FLAME[0] : u < 0.52 ? FLAME[1] : u < 0.76 ? FLAME[2] : FLAME[3]);
        }
      }
    }
    for (const e of embers) px(e.x, e.y, 1, 1, e.age % 4 < 2 ? "#f6d27a" : "#e48a42");

    // Door with the green exit sign.
    px(doorX - 1, GROUND - 25, 16, 23, "#34454a");
    px(doorX, GROUND - 24, 14, 22, night ? "#f0d9a0" : "#cfe4e8");
    px(doorX + 1, GROUND - 23, 5, 20, night ? "#fbeac2" : "#e6f2f4");
    px(doorX + 8, GROUND - 23, 5, 20, night ? "#fbeac2" : "#e6f2f4");
    px(doorX + 6, GROUND - 24, 2, 22, "#34454a");
    px(doorX + 2, GROUND - 31, 10, 5, "#2a9a58");
    px(doorX + 4, GROUND - 30, 1, 1, "#f4f7f2");
    px(doorX + 5, GROUND - 29, 2, 1, "#f4f7f2");
    px(doorX + 7, GROUND - 30, 1, 2, "#f4f7f2");
    px(doorX + 9, GROUND - 29, 1, 1, "#f4f7f2");
    if (night) pool(doorX + 7, GROUND - 14, 14, 18, P.warm, 0.22);
  }

  function smoke() {
    for (const p of puffs) {
      const s = Math.round(p.size);
      ctx.globalAlpha = Math.max(0, 0.55 * (1 - p.age / p.life));
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
      // Wet plaza: the lit glass, the door and the fire repeat as soft streaks.
      ctx.globalAlpha = 0.2;
      for (let c = x0 + 4; c < x1 - 3; c += 9) px(c, GROUND + 1, 2, 5, "#f6e2a0");
      for (let c = doorX + 1; c < doorX + 13; c += 2) px(c, GROUND + 1, 1, 4 + (c % 3), "#f0d9a0");
      ctx.globalAlpha = 0.2 + 0.08 * Math.sin(tick * 0.9);
      for (let c = fires[0].a + 1; c < fires[0].b; c += 3) px(c, GROUND + 1, 1, 3 + ((c + tick) % 6), "#e8924c");
      ctx.globalAlpha = 1;
    }

    // Bushes, lamps and the assembly-point sign.
    for (let x = 0; x < W; x += 9) {
      if (x + 10 > x0 - 4 && x < x1 + 4) continue;
      if (x + 10 > assemblyX - 6 && x < assemblyX + 12) continue;
      const h = 5 + Math.floor(hash(x) * 5);
      px(x, GROUND - h, 10, h, P.bush[0]);
      px(x + 1, GROUND - h - 1, 8, 1, P.bush[0]);
      px(x + 2, GROUND - h - 2, 6, 1, P.bush[1]);
    }
    for (const lx of [x0 - 12, x1 + 8]) {
      if (night) pool(lx, GROUND - 18, 10, 9, P.warm, 0.3);
      px(lx, GROUND - 20, 1, 20, P.pole);
      px(lx - 1, GROUND - 22, 3, 2, night ? "#fbefc4" : P.pole);
    }
    px(assemblyX + 6, GROUND - 24, 1, 24, P.pole);
    px(assemblyX - 1, GROUND - 36, 15, 12, "#2a9a58");
    px(assemblyX, GROUND - 35, 13, 10, "#35b06a");
    for (const [hx, hy] of [[1, 33], [5, 34], [9, 33]] as const) {
      px(assemblyX + hx + 1, GROUND - hy, 1, 1, "#f4f7f2");
      px(assemblyX + hx, GROUND - hy + 1, 3, 4, "#f4f7f2");
    }
  }

  function ripple() {
    for (const r of ripples) {
      const rx = 1 + r.age * 0.7;
      const ry = Math.max(1, rx / 3);
      ctx.globalAlpha = 0.34 * (1 - r.age / 9);
      for (let a = 0; a < 12; a += 1) {
        const t = (a / 12) * Math.PI * 2;
        px(r.x + Math.round(Math.cos(t) * rx), r.y + Math.round(Math.sin(t) * ry), 1, 1, night ? P.cream : "#ffffff");
      }
    }
    ctx.globalAlpha = 1;
  }

  function truck() {
    if (!showTruck) return;
    const tx = truckX;
    const ty = H - 5;
    const flash = Math.floor(tick / 3) % 2 === 0;
    pool(tx + 6, ty - 16, 30, 24, flash ? "255,80,70" : "80,140,255", 0.26);
    px(tx - 1, ty - 4, 44, 1, "rgba(0,0,0,.24)");
    px(tx + 10, ty - 15, 32, 11, "#c9473f");
    px(tx, ty - 12, 13, 8, "#d9594f");
    px(tx + 1, ty - 11, 5, 3, "#bcd8e0");
    px(tx + 7, ty - 11, 4, 3, "#bcd8e0");
    px(tx, ty - 8, 42, 1, "#f1ecde");
    px(tx + 14, ty - 13, 1, 8, "#9c342d");
    px(tx + 24, ty - 13, 1, 8, "#9c342d");
    px(tx + 33, ty - 13, 1, 8, "#9c342d");
    px(tx + 11, ty - 18, 30, 1, "#c4cacc");
    for (let r = tx + 13; r < tx + 40; r += 3) px(r, ty - 17, 1, 2, "#c4cacc");
    px(tx + 3, ty - 15, 6, 2, flash ? "#f45a50" : "#4a86f0");
    px(tx + 4, ty - 16, 4, 1, flash ? "#fbc4be" : "#c4d8fb");
    px(tx - 1, ty - 5, 2, 2, "#f6e8b8");
    for (const wx of [tx + 4, tx + 31]) {
      px(wx, ty - 5, 6, 5, "#20262a");
      px(wx + 2, ty - 3, 2, 2, "#9aa4a6");
    }
  }

  function flashLight() {
    if (!showTruck) return;
    const flash = Math.floor(tick / 3) % 2 === 0;
    ctx.globalAlpha = 0.07;
    px(assemblyX - 40, GROUND, W - assemblyX + 40, PLAZA, flash ? "#f05048" : "#4a80f0");
    ctx.globalAlpha = 1;
  }

  function person(r: Runner) {
    const { look } = r;
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const legTop = y - look.legs;
    const torsoTop = legTop - look.torso;
    const headTop = torsoTop - 7;
    // Sprites are drawn facing left; they run right (towards the assembly point), so mirror about their own centre.
    ctx.save();
    ctx.translate(2 * x + 7, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = r.stopped > 44 ? Math.max(0, 1 - (r.stopped - 44) / 12) : 1;
    px(x - 1, y, 9, 1, "rgba(0,0,0,.2)");
    px(x, y + 1, 7, 1, "rgba(0,0,0,.1)");
    // Legs (running: one reaches forward, one trails).
    const run = r.stopped === 0 && r.frame === 0;
    px(run ? x - 1 : x + 1, legTop, 2, look.legs, look.pants);
    px(run ? x + 5 : x + 4, legTop, 2, look.legs, look.pants);
    px(run ? x - 2 : x + 1, y - 1, run ? 3 : 2, 1, INK);
    px(run ? x + 5 : x + 4, y - 1, run ? 3 : 2, 1, INK);
    // Torso and arms, lit from the left.
    px(x, torsoTop, 7, look.torso, look.top);
    px(x, torsoTop, 1, look.torso, "rgba(255,255,255,.14)");
    px(x + 6, torsoTop, 1, look.torso, "rgba(0,0,0,.16)");
    px(x, torsoTop + look.torso - 1, 7, 1, "rgba(0,0,0,.14)");
    if (run) {
      px(x - 2, torsoTop, 2, 2, look.top);
      px(x - 3, torsoTop + 1, 1, 2, look.skin);
      px(x + 7, torsoTop + 2, 1, 3, look.top);
    } else {
      px(x + 7, torsoTop + 1, 1, 3, look.top);
      px(x - 1, torsoTop + 1, 1, 3, look.top);
    }
    if (look.bag) { px(x + 6, torsoTop + 2, 3, 3, look.bag); px(x + 1, torsoTop, 1, 3, look.bag); }
    // Head 7x7, facing left: rounded, hair, eyes, blush, worried mouth.
    px(x + 1, headTop, 5, 1, look.hair);
    px(x, headTop + 1, 7, 2, look.hair);
    px(x, headTop + 3, 6, 3, look.skin);
    px(x + 1, headTop + 6, 4, 1, look.skin);
    px(x + 6, headTop + 3, 1, look.longHair ? 7 : 3, look.hair);
    if (look.longHair) px(x, headTop + 3, 1, 1, look.hair);
    px(x + 1, headTop + 3, 1, 1, "#f6f2ea");
    px(x + 3, headTop + 3, 1, 1, "#f6f2ea");
    px(x + 1, headTop + 4, 1, 1, INK);
    px(x + 3, headTop + 4, 1, 1, INK);
    px(x + 1, headTop + 2, 2, 1, look.hair);
    px(x + 3, headTop + 2, 2, 1, look.hair);
    px(x, headTop + 5, 1, 1, "rgba(226,110,110,.5)");
    px(x + 4, headTop + 5, 1, 1, "rgba(226,110,110,.5)");
    px(x + 1, headTop + 6, 2, 1, look.mouth);
    ctx.restore();
  }

  function firefighter() {
    const { x, y } = fighter;
    const coat = "#2a3358";
    const wave = Math.floor(tick / 6) % 2;
    const legTop = y - 7;
    const torsoTop = legTop - 9;
    const headTop = torsoTop - 7;
    ctx.save();
    ctx.translate(2 * x + 11, 0);
    ctx.scale(-1, 1);
    px(x - 2, y, 15, 1, "rgba(0,0,0,.22)");
    px(x - 1, y + 1, 13, 1, "rgba(0,0,0,.1)");
    // Air tank on the back.
    px(x + 11, torsoTop + 1, 3, 9, "#9aa4a8");
    px(x + 11, torsoTop + 1, 1, 9, "#c4ccd0");
    // Legs, reflective bands, boots.
    px(x + 1, legTop, 4, 7, coat);
    px(x + 6, legTop, 4, 7, coat);
    px(x + 1, y - 3, 4, 1, "#e3e58a");
    px(x + 6, y - 3, 4, 1, "#e3e58a");
    px(x + 1, y - 2, 4, 1, "#c9cdd0");
    px(x + 6, y - 2, 4, 1, "#c9cdd0");
    px(x, y - 1, 5, 1, INK);
    px(x + 6, y - 1, 5, 1, INK);
    // Torso with yellow-grey-yellow reflective bands and belt, lit from the left.
    px(x, torsoTop, 11, 9, coat);
    px(x, torsoTop, 1, 9, "rgba(255,255,255,.12)");
    px(x + 10, torsoTop, 1, 9, "rgba(0,0,0,.18)");
    px(x, torsoTop + 2, 11, 1, "#e3e58a");
    px(x, torsoTop + 3, 11, 1, "#c9cdd0");
    px(x, torsoTop + 4, 11, 1, "#e3e58a");
    px(x, torsoTop + 7, 11, 1, INK);
    // Arm pointing towards the assembly point, lifting a pixel every half second; the other arm hangs down.
    const ay = torsoTop + 1 - wave;
    px(x - 11, ay, 11, 3, coat);
    px(x - 11, ay, 11, 1, "rgba(255,255,255,.1)");
    px(x - 8, ay, 1, 3, "#e3e58a");
    px(x - 5, ay, 1, 3, "#e3e58a");
    px(x - 14, ay, 3, 3, INK);
    px(x - 17, ay + 1, 3, 1, INK);
    px(x + 10, torsoTop + 2, 2, 7, coat);
    // Head: helmet, glasses, shouting mouth.
    px(x + 1, headTop - 3, 8, 2, "#d65a49");
    px(x - 1, headTop - 1, 12, 2, "#e87a5a");
    px(x + 3, headTop - 3, 3, 2, "#f0cf6a");
    px(x + 1, headTop + 1, 8, 6, "#e6ad86");
    px(x + 8, headTop + 1, 2, 6, INK);
    for (const lx of [x + 1, x + 5]) {
      px(lx, headTop + 2, 3, 3, INK);
      px(lx + 1, headTop + 3, 1, 1, "#cfe4ee");
    }
    px(x + 4, headTop + 3, 1, 1, INK);
    px(x + 2, headTop + 5, 1, 1, "rgba(226,110,110,.5)");
    px(x + 2, headTop + 6, 3, 1, "#a04e4a");
    px(x, headTop + 2, 1, 4, "#e6ad86");
    ctx.restore();
  }

  function rainFall() {
    ctx.fillStyle = `rgba(${P.rain},${P.rainA})`;
    for (const d of rain) ctx.fillRect(d.x, Math.round(d.y), 1, d.len);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    sky();
    skyline();
    building();
    smoke();
    ground();
    ripple();
    truck();
    flashLight();
    const actors: Array<{ y: number; draw: () => void }> = runners.map((r) => ({ y: r.y, draw: () => person(r) }));
    actors.push({ y: fighter.y, draw: firefighter });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();
    rainFall();
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
      const scale = Math.max(3, Math.min(6, Math.floor(Math.min(cw / 260, ch / 170))));
      const w = Math.ceil(cw / scale);
      const h = Math.ceil(ch / scale);
      const mode: Mode = scope?.dataset.resolvedTheme === "light" ? "day" : "night";
      const cx = cw >= 960 ? 0.27 : 0.5;
      const key = `${w}x${h}:${mode}:${cx}`;
      if (key === sceneKey) return;
      sceneKey = key;
      canvas.width = w;
      canvas.height = h;
      scene = createScene(ctx, w, h, mode, cx);
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
