"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { routes } from "@/configs/routes";
import { Button } from "@/components/ui/button";
import { FET3DLogo } from "@/components/brand/fet3d-logo";
import { useAuthSession } from "@/features/auth/auth-session";
import { MobileMenu } from "./mobile-menu";

const links = [
  { href: routes.home, label: "Khám phá" },
  { href: routes.organizations, label: "Dành cho tổ chức" },
  { href: routes.learn, label: "Learn" },
  { href: routes.about, label: "Về chúng tôi" },
];

export function SiteHeader() {
  const { user } = useAuthSession();
  const navigation = user?.role === 0 ? [...links, { href: routes.adminAccounts, label: "Quản trị" }] : links;
  return (
    <header className="site-header">
      <Link className="brand-mark" href={routes.home} aria-label="FET3D, về trang chủ">
        <FET3DLogo />
      </Link>
      <nav className="site-nav" aria-label="Điều hướng chính">
        {navigation.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="site-actions">
        <Link className="header-login" href={routes.login}>Đăng nhập</Link>
        <Button asChild size="sm"><Link href={routes.download}>Tải ứng dụng <ArrowUpRight size={15} /></Link></Button>
        <MobileMenu links={navigation} />
      </div>
    </header>
  );
}
