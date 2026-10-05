import type { CSSProperties } from "react";

export type IconsaxName = "message-question" | "archive-book" | "clock" | "send-2" | "user" | "buildings" | "arrow-left" | "logout";

export function Iconsax({ name, size = 20, className = "" }: { name: IconsaxName; size?: number; className?: string }) {
  return <span aria-hidden="true" className={`iconsax ${className}`} style={{ width: size, height: size, "--icon-url": `url(/icons/iconsax/${name}.svg)` } as CSSProperties} />;
}
