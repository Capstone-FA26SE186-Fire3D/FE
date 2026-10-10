export type ScenePalette = {
  clear: number;
  gridMajor: number;
  gridMinor: number;
  floorPlane: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  spawn: number;
  fire: number;
  smoke: number;
  wind: number;
  other: number;
  selected: number;
  fallbackModel: number;
};

/** Mirrors the ops theme tokens (--bg, --success, --ember, --info). Values only change with the resolved theme. */
export const PALETTES: Record<"light" | "dark", ScenePalette> = {
  dark: {
    clear: 0x111517, gridMajor: 0x405054, gridMinor: 0x263136, floorPlane: 0x7fb7ff,
    hemiSky: 0xe8f4f0, hemiGround: 0x182022, hemiIntensity: 2.2, sun: 0xffd4bb, sunIntensity: 2.4,
    spawn: 0x5fd08a, fire: 0xee8654, smoke: 0x9aa5a8, wind: 0x7fb7ff, other: 0xf2c14e, selected: 0xffffff, fallbackModel: 0x6d7a7e,
  },
  light: {
    clear: 0xe6eaec, gridMajor: 0x9aa5a8, gridMinor: 0xc5ced1, floorPlane: 0x1b5fb4,
    hemiSky: 0xffffff, hemiGround: 0xaab4b7, hemiIntensity: 2.6, sun: 0xfff1e6, sunIntensity: 2.0,
    spawn: 0x1f7a45, fire: 0xc4501a, smoke: 0x6d7a7e, wind: 0x1b5fb4, other: 0x8a5a00, selected: 0x171b1d, fallbackModel: 0x8c989c,
  },
};
