import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return <div className="ops-empty"><Icon size={28} strokeWidth={1.75} aria-hidden="true" /><h2 className="ops-empty-title">{title}</h2>{description && <p>{description}</p>}{action}</div>;
}
