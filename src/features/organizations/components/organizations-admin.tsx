"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { organizationsApi } from "../api";
import type { Organization } from "../types";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function errorMessage(): string {
  return "Không thể cập nhật tổ chức. Hãy thử lại sau.";
}

export function OrganizationsAdmin() {
  const { accessToken, isAuthenticated, ready, user } = useAuthSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError("");
    try {
      const response = await organizationsApi.list(accessToken, { page: 1, pageSize: 100 });
      setOrganizations(response.items);
    } catch {
      setError(errorMessage());
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!ready || user?.role !== 0) return;
    void load();
  }, [load, ready, user?.role]);

  const createOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedSlug = slug.trim().toLowerCase();

    if (!accessToken) return;
    if (!normalizedName || normalizedName.length > 200 || !slugPattern.test(normalizedSlug) || normalizedSlug.length > 100) {
      setError("Tên hoặc slug tổ chức chưa hợp lệ.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const created = await organizationsApi.create(accessToken, { name: normalizedName, slug: normalizedSlug });
      setOrganizations((current) => [created, ...current]);
      setName("");
      setSlug("");
      setNotice("Đã tạo tổ chức.");
    } catch {
      setError(errorMessage());
    } finally {
      setSubmitting(false);
    }
  };

  const toggleOrganization = async (organization: Organization) => {
    if (!accessToken) return;

    setError("");
    setNotice("");
    try {
      const updated = await organizationsApi.setStatus(accessToken, organization.id, !organization.isActive);
      setOrganizations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(updated.isActive ? "Đã kích hoạt tổ chức." : "Đã vô hiệu hóa tổ chức.");
    } catch {
      setError(errorMessage());
    }
  };

  if (!ready) return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
  if (!isAuthenticated) return <Card className="admin-card"><h1>Quản lý tổ chức</h1><p>Hãy đăng nhập để truy cập khu vực quản trị.</p><Button asChild><Link href={`${routes.login}?next=${routes.adminOrganizations}`}>Đăng nhập</Link></Button></Card>;
  if (user?.role !== 0) return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Chỉ PlatformAdmin có thể quản lý tổ chức.</p></Card>;

  return <div className="admin-layout">
    <header className="admin-heading"><p className="kicker"><span className="kicker-line" /> Quản trị hệ thống</p><h1>Quản lý tổ chức</h1><p>Tạo tổ chức và kiểm soát trạng thái hoạt động trước khi cấp tài khoản thành viên.</p></header>
    {error && <p className="form-message" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="admin-grid">
      <Card className="admin-card"><h2>Tạo tổ chức</h2><form className="admin-form" onSubmit={createOrganization}>
        <label>Tên tổ chức<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} autoComplete="organization" /></label>
        <label>Slug<input required maxLength={100} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="fire-safety-team" /></label>
        <Button type="submit" disabled={submitting}>{submitting ? "Đang tạo…" : "Tạo tổ chức"}</Button>
      </form></Card>
      <Card className="admin-card"><h2>Quy trình</h2><p>Tạo tổ chức trước, sau đó vào <Link href={routes.adminAccounts}>quản lý tài khoản</Link> để tạo OrganizationUser và gán vào tổ chức tương ứng.</p></Card>
    </div>
    <Card className="admin-card"><div className="admin-toolbar"><h2>Danh sách tổ chức</h2><Button variant="quiet" onClick={() => void load()} disabled={loading}>{loading ? "Đang tải…" : "Tải lại"}</Button></div>
      {loading ? <p role="status">Đang tải danh sách tổ chức…</p> : <div className="account-table-wrap"><table><thead><tr><th>Tổ chức</th><th>Slug</th><th>Trạng thái</th><th /></tr></thead><tbody>
        {organizations.map((organization) => <tr key={organization.id}><td>{organization.name}</td><td>{organization.slug}</td><td>{organization.isActive ? "Hoạt động" : "Vô hiệu hóa"}</td><td><Button size="sm" variant="quiet" onClick={() => void toggleOrganization(organization)}>{organization.isActive ? "Vô hiệu hóa" : "Kích hoạt"}</Button></td></tr>)}
        {!organizations.length && <tr><td colSpan={4}>Chưa có tổ chức nào.</td></tr>}
      </tbody></table></div>}
    </Card>
  </div>;
}
