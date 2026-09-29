"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { organizationsApi } from "../api";
import type { Organization } from "../types";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("vi-VN");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Không thể cập nhật tổ chức. Hãy thử lại sau.";
}

export function OrganizationsAdmin() {
  const { accessToken, isAuthenticated, ready, user } = useAuthSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [active, setActive] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pageSize = 20;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await organizationsApi.list(accessToken, { page, pageSize, search: appliedSearch || undefined, isActive: active === "" ? undefined : active === "true" });
      setOrganizations(response.items);
      setTotalCount(response.totalCount);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [accessToken, active, appliedSearch, page]);

  useEffect(() => {
    if (!ready || user?.role !== 0) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, ready, refreshToken, user?.role]);

  const activeOnPage = useMemo(() => organizations.filter((organization) => organization.isActive).length, [organizations]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const selectOrganization = async (id: string) => {
    if (!accessToken) return;
    setError("");
    try {
      setSelected(await organizationsApi.get(accessToken, id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

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
      setSelected(created);
      setTotalCount((current) => current + 1);
      setName("");
      setSlug("");
      setSlugEdited(false);
      setNotice("Đã tạo tổ chức. Hãy tạo OrganizationUser owner để bắt đầu quản lý Building.");
    } catch (cause) {
      setError(errorMessage(cause));
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
      setOrganizations((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected((current) => current?.id === updated.id ? updated : current);
      setNotice(updated.isActive ? "Đã kích hoạt tổ chức." : "Đã vô hiệu hóa tổ chức.");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
    setRefreshToken((current) => current + 1);
  };

  if (!ready) return <Card className="admin-card"><p role="status">Đang kiểm tra phiên đăng nhập…</p></Card>;
  if (!isAuthenticated) return <Card className="admin-card"><h1>Quản lý tổ chức</h1><p>Hãy đăng nhập để truy cập khu vực quản trị.</p><Button asChild><Link href={`${routes.login}?next=${routes.adminOrganizations}`}>Đăng nhập</Link></Button></Card>;
  if (user?.role !== 0) return <Card className="admin-card"><h1>Không có quyền truy cập</h1><p>Chỉ PlatformAdmin có thể quản lý tổ chức.</p></Card>;

  return <div className="admin-layout">
    <header className="admin-heading"><p className="kicker"><span className="kicker-line" /> Quản trị hệ thống</p><h1>Organization</h1><p>Tạo tổ chức, kiểm soát trạng thái và cấp OrganizationUser owner trước khi mở workspace Building.</p></header>
    {error && <p className="form-message" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <section className="admin-summary" aria-label="Tổng quan tổ chức"><div><span>Tổng tổ chức</span><strong>{totalCount}</strong></div><div><span>Đang hoạt động</span><strong>{activeOnPage}</strong></div><div><span>Đã vô hiệu hóa</span><strong>{organizations.length - activeOnPage}</strong></div></section>
    <div className="admin-grid">
      <Card className="admin-card"><h2>Tạo Organization</h2><form className="admin-form" onSubmit={createOrganization}>
        <label>Tên tổ chức<input required maxLength={200} value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(slugify(value)); }} autoComplete="organization" placeholder="Ví dụ: Trường An Toàn" /></label>
        <label>Slug tổ chức<input required maxLength={100} value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="truong-an-toan" /></label>
        <p>Slug là định danh URL; chỉ dùng chữ thường, số và dấu gạch ngang.</p>
        <Button type="submit" disabled={submitting}>{submitting ? "Đang tạo…" : "Tạo Organization"}</Button>
      </form></Card>
      <Card className="admin-card"><h2>Thông tin tổ chức</h2>{selected ? <div className="organization-detail"><p><strong>{selected.name}</strong></p><p><code>{selected.slug}</code></p><dl><div><dt>Trạng thái</dt><dd>{selected.isActive ? "Hoạt động" : "Vô hiệu hóa"}</dd></div><div><dt>Tạo lúc</dt><dd>{formatDate(selected.createdAt)}</dd></div><div><dt>Cập nhật</dt><dd>{formatDate(selected.updatedAt)}</dd></div></dl><div className="organization-actions"><Button asChild><Link href={`${routes.adminAccounts}?organizationId=${selected.id}`}>Tạo OrganizationUser</Link></Button><Button type="button" variant="secondary" onClick={() => void toggleOrganization(selected)}>{selected.isActive ? "Vô hiệu hóa tổ chức" : "Kích hoạt tổ chức"}</Button></div></div> : <p>Chọn một tổ chức trong danh sách để xem chi tiết và tạo owner.</p>}</Card>
    </div>
    <Card className="admin-card"><div className="admin-toolbar"><h2>Danh sách tổ chức</h2><Button variant="quiet" onClick={() => setRefreshToken((current) => current + 1)} disabled={loading}>{loading ? "Đang tải…" : "Tải lại"}</Button></div>
      <form className="admin-filters" onSubmit={applyFilters}><label>Tìm theo tên hoặc slug<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Fire3D Lab" /></label><label>Trạng thái<select value={active} onChange={(event) => { setActive(event.target.value as "" | "true" | "false"); setPage(1); }}><option value="">Tất cả</option><option value="true">Đang hoạt động</option><option value="false">Đã vô hiệu hóa</option></select></label><Button type="submit" variant="secondary" disabled={loading}>Lọc</Button></form>
      {loading ? <p role="status">Đang tải danh sách tổ chức…</p> : <><div className="account-table-wrap"><table><thead><tr><th>Tổ chức</th><th>Slug</th><th>Trạng thái</th><th>Owner</th><th /></tr></thead><tbody>
        {organizations.map((organization) => <tr key={organization.id}><td><button type="button" className="account-link" onClick={() => void selectOrganization(organization.id)}>{organization.name}<span>{organization.id}</span></button></td><td>{organization.slug}</td><td>{organization.isActive ? "Hoạt động" : "Vô hiệu hóa"}</td><td><Link href={`${routes.adminAccounts}?organizationId=${organization.id}`}>Tạo owner</Link></td><td><Button size="sm" variant="quiet" onClick={() => void toggleOrganization(organization)}>{organization.isActive ? "Khóa" : "Mở"}</Button></td></tr>)}
        {!organizations.length && <tr><td colSpan={5}>Không có tổ chức phù hợp.</td></tr>}
      </tbody></table></div><div className="admin-pagination"><span>Trang {page}/{totalPages} · {totalCount} tổ chức</span><div><Button type="button" variant="quiet" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Trước</Button><Button type="button" variant="quiet" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Sau</Button></div></div></>}
    </Card>
  </div>;
}
