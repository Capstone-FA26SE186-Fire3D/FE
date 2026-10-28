import { blit, CIVILIAN_BODY, FIREFIGHTER, FIREFIGHTER_CHUBBY, FIREFIGHTER_CHUBBY_SHOULDER, FIREFIGHTER_SHOULDER, LEGS_RUN_A, LEGS_RUN_B, LEGS_STAND, shade } from "./sprites";

/*
 * The evacuation scene: a burning glass building, people running out of its door, a firefighter either pointing the way
 * to the assembly point or hosing the fire, a city skyline and trees behind, a wet plaza in front. Painted pixel-art
 * look: muted palette, no outlines, dithered gradients (checkerboard patterns) for haze, foliage and the ground, light
 * pools built from hard-edged bands. The sky is transparent so the page shows through.
 */

export type Mode = "night" | "day";
export type SceneOptions = {
  /** Horizontal centre of the building as a fraction of the width. */
  cx: number;
  /** What the firefighter does. */
  pose: "point" | "hose";
  /** Where people run: 1 right, -1 left. */
  direction: 1 | -1;
  truck: boolean;
  rain: boolean;
  /** Pixels kept free above the building (for a heading drawn over the sky). */
  headroom: number;
  /** Which firefighter: the slim one with glasses, or the chubby bare-faced one. */
  fighter: "glasses" | "chubby";
  /** Where the crowd's look sequence starts, so two scenes do not show the same people in the same order. */
  cast: number;
};

const PLAZA = 24;
const FLOOR = 26;
const GRAVITY = 0.09;

type Look = { hair: string; skin: string; top: string; pants: string; speed: number; longHair?: boolean; bag?: string; short?: boolean; mouth: string };
type Runner = { x: number; y: number; lane: number; look: Look; stopX: number; stopped: number; frame: number };
type Puff = { x: number; y: number; vx: number; vy: number; size: number; age: number; life: number; steam?: boolean };
type Ember = { x: number; y: number; age: number };
type Fire = { a: number; b: number; bottom: number; base: number; amp: number };
type Drop = { x: number; y: number; len: number; speed: number };
type Ripple = { x: number; y: number; age: number };
type Water = { x: number; y: number; vx: number; vy: number; age: number };
type Tree = { x: number; size: number; pine: boolean };

const PAL = {
  night: {
    glassA: [22, 44, 52], glassB: [86, 130, 134], slab: "#6d7c80", slabHi: "#a2b0aa", mullion: "rgba(18,34,38,.7)",
    plaza: "rgba(14,24,26,.74)", plazaDeep: "6,12,14", plazaLine: "rgba(230,228,178,.05)", edge: "rgba(230,228,178,.14)",
    haze: "70,120,130", hazeA: 0.1, bush: ["#1f3a2a", "#2c4e38"], leaf: ["#1a3326", "#27483a", "#3a6648", "#4f8058"], trunk: "#3a2e28",
    smoke: "112,118,112", steam: "190,206,210", pole: "#4a5256", rain: "230,228,178", rainA: 0.5, cream: "#e6e3b4",
    skyline: "#16222a", warm: "250,222,150", glow: 0.24, water: ["#dff3ff", "#8fc8e6", "#5f9fc4"],
  },
  day: {
    glassA: [104, 150, 164], glassB: [210, 232, 234], slab: "#8d9a9c", slabHi: "#c3ccc6", mullion: "rgba(80,112,122,.55)",
    plaza: "rgba(126,140,142,.34)", plazaDeep: "70,84,90", plazaLine: "rgba(255,255,255,.4)", edge: "rgba(52,66,72,.26)",
    haze: "255,244,220", hazeA: 0.16, bush: ["#4c8b5c", "#68a874"], leaf: ["#3f7a4e", "#56985f", "#78b878", "#a2d494"], trunk: "#6a5244",
    smoke: "96,102,104", steam: "240,244,246", pole: "#7b8587", rain: "150,172,186", rainA: 0.36, cream: "#f4efd0",
    skyline: "#c6d2d6", warm: "255,230,160", glow: 0.14, water: ["#ffffff", "#9fd4ee", "#5fb0dc"],
  },
} as const;

