"use client";

import { Plus, RefreshCw, Search, ShieldAlert, UserCog, Users } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { describeApiError } from "@/api/describe-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/dialog";
import type { RowMenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton, LoadingBlock } from "@/components/ui/spinner";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { RetryButton } from "@/components/ui/retry-button";
import { routes } from "@/configs/routes";
import { Rows } from "@/features/admin-overview/components/admin-kit";
import { useAuthSession } from "@/features/auth/auth-session";
import type { UserRole } from "@/features/auth/types";
import { useMediaQuery } from "@/utils/use-media-query";
import { accountsApi } from "../api";
import type { ManagedAccount } from "../types";
import "@/assets/styles/ops-v2.css";

const PAGE_SIZE = 20;
const roles: Array<{ value: UserRole; label: string }> = [
  { value: 0, label: "Quản trị FET3D" },
  { value: 1, label: "Tài khoản tổ chức" },
  { value: 2, label: "Học viên" },
];
/** PlatformAdmin is granted outside this screen (Figma: "Không thể gán PlatformAdmin ở đây"), so the create form does not offer it. */
const creatableRoles = roles.filter((item) => item.value !== 0);
const roleOptions: ComboboxOption[] = creatableRoles.map((item) => ({ value: String(item.value), label: item.label }));
const roleLabel = (role: UserRole) => roles.find((item) => item.value === role)?.label ?? "Không xác định";
const roleTone = (role: UserRole): Tone => (role === 0 ? "ember" : role === 1 ? "info" : "neutral");
const formatDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleString("vi-VN") : "Chưa có");
const statusChip = (account: Pick<ManagedAccount, "isActive">) => <StatusBadge tone={account.isActive ? "success" : "danger"}>{account.isActive ? "Hoạt động" : "Đã khóa"}</StatusBadge>;

type CreateForm = { email: string; password: string; fullName: string; role: UserRole; organizationId: string };

function createErrors(form: CreateForm) {
  const errors: Partial<Record<keyof CreateForm, string>> = {};
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Nhập email hợp lệ.";
  if (form.password.length < 12 || form.password.length > 128) errors.password = "Mật khẩu dài từ 12 đến 128 ký tự.";
  if (form.role === 1 && !form.organizationId) errors.organizationId = "Chọn tổ chức cho tài khoản này.";
  return errors;
}

/**
 * Admin v2 "Tài khoản" (Figma 52:860 / 52:1094): DataTable with search + filter chips, a row click opens the account
 * drawer (role/status chips, key/values, Khóa/Kích hoạt in the footer), the "···" menu carries the same quick actions,
 * and "Tạo tài khoản" is a centered modal. Filters, search and organization scope stay in the URL.
 */
