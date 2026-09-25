"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronDown, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FET3DLogo } from "@/components/brand/fet3d-logo";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { MobileMenu } from "./mobile-menu";

const links = [
  { href: routes.home, label: "Khám phá" },
  { href: routes.organizations, label: "Dành cho tổ chức" },
  { href: routes.learn, label: "Learn" },
  { href: routes.about, label: "Về chúng tôi" },
];

export function SiteHeader() {
  const { logout, user } = useAuthSession();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const navigation = user?.role === 0 ? [...links, { href: routes.adminAccounts, label: "Quản trị" }] : links;

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const displayName = user?.fullName?.trim() || user?.email || "Tài khoản";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header className="site-header">
      <Link className="brand-mark" href={routes.home} aria-label="FET3D, về trang chủ">
        <FET3DLogo />
      </Link>
      <nav className="site-nav" aria-label="Điều hướng chính">
        {navigation.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="site-actions">
        {user ? (
          <div className="account-menu" ref={accountMenuRef}>
            <button className="account-trigger" type="button" aria-expanded={accountOpen} aria-haspopup="menu" aria-label={`Mở menu tài khoản của ${displayName}`} onClick={() => setAccountOpen((open) => !open)}>
              <span aria-hidden="true">{initials}</span><ChevronDown size={15} aria-hidden="true" />
            </button>
            {accountOpen && <div className="account-popover" role="menu" aria-label="Tài khoản">
              <p className="account-popover-name">{displayName}</p>
              <p className="account-popover-email">{user.email}</p>
              <Link href={routes.account} role="menuitem" onClick={() => setAccountOpen(false)}><UserRound size={16} /> Chi tiết tài khoản</Link>
              <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); void logout(); }}><LogOut size={16} /> Đăng xuất</button>
            </div>}
          </div>
        ) : <Link className="header-login" href={routes.login}>Đăng nhập</Link>}
        <Button asChild size="sm"><Link href={routes.download}>Tải ứng dụng <ArrowUpRight size={15} /></Link></Button>
        <MobileMenu links={navigation} accountHref={user ? routes.account : undefined} />
      </div>
    </header>
  );
}
