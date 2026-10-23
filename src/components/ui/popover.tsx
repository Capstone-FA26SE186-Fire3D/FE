"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { usePortalContainer } from "@/features/theme/theme-scope";
import { cn } from "@/utils/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

/** Floating panel anchored to its trigger. Portals into the theme scope so it inherits the ops tokens. */
export function PopoverContent({ className, sideOffset = 6, align = "start", collisionPadding = 12, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  const container = usePortalContainer();
  return <PopoverPrimitive.Portal container={container ?? undefined}>
    <PopoverPrimitive.Content className={cn("ops-popover", className)} sideOffset={sideOffset} align={align} collisionPadding={collisionPadding} {...props} />
  </PopoverPrimitive.Portal>;
}
