import { MathUtils } from "three";

export function collapseBay(z: number) {
  return MathUtils.clamp(Math.floor((9 - z) / 6.5), 0, 3);
}

/** Roof/front first, then adjacent bays; lower floors follow their upper bay. */
export function bayFall(time: number, level: number, bay: number) {
  const start = 110 + bay * 7 + (2 - level) * 3;
  return MathUtils.smoothstep(time, start, start + 6);
}
