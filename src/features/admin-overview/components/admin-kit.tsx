"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { cn } from "@/utils/cn";

/** One headline figure. `value` null renders "—" (the server value is unavailable); `loading` shows a skeleton. */
export function KpiTile({ label, value, hint, tone, icon: Icon, badge, href, linkLabel, loading, className }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "warning" | "danger";
  icon?: LucideIcon;
  badge?: { label: string; tone: Tone };
  href?: string;
  linkLabel?: string;
  loading?: boolean;
  className?: string;
}) {
  return <div className={cn("adm-kpi", href && "adm-action-tile", className)} data-tone={tone}>
    <span className="adm-kpi-label">{Icon && <Icon size={16} aria-hidden="true" />}{href ? <strong>{label}</strong> : label}{badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}</span>
    {loading ? <span className="ops-skeleton adm-kpi-skeleton" role="status" aria-label={`Đang tải ${label}`} /> : value === null ? <p className="adm-kpi-unavailable" title="Chưa lấy được từ máy chủ">—</p> : <p className="adm-kpi-value">{value}</p>}
    {hint && <p className="adm-kpi-hint">{hint}</p>}
    {href && linkLabel && <Link className="adm-kpi-link" href={href}>{linkLabel}<ChevronRight size={14} aria-hidden="true" /></Link>}
  </div>;
}

export function KpiRow({ children, columns = 4, label }: { children: ReactNode; columns?: number; label?: string }) {
  return <div className="adm-kpis" style={{ "--cols": columns } as React.CSSProperties} role="group" aria-label={label}>{children}</div>;
}

/** Pill filter; `aria-pressed` toggles. Use for server-side filters in the URL or client-side tabs. */
export function Chip({ active, onClick, children, ...rest }: { active: boolean; onClick: () => void; children: ReactNode } & { "data-testid"?: string }) {
  return <button type="button" className="adm-chip" aria-pressed={active} onClick={onClick} {...rest}>{children}</button>;
}

export function Chips({ label, children }: { label: string; children: ReactNode }) {
  return <div className="adm-chips" role="group" aria-label={label}>{children}</div>;
}

/** Label/value rows with hairlines. */
export function Rows({ items }: { items: Array<{ label: string; value: ReactNode; left?: boolean }> }) {
  return <dl className="adm-rows">{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className={item.left ? "adm-left" : undefined}>{item.value}</dd></div>)}</dl>;
}
