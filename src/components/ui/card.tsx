import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[12px] border border-[var(--line)] bg-[var(--surface)]", className)} {...props} />;
}