const FLAME = ["#f7ebb4", "#f3c26a", "#e0813e", "#a8433a"];
const INK = "#2a2433";
const EYE = "#f6f2ea";
const BLUSH = "rgba(226,110,110,.5)";

const LOOKS: Look[] = [
  { hair: "#cfcdc4", skin: "#ebbb98", top: "#b8606a", pants: "#8e8070", speed: 1, bag: "#80542e", mouth: "#a04e4a" },
  { hair: "#2a2226", skin: "#e6ad86", top: "#3a5684", pants: "#2a2d36", speed: 1.7, mouth: "#9a4442" },
  { hair: "#3a261c", skin: "#f1c7a4", top: "#efe9de", pants: "#6b83a3", speed: 1.5, longHair: true, bag: "#4a362a", mouth: "#b0554f" },
  { hair: "#4a3420", skin: "#dca37c", top: "#4b9166", pants: "#343846", speed: 1.3, short: true, mouth: "#a04e4a" },
  { hair: "#221c1c", skin: "#e4ac84", top: "#dba843", pants: "#454a56", speed: 1.6, mouth: "#9a4442" },
  { hair: "#563a28", skin: "#edc0a0", top: "#8468b0", pants: "#363c4a", speed: 1.3, longHair: true, mouth: "#b0554f" },
];

const FIRE_LEGEND = {
  R: "#d65a49", r: "#a8443a", Y: "#f0cf6a", S: "#e6ad86", s: "#c98f6c", G: INK, g: "#cfe4ee", K: INK,
  N: "#2a3358", n: "#1f2642", L: "#e3e58a", W: "#c9cdd0", A: "#9aa4a8", a: "#c4ccd0", b: BLUSH, M: "#a04e4a",
};

const hash = (n: number) => Math.abs((Math.sin(n * 12.9898) * 43758.5453) % 1);

