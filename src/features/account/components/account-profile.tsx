"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";

const roleNames = ["Quản trị nền tảng", "Người dùng tổ chức", "Học viên"];

export function AccountProfile() {
  const { isAuthenticated, logout, ready, user } = useAuthSession();

  if (!ready) return <Card className="account-card" aria-busy="true">Đang tải tài khoản…</Card>;
  if (!isAuthenticated || !user) return <Card className="account-card"><h1>Tài khoản</h1><p>Bạn cần đăng nhập để xem trang này.</p><Button asChild><Link href={routes.login}>Đăng nhập</Link></Button></Card>;

  const displayName = user.fullName?.trim() || user.email;
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <section className="account-page">
    <header className="account-heading"><p className="kicker"><span className="kicker-line" /> Hồ sơ cá nhân</p><h1>Tài khoản của bạn</h1><p>Thông tin này được đồng bộ từ phiên đăng nhập Fire3D.</p></header>
    <Card className="account-card">
      <div className="account-profile-summary"><span className="account-profile-avatar" aria-hidden="true">{initials}</span><div><h2>{displayName}</h2><p>{user.email}</p></div></div>
      <dl className="account-details"><div><dt>Vai trò</dt><dd>{roleNames[user.role] ?? "Người dùng"}</dd></div><div><dt>Tổ chức</dt><dd>{user.organizationId ?? "Chưa thuộc tổ chức"}</dd></div></dl>
      <Button variant="secondary" onClick={() => void logout()}><LogOut size={16} /> Đăng xuất</Button>
    </Card>
  </section>;
}
