"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useRef } from "react";
import styles from "./navigation.module.css";

export function MobileMenu({ links, accountHref }: { links: { href: string; label: string }[]; accountHref?: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  return <details ref={details} className={styles.mobile} onKeyDown={event => {
    if (event.key === "Escape" && details.current) { details.current.open = false; summary.current?.focus(); }
  }}>
    <summary ref={summary} aria-label="Mở menu điều hướng"><Menu size={22} /></summary>
    <nav aria-label="Điều hướng trên điện thoại" className={styles.panel}>
      {links.map(link => <Link key={link.href} href={link.href} onClick={() => { if (details.current) details.current.open = false; }}>{link.label}</Link>)}
      <Link href={accountHref ?? "/login"} onClick={() => { if (details.current) details.current.open = false; }}>{accountHref ? "Tài khoản" : "Đăng nhập"}</Link>
    </nav>
  </details>;
}
