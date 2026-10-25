"use client";

import { BookOpen, Bookmark, History, LayoutDashboard, LifeBuoy, LogOut, Menu, MessageSquare, User, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "@/assets/styles/ops.css";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { AccountProfile } from "@/features/account/components/account-profile";
import { useAuthSession } from "@/features/auth/auth-session";
import { ThemeScope } from "@/features/theme/theme-scope";
import { TraineeSupport } from "@/features/support/components/trainee-support";
import "../learning-hub.css";
import { AskPanel } from "./ask-panel";
import { HistoryPanel } from "./history-panel";
import { Overview } from "./overview";
import { SavedPosts } from "./saved-posts";

type ViewKey = "overview" | "saved" | "questions" | "history" | "support" | "profile";
type View = { key: ViewKey; label: string; short: string; icon: LucideIcon; kicker?: string; description?: string };

/** Sidebar order of the Figma page "03 Trainee". `short` is the label of the bottom tab bar on a phone. */
const views: readonly View[] = [
  { key: "overview", label: "Tổng quan", short: "Tổng quan", icon: LayoutDashboard, description: "Bắt đầu từ bài đã lưu, hỏi AI hoặc mở ứng dụng để luyện tập." },
  { key: "saved", label: "Bài đã lưu", short: "Đã lưu", icon: Bookmark, description: "Quay lại bài viết, mẹo và video bạn đã lưu. Bài bị gỡ vẫn nằm ở đây cho tới khi bạn bỏ lưu." },
  { key: "questions", label: "Hỏi đáp AI", short: "Hỏi AI", icon: MessageSquare, description: "Hỏi về bài đang đọc hoặc kết quả luyện tập của bạn. Câu trả lời luôn kèm nguồn." },
  { key: "history", label: "Lịch sử luyện tập", short: "Lịch sử", icon: History, description: "Mỗi phiên có hai trạng thái riêng: hoàn thành phiên và kết quả đánh giá. Luyện tập lại không giới hạn." },
  { key: "support", label: "Hỗ trợ", short: "Hỗ trợ", icon: LifeBuoy },
  { key: "profile", label: "Hồ sơ", short: "Hồ sơ", icon: User },
];
const tabViews = views.filter((item) => item.key !== "support");

const hrefOf = (key: ViewKey) => `/learning-hub?view=${key}`;
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase() || "?";
const givenName = (name: string) => name.trim().split(/\s+/).filter(Boolean).at(-1) ?? "";

function Gate({ children }: { children: ReactNode }) {
  return <main className="learning-gate">{children}</main>;
}

export function HubView() {
  return <ThemeScope className="learning-scope"><ToastProvider><Workspace /></ToastProvider></ThemeScope>;
}

function Workspace() {
  const params = useSearchParams();
  const { isAuthenticated, logout, ready, user } = useAuthSession();
  const rawArticle = params.get("article");
  const requestedView = params.get("view");
  const view = views.find((item) => item.key === requestedView)?.key ?? (rawArticle || params.get("session") || params.get("training") ? "questions" : "overview");
  const selected = views.find((item) => item.key === view)!;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    sidebar.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const next = "/learning-hub" + (params.size ? "?" + params.toString() : "");
  if (!ready) return <Gate><p role="status">Đang khôi phục phiên đăng nhập…</p></Gate>;
  if (!isAuthenticated) return <Gate><div className="ops-panel ops-panel-body"><h1>Thư viện cá nhân</h1><p>Đăng nhập để xem bài đã lưu, hỗ trợ và hồ sơ của bạn.</p><Button asChild><Link href={`${routes.login}?next=${encodeURIComponent(next)}`}>Đăng nhập</Link></Button></div></Gate>;

  const displayName = user?.fullName || user?.email || "";
  const header = view !== "profile" ? <header className="learning-page-head">
    <div>
      <p className="learning-kicker">{selected.label}</p>
      <h1>{view === "overview" ? `Xin chào, ${givenName(displayName) || "bạn"}` : selected.label}</h1>
      {selected.description && <p>{selected.description}</p>}
    </div>
    <div className="learning-page-actions">
      {(view === "overview" || view === "saved") && <Link className={buttonVariants({ variant: "secondary" })} href={routes.learn}>Khám phá bài học</Link>}
      {view === "history" && <Link className={buttonVariants({ variant: "secondary" })} href={routes.download}>Mở trên điện thoại</Link>}
    </div>
  </header> : null;

  return <div className="learning-workspace">
    <aside ref={sidebar} id="learning-sidebar" className={`learning-sidebar ${menuOpen ? "is-open" : ""}`}>
      <Link className="learning-brand" href="/" aria-label="FET3D, về trang chủ" onClick={closeMenu}><span className="learning-wordmark">FET3D<i aria-hidden="true" /></span><small>Thư viện cá nhân</small></Link>
      <nav id="learning-navigation" className="learning-navigation" aria-label="Quản lý học tập">
        <div className="learning-nav-items">{views.map((item) => <Link key={item.key} href={hrefOf(item.key)} aria-current={view === item.key ? "page" : undefined} onClick={closeMenu}><item.icon size={20} strokeWidth={1.75} aria-hidden="true" /><span className="learning-nav-label">{item.label}</span></Link>)}</div>
        <div className="learning-nav-bottom"><div className="learning-nav-theme"><span>Giao diện</span><ThemeToggle /></div><Link href={routes.learn} onClick={closeMenu}><BookOpen size={20} strokeWidth={1.75} aria-hidden="true" />Khám phá bài học</Link><button type="button" onClick={() => void logout()}><LogOut size={20} strokeWidth={1.75} aria-hidden="true" />Đăng xuất</button></div>
      </nav>
    </aside>
    <button type="button" className="learning-scrim" aria-label="Đóng menu" tabIndex={-1} onClick={() => { closeMenu(); menuButton.current?.focus(); }} />
    <div className="learning-content">
      <header className="learning-topbar">
        <button ref={menuButton} type="button" className="learning-menu-toggle" aria-expanded={menuOpen} aria-controls="learning-sidebar" aria-label={menuOpen ? "Đóng menu" : "Mở menu học tập"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>
        <Link className="learning-topbar-brand learning-wordmark" href="/" aria-label="FET3D, về trang chủ">FET3D<i aria-hidden="true" /></Link>
        <nav className="learning-crumbs" aria-label="Vị trí hiện tại"><Link href={hrefOf("overview")}>Thư viện cá nhân</Link><span aria-hidden="true">›</span><span aria-current="page">{selected.label}</span></nav>
        <nav className="learning-topnav" aria-label="Chuyển nhanh">{tabViews.filter((item) => item.key !== "profile").map((item) => <Link key={item.key} href={hrefOf(item.key)} aria-label={item.label} title={item.label} aria-current={view === item.key ? "page" : undefined}><item.icon size={20} strokeWidth={1.75} aria-hidden="true" /></Link>)}</nav>
        <span className="learning-theme-top"><ThemeToggle /></span>
        <Link href={hrefOf("profile")} className="learning-avatar" aria-label={`Hồ sơ của ${displayName}`} aria-current={view === "profile" ? "page" : undefined} title={user?.email}>{initials(displayName)}</Link>
      </header>
      <main id="learning-main" className={`learning-main learning-view-${view}`} tabIndex={-1}>
        {header}
        {view === "overview" && <Overview />}
        {view === "saved" && <SavedPosts />}
        {view === "questions" && <AskPanel articleParam={rawArticle} />}
        {view === "history" && <HistoryPanel />}
        {view === "support" && <TraineeSupport />}
        {view === "profile" && <AccountProfile />}
      </main>
    </div>
    <nav className="learning-tabbar" aria-label="Điều hướng nhanh">{tabViews.map((item) => <Link key={item.key} href={hrefOf(item.key)} aria-current={view === item.key ? "page" : undefined}><item.icon size={20} strokeWidth={1.75} aria-hidden="true" /><span>{item.short}</span></Link>)}</nav>
  </div>;
}