export function createScene(ctx: CanvasRenderingContext2D, W: number, H: number, mode: Mode, o: SceneOptions) {
  const P = PAL[mode];
  const night = mode === "night";
  const GROUND = H - PLAZA;
  const floors = Math.max(2, Math.min(6, Math.floor((GROUND - o.headroom) / FLOOR)));
  const width = Math.max(72, Math.min(112, Math.round(W * 0.36)));
  const x0 = Math.max(8, Math.min(W - width - 8, Math.round(W * o.cx - width / 2)));
  const x1 = x0 + width;
  const doorX = x0 + Math.round(width * 0.42) - 7;
  const hose = o.pose === "hose";
  const topFloorTop = GROUND - floors * FLOOR;
  const fires: Fire[] = [{ a: x0 + 4, b: x1 - 4, bottom: topFloorTop + FLOOR - 3, base: 9, amp: 1 }];
  if (floors >= 4) fires.push({ a: x0 + Math.round(width * 0.55), b: x1 - 4, bottom: topFloorTop + FLOOR * 2 - 3, base: 6, amp: 0.7 });
  // The firefighter stands beside the door (pointing) or well right of the building (hosing); feet on the plaza.
  const chubby = o.fighter === "chubby";
  const fighterSprite = chubby ? FIREFIGHTER_CHUBBY : FIREFIGHTER;
  const fighterShoulder = chubby ? FIREFIGHTER_CHUBBY_SHOULDER : FIREFIGHTER_SHOULDER;
  const fighter = hose ? { x: Math.min(W - fighterSprite.w - 8, x1 + 34), y: GROUND + 10 } : { x: doorX + 30, y: GROUND + 10 };
  const assemblyX = o.direction === 1 ? Math.min(W - 22, x1 + 20) : Math.max(6, x0 - 36);
  const truckX = W - 46;
  const showTruck = o.truck && truckX > assemblyX + 24;
  // Sun / moon: top middle on a wide page (clear of the heading and the theme toggle), lower on a narrow one.
  // Sun / moon: above the firefighter on the banner (the copy sits on the left), top middle on a narrow sign-in page, else near the heading's end.
  const cel = hose ? { x: Math.round(W * 0.86), y: 12 } : o.cx >= 0.5 ? { x: Math.round(W * 0.5), y: 46 } : { x: Math.round(W * 0.44), y: 14 };
  const stars = Array.from({ length: 34 }, (_, i) => ({ x: Math.floor(hash(i + 1) * W), y: Math.floor(hash(i + 50) * (GROUND - 30)), phase: i % 5 }))
    .filter((s) => s.x > W * 0.55 || s.y > 46);
  const clouds = [{ x: W * 0.2, y: 50, w: 26, speed: 0.1 }, { x: W * 0.65, y: 62, w: 20, speed: 0.06 }, { x: W * 0.95, y: 46, w: 16, speed: 0.08 }];
  const rain: Drop[] = o.rain ? Array.from({ length: Math.round(W / 5) }, (_, i) => ({ x: Math.floor(hash(i + 90) * W), y: hash(i + 120) * H, len: 5 + Math.floor(hash(i + 150) * 6), speed: 3 + hash(i + 180) * 2.5 })) : [];
  const trees: Tree[] = [];
  for (let x = 14, i = 0; x < W - 10; i += 1) {
    const size = 14 + Math.floor(hash(i + 300) * 10);
    const clear = (x + size < x0 - 16 || x - size > x1 + 14) && Math.abs(x - assemblyX) > size + 8 && (!hose || Math.abs(x - fighter.x) > size + 10) && (!showTruck || x < truckX - size - 6);
    if (clear) trees.push({ x, size, pine: hash(i + 400) > 0.55 });
    x += size * 2 + 10 + Math.floor(hash(i + 500) * 30);
  }
  // Where the hose aims: the near edge of the top fire (the jet meets the glass there); launch speed from the ballistic path.
  const aim = { x: x1 - 1, y: fires[0].bottom - 7 };
  const nozzleFrom = { x: fighter.x - 10, y: fighter.y - 20 };
  const jetVx = -4.6;
  const jetT = Math.max(8, (nozzleFrom.x - aim.x) / -jetVx);
  const jetVy = (aim.y - nozzleFrom.y - 0.5 * GRAVITY * jetT * jetT) / jetT;
  const wet = new Float32Array(width);

  const runners: Runner[] = [];
  const puffs: Puff[] = [];
  const embers: Ember[] = [];
  const ripples: Ripple[] = [];
  const water: Water[] = [];
  const patterns = new Map<string, CanvasPattern>();
  let tick = 0;
  let next = 0;
  let lookIndex = o.cast;

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  /** Checkerboard fill at 25 / 50 / 75 % density: the dithered gradients of painted pixel art. */
  const dither = (x: number, y: number, w: number, h: number, color: string, level: 1 | 2 | 3) => {
    const key = `${color}/${level}`;
    let pattern = patterns.get(key);
    if (!pattern) {
      const tile = document.createElement("canvas");
      tile.width = 2;
      tile.height = 2;
      const t = tile.getContext("2d");
      if (!t) return;
      t.fillStyle = color;
      if (level === 1) t.fillRect(0, 0, 1, 1);
      else if (level === 2) { t.fillRect(0, 0, 1, 1); t.fillRect(1, 1, 1, 1); }
      else { t.fillRect(0, 0, 2, 2); t.clearRect(1, 0, 1, 1); }
      const created = ctx.createPattern(tile, "repeat");
      if (!created) return;
      pattern = created;
      patterns.set(key, pattern);
    }
    ctx.fillStyle = pattern;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  /** Soft light as four hard-edged ellipse bands, each a little stronger towards the centre. */
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
    const damp = f === fires[0] ? Math.max(0.2, 1 - wet[Math.max(0, Math.min(width - 1, c - x0))]) : 1;
    return Math.max(2, Math.round((f.base + f.amp * wave) * taper * damp));
  };

  function step() {
    tick += 1;
    if (tick >= next) {
      const look = LOOKS[lookIndex % LOOKS.length];
      lookIndex += 1;
      const lane = GROUND + 6 + ((lookIndex * 5) % (PLAZA - 12));
      const from = o.direction === 1 ? fighter.x + 26 : x0 - 16;
      const room = Math.max(12, Math.abs(assemblyX - from) - 8);
      const stopX = from + o.direction * ((lookIndex * 13) % room);
      runners.push({ x: doorX + 2 + (o.direction === 1 ? 6 : 0), y: GROUND + 5, lane, look, stopX, stopped: 0, frame: 0 });
      next = tick + 18 + ((lookIndex * 7) % 10);
    }
    for (const r of runners) {
      const left = (r.stopX - r.x) * o.direction;
      if (left > 0) {
        r.x += o.direction * Math.min(left, r.look.speed);
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
    for (const p of puffs) { p.x += p.vx; p.y += p.vy; p.age += 1; p.size += p.steam ? 0.16 : 0.1; }
    for (let i = puffs.length - 1; i >= 0; i -= 1) if (puffs[i].age > puffs[i].life) puffs.splice(i, 1);

    if (tick % 2 === 0) embers.push({ x: top.a + hash(tick + 3) * (top.b - top.a), y: top.bottom - 12, age: 0 });
    for (const e of embers) { e.y -= 0.9; e.x += Math.sin((e.age + e.x) * 0.7) * 0.6; e.age += 1; }
    for (let i = embers.length - 1; i >= 0; i -= 1) if (embers[i].age > 26) embers.splice(i, 1);
    for (const c of clouds) { c.x -= c.speed; if (c.x < -c.w) c.x = W + c.w; }

    rain.forEach((d, i) => {
      d.y += d.speed;
      if (d.y > H) { d.y = -d.len; d.x = Math.floor(hash(tick * 3 + i) * W); }
    });
    if (o.rain && tick % 2 === 0) ripples.push({ x: Math.floor(hash(tick * 3 + 1) * W), y: GROUND + 4 + Math.floor(hash(tick * 5 + 2) * (PLAZA - 8)), age: 0 });
    for (const r of ripples) r.age += 1;
    for (let i = ripples.length - 1; i >= 0; i -= 1) if (ripples[i].age > 9) ripples.splice(i, 1);

    if (hose) {
      for (let i = 0; i < 7; i += 1) {
        const j = hash(tick * 7 + i);
        water.push({ x: nozzleFrom.x + j * jetVx * 0.9, y: nozzleFrom.y + (j - 0.5) * 1.5, vx: jetVx + (j - 0.5) * 0.6, vy: jetVy + (hash(tick * 11 + i) - 0.5) * 0.45, age: 0 });
      }
      for (let i = water.length - 1; i >= 0; i -= 1) {
        const d = water[i];
        d.x += d.vx;
        d.y += d.vy;
        d.vy += GRAVITY;
        d.age += 1;
        const hitFace = d.x <= x1 + 1 && d.y < GROUND - 2;
        if (hitFace) {
          const f = fires[0];
          if (d.y > f.bottom - 22 && d.y < f.bottom + 2) {
            const c = Math.max(0, Math.min(width - 1, Math.round(d.x) - x0));
            for (let k = -4; k <= 4; k += 1) { const idx = c + k; if (idx >= 0 && idx < width) wet[idx] = Math.min(1, wet[idx] + 0.08 * (1 - Math.abs(k) / 5)); }
            if (tick % 2 === 0) puffs.push({ x: d.x + 2, y: d.y - 2, vx: 0.2 + hash(tick + i) * 0.3, vy: -0.7, size: 2, age: 0, life: 28, steam: true });
          } else if (tick % 3 === 0) {
            ripples.push({ x: Math.round(d.x) + 2, y: Math.round(d.y), age: 4 });
          }
          water.splice(i, 1);
        } else if (d.y >= GROUND + 2 || d.age > 80) {
          if (d.y >= GROUND + 2 && tick % 2 === 0) ripples.push({ x: Math.round(d.x), y: Math.min(H - 2, Math.round(d.y)), age: 0 });
          water.splice(i, 1);
        }
      }
      for (let c = 0; c < width; c += 1) wet[c] *= 0.975;
    }
  }

  function sky() {
    // Dithered haze above the horizon: warm by day, cool by night; stronger near the ground.
    for (let i = 0; i < 3; i += 1) dither(0, GROUND - 48 + i * 16, W, 16, `rgba(${P.haze},${P.hazeA})`, (i + 1) as 1 | 2 | 3);
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
      dither(x, c.y + 6, c.w, 2, "#cfdcdc", 2);
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

  /** Round or pine tree: trunk, stacked crowns in four greens with dithered edges and a lit upper-left side. */
  function tree(t: Tree) {
    const base = GROUND - 1;
    const s = t.size;
    px(t.x - 1, base - Math.round(s * 0.6), 3, Math.round(s * 0.6) + 1, P.trunk);
    if (t.pine) {
      const layers = 4;
      for (let l = 0; l < layers; l += 1) {
        const half = Math.round(s * 0.28 * (layers - l) / layers) + 2;
        const top = base - Math.round(s * 0.45) - l * Math.round(s * 0.36);
        const h = Math.round(s * 0.42);
        for (let r = 0; r < h; r += 1) {
          const w = Math.max(1, Math.round(half * 2 * (r + 2) / (h + 1)));
          px(t.x - Math.floor(w / 2), top + r, w, 1, P.leaf[1]);
          if (r > 1) dither(t.x - Math.floor(w / 2), top + r, Math.max(1, Math.floor(w / 2) - 1), 1, P.leaf[2], 2);
          px(t.x + Math.floor(w / 2) - 1, top + r, 1, 1, P.leaf[0]);
        }
      }
      return;
    }
    const crowns = [{ dx: 0, dy: -s * 0.95, r: s * 0.46 }, { dx: -s * 0.3, dy: -s * 0.62, r: s * 0.42 }, { dx: s * 0.32, dy: -s * 0.6, r: s * 0.4 }, { dx: 0, dy: -s * 0.5, r: s * 0.48 }];
    for (const c of crowns) {
      const r = Math.round(c.r);
      const cxp = Math.round(t.x + c.dx);
      const cyp = Math.round(base + c.dy);
      for (let dy = -r; dy <= r; dy += 1) {
        const half = Math.floor(Math.sqrt(r * r - dy * dy));
        px(cxp - half, cyp + dy, half * 2 + 1, 1, P.leaf[1]);
        if (dy < -r * 0.2) dither(cxp - half, cyp + dy, Math.max(1, half), 1, P.leaf[2], 2);
        if (dy < -r * 0.6) dither(cxp - Math.floor(half * 0.6), cyp + dy, Math.max(1, Math.floor(half * 0.6)), 1, P.leaf[3], 1);
        if (dy > r * 0.3) dither(cxp, cyp + dy, half + 1, 1, P.leaf[0], 2);
        px(cxp - half, cyp + dy, 1, 1, P.leaf[0]);
      }
    }
  }

  function glassColumn(u: number): string {
    const sh = Math.sin(Math.PI * u);
    const mix = (a: number, b: number) => Math.round(a + (b - a) * sh);
    return `rgb(${mix(P.glassA[0], P.glassB[0])},${mix(P.glassA[1], P.glassB[1])},${mix(P.glassA[2], P.glassB[2])})`;
  }

  function building() {
    for (let f = 0; f < floors; f += 1) {
      const top = GROUND - (f + 1) * FLOOR;
      for (let c = x0; c < x1; c += 1) {
        px(c, top + 2, 1, FLOOR - 2, glassColumn((c - x0) / width));
        if ((c - x0) % 9 === 0) px(c, top + 2, 1, FLOOR - 2, P.mullion);
      }
      dither(x0, top + FLOOR - 10, width, 8, night ? "rgba(8,22,26,.3)" : "rgba(40,84,100,.16)", 2);
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
      ctx.globalAlpha = Math.max(0, (p.steam ? 0.7 : 0.55) * (1 - p.age / p.life));
      const color = `rgb(${p.steam ? P.steam : P.smoke})`;
      px(p.x - s / 2, p.y - s / 2 + 1, s, Math.max(1, s - 2), color);
      px(p.x - s / 2 + 1, p.y - s / 2, Math.max(1, s - 2), s, color);
    }
    ctx.globalAlpha = 1;
  }

  function ground() {
    px(0, GROUND, W, PLAZA, P.plaza);
    px(0, GROUND, W, 1, P.edge);
    dither(0, GROUND + Math.round(PLAZA * 0.55), W, Math.round(PLAZA * 0.45), `rgba(${P.plazaDeep},.35)`, 2);
    dither(0, GROUND + PLAZA - 4, W, 4, `rgba(${P.plazaDeep},.45)`, 3);
    for (let x = 0; x < W; x += 16) px(x, GROUND + 1, 1, PLAZA - 1, P.plazaLine);
    if (night) {
      // Wet plaza: the lit glass, the door and the fire repeat as soft streaks.
      ctx.globalAlpha = 0.2;
      for (let c = x0 + 4; c < x1 - 3; c += 9) px(c, GROUND + 1, 2, 5, "#f6e2a0");
      for (let c = doorX + 1; c < doorX + 13; c += 2) px(c, GROUND + 1, 1, 4 + (c % 3), "#f0d9a0");
      ctx.globalAlpha = 0.2 + 0.08 * Math.sin(tick * 0.9);
      for (let c = fires[0].a + 1; c < fires[0].b; c += 3) px(c, GROUND + 1, 1, 3 + ((c + tick) % 6), "#e8924c");
      ctx.globalAlpha = 1;
    } else {
      dither(x0, GROUND + 1, width, 6, "rgba(255,190,120,.25)", 2);
    }

    // Bushes, lamps and the assembly-point sign.
    for (let x = 0; x < W; x += 9) {
      if (x + 10 > x0 - 4 && x < x1 + 4) continue;
      if (x + 10 > assemblyX - 6 && x < assemblyX + 12) continue;
      const h = 5 + Math.floor(hash(x) * 5);
      px(x, GROUND - h, 10, h, P.bush[0]);
      px(x + 1, GROUND - h - 1, 8, 1, P.bush[0]);
      dither(x + 2, GROUND - h - 2, 6, 3, P.bush[1], 2);
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
    const flashA = 0.07;
    ctx.globalAlpha = flashA;
    px(assemblyX - 40, GROUND, W - assemblyX + 40, PLAZA, flash ? "#f05048" : "#4a80f0");
    ctx.globalAlpha = 1;
  }

  function person(r: Runner) {
    const { look } = r;
    const legend = {
      H: look.hair, h: shade(look.hair, 0.72), S: look.skin, s: shade(look.skin, 0.8), E: EYE, K: INK, b: BLUSH, M: look.mouth,
      T: look.top, t: shade(look.top, 0.76), P: look.pants, p: shade(look.pants, 0.72), B: look.bag ?? look.top,
    };
    const flip = o.direction === 1;
    const legs = r.stopped > 0 ? LEGS_STAND : r.frame === 0 ? LEGS_RUN_A : LEGS_RUN_B;
    const legsH = look.short ? 4 : legs.h;
    const bodyH = look.short ? CIVILIAN_BODY.h - 2 : CIVILIAN_BODY.h;
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    ctx.globalAlpha = r.stopped > 44 ? Math.max(0, 1 - (r.stopped - 44) / 12) : 1;
    px(x - 1, y, 12, 1, "rgba(0,0,0,.2)");
    px(x, y + 1, 10, 1, "rgba(0,0,0,.1)");
    const top = y - legsH - bodyH;
    if (look.short) {
      blit(ctx, { w: CIVILIAN_BODY.w, h: bodyH, rows: [...CIVILIAN_BODY.rows.slice(0, 11), ...CIVILIAN_BODY.rows.slice(13)] }, legend, x, top, flip);
      blit(ctx, { w: legs.w, h: legsH, rows: [...legs.rows.slice(0, 2), ...legs.rows.slice(4)] }, legend, x, top + bodyH, flip);
    } else {
      blit(ctx, CIVILIAN_BODY, legend, x, top, flip);
      blit(ctx, legs, legend, x, top + bodyH, flip);
    }
    const side = (c: number) => x + (flip ? CIVILIAN_BODY.w - 1 - c : c);
    if (look.longHair) { px(side(9), top + 3, 1, 7, look.hair); px(side(8), top + 8, 1, 3, shade(look.hair, 0.72)); }
    if (look.bag) { px(side(8), top + 11, 1, 3, look.bag); px(side(7), top + 13, 3, 3, look.bag); px(side(7), top + 13, 3, 1, shade(look.bag, 0.75)); }
    ctx.globalAlpha = 1;
  }

  function firefighter() {
    const { x, y } = fighter;
    const flip = !hose;
    const top = y - fighterSprite.h;
    px(x - 2, y, fighterSprite.w + 4, 1, "rgba(0,0,0,.22)");
    px(x - 1, y + 1, fighterSprite.w + 2, 1, "rgba(0,0,0,.1)");
    blit(ctx, fighterSprite, FIRE_LEGEND, x, top, flip);
    const shoulderX = x + (flip ? fighterSprite.w - 1 - fighterShoulder.col : fighterShoulder.col);
    const shoulderY = top + fighterShoulder.row;
    if (!hose) {
      // Arm pointing to the assembly point, lifting a pixel every half second.
      const ay = shoulderY - (Math.floor(tick / 6) % 2);
      px(shoulderX, ay, 11, 3, FIRE_LEGEND.N);
      px(shoulderX, ay, 11, 1, "rgba(255,255,255,.1)");
      px(shoulderX + 4, ay, 1, 3, FIRE_LEGEND.L);
      px(shoulderX + 7, ay, 1, 3, FIRE_LEGEND.L);
      px(shoulderX + 11, ay, 3, 3, INK);
      px(shoulderX + 14, ay + 1, 3, 1, INK);
      return;
    }
    // Both arms along the jet direction, gloves at the end, brass nozzle; the hose trails behind and off the right edge.
    const len = Math.hypot(jetVx, jetVy);
    const ux = jetVx / len;
    const uy = jetVy / len;
    const armLen = 13;
    for (let i = 0; i <= armLen; i += 1) {
      const ax = shoulderX + ux * i;
      const ay = shoulderY + uy * i;
      const band = i === 5 || i === 9;
      const arm = chubby ? 4 : 3;
      px(ax, ay, arm, arm, i >= armLen - 2 ? INK : band ? FIRE_LEGEND.L : FIRE_LEGEND.N);
    }
    const nx = shoulderX + ux * (armLen + 2);
    const ny = shoulderY + uy * (armLen + 2);
    px(nx, ny, 3, 3, "#c89a4a");
    px(nx + ux * 2, ny + uy * 2, 2, 2, "#8a6a30");
    nozzleFrom.x = nx + ux * 3 + 1;
    nozzleFrom.y = ny + uy * 3 + 1;
    const hx0 = shoulderX + 6;
    const hy0 = shoulderY + 6;
    const hx1 = x + 12;
    const hy1 = GROUND + 12;
    const hx2 = W + 6;
    const hy2 = GROUND + 14;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const bx = (1 - t) * (1 - t) * hx0 + 2 * (1 - t) * t * hx1 + t * t * hx2;
      const by = (1 - t) * (1 - t) * hy0 + 2 * (1 - t) * t * hy1 + t * t * hy2;
      px(bx, by, 2, 2, "#c9473f");
      px(bx, by, 2, 1, "#e07060");
    }
  }

  function waterJet() {
    for (const d of water) {
      const i = d.age % 3;
      px(d.x, d.y, 2, 1, P.water[i]);
      px(d.x - d.vx * 0.5, d.y - d.vy * 0.5, 1, 1, P.water[i === 0 ? 1 : 2]);
      if (d.age > 4 && d.age % 2 === 0) px(d.x, d.y - 1, 1, 1, P.water[0]);
    }
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
    for (const t of trees) tree(t);
    building();
    smoke();
    ground();
    ripple();
    truck();
    const actors: Array<{ y: number; draw: () => void }> = runners.map((r) => ({ y: r.y, draw: () => person(r) }));
    actors.push({ y: fighter.y, draw: firefighter });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();
    if (hose) waterJet();
    rainFall();
  }

  return { step, draw };
}
