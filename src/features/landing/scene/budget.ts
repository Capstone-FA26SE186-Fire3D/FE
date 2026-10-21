/** Quality tiers and per-device budgets for the landing lab. Pure, no three.js import. */

export type Tier = "high" | "medium" | "low";
export const TIER_ORDER: readonly Tier[] = ["high", "medium", "low"];

export type Budget = {
  /** Skinned characters drawn at once (first N of OCCUPANTS). */
  characters: number;
  /** Smoke billboards in the single instanced draw. */
  smokePuffs: number;
  flames: number;
  /** Device-pixel-ratio ceiling for the main canvas. */
  dprCap: number;
  /** How often the phone screen is re-rendered, Hz. */
  phoneHz: number;
  /** Texture size of the phone render target (long edge). */
  phoneWidth: number;
};

export const BUDGETS: Record<Tier, Budget> = {
  high: { characters: 12, smokePuffs: 360, flames: 70, dprCap: 1.5, phoneHz: 60, phoneWidth: 1024 },
  medium: { characters: 8, smokePuffs: 220, flames: 45, dprCap: 1.25, phoneHz: 30, phoneWidth: 768 },
  low: { characters: 6, smokePuffs: 120, flames: 24, dprCap: 1, phoneHz: 20, phoneWidth: 512 },
};

export function initialTier(mobile: boolean, cores: number | undefined): Tier {
  if (mobile) return "medium";
  return (cores ?? 4) >= 8 ? "high" : "medium";
}

export function tierBelow(tier: Tier): Tier { return TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(tier) + 1)]; }

/**
 * Frames between animation updates for a character at `distance` metres. Near characters animate every frame,
 * far ones less often (the pose is smoothed by the mixer's own time, so stepping only coarsens sampling).
 */
export function animationInterval(distance: number, tier: Tier): number {
  const scale = tier === "high" ? 1 : tier === "medium" ? 1.25 : 1.6;
  if (distance < 10 * scale) return 1;
  if (distance < 22 * scale) return 2;
  return 4;
}

/** Dwell between automatic tier changes, so image quality does not flip back and forth. */
export const TIER_DWELL_MS = 8000;
