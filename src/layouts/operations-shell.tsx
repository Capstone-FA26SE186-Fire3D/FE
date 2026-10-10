"use client";

import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import "@/assets/styles/ops.css";
import { FET3DLogo } from "@/components/brand/fet3d-logo";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";
import { useAuthSession } from "@/features/auth/auth-session";
import { ThemeScope } from "@/features/theme/theme-scope";
import { useLocalPreference } from "@/utils/local-preference";
import { adminArea, organizationArea, type NavItem, type OperationsArea } from "./nav-config";

const isSidebarState = (value: string): value is "expanded" | "collapsed" => value === "expanded" || value === "collapsed";

function isActive(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function SidebarContent({ area, pathname, collapsed, onNavigate, onToggleCollapsed, onLogout, idPrefix }: {
  area: OperationsArea;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
  onLogout: () => void;
  idPrefix: string;
}) {
  const groups = area.nav.reduce<Array<{ name?: string; items: NavItem[] }>>((acc, item) => {
    const last = acc[acc.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else acc.push({ name: item.group, items: [item] });
    return acc;
  }, []);

  return <>
    <Link className="ops-brand" href="/" aria-label="FET3D, về trang chủ" onClick={onNavigate}><FET3DLogo variant="mark" /><span>FET3D<small>{area.brandSubtitle}</small></span></Link>
    <nav className="ops-nav" aria-label={area.navLabel}>
      {groups.map((group, index) => <div key={group.name ?? index} style={{ display: "grid", gap: 2 }}>
        {group.name && <p className="ops-nav-label">{group.name}</p>}
        {group.items.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return <Link key={item.href} className="ops-nav-link" href={item.href} aria-current={active ? "page" : undefined} aria-label={item.label} title={collapsed ? item.label : undefined} onClick={onNavigate}>
            {active && <motion.span layoutId={`${idPrefix}-active`} className="ops-nav-active" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" style={{ position: "relative" }} />
            <span className="ops-nav-text"><span style={{ position: "relative" }}>{item.label}</span>{item.status === "pending-be" && <StatusBadge tone="warning" style={{ position: "relative" }}>Chờ BE</StatusBadge>}</span>
          </Link>;
        })}
      </div>)}
    </nav>
    <div className="ops-sidebar-footer">
      <Link href={area.secondaryLink.href} onClick={onNavigate} aria-label={area.secondaryLink.label} title={collapsed ? area.secondaryLink.label : undefined}><span className="ops-label">{area.secondaryLink.label}</span></Link>
      {onToggleCollapsed && <button type="button" onClick={onToggleCollapsed} aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"} title={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}>{collapsed ? <PanelLeftOpen size={20} strokeWidth={1.75} aria-hidden="true" /> : <PanelLeftClose size={20} strokeWidth={1.75} aria-hidden="true" />}<span className="ops-label">Thu gọn</span></button>}
      <button type="button" onClick={onLogout} aria-label="Đăng xuất" title={collapsed ? "Đăng xuất" : undefined}><LogOut size={20} strokeWidth={1.75} aria-hidden="true" /><span className="ops-label">Đăng xuất</span></button>
    </div>
  </>;
}

function AccessScreen({ title, message, action }: { title: string; message: string; action: ReactNode }) {
  return <main className="ops-access"><div className="ops-panel ops-panel-body"><h1>{title}</h1><p>{message}</p>{action}</div></main>;
}

function Shell({ area, children }: { area: OperationsArea; children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { ready, user, logout } = useAuthSession();
  const [sidebar, setSidebar] = useLocalPreference<"expanded" | "collapsed">("fire3d-ops-sidebar", "expanded", isSidebarState);
  const [menuOpen, setMenuOpen] = useState(false);
  const collapsed = sidebar === "collapsed";

  if (!ready) return <AccessScreen title={area.label} message="Đang kiểm tra phiên đăng nhập…" action={null} />;
  if (!user) {
    const next = pathname + (params.size ? "?" + params.toString() : "");
    return <AccessScreen title={area.label} message={area.signInPrompt} action={<Button asChild><Link href={`/login?next=${encodeURIComponent(next)}`}>Đăng nhập</Link></Button>} />;
  }
  if (!area.allowedRoles.includes(user.role)) {
    return <AccessScreen title="Không có quyền truy cập" message={area.deniedMessage} action={<Button asChild variant="secondary"><Link href={area.deniedHref}>{area.deniedLabel}</Link></Button>} />;
  }

  const current = area.nav.find((item) => isActive(pathname, item));

  return <div className="ops-shell" data-collapsed={collapsed}>
    <a className="ops-skip" href="#ops-main">Bỏ qua điều hướng</a>
    <aside className="ops-sidebar">
      <SidebarContent area={area} pathname={pathname} collapsed={collapsed} idPrefix={`${area.id}-desktop`} onToggleCollapsed={() => setSidebar(collapsed ? "expanded" : "collapsed")} onLogout={() => void logout()} />
    </aside>
    <div className="ops-body">
      <header className="ops-topbar">
        <button type="button" className="ops-icon-button ops-menu-button" aria-label="Mở điều hướng" onClick={() => setMenuOpen(true)}><Menu size={18} aria-hidden="true" /></button>
        <span className="ops-area-label">{current?.label ?? area.label}</span>
        <span className="ops-topbar-spacer" />
        <ThemeToggle />
        <Link href={area.id === "organization" ? "/workspace/profile" : "/account"} className="ops-user" title={user.email}><span>{user.fullName || user.email}</span></Link>
      </header>
      <main id="ops-main" className="ops-main" tabIndex={-1}>
        <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>{children}</motion.div>
      </main>
    </div>
    <Drawer open={menuOpen} onOpenChange={setMenuOpen} side="left" title="Điều hướng" hideTitle>
      <div className="ops-sidebar"><SidebarContent area={area} pathname={pathname} collapsed={false} idPrefix={`${area.id}-mobile`} onNavigate={() => setMenuOpen(false)} onLogout={() => void logout()} /></div>
    </Drawer>
  </div>;
}

/**
 * Shared shell for the Organization workspace and the PlatformAdmin area: themed scope, collapsible
 * sidebar, role gate, topbar with theme toggle. Each area passes its own navigation and allowed roles.
 */
export function OperationsShell({ areaId, children }: { areaId: OperationsArea["id"]; children: ReactNode }) {
  // Resolved here (client side): nav items hold icon components, which cannot cross the server→client boundary.
  const area = areaId === "admin" ? adminArea : organizationArea;
  return <ThemeScope>
    <MotionConfig reducedMotion="user">
      <ToastProvider><Shell area={area}>{children}</Shell></ToastProvider>
    </MotionConfig>
  </ThemeScope>;
}
