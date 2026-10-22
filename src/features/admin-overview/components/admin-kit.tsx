"use client";

import { ChevronRight, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
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

/** Two-column master/detail grid. `queue` puts the narrow list on the left. */
export function Split({ children, queue }: { children: ReactNode; queue?: boolean }) {
  return <div className={cn("adm-split", queue && "adm-split--queue")}>{children}</div>;
}

/**
 * Inline detail pane (replaces a modal drawer): a named region next to the list. Scrolls into view on narrow screens,
 * where it stacks under the list. Without `open` it shows the placeholder so the layout does not jump.
 */
export function DetailPane({ open, label, title, subtitle, onClose, closeLabel = "Đóng", placeholder, children, headerExtra }: {
  open: boolean;
  label: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  placeholder?: { icon: LucideIcon; title: string; text: string };
  children?: ReactNode;
  headerExtra?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    if (window.matchMedia("(max-width: 1100px)").matches) ref.current.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open]);
  if (!open) {
    if (!placeholder) return null;
    const Icon = placeholder.icon;
    return <div className="adm-pane-placeholder"><Icon size={26} aria-hidden="true" /><strong>{placeholder.title}</strong><span>{placeholder.text}</span></div>;
  }
  return <section ref={ref} className="adm-pane" role="region" aria-label={label}>
    <div className="adm-pane-head">
      <div style={{ minWidth: 0 }}>{title && <h2>{title}</h2>}</div>
      <div className="ops-actions" style={{ flexWrap: "nowrap" }}>{headerExtra}{onClose && <Button size="icon" variant="ghost" onClick={onClose} aria-label={closeLabel}><X size={18} aria-hidden="true" /></Button>}</div>
    </div>
    {subtitle && <p className="adm-pane-sub">{subtitle}</p>}
    {children}
  </section>;
}

/** Label/value rows with hairlines. */
export function Rows({ items }: { items: Array<{ label: string; value: ReactNode; left?: boolean }> }) {
  return <dl className="adm-rows">{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className={item.left ? "adm-left" : undefined}>{item.value}</dd></div>)}</dl>;
}

export function PaneLoading({ label }: { label: string }) {
  return <SkeletonRows rows={5} label={label} />;
}
