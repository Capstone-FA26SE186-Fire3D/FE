"use client";

import { Building2, Landmark, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { describeApiError } from "@/api/describe-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/dialog";
import type { RowMenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { RetryButton } from "@/components/ui/retry-button";
import { routes } from "@/configs/routes";
import { formatCount } from "@/features/admin-overview/format";
import { useAuthSession } from "@/features/auth/auth-session";
import { useMediaQuery } from "@/utils/use-media-query";
import { organizationsApi } from "../api";
import type { Organization } from "../types";
import { OrganizationDetail } from "./organization-detail";
import "@/assets/styles/ops-v2.css";

const PAGE_SIZE = 20;
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const formatDate = (value: string) => new Date(value).toLocaleDateString("vi-VN");
const buildingsHref = (id: string) => `${routes.adminOrganizations}/${id}/buildings`;
const accountsHref = (id: string) => `${routes.adminAccounts}?organizationId=${id}`;

type CreateErrors = { name?: string; slug?: string };

function organizationStatusChip(organization: Pick<Organization, "isActive">) {
  return <StatusBadge tone={organization.isActive ? "success" : "danger"}>{organization.isActive ? "Hoạt động" : "Vô hiệu"}</StatusBadge>;
}

/**
 * Admin v2 "Tổ chức" (Figma 52:1194 / 52:1416): DataTable with search + status chip, a row click deep-links to
 * `?organization=<id>` and opens the profile drawer (OrganizationDetail: PATCH + If-Match edit, counts, links), the
 * footer carries Vô hiệu hóa/Kích hoạt behind a confirm, and "Tạo tổ chức" is a centered modal.
 */
export function OrganizationsAdmin() {
  const toast = useToast();
  const router = useRouter();
  const formId = useId();
  const phone = useMediaQuery("(max-width: 767px)");
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
  const [submitState, setSubmitState] = useState<"idle" | "busy" | "done">("idle");
  const [toggling, setToggling] = useState<Organization | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const [detailVersion, setDetailVersion] = useState(0);
  /** The record the drawer has loaded (`GET /api/organizations/{id}`); the footer toggles this one, not the list row. */
  const [detailOrg, setDetailOrg] = useState<Organization | null>(null);

  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const list = useAsyncData(
    `organizations:${page}:${urlSearch}:${active}`,
    (signal) => organizationsApi.list(accessToken as string, { page, pageSize: PAGE_SIZE, search: urlSearch.trim() || undefined, isActive: active === "" ? undefined : active === "true" }, signal),
    enabled,
  );
  const items = list.data?.items ?? [];
  const totalCount = list.data?.totalCount ?? 0;
  const filtering = Boolean(urlSearch || active);
  const hasCounts = items.some((organization) => typeof organization.buildingCount === "number" || typeof organization.accountCount === "number");
  const saving = submitState !== "idle";

  const openDetail = (id: string) => setParams({ organization: id, page });
  const closeDetail = () => { setParams({ organization: null, page }); setDetailOrg(null); };
  const askToggle = (organization: Organization) => { setToggleError(""); setToggling(organization); };

  const resetCreate = () => { setName(""); setSlug(""); setSlugEdited(false); setErrors({}); setFormError(""); };
  const openCreate = () => { resetCreate(); setCreating(true); };

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
    setSubmitState("busy");
    setFormError("");
    try {
      const created = await organizationsApi.create(accessToken, { name: normalizedName, slug: normalizedSlug });
      setSubmitState("done");
      toast.notify({ tone: "success", title: "Đã tạo tổ chức", description: `${created.name}. Hãy tạo OrganizationUser owner để bắt đầu quản lý công trình.` });
      list.reload();
      window.setTimeout(() => {
        setCreating(false);
        resetCreate();
        setSubmitState("idle");
        setParams({ organization: created.id, page: 1 });
      }, 600);
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
      setSubmitState("idle");
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
      setDetailOrg((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
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

  const listed = items.find((organization) => organization.id === selectedId);
  const shown = detailOrg?.id === selectedId ? detailOrg : listed;

  const columns: DataColumn<Organization>[] = [
    { key: "name", header: "Tổ chức", primary: true, render: (organization) => <CellTitle title={organization.name} sub={organization.slug} /> },
    ...(hasCounts ? [
      { key: "buildings", header: "Công trình", width: 120, hideBelow: 900, align: "right", render: (organization) => formatCount(organization.buildingCount) ?? "—" } satisfies DataColumn<Organization>,
      { key: "accounts", header: "Tài khoản", width: 120, hideBelow: 900, align: "right", render: (organization) => formatCount(organization.accountCount) ?? "—" } satisfies DataColumn<Organization>,
    ] : []),
    { key: "created", header: "Tạo lúc", width: 140, hideBelow: 760, render: (organization) => formatDate(organization.createdAt) },
    { key: "status", header: "Trạng thái", width: 140, render: organizationStatusChip },
  ];

  const rowMenu = (organization: Organization): RowMenuItem[] => [
    { label: "Mở công trình", icon: Building2, onSelect: () => router.push(buildingsHref(organization.id)) },
    { label: "Mở tài khoản", icon: Users, onSelect: () => router.push(accountsHref(organization.id)) },
    organization.isActive
      ? { label: "Vô hiệu hóa tổ chức", icon: ShieldAlert, tone: "danger", separator: true, onSelect: () => askToggle(organization) }
      : { label: "Kích hoạt tổ chức", icon: ShieldCheck, separator: true, onSelect: () => askToggle(organization) },
  ];

  return <>
    <PageHeader
      eyebrow="Quản lý hệ thống"
      title="Tổ chức"
      description="Bấm một hàng để xem hồ sơ, sửa trực tiếp và vô hiệu hóa."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Tổ chức" }]}
      actions={<><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo tổ chức</Button></>}
    />

    {list.error !== undefined && <Alert tone="danger" className="mb-4" title="Không tải được danh sách tổ chức" action={<RetryButton error={list.error} onRetry={list.reload} />}>{describeApiError(list.error, "Không tải được danh sách tổ chức. Hãy thử lại sau.")}</Alert>}

    <DataTable
      caption="Danh sách tổ chức"
      data-testid="organizations-table"
      columns={columns}
      rows={items}
      rowKey={(organization) => organization.id}
      loading={list.loading && !list.data}
      onRowClick={(organization) => openDetail(organization.id)}
      rowMenu={rowMenu}
      rowTone={(organization) => (organization.isActive ? undefined : "muted")}
      toolbar={<>
        <TableSearch value={searchText} onChange={setSearchText} label="Tìm tổ chức" placeholder="Tìm theo tên hoặc mã" />
        <FilterChips label="Bộ lọc tổ chức">
          <FilterChip label="Trạng thái" value={active} onChange={(value) => setParams({ status: value })} options={[{ value: "true", label: "Hoạt động" }, { value: "false", label: "Vô hiệu" }]} />
        </FilterChips>
      </>}
      empty={<EmptyState icon={filtering ? Search : Landmark} title={filtering ? "Không có tổ chức phù hợp." : "Chưa có tổ chức"} description={filtering ? "Thử đổi từ khóa hoặc bộ lọc." : "Tạo tổ chức đầu tiên, sau đó cấp OrganizationUser owner."} action={!filtering ? <Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo tổ chức</Button> : undefined} />}
      pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined}
    />
    {list.data && totalCount > 0 && <p className="ops-field-hint" style={{ margin: "10px 0 0" }} role="status">Hiển thị {items.length} trên {formatCount(totalCount)} · bộ lọc áp dụng toàn bộ danh sách.</p>}

    <Drawer open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) closeDetail(); }} side={phone ? "bottom" : "right"} size="md" data-testid="organization-drawer"
      title={shown?.name ?? "Thông tin tổ chức"}
      description={shown ? `slug ${shown.slug} · tạo ${formatDate(shown.createdAt)}` : "Hồ sơ, quy mô và các thao tác quản trị của tổ chức."}
      eyebrow={shown ? organizationStatusChip(shown) : undefined}
      footer={<>
        <Button variant="ghost" onClick={closeDetail}>Đóng</Button>
        <Button className={shown?.isActive ? "adm-btn-danger-outline" : undefined} variant={shown?.isActive ? "secondary" : "primary"} disabled={!shown} onClick={() => shown && askToggle(shown)}>
          {shown?.isActive === false ? <ShieldCheck size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}{shown?.isActive === false ? "Kích hoạt tổ chức" : "Vô hiệu hóa tổ chức"}
        </Button>
      </>}>
      {selectedId && accessToken && <OrganizationDetail key={`${selectedId}:${detailVersion}`} id={selectedId} accessToken={accessToken} onLoaded={setDetailOrg} onSaved={list.reload} />}
    </Drawer>

    <Modal open={creating} onOpenChange={(open) => { if (!open && !saving) setCreating(false); }} size="md" title="Tạo tổ chức" description="Slug là định danh URL, không đổi được sau khi tạo."
      footer={<>
        <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={saving}>Hủy</Button>
        <SubmitButton type="submit" form={formId} state={submitState} doneLabel="Đã tạo">Tạo tổ chức</SubmitButton>
      </>}>
      <form id={formId} onSubmit={submit} noValidate className="ops-stack">
        <Field label="Tên tổ chức" required error={errors.name}>{(p) => <Input {...p} maxLength={200} autoComplete="organization" placeholder="Ví dụ: Trường An Toàn" value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(slugify(value)); }} />}</Field>
        <Field label="Slug tổ chức" required hint="Chỉ dùng chữ thường, số và dấu gạch ngang." error={errors.slug}>{(p) => <Input {...p} maxLength={100} placeholder="truong-an-toan" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} />}</Field>
        {formError && <Alert tone="danger">{formError}</Alert>}
      </form>
    </Modal>

    <ConfirmDialog open={toggling !== null} onOpenChange={(open) => { if (!open) setToggling(null); }} busy={toggleBusy}
      tone={toggling?.isActive ? "danger" : "primary"}
      title={toggling?.isActive ? "Vô hiệu hóa tổ chức?" : "Kích hoạt tổ chức?"}
      description={toggling ? (toggling.isActive ? `${toggling.name} sẽ bị khóa: mọi phiên đăng nhập của OrganizationUser thuộc tổ chức bị thu hồi và họ không đăng nhập lại được cho tới khi tổ chức được kích hoạt.` : `${toggling.name} sẽ hoạt động trở lại. Người dùng cần đăng nhập lại; phiên cũ không được khôi phục.`) : undefined}
      confirmLabel={toggling?.isActive ? "Vô hiệu hóa" : "Kích hoạt"}
      onConfirm={confirmToggle}>
      {toggleError ? <Alert tone="danger">{toggleError}</Alert> : <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Thao tác này được ghi nhận trong nhật ký audit.</p>}
    </ConfirmDialog>
  </>;
}
