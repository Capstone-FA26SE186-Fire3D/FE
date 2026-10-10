"use client";

import { Building2, Landmark, Plus, RefreshCw, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { organizationsApi } from "../api";
import type { Organization } from "../types";

const PAGE_SIZE = 20;
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BE_ISSUE_PROFILE = "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/60";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const formatDate = (value: string) => new Date(value).toLocaleString("vi-VN");
const buildingsHref = (id: string) => `${routes.adminOrganizations}/${id}/buildings`;
const ownersHref = (id: string) => `${routes.adminAccounts}?organizationId=${id}`;

type CreateErrors = { name?: string; slug?: string };

function statusBadge(organization: Organization) {
  return <StatusBadge tone={organization.isActive ? "success" : "neutral"}>{organization.isActive ? "Hoạt động" : "Vô hiệu hóa"}</StatusBadge>;
}

function OrganizationDetail({ id, accessToken, onToggle }: { id: string; accessToken: string; onToggle: (organization: Organization) => void }) {
  const detail = useAsyncData(`organization:${id}`, (signal) => organizationsApi.get(accessToken, id, signal), true);
  const organization = detail.data;

  if (!organization) {
    if (detail.error !== undefined) {
      const missing = detail.error instanceof ApiError && detail.error.status === 404;
      return <Alert tone="danger" title={missing ? "Không tìm thấy tổ chức" : "Không mở được tổ chức"} action={missing ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={detail.reload}>Thử lại</Button>}>{missing ? "Tổ chức có thể đã bị xóa hoặc đường dẫn không đúng." : "Hãy kiểm tra kết nối rồi thử lại."}</Alert>;
    }
    return <SkeletonRows rows={4} label="Đang tải thông tin tổ chức…" />;
  }

  return <div className="ops-stack">
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{statusBadge(organization)}<code style={{ color: "var(--muted)", fontSize: 13 }}>{organization.slug}</code></div>
    <dl className="ops-stack" style={{ margin: 0, gap: 12 }}>
      <div><dt className="ops-field-hint">Tên tổ chức</dt><dd style={{ margin: 0, fontWeight: 600 }}>{organization.name}</dd></div>
      <div><dt className="ops-field-hint">Mã tổ chức</dt><dd style={{ margin: 0, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12, overflowWrap: "anywhere" }}>{organization.id}</dd></div>
      <div><dt className="ops-field-hint">Tạo lúc</dt><dd style={{ margin: 0, fontSize: 14, fontWeight: 400 }}>{formatDate(organization.createdAt)}</dd></div>
      <div><dt className="ops-field-hint">Cập nhật</dt><dd style={{ margin: 0, fontSize: 14, fontWeight: 400 }}>{formatDate(organization.updatedAt)}</dd></div>
    </dl>
    <Alert tone="info" title="Chờ BE: địa chỉ và số điện thoại">Response quản trị chưa có địa chỉ, số điện thoại và chưa có API sửa hồ sơ từ admin, nên các trường này chưa hiển thị. <a href={BE_ISSUE_PROFILE} target="_blank" rel="noreferrer" style={{ color: "var(--ember)", textDecoration: "underline" }}>BE#60</a></Alert>
    <div className="ops-actions">
      <Button asChild><Link href={ownersHref(organization.id)}><UserPlus size={16} aria-hidden="true" />Tạo OrganizationUser</Link></Button>
      <Button asChild variant="secondary"><Link href={buildingsHref(organization.id)}><Building2 size={16} aria-hidden="true" />Xem công trình</Link></Button>
      <Button variant={organization.isActive ? "secondary" : "primary"} onClick={() => onToggle(organization)}>{organization.isActive ? "Vô hiệu hóa tổ chức" : "Kích hoạt tổ chức"}</Button>
    </div>
  </div>;
}

export function OrganizationsAdmin() {
  const toast = useToast();
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const urlSearch = get("q");
  const active = get("status");
  const selectedId = get("organization");
  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<CreateErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<Organization | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const [detailVersion, setDetailVersion] = useState(0);

  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const list = useAsyncData(
    `organizations:${page}:${urlSearch}:${active}`,
    (signal) => organizationsApi.list(accessToken as string, { page, pageSize: PAGE_SIZE, search: urlSearch.trim() || undefined, isActive: active === "" ? undefined : active === "true" }, signal),
    enabled,
  );
  const items = list.data?.items ?? [];
  const totalCount = list.data?.totalCount ?? 0;
  const filtering = Boolean(urlSearch || active);

  const openDetail = (id: string) => setParams({ organization: id, page });
  const closeDetail = () => setParams({ organization: null, page });

  const resetCreate = () => { setName(""); setSlug(""); setSlugEdited(false); setErrors({}); setFormError(""); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || saving) return;
    const normalizedName = name.trim();
    const normalizedSlug = slug.trim().toLowerCase();
    const found: CreateErrors = {};
    if (!normalizedName || normalizedName.length > 200) found.name = "Tên tổ chức dài từ 1 đến 200 ký tự.";
    if (!slugPattern.test(normalizedSlug) || normalizedSlug.length > 100) found.slug = "Slug chỉ gồm chữ thường, số và dấu gạch ngang (tối đa 100 ký tự).";
    setErrors(found);
    if (found.name || found.slug) return;
    setSaving(true);
    setFormError("");
    try {
      const created = await organizationsApi.create(accessToken, { name: normalizedName, slug: normalizedSlug });
      setCreating(false);
      resetCreate();
      toast.notify({ tone: "success", title: "Đã tạo tổ chức", description: `${created.name}. Hãy tạo OrganizationUser owner để bắt đầu quản lý công trình.` });
      list.reload();
      setParams({ organization: created.id, page: 1 });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setErrors({ slug: "Slug này đã được dùng (kể cả bởi tổ chức đã xóa). Hãy chọn slug khác." });
        setFormError("Không tạo được tổ chức vì slug bị trùng.");
      } else if (cause instanceof ApiError && cause.fieldErrors.length) {
        setErrors({ name: cause.fieldMessage("name"), slug: cause.fieldMessage("slug") });
        setFormError("Máy chủ từ chối dữ liệu. Kiểm tra các trường được đánh dấu.");
      } else {
        setFormError("Không thể tạo tổ chức. Nội dung bạn nhập vẫn được giữ lại; hãy thử lại.");
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmToggle = async () => {
    if (!accessToken || !toggling) return;
    setToggleBusy(true);
    setToggleError("");
    try {
      const updated = await organizationsApi.setStatus(accessToken, toggling.id, !toggling.isActive);
      toast.notify({ tone: "success", title: updated.isActive ? "Đã kích hoạt tổ chức" : "Đã vô hiệu hóa tổ chức", description: updated.name });
      setToggling(null);
      list.reload();
      setDetailVersion((value) => value + 1);
    } catch {
      setToggleError("Không thể đổi trạng thái tổ chức. Hãy thử lại sau.");
    } finally {
      setToggleBusy(false);
    }
  };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể quản lý tổ chức.</Alert>;

  return <>
    <PageHeader
      title="Tổ chức"
      description="Tạo tổ chức, kiểm soát trạng thái và cấp OrganizationUser owner trước khi mở không gian công trình."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức" }]}
      actions={<><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button><Button onClick={() => { resetCreate(); setCreating(true); }}><Plus size={16} aria-hidden="true" />Tạo tổ chức</Button></>}
    />

    <div className="ops-toolbar">
      <div className="ops-field ops-toolbar-grow" style={{ position: "relative" }}>
        <label htmlFor="organization-search" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Tìm tổ chức</label>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 13, color: "var(--dim)" }} />
        <Input id="organization-search" style={{ paddingLeft: 36 }} placeholder="Tên hoặc slug" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
      </div>
      <Select aria-label="Trạng thái" style={{ width: 180 }} value={active} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option><option value="true">Đang hoạt động</option><option value="false">Đã vô hiệu hóa</option>
      </Select>
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách tổ chức" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>Hãy kiểm tra kết nối rồi thử lại.</Alert>}

    <Table caption="Danh sách tổ chức">
      <thead><tr><th>Tổ chức</th><th>Trạng thái</th><th>Tạo lúc</th><th aria-label="Thao tác" /></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={6} label="Đang tải danh sách tổ chức…" /></TableMessage>}
        {items.map((organization) => <tr key={organization.id}>
          <td><button type="button" className="ops-cell-primary" style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => openDetail(organization.id)}>{organization.name}<span className="ops-cell-sub">{organization.slug}</span></button></td>
          <td>{statusBadge(organization)}</td>
          <td>{formatDate(organization.createdAt)}</td>
          <td className="ops-cell-actions">
            <Button asChild size="sm" variant="ghost"><Link href={ownersHref(organization.id)} aria-label={`Tạo owner cho ${organization.name}`}>Tạo owner</Link></Button>
            <Button asChild size="sm" variant="ghost"><Link href={buildingsHref(organization.id)} aria-label={`Xem công trình của ${organization.name}`}>Công trình</Link></Button>
            <Button size="sm" variant="quiet" onClick={() => { setToggleError(""); setToggling(organization); }} aria-label={`${organization.isActive ? "Khóa" : "Mở"} ${organization.name}`}>{organization.isActive ? "Khóa" : "Mở"}</Button>
          </td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={filtering ? Search : Landmark} title={filtering ? "Không có tổ chức phù hợp." : "Chưa có tổ chức"} description={filtering ? "Thử đổi từ khóa hoặc bộ lọc." : "Tạo tổ chức đầu tiên, sau đó cấp OrganizationUser owner."} action={!filtering && <Button onClick={() => { resetCreate(); setCreating(true); }}><Plus size={16} aria-hidden="true" />Tạo tổ chức</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {totalCount > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) closeDetail(); }} title="Thông tin tổ chức" description="Dữ liệu lấy trực tiếp từ Fire3D API.">
      {selectedId && accessToken && <OrganizationDetail key={`${selectedId}:${detailVersion}`} id={selectedId} accessToken={accessToken} onToggle={(organization) => { setToggleError(""); setToggling(organization); }} />}
    </Drawer>

    <Drawer open={creating} onOpenChange={(open) => { if (!open && !saving) setCreating(false); }} title="Tạo tổ chức" description="Slug là định danh URL, không đổi được sau khi tạo.">
      <form onSubmit={submit} noValidate className="ops-stack">
        <Field label="Tên tổ chức" required error={errors.name}>{(p) => <Input {...p} maxLength={200} autoComplete="organization" placeholder="Ví dụ: Trường An Toàn" value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(slugify(value)); }} />}</Field>
        <Field label="Slug tổ chức" required hint="Chỉ dùng chữ thường, số và dấu gạch ngang." error={errors.slug}>{(p) => <Input {...p} maxLength={100} placeholder="truong-an-toan" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} />}</Field>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
          <Button type="button" variant="quiet" onClick={() => setCreating(false)} disabled={saving}>Hủy</Button>
          <Button type="submit" disabled={saving}>{saving ? "Đang tạo…" : "Tạo tổ chức"}</Button>
        </div>
      </form>
    </Drawer>

    <Modal open={toggling !== null} onOpenChange={(open) => { if (!open && !toggleBusy) setToggling(null); }}
      title={toggling?.isActive ? "Vô hiệu hóa tổ chức?" : "Kích hoạt tổ chức?"}
      description={toggling ? (toggling.isActive ? `${toggling.name} sẽ bị khóa: mọi phiên đăng nhập của OrganizationUser thuộc tổ chức bị thu hồi và họ không đăng nhập lại được cho tới khi tổ chức được kích hoạt.` : `${toggling.name} sẽ hoạt động trở lại. Người dùng cần đăng nhập lại; phiên cũ không được khôi phục.`) : undefined}
      footer={<><Button variant="quiet" onClick={() => setToggling(null)} disabled={toggleBusy}>Hủy</Button><Button variant={toggling?.isActive ? "danger" : "primary"} onClick={() => void confirmToggle()} disabled={toggleBusy}>{toggleBusy ? "Đang lưu…" : toggling?.isActive ? "Vô hiệu hóa" : "Kích hoạt"}</Button></>}>
      {toggleError ? <Alert tone="danger">{toggleError}</Alert> : <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Thao tác này được ghi nhận trong nhật ký audit.</p>}
    </Modal>
  </>;
}
