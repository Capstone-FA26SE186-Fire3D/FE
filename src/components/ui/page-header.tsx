import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return <nav className="ops-breadcrumb" aria-label="Đường dẫn"><ol>
    {items.map((item, index) => {
      const last = index === items.length - 1;
      return <li key={`${item.label}-${index}`}>
        {item.href && !last ? <Link href={item.href}>{item.label}</Link> : <span aria-current={last ? "page" : undefined}>{item.label}</span>}
        {!last && <ChevronRight size={14} aria-hidden="true" />}
      </li>;
    })}
  </ol></nav>;
}

export function PageHeader({ title, description, breadcrumbs, actions }: { title: string; description?: string; breadcrumbs?: Crumb[]; actions?: ReactNode }) {
  return <>
    {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
    <header className="ops-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="ops-actions">{actions}</div>}</header>
  </>;
}
