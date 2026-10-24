"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Animation entry point for the operations area. Components import `m`/`AnimatePresence` from here and never the
 * full `motion` export: `LazyMotion` loads the DOM animation features in their own chunk, so every ops page ships the
 * ~5 kB `m` runtime instead of the whole library. `strict` throws in development if a `motion.*` element slips in.
 */
export { m, AnimatePresence, LayoutGroup, useReducedMotion } from "motion/react";

const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures} strict>
    <MotionConfig reducedMotion="user">{children}</MotionConfig>
  </LazyMotion>;
}

/** Shared timings so modal, drawer, tabs, toast and reveals feel like one system (transitions.dev "spring pop" family). */
export const presets = {
  spring: { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const,
  softSpring: { type: "spring", stiffness: 300, damping: 32 } as const,
  fade: { duration: 0.18, ease: "easeOut" } as const,
  reveal: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] } as const,
};
