import Link from "next/link";
import { ArrowUpRight, Flame } from "lucide-react";
import { routes } from "@/configs/routes";
import { Button } from "@/components/ui/button";
import { MobileMenu } from "./mobile-menu";

const links = [
  { href: routes.home, label: "Khám phá" },
  { href: routes.organizations, label: "Dành cho tổ chức" },
  { href: routes.learn, label: "Learn" },
  { href: routes.about, label: "Về chúng tôi" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand-mark" href={routes.home} aria-label="Fire3D, về trang chủ">
        <span className="brand-icon" aria-hidden="true"><Flame size={17} strokeWidth={2.4} /></span>
        <span>Fire3D</span>
      </Link>
      <nav className="site-nav" aria-label="Điều hướng chính">
        {links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>
      <div className="site-actions">
        <Link className="header-login" href={routes.login}>Đăng nhập</Link>
        <Button asChild size="sm"><Link href={routes.download}>Tải ứng dụng <ArrowUpRight size={15} /></Link></Button>
        <MobileMenu links={links} />
      </div>
    </header>
  );
}
