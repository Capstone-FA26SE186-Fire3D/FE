"use client";

import { Plus, RefreshCw, Search, UserCog, Users } from "lucide-react";
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
import type { UserRole } from "@/features/auth/types";
import { accountsApi } from "../api";
import type { ManagedAccount } from "../types";

const PAGE_SIZE = 20;
const roles: Array<{ value: UserRole; label: string }> = [
  { value: 0, label: "Platform admin" },
  { value: 1, label: "Thành viên tổ chức" },
  { value: 2, label: "Học viên" },
];
const roleLabel = (role: UserRole) => roles.find((item) => item.value === role)?.label ?? "Không xác định";
const formatDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleString("vi-VN") : "Chưa có");

type CreateForm = { email: string; password: string; fullName: string; role: UserRole; organizationId: string };

function createErrors(form: CreateForm) {
  const errors: Partial<Record<keyof CreateForm, string>> = {};
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Nhập email hợp lệ.";
  if (form.password.length < 12 || form.password.length > 128) errors.password = "Mật khẩu dài từ 12 đến 128 ký tự.";
  if (form.role === 1 && !form.organizationId) errors.organizationId = "Chọn tổ chức cho tài khoản này.";
  return errors;
}

export function AccountsAdmin({ initialOrganizationId = "" }: { initialOrganizationId?: string }) {
  const toast = useToast();
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const urlSearch = get("q");
  const role = get("role");
  const active = get("status");
  const organizationId = get("organizationId") || initialOrganizationId;

  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);
  const [selected, setSelected] = useState<ManagedAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>({ email: "", password: "", fullName: "", role: initialOrganizationId ? 1 : 2, organizationId: initialOrganizationId });
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof createErrors>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
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
  const orgName = (id: string | null | undefined) => orgItems.find((organization) => organization.id === id)?.name;
  const filtering = Boolean(urlSearch || role || active || organizationId);

  const openDetail = async (id: string) => {
    if (!accessToken) return;
    try {
      setSelected(await accountsApi.get(accessToken, id));
    } catch {
      toast.notify({ tone: "danger", title: "Không mở được tài khoản", description: "Hãy tải lại danh sách rồi thử lại." });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || saving) return;
    const errors = createErrors(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setFormError("");
    try {
      await accountsApi.create(accessToken, { email: form.email.trim(), password: form.password, fullName: form.fullName.trim(), role: form.role, organizationId: form.role === 1 ? form.organizationId || null : null });
      setCreating(false);
      setForm({ email: "", password: "", fullName: "", role: 2, organizationId: "" });
      toast.notify({ tone: "success", title: "Đã tạo tài khoản", description: "Danh sách đã được tải lại." });
      list.reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors.length) {
        setFieldErrors({ email: cause.fieldMessage("email"), password: cause.fieldMessage("password"), organizationId: cause.fieldMessage("organizationId") });
      }
      setFormError(cause instanceof ApiError && cause.status === 409 ? "Email này đã được sử dụng." : "Không thể tạo tài khoản. Nội dung bạn nhập vẫn được giữ lại; hãy kiểm tra và thử lại.");
    } finally {
      setSaving(false);
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

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user?.role !== 0) return <Alert tone="danger" title="Không có quyền truy cập">Chỉ PlatformAdmin có thể xem và quản lý tài khoản.</Alert>;

  const statusBadge = (account: ManagedAccount) => <StatusBadge tone={account.isActive ? "success" : "neutral"}>{account.isActive ? "Hoạt động" : "Vô hiệu hóa"}</StatusBadge>;

  return <>
    <PageHeader
      title="Tài khoản"
      description="Danh sách, trạng thái và tạo tài khoản mới qua Fire3D API."
      breadcrumbs={[{ label: "Quản trị", href: routes.adminOverview }, { label: "Tài khoản" }]}
      actions={<><Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />{list.loading ? "Đang tải…" : "Tải lại"}</Button><Button onClick={() => { setFieldErrors({}); setFormError(""); setCreating(true); }}><Plus size={16} aria-hidden="true" />Tạo tài khoản</Button></>}
    />

    <div className="ops-toolbar">
      <div className="ops-field ops-toolbar-grow" style={{ position: "relative" }}>
        <label htmlFor="account-search" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Tìm tài khoản</label>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 13, color: "var(--dim)" }} />
        <Input id="account-search" style={{ paddingLeft: 36 }} placeholder="Email hoặc tên" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
      </div>
      <Select aria-label="Vai trò" style={{ width: 190 }} value={role} onChange={(event) => setParams({ role: event.target.value })}>
        <option value="">Mọi vai trò</option>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </Select>
      <Select aria-label="Trạng thái" style={{ width: 170 }} value={active} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option><option value="true">Đang hoạt động</option><option value="false">Đã vô hiệu hóa</option>
      </Select>
      <Select aria-label="Tổ chức" style={{ width: 200 }} value={organizationId} onChange={(event) => setParams({ organizationId: event.target.value })}>
        <option value="">Mọi tổ chức</option>{orgItems.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </Select>
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách tài khoản" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>Hãy kiểm tra kết nối rồi thử lại.</Alert>}

    <Table caption="Danh sách tài khoản">
      <thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={6} label="Đang tải danh sách tài khoản…" /></TableMessage>}
        {items.map((account) => <tr key={account.id}>
          <td><button type="button" className="ops-cell-primary" style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => void openDetail(account.id)}>{account.fullName || account.email}<span className="ops-cell-sub">{account.email}</span></button></td>
          <td>{roleLabel(account.role)}</td>
          <td>{statusBadge(account)}</td>
          <td className="ops-cell-actions"><Button size="sm" variant="quiet" onClick={() => setToggling(account)} aria-label={`${account.isActive ? "Khóa" : "Mở"} ${account.email}`}>{account.isActive ? "Khóa" : "Mở"}</Button></td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={filtering ? Search : Users} title={filtering ? "Không có tài khoản phù hợp." : "Chưa có tài khoản"} description={filtering ? "Thử đổi từ khóa hoặc bộ lọc." : "Tạo tài khoản đầu tiên cho tổ chức hoặc học viên."} /></TableMessage>}
      </tbody>
    </Table>
    {totalCount > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected?.fullName || selected?.email || "Tài khoản"} description={selected?.email}
      footer={selected && <Button variant={selected.isActive ? "secondary" : "primary"} onClick={() => setToggling(selected)}><UserCog size={16} aria-hidden="true" />{selected.isActive ? "Vô hiệu hóa" : "Kích hoạt"}</Button>}>
      {selected && <dl className="ops-stack" style={{ margin: 0 }}>
        <div><dt className="ops-field-hint">Vai trò</dt><dd style={{ margin: 0 }}>{roleLabel(selected.role)}</dd></div>
        <div><dt className="ops-field-hint">Trạng thái</dt><dd style={{ margin: 0 }}>{statusBadge(selected)}</dd></div>
        {selected.organizationId && <div><dt className="ops-field-hint">Tổ chức</dt><dd style={{ margin: 0 }}>{orgName(selected.organizationId) ?? selected.organizationId}</dd></div>}
        <div><dt className="ops-field-hint">Đăng nhập gần nhất</dt><dd style={{ margin: 0 }}>{formatDate(selected.lastLoginAt)}</dd></div>
      </dl>}
    </Drawer>

    <Drawer open={creating} onOpenChange={(open) => { if (!open && !saving) setCreating(false); }} title="Tạo tài khoản" description="Vai trò và tổ chức không đổi được sau khi tạo.">
      <form onSubmit={submit} noValidate className="ops-stack">
        <Field label="Email" required error={fieldErrors.email}>{(p) => <Input {...p} type="email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />}</Field>
        <Field label="Mật khẩu" required hint="Từ 12 đến 128 ký tự." error={fieldErrors.password}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />}</Field>
        <Field label="Họ và tên">{(p) => <Input {...p} maxLength={200} autoComplete="off" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />}</Field>
        <Field label="Vai trò">{(p) => <Select {...p} value={form.role} onChange={(event) => setForm({ ...form, role: Number(event.target.value) as UserRole })}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>}</Field>
        {form.role === 1 && <Field label="Tổ chức" required error={fieldErrors.organizationId}>{(p) => <Select {...p} value={form.organizationId} onChange={(event) => setForm({ ...form, organizationId: event.target.value })}><option value="">Chọn tổ chức</option>{orgItems.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</Select>}</Field>}
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
          <Button type="button" variant="quiet" onClick={() => setCreating(false)} disabled={saving}>Hủy</Button>
          <Button type="submit" disabled={saving}>{saving ? "Đang tạo…" : "Tạo tài khoản"}</Button>
        </div>
      </form>
    </Drawer>

    <Modal open={toggling !== null} onOpenChange={(open) => { if (!open && !toggleBusy) setToggling(null); }}
      title={toggling?.isActive ? "Vô hiệu hóa tài khoản?" : "Kích hoạt tài khoản?"}
      description={toggling ? (toggling.isActive ? `${toggling.email} sẽ không đăng nhập được cho tới khi được kích hoạt lại.` : `${toggling.email} sẽ đăng nhập lại được.`) : undefined}
      footer={<><Button variant="quiet" onClick={() => setToggling(null)} disabled={toggleBusy}>Hủy</Button><Button variant={toggling?.isActive ? "danger" : "primary"} onClick={() => void confirmToggle()} disabled={toggleBusy}>{toggleBusy ? "Đang lưu…" : toggling?.isActive ? "Vô hiệu hóa" : "Kích hoạt"}</Button></>}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Thao tác này được ghi nhận trong nhật ký hệ thống.</p>
    </Modal>
  </>;
}
