import { MathUtils } from "three";

export type ReactionKind = "panic" | "cough" | null;

/** Authored, non-graphic demo beats; not a smoke exposure or injury simulation. */
export function sampleReaction(elapsed: number, start: number, kind: ReactionKind) {
  const duration = kind ? 6 : 0;
  const age = elapsed - start;
  const held = MathUtils.clamp(age, 0, duration);
  const weight = kind
    ? MathUtils.smoothstep(age, 0, .7) * (1 - MathUtils.smoothstep(age, duration - 1, duration))
    : 0;
  return { travelTime: elapsed - held, weight, age, duration };
}
