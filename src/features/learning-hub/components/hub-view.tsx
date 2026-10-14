"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Iconsax, type IconsaxName } from "@/components/ui/iconsax";
import { FET3DLogo } from "@/components/brand/fet3d-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { AccountProfile } from "@/features/account/components/account-profile";
import { PublicOpsScope } from "@/features/account/components/public-ops-scope";
import { useAuthSession } from "@/features/auth/auth-session";
import { TraineeSupport } from "@/features/support/components/trainee-support";
import { AskPanel } from "./ask-panel";
import { HistoryPanel } from "./history-panel";
import { SavedPosts } from "./saved-posts";

/** `unavailable` views stay in the menu so the URL keeps working and the reason is one click away; see CapabilityUnavailable. */
const views = [
  { key: "saved", label: "Bài đã lưu", icon: "archive-book" },
  { key: "questions", label: "Hỏi đáp", icon: "message-question", unavailable: true },
  { key: "history", label: "Lịch sử", icon: "clock", unavailable: true },
  { key: "support", label: "Hỗ trợ", icon: "send-2" },
  { key: "profile", label: "Hồ sơ", icon: "user" },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: IconsaxName; unavailable?: true }>;

export function HubView() {
  const params = useSearchParams();
  const { isAuthenticated, logout, ready, user } = useAuthSession();
  const rawArticle = params.get("article");
  const requestedView = params.get("view");
  const view = views.find((item) => item.key === requestedView)?.key ?? (rawArticle ? "questions" : "saved");
  const selected = views.find((item) => item.key === view)!;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    navigationRef.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => { setMenuOpen(false); menuButton.current?.focus(); };
  const next = "/learning-hub" + (params.size ? "?" + params.toString() : "");
  if (!ready) return <main className="page-main"><p role="status">Đang khôi phục phiên đăng nhập…</p></main>;
  if (!isAuthenticated) return <main className="page-main"><Card className="hub-card"><h1>Thư viện cá nhân</h1><p className="mb-5 text-[var(--muted)]">Đăng nhập để xem bài đã lưu, hỗ trợ và hồ sơ của bạn.</p><Button asChild><Link href={`${routes.login}?next=${encodeURIComponent(next)}`}>Đăng nhập</Link></Button></Card></main>;

  return <div className="learning-workspace">
    <aside className="learning-sidebar">
      <Link className="learning-brand" href="/" aria-label="FET3D, về trang chủ"><FET3DLogo variant="mark" /><span>FET3D<small>Thư viện cá nhân</small></span></Link>
      <button ref={menuButton} type="button" className="learning-menu-toggle" aria-expanded={menuOpen} aria-controls="learning-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "Đóng menu" : "Mở menu học tập"}</button>
      <nav id="learning-navigation" ref={navigationRef} className={`learning-navigation ${menuOpen ? "is-open" : ""}`} aria-label="Quản lý học tập">
        <div className="learning-nav-items">{views.map((item) => <Link key={item.key} href={`/learning-hub?view=${item.key}`} aria-current={view === item.key ? "page" : undefined} onClick={closeMenu}><Iconsax name={item.icon} /><span className="learning-nav-label">{item.label}{"unavailable" in item && <small className="learning-nav-note">Chưa khả dụng</small>}</span></Link>)}</div>
        <div className="learning-nav-bottom"><Link href="/learn" onClick={closeMenu}><Iconsax name="buildings" />Khám phá Learn</Link><button type="button" onClick={() => void logout()}><Iconsax name="logout" />Đăng xuất</button></div>
      </nav>
    </aside>
    <div className="learning-content">
      <header className="learning-topbar"><div><p>Thư viện cá nhân</p><h1>{selected.label}</h1></div><Link href="/learning-hub?view=profile" className="learning-account"><Iconsax name="user" size={18} /><span>{user?.fullName || user?.email}</span></Link></header>
      <main id="learning-main" className={`learning-main learning-view-${view}`}>
        {view === "saved" && <SavedPosts />}
        {view === "questions" && <AskPanel articleParam={rawArticle} />}
        {view === "history" && <HistoryPanel />}
        {view === "support" && <PublicOpsScope><TraineeSupport /></PublicOpsScope>}
        {view === "profile" && <PublicOpsScope><AccountProfile /></PublicOpsScope>}
      </main>
    </div>
  </div>;
}
