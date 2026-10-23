"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { usePortalContainer } from "@/features/theme/theme-scope";

/** One provider per shell: Radix shares the open delay and skips re-opening delays between neighbouring tooltips. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={200}>{children}</TooltipPrimitive.Provider>;
}

/**
 * Short hint on hover/focus. The child must accept a ref and be focusable (a button); a tooltip never carries
 * information that is not also available another way, so screen readers may skip it.
 */
export function Tooltip({ content, children, side = "top", disabled }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right"; disabled?: boolean }) {
  const container = usePortalContainer();
  if (disabled || !content) return <>{children}</>;
  return <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal container={container ?? undefined}>
      <TooltipPrimitive.Content className="ops-tooltip" side={side} sideOffset={6} collisionPadding={8}>{content}<TooltipPrimitive.Arrow className="ops-tooltip-arrow" width={10} height={5} /></TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>;
}
