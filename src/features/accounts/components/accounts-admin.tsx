"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import type { UserRole } from "@/features/auth/types";
import { accountsApi } from "../api";
import type { ManagedAccount, Organization } from "../types";

const roles: Array<{ value: UserRole; label: string }> = [
  { value: 0, label: "Platform admin" },
  { value: 1, label: "Thành viên tổ chức" },
  { value: 2, label: "Học viên" },
];

function message(error: unknown) {
  return error instanceof Error ? error.message : "Không thể tải dữ liệu tài khoản.";
}

function roleLabel(role: UserRole) {
  return roles.find((item) => item.value === role)?.label ?? "Không xác định";
}

export function AccountsAdmin() {
  const { accessToken, isAuthenticated, ready, user } = useAuthSession();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<ManagedAccount | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | UserRole>("");
  const [active, setActive] = useState<"" | "true" | "false">("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>(2);
  const [organizationId, setOrganizationId] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const [accountPage, organizationPage] = await Promise.all([
        accountsApi.list(accessToken, { page: 1, pageSize: 50, search: search.trim() || undefined, role: role === "" ? undefined : role, isActive: active === "" ? undefined : active === "true" }),
        accountsApi.organizations(accessToken),
      ]);
      setAccounts(accountPage.items);
      setOrganizations(organizationPage.items);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }, [accessToken, active, role, search]);

  useEffect(() => {
    if (!ready || user?.role !== 0) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, ready, user?.role]);

  const selectAccount = async (id: string) => {
    if (!accessToken) return;
    setError("");
    try {
      setSelected(await accountsApi.get(accessToken, id));
    } catch (cause) {
      setError(message(cause));
    }
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      await accountsApi.create(accessToken, { email, password, fullName, role: newRole, organizationId: newRole === 1 ? organizationId || null : null });
      setEmail(""); setPassword(""); setFullName(""); setOrganizationId("");
      setNotice("Đã tạo tài khoản. Danh sách đã được tải lại.");
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (account: ManagedAccount) => {
    if (!accessToken) return;
    setError("");
    setNotice("");
    try {
      const updated = await accountsApi.setStatus(accessToken, account.id, !account.isActive);
      setAccounts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected((current) => current?.id === updated.id ? updated : current);
      setNotice(updated.isActive ? "Đã kích hoạt tài khoản." : "Đã vô hiệu hóa tài khoản.");
    } catch (cause) {
      setError(message(cause));
    }
  };

  if (!ready) return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
  if (!isAuthenticated) return <Card className="admin-card"><h1>Quản lý tài khoản</h1><p>Hãy đăng nhập để truy cập khu vực quản trị.</p><Button asChild><Link href={`${routes.login}?next=${routes.adminAccounts}`}>Đăng nhập</Link></Button></Card>;
  if (user?.role !== 0) return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Chỉ PlatformAdmin có thể xem và quản lý tài khoản.</p></Card>;

  return <div className="admin-layout">
    <header className="admin-heading"><p className="kicker"><span className="kicker-line" /> Quản trị hệ thống</p><h1>Accounts</h1><p>Danh sách, trạng thái và tạo tài khoản mới qua Fire3D API.</p></header>
    {error && <p className="form-message" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="admin-grid">
      <Card className="admin-card"><h2>Tạo tài khoản</h2><form className="admin-form" onSubmit={create}>
        <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
        <label>Mật khẩu<input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
        <label>Họ và tên<input maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
        <label>Vai trò<select value={newRole} onChange={(event) => setNewRole(Number(event.target.value) as UserRole)}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {newRole === 1 && <label>Tổ chức<select required value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Chọn tổ chức</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}
        <Button type="submit" disabled={creating}>{creating ? "Đang tạo…" : "Tạo tài khoản"}</Button>
      </form></Card>
      <Card className="admin-card"><h2>Chi tiết tài khoản</h2>{selected ? <div className="account-detail"><p><strong>{selected.fullName || selected.email}</strong></p><p>{selected.email}</p><p>{roleLabel(selected.role)} · {selected.isActive ? "Đang hoạt động" : "Đã vô hiệu hóa"}</p><p>Đăng nhập gần nhất: {selected.lastLoginAt ? new Date(selected.lastLoginAt).toLocaleString("vi-VN") : "Chưa có"}</p><Button onClick={() => void toggle(selected)} variant={selected.isActive ? "secondary" : "primary"}>{selected.isActive ? "Vô hiệu hóa" : "Kích hoạt"}</Button></div> : <p>Chọn một hàng trong danh sách để xem chi tiết.</p>}</Card>
    </div>
    <Card className="admin-card"><div className="admin-toolbar"><h2>Tài khoản</h2><Button variant="quiet" onClick={() => void load()} disabled={loading}>{loading ? "Đang tải…" : "Tải lại"}</Button></div><div className="admin-filters"><label>Tìm kiếm<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email hoặc tên" /></label><label>Vai trò<select value={role} onChange={(event) => setRole(event.target.value === "" ? "" : Number(event.target.value) as UserRole)}><option value="">Tất cả</option>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Trạng thái<select value={active} onChange={(event) => setActive(event.target.value as "" | "true" | "false")}><option value="">Tất cả</option><option value="true">Đang hoạt động</option><option value="false">Đã vô hiệu hóa</option></select></label><Button variant="secondary" onClick={() => void load()} disabled={loading}>Lọc</Button></div>{loading ? <p role="status">Đang tải danh sách…</p> : <div className="account-table-wrap"><table><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Trạng thái</th><th /></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}><td><button className="account-link" onClick={() => void selectAccount(account.id)}>{account.fullName || account.email}<span>{account.email}</span></button></td><td>{roleLabel(account.role)}</td><td>{account.isActive ? "Hoạt động" : "Vô hiệu hóa"}</td><td><Button size="sm" variant="quiet" onClick={() => void toggle(account)}>{account.isActive ? "Khóa" : "Mở"}</Button></td></tr>)}{!accounts.length && <tr><td colSpan={4}>Không có tài khoản phù hợp.</td></tr>}</tbody></table></div>}</Card>
  </div>;
}
