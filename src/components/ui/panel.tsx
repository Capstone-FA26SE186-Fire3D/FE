import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

export function Panel({ title, description, actions, children, className, bodyClassName, ...props }: Omit<HTMLAttributes<HTMLElement>, "title"> & { title?: string; description?: string; actions?: ReactNode; bodyClassName?: string }) {
  return <section className={cn("ops-panel", className)} {...props}>
    {(title || actions) && <header className="ops-panel-head"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions && <div className="ops-actions">{actions}</div>}</header>}
    <div className={cn("ops-panel-body", bodyClassName)}>{children}</div>
  </section>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="ops-stat"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}
