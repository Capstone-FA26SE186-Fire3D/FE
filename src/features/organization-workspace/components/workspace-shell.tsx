"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FET3DLogo } from "@/components/brand/fet3d-logo";
import { Iconsax, type IconsaxName } from "@/components/ui/iconsax";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/features/auth/auth-session";

const sections: Array<{ href: string; label: string; icon: IconsaxName }> = [
  { href: "/workspace/buildings", label: "Công trình", icon: "buildings" },
  { href: "/workspace/ifc", label: "Quét mô hình IFC", icon: "archive-book" },
  { href: "/workspace/profile", label: "Hồ sơ tổ chức", icon: "user" },
];

export function OrganizationWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { ready, user, logout } = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const selected = sections.find((section) => pathname === section.href || pathname.startsWith(section.href + "/")) ?? sections[0];
  const closeMenu = () => { setMenuOpen(false); toggleRef.current?.focus(); };

  useEffect(() => {
    if (!menuOpen) return;
    navRef.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); toggleRef.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menuOpen]);

  if (!ready) return <main className="page-main"><p role="status">Đang kiểm tra phiên đăng nhập…</p></main>;
  if (!user) {
    const next = pathname + (params.size ? "?" + params.toString() : "");
    return <main className="page-main workspace-access"><h1>Không gian tổ chức</h1><p>Đăng nhập để quản lý công trình, mô hình IFC và hồ sơ.</p><Button asChild><Link href={`/login?next=${encodeURIComponent(next)}`}>Đăng nhập</Link></Button></main>;
  }
  if (user.role === 2) return <main className="page-main workspace-access"><h1>Không có quyền truy cập</h1><p>Khu quản lý này dành cho tài khoản tổ chức.</p><Button asChild><Link href="/learning-hub">Mở thư viện cá nhân</Link></Button></main>;

  return <div className="learning-workspace organization-workspace">
    <aside className="learning-sidebar">
      <Link className="learning-brand" href="/" aria-label="FET3D, về trang chủ"><FET3DLogo variant="mark" /><span>FET3D<small>Không gian tổ chức</small></span></Link>
      <button ref={toggleRef} className="learning-menu-toggle" type="button" aria-controls="organization-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "Đóng menu" : "Mở menu tổ chức"}</button>
      <nav ref={navRef} id="organization-navigation" className={`learning-navigation ${menuOpen ? "is-open" : ""}`} aria-label="Quản lý tổ chức">
        <div className="learning-nav-items">{sections.map((section) => <Link key={section.href} href={section.href} aria-current={selected.href === section.href ? "page" : undefined} onClick={closeMenu}><Iconsax name={section.icon} />{section.label}</Link>)}</div>
        <div className="learning-nav-bottom"><Link href="/learn" onClick={closeMenu}><Iconsax name="message-question" />Khám phá Learn</Link><button type="button" onClick={() => void logout()}><Iconsax name="logout" />Đăng xuất</button></div>
      </nav>
    </aside>
    <div className="learning-content">
      <header className="learning-topbar"><div><p>Không gian tổ chức</p><strong className="workspace-section-title">{selected.label}</strong></div><Link href="/workspace/profile" className="learning-account"><Iconsax name="user" size={18} /><span>{user.fullName || user.email}</span></Link></header>
      <main className="learning-main organization-main">{pathname.startsWith("/workspace/buildings/") && <Link className="workspace-back" href="/workspace/buildings"><Iconsax name="arrow-left" size={16} />Danh sách công trình</Link>}{children}</main>
    </div>
  </div>;
}
