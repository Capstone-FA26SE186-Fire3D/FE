/*
 * Pixel sprites as rows of characters; each character is a key of a legend (colour), "." is transparent. Drawn facing
 * LEFT and mirrored at blit time when a figure faces right. Proportions follow painted pixel art (head about a quarter
 * of the height, broad chest, short legs) rather than chibi.
 */

export type Sprite = { w: number; h: number; rows: string[] };

const sprite = (rows: string[]): Sprite => ({ w: rows[0].length, h: rows.length, rows });

/**
 * Civilian head + torso (10 x 18). Legend: H hair, h hair shadow, S skin, s skin shadow, E eye white, K ink, b blush,
 * M mouth, T top, t top shadow, P pants, p pants shadow.
 */
export const CIVILIAN_BODY = sprite([
  "...HHHH...",
  "..HHHHHHh.",
  ".HHHHHHHHh",
  ".HhSSSSSHh",
  ".SSSSSSSsh",
  ".KESKESSs.",
  ".bSSSSSbs.",
  "..SMMSSs..",
  "...SSSs...",
  "..TTTTTT..",
  ".TTTTTTTt.",
  "TTTTTTTTTt",
  "TTTTTTTTTt",
  "TtTTTTTTtt",
  "StTTTTTTtS",
  ".TTTTTTTt.",
  ".PPPPPPPp.",
  ".PPPPPPPp.",
]);

/** Legs (10 x 6) under the civilian body: standing, and two running frames. */
export const LEGS_STAND = sprite([
  ".PPP..PPp.",
  ".PPP..PPp.",
  ".PPp..Ppp.",
  ".PPp..Ppp.",
  "KKKK..KKK.",
  "KKKK..KKK.",
]);
export const LEGS_RUN_A = sprite([
  "PPPP...PPp",
  "PPP....PPp",
  "PP......Pp",
  "PP.......p",
  "KKK.....KK",
  "KKK.....KK",
]);
export const LEGS_RUN_B = sprite([
  "..PPPPPP..",
  "..PPPPPp..",
  "..PPP.Pp..",
  "..PPP.pp..",
  "..KKK.KK..",
  "..KKK.KK..",
]);

/**
 * Firefighter (15 x 30), arms drawn separately by pose. Legend: R helmet, r helmet shadow, Y helmet shield, S skin,
 * s skin shadow, G glasses, g glasses glint, K ink / hair / boots, N coat, n coat shadow, L reflective band, W grey band,
 * A air tank, a tank highlight, b blush, M mouth.
 */
export const FIREFIGHTER = sprite([
  ".....RRRRR.....",
  "....RRRYYRR....",
  "...RRRRYYRRRr..",
  "..RRRRRRRRRRRr.",
  ".rrrrrrrrrrrrrr",
  "...SSSSSSSSKK..",
  "..GgGSSGgGSsKK.",
  "..GGGSSGGGSsK..",
  "...SSSSSSSSs...",
  "...SbSMMSSs....",
  "....SSSSSs.....",
  "...NNNNNNNNNA..",
  "..NNNNNNNNNNAa.",
  "..LLLLLLLLLLAa.",
  "..WWWWWWWWWWAa.",
  "..LLLLLLLLLLAa.",
  "..NNNNNNNNNNAa.",
  ".NNNNNNNNNNnAa.",
  ".NNNNNNNNNNnA..",
  ".nNNNNNNNNNn...",
  ".KKKKKKKKKKK...",
  ".NNNNNNNNNNn...",
  ".NNNNN.NNNNn...",
  ".NNNNN.NNNNn...",
  ".LLLLL.LLLLn...",
  ".WWWWW.WWWWn...",
  ".NNNNN.NNNNn...",
  ".nnnnn.nnnnn...",
  "KKKKKK.KKKKKK..",
  "KKKKKK.KKKKKK..",
]);
/** Shoulder of the firefighter (row, column from the sprite's left edge when facing left). */
export const FIREFIGHTER_SHOULDER = { col: 3, row: 13 };


/**
 * Chubby firefighter (17 x 31) of the overview banner: round face, rosy cheeks, smile, no glasses, broad coat and belly.
 * Same legend as FIREFIGHTER (the sign-in firefighter wears glasses; this one does not).
 */
export const FIREFIGHTER_CHUBBY = sprite([
  "......RRRRRR.....",
  "....RRRRYYYRRR...",
  "...RRRRRRRRRRRr..",
  "..rrrrrrrrrrrrrr.",
  "...SSSSSSSSSSKK..",
  "..SSSSSSSSSSSsK..",
  "..SEKSSEKSSSsK...",
  "..SbbSSSSSSbbsK..",
  "..SSSSMMMSSSsK...",
  "...sSSSSSSSSs....",
  ".....ssssss......",
  "...NNNNNNNNNNNAa.",
  "..NNNNNNNNNNNNAa.",
  ".NNNNNNNNNNNNNAa.",
  ".LLLLLLLLLLLLLAa.",
  ".WWWWWWWWWWWWWAa.",
  ".LLLLLLLLLLLLLAa.",
  "NNNNNNNNNNNNNNNAa",
  "NNNNNNNNNNNNNNNAa",
  "NNNNNNNNNNNNNNnA.",
  "nNNNNNNNNNNNNnn..",
  ".KKKKKKKKKKKKKK..",
  ".NNNNNNNNNNNNNn..",
  ".NNNNNN..NNNNNn..",
  ".NNNNNN..NNNNNn..",
  ".LLLLLL..LLLLLn..",
  ".WWWWWW..WWWWWn..",
  ".NNNNNN..NNNNNn..",
  ".nnnnnn..nnnnnn..",
  "KKKKKKK..KKKKKKK.",
  "KKKKKKK..KKKKKKK.",
]);
export const FIREFIGHTER_CHUBBY_SHOULDER = { col: 2, row: 13 };

export function blit(ctx: CanvasRenderingContext2D, sp: Sprite, legend: Record<string, string>, x: number, y: number, flip: boolean) {
  const bx = Math.round(x);
  const by = Math.round(y);
  for (let r = 0; r < sp.h; r += 1) {
    const row = sp.rows[r];
    for (let c = 0; c < sp.w; c += 1) {
      const key = row[c];
      if (key === ".") continue;
      const color = legend[key];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(bx + (flip ? sp.w - 1 - c : c), by + r, 1, 1);
    }
  }
}

/** Darkens a #rrggbb colour by `f` (0.8 = 20% darker). */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
