"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTopbarSlot } from "@/features/theme/topbar-slot";

export type Crumb = { label: string; href?: string };

/** Inside the operations shell the breadcrumb lives in the topbar; elsewhere it renders inline above the title. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const slot = useTopbarSlot();
  const nav = <nav className="ops-breadcrumb" aria-label="Đường dẫn"><ol>
    {items.map((item, index) => {
      const last = index === items.length - 1;
      return <li key={`${item.label}-${index}`}>
        {item.href && !last ? <Link href={item.href}>{item.label}</Link> : <span aria-current={last ? "page" : undefined}>{item.label}</span>}
        {!last && <ChevronRight size={14} aria-hidden="true" />}
      </li>;
    })}
  </ol></nav>;
  return slot ? createPortal(nav, slot) : nav;
}

export function PageHeader({ title, description, eyebrow, breadcrumbs, actions }: { title: string; description?: string; /** Small uppercase label above the title (e.g. "CÔNG TRÌNH"). */ eyebrow?: string; breadcrumbs?: Crumb[]; actions?: ReactNode }) {
  return <>
    {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
    <header className="ops-page-header"><div>{eyebrow && <p className="ops-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="ops-actions">{actions}</div>}</header>
  </>;
}