export function AccountsAdmin({ initialOrganizationId = "" }: { initialOrganizationId?: string }) {
  const toast = useToast();
  const formId = useId();
  const phone = useMediaQuery("(max-width: 767px)");
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const urlSearch = get("q");
  const role = get("role");
  const active = get("status");
  const organizationId = get("organizationId") || initialOrganizationId;

  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);
  const [selected, setSelected] = useState<ManagedAccount | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>({ email: "", password: "", fullName: "", role: initialOrganizationId ? 1 : 2, organizationId: initialOrganizationId });
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof createErrors>>({});
  const [formError, setFormError] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "busy" | "done">("idle");
  const [toggling, setToggling] = useState<ManagedAccount | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const enabled = ready && user?.role === 0 && Boolean(accessToken);
  const list = useAsyncData(
    `accounts:${page}:${urlSearch}:${role}:${active}:${organizationId}`,
    (signal) => accountsApi.list(accessToken as string, {
      page,
      pageSize: PAGE_SIZE,
      search: urlSearch.trim() || undefined,
      role: role === "" ? undefined : (Number(role) as UserRole),
      isActive: active === "" ? undefined : active === "true",
      organizationId: organizationId || undefined,
    }, signal),
    enabled,
  );
  const organizations = useAsyncData("accounts:organizations", () => accountsApi.organizations(accessToken as string), enabled);

  const items = list.data?.items ?? [];
  const totalCount = list.data?.totalCount ?? 0;
  const orgItems = organizations.data?.items ?? [];
  const orgOptions: ComboboxOption[] = orgItems.map((organization) => ({ value: organization.id, label: organization.name, hint: organization.slug }));
  const orgName = (id: string | null | undefined) => orgItems.find((organization) => organization.id === id)?.name;
  const orgCell = (id: string | null | undefined) => orgName(id) ?? (id ? `${id.slice(0, 8)}…` : "—");
  const filtering = Boolean(urlSearch || role || active || organizationId);
  const saving = submitState !== "idle";

  const openDetail = async (account: ManagedAccount) => {
    if (!accessToken || opening) return;
    setOpening(account.id);
    try {
      setSelected(await accountsApi.get(accessToken, account.id));
    } catch {
      toast.notify({ tone: "danger", title: "Không mở được tài khoản", description: "Hãy tải lại danh sách rồi thử lại." });
    } finally {
      setOpening(null);
    }
  };

  const openCreate = () => { setFieldErrors({}); setFormError(""); setCreating(true); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || saving) return;
    const errors = createErrors(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSubmitState("busy");
    setFormError("");
    try {
      await accountsApi.create(accessToken, { email: form.email.trim(), password: form.password, fullName: form.fullName.trim(), role: form.role, organizationId: form.role === 1 ? form.organizationId || null : null });
      setSubmitState("done");
      toast.notify({ tone: "success", title: "Đã tạo tài khoản", description: "Danh sách đã được tải lại." });
      list.reload();
      window.setTimeout(() => {
        setCreating(false);
        setForm({ email: "", password: "", fullName: "", role: initialOrganizationId ? 1 : 2, organizationId: initialOrganizationId });
        setSubmitState("idle");
      }, 600);
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors.length) {
        setFieldErrors({ email: cause.fieldMessage("email"), password: cause.fieldMessage("password"), organizationId: cause.fieldMessage("organizationId") });
      }
      setFormError(cause instanceof ApiError && cause.status === 409 ? "Email này đã được sử dụng." : "Không thể tạo tài khoản. Nội dung bạn nhập vẫn được giữ lại; hãy kiểm tra và thử lại.");
      setSubmitState("idle");
    }
  };

  const confirmToggle = async () => {
    if (!accessToken || !toggling) return;
    setToggleBusy(true);
    try {
      const updated = await accountsApi.setStatus(accessToken, toggling.id, !toggling.isActive);
      setSelected((current) => (current?.id === updated.id ? updated : current));
      toast.notify({ tone: "success", title: updated.isActive ? "Đã kích hoạt tài khoản" : "Đã vô hiệu hóa tài khoản", description: updated.email });
      setToggling(null);
      list.reload();
    } catch {
      toast.notify({ tone: "danger", title: "Không thể đổi trạng thái", description: "Hãy thử lại sau." });
    } finally {
      setToggleBusy(false);
    }
  };

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  if (user?.role !== 0) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ quản trị FET3D có thể xem và quản lý tài khoản.</Alert>;

  const columns: DataColumn<ManagedAccount>[] = [
    { key: "email", header: "Email", primary: true, render: (account) => <CellTitle title={account.email} sub={account.fullName || account.username || undefined} /> },
    { key: "role", header: "Vai trò", width: 170, render: (account) => <StatusBadge tone={roleTone(account.role)}>{roleLabel(account.role)}</StatusBadge> },
    { key: "organization", header: "Tổ chức", width: 200, hideBelow: 900, render: (account) => orgCell(account.organizationId) },
    { key: "status", header: "Trạng thái", width: 140, render: statusChip },
    { key: "lastLogin", header: "Đăng nhập gần nhất", width: 180, hideBelow: 1200, cardHidden: true, render: (account) => formatDate(account.lastLoginAt) },
  ];

  const rowMenu = (account: ManagedAccount): RowMenuItem[] => [
    account.isActive
      ? { label: "Khóa tài khoản", icon: ShieldAlert, tone: "danger", onSelect: () => setToggling(account) }
      : { label: "Kích hoạt tài khoản", icon: UserCog, onSelect: () => setToggling(account) },
  ];

  const selectedTitle = selected ? selected.fullName || selected.username || selected.email : "Chi tiết tài khoản";

  return <>
    <PageHeader
      eyebrow="Quản lý hệ thống"
      title="Tài khoản"
      description="Tạo mới mở hộp thoại; bấm hàng để xem và khóa/kích hoạt trong ngăn bên phải."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Tài khoản" }]}
      actions={<><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo tài khoản</Button></>}
    />

    {list.error !== undefined && <Alert tone="danger" className="mb-4" title="Không tải được danh sách tài khoản" action={<RetryButton error={list.error} onRetry={list.reload} />}>{describeApiError(list.error, "Không tải được danh sách tài khoản. Hãy thử lại sau.")}</Alert>}

    <DataTable
      caption="Danh sách tài khoản"
      data-testid="accounts-table"
      columns={columns}
      rows={items}
      rowKey={(account) => account.id}
      loading={list.loading && !list.data}
      onRowClick={(account) => void openDetail(account)}
      rowMenu={rowMenu}
      rowTone={(account) => (account.isActive ? undefined : "muted")}
      toolbar={<>
        <TableSearch value={searchText} onChange={setSearchText} label="Tìm tài khoản" placeholder="Tìm email hoặc họ tên" />
        <FilterChips label="Bộ lọc tài khoản">
          <FilterChip label="Vai trò" value={role} onChange={(value) => setParams({ role: value })} options={roles.map((item) => ({ value: String(item.value), label: item.label }))} />
          <FilterChip label="Trạng thái" value={active} onChange={(value) => setParams({ status: value })} options={[{ value: "true", label: "Hoạt động" }, { value: "false", label: "Đã khóa" }]} />
        </FilterChips>
        <div style={{ width: "min(240px, 100%)" }}>
          <Combobox aria-label="Tổ chức" value={organizationId} onChange={(value) => setParams({ organizationId: value })} options={orgOptions} placeholder="Tổ chức: tất cả" searchPlaceholder="Tìm tổ chức…" groupLabel="Tổ chức" loading={organizations.loading && !organizations.data} clearable data-testid="accounts-organization-filter" />
        </div>
      </>}
      empty={<EmptyState icon={filtering ? Search : Users} title={filtering ? "Không có tài khoản phù hợp." : "Chưa có tài khoản"} description={filtering ? "Thử đổi từ khóa hoặc bộ lọc." : "Tạo tài khoản đầu tiên cho tổ chức hoặc học viên."} action={!filtering ? <Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo tài khoản</Button> : undefined} />}
      pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined}
    />
    <p className="ops-field-hint" style={{ margin: "10px 0 0" }}>Vai trò và tổ chức không đổi được sau khi tạo.</p>

    <Drawer open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }} side={phone ? "bottom" : "right"} size="md" data-testid="account-drawer"
      title={selectedTitle}
      description={selected && selectedTitle !== selected.email ? selected.email : undefined}
      eyebrow={selected ? <><StatusBadge tone={roleTone(selected.role)}>{roleLabel(selected.role)}</StatusBadge>{statusChip(selected)}</> : undefined}
      footer={selected ? <>
        <Button variant="ghost" onClick={() => setSelected(null)}>Đóng</Button>
        <Button className={selected.isActive ? "adm-btn-danger-outline" : undefined} variant={selected.isActive ? "secondary" : "primary"} onClick={() => setToggling(selected)}>
          {selected.isActive ? <ShieldAlert size={16} aria-hidden="true" /> : <UserCog size={16} aria-hidden="true" />}{selected.isActive ? "Khóa tài khoản" : "Kích hoạt tài khoản"}
        </Button>
      </> : undefined}>
      {selected && <div className="ops-stack">
        <Rows items={[
          { label: "Họ tên", value: selected.fullName?.trim() ? selected.fullName : "Chưa có" },
          { label: "Vai trò", value: roleLabel(selected.role) },
          ...(selected.username ? [{ label: "Tên người dùng", value: selected.username }] : []),
          { label: "Tổ chức", value: orgCell(selected.organizationId) },
          { label: "Trạng thái", value: statusChip(selected) },
          { label: "Đăng nhập gần nhất", value: formatDate(selected.lastLoginAt) },
          { label: "Ngày tạo", value: formatDate(selected.createdAt) },
        ]} />
        <Alert tone="info" title="Không cấp quyền quản trị FET3D ở đây">Quyền quản trị FET3D được cấp riêng, không qua trang này. Vai trò và tổ chức của tài khoản không đổi được sau khi tạo.</Alert>
      </div>}
    </Drawer>

    <Modal open={creating} onOpenChange={(open) => { if (!open && !saving) setCreating(false); }} size="md" title="Tạo tài khoản" description="Vai trò và tổ chức không đổi được sau khi tạo."
      footer={<>
        <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={saving}>Hủy</Button>
        <SubmitButton type="submit" form={formId} state={submitState} doneLabel="Đã tạo">Tạo tài khoản</SubmitButton>
      </>}>
      <form id={formId} onSubmit={submit} noValidate className="ops-stack">
        <Field label="Email" required error={fieldErrors.email}>{(p) => <Input {...p} type="email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />}</Field>
        <Field label="Mật khẩu" required hint="Từ 12 đến 128 ký tự." error={fieldErrors.password}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />}</Field>
        <Field label="Họ và tên">{(p) => <Input {...p} maxLength={200} autoComplete="off" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />}</Field>
        <Field label="Vai trò" hint="Quyền quản trị FET3D được cấp riêng, không chọn ở đây.">{(p) => <Combobox {...p} value={String(form.role)} onChange={(value) => setForm({ ...form, role: Number(value) as UserRole })} options={roleOptions} groupLabel="Vai trò" />}</Field>
        {form.role === 1 && <Field label="Tổ chức" required error={fieldErrors.organizationId}>{(p) => <Combobox {...p} value={form.organizationId} onChange={(value) => setForm({ ...form, organizationId: value })} options={orgOptions} placeholder="Chọn tổ chức" searchPlaceholder="Tìm theo tên tổ chức…" groupLabel="Tổ chức đang hoạt động" emptyText="Không có tổ chức phù hợp" loading={organizations.loading && !organizations.data} />}</Field>}
        {formError && <Alert tone="danger">{formError}</Alert>}
      </form>
    </Modal>

    <ConfirmDialog open={toggling !== null} onOpenChange={(open) => { if (!open) setToggling(null); }} busy={toggleBusy}
      tone={toggling?.isActive ? "danger" : "primary"}
      title={toggling?.isActive ? "Vô hiệu hóa tài khoản?" : "Kích hoạt tài khoản?"}
      description={toggling ? (toggling.isActive ? `${toggling.email} sẽ không đăng nhập được cho tới khi được kích hoạt lại.` : `${toggling.email} sẽ đăng nhập lại được.`) : undefined}
      confirmLabel={toggling?.isActive ? "Vô hiệu hóa" : "Kích hoạt"}
      onConfirm={confirmToggle}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Thao tác này được ghi nhận trong nhật ký hệ thống.</p>
    </ConfirmDialog>
  </>;
}
