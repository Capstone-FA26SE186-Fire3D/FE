"use client";

import { PixelScene } from "@/features/pixel-scene/pixel-scene";

/** The sign-in page's background: the evacuation scene (firefighter pointing the way, fire engine, rain) behind the card. */
export function PixelEvacuation({ className }: { className?: string }) {
  return <PixelScene variant="evacuation" className={className} testId="login-pixel-scene" />;
}
