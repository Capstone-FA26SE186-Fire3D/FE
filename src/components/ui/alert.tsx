import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type AlertTone = "info" | "success" | "warning" | "danger";
const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert } as const;

/** Inline message at the point of action. Errors use role=alert, everything else role=status. */
export function Alert({ tone = "info", title, children, className, action }: { tone?: AlertTone; title?: string; children?: ReactNode; className?: string; action?: ReactNode }) {
  const Icon = icons[tone];
  return <div className={cn("ops-alert", className)} data-tone={tone} role={tone === "danger" ? "alert" : "status"}>
    <Icon size={18} aria-hidden="true" />
    <div>{title && <strong>{title}</strong>}{children && <p>{children}</p>}{action}</div>
  </div>;
}
