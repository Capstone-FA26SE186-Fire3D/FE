import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "ember" | "pending";

/** Status pill. Color is never the only signal: always pass a text label as children. */
export function StatusBadge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("ops-badge", className)} data-tone={tone} {...props} />;
}
