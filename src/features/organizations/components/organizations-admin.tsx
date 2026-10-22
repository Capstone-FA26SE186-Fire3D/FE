"use client";

import { Landmark, Plus, RefreshCw, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { describeApiError } from "@/api/describe-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { DetailPane, Split } from "@/features/admin-overview/components/admin-kit";
import { formatCount } from "@/features/admin-overview/format";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { organizationsApi } from "../api";
import type { Organization } from "../types";
import { OrganizationDetail } from "./organization-detail";
import { RetryButton } from "@/components/ui/retry-button";

const PAGE_SIZE = 20;
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const formatDate = (value: string) => new Date(value).toLocaleDateString("vi-VN");

type CreateErrors = { name?: string; slug?: string };

function statusBadge(organization: Organization) {
  return <StatusBadge tone={organization.isActive ? "success" : "neutral"}>{organization.isActive ? "Hoạt động" : "Vô hiệu hóa"}</StatusBadge>;
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

  const selected = items.find((organization) => organization.id === selectedId);

  return <>
    <PageHeader
      eyebrow="Quản lý hệ thống"
      title="Tổ chức"
      description="Hồ sơ tổ chức, công trình và tài khoản của từng tổ chức. Tạo tổ chức rồi cấp OrganizationUser owner trước khi mở không gian công trình."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức" }]}
      actions={<><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button><Button onClick={() => { resetCreate(); setCreating(true); }}><Plus size={16} aria-hidden="true" />Tạo tổ chức</Button></>}
    />

    <div className="adm-filters">
      <div className="adm-search">
        <label htmlFor="organization-search" className="sr-only">Tìm tổ chức</label>
        <Search size={16} aria-hidden="true" />
        <Input id="organization-search" placeholder="Tìm theo tên hoặc slug" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
      </div>
      <Select aria-label="Trạng thái" data-w style={{ width: 190 }} value={active} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Trạng thái: tất cả</option><option value="true">Đang hoạt động</option><option value="false">Đã vô hiệu hóa</option>
      </Select>
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách tổ chức" action={<RetryButton error={list.error} onRetry={list.reload} />}>{describeApiError(list.error, "Không tải được danh sách tổ chức. Hãy thử lại sau.")}</Alert>}

    <Split>
      <div>
        <Table caption="Danh sách tổ chức">
          <thead><tr><th>Tổ chức</th><th>Công trình</th><th>Tài khoản</th><th>Tạo lúc</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={6} label="Đang tải danh sách tổ chức…" /></TableMessage>}
            {items.map((organization) => <tr key={organization.id} data-selected={selectedId === organization.id ? "true" : undefined}>
              <td><button type="button" className="ops-cell-primary" style={{ border: 0, background: "none", textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => openDetail(organization.id)}>{organization.name}<span className="ops-cell-sub">{organization.slug}</span></button></td>
              <td>{formatCount(organization.buildingCount) ?? "—"}</td>
              <td>{formatCount(organization.accountCount) ?? "—"}</td>
              <td>{formatDate(organization.createdAt)}</td>
              <td>{statusBadge(organization)}</td>
            </tr>)}
            {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtering ? Search : Landmark} title={filtering ? "Không có tổ chức phù hợp." : "Chưa có tổ chức"} description={filtering ? "Thử đổi từ khóa hoặc bộ lọc." : "Tạo tổ chức đầu tiên, sau đó cấp OrganizationUser owner."} action={!filtering && <Button onClick={() => { resetCreate(); setCreating(true); }}><Plus size={16} aria-hidden="true" />Tạo tổ chức</Button>} /></TableMessage>}
          </tbody>
        </Table>
        {list.data && totalCount > 0 && <p className="adm-note" role="status">Hiển thị {items.length} trên {formatCount(totalCount)} · bộ lọc áp dụng toàn bộ danh sách.</p>}
        {totalCount > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={list.loading} />}
      </div>

      <DetailPane
        open={Boolean(selectedId)}
        label="Thông tin tổ chức"
        title={selected?.name ?? "Thông tin tổ chức"}
        subtitle={selected ? `slug ${selected.slug} · tạo ${formatDate(selected.createdAt)}` : undefined}
        onClose={closeDetail}
        placeholder={{ icon: Landmark, title: "Chọn một tổ chức", text: "Hồ sơ, quy mô và các thao tác quản trị hiện ở đây." }}
      >
        {selectedId && accessToken && <OrganizationDetail key={`${selectedId}:${detailVersion}`} id={selectedId} accessToken={accessToken} onToggle={(organization) => { setToggleError(""); setToggling(organization); }} onSaved={list.reload} />}
      </DetailPane>
    </Split>

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
