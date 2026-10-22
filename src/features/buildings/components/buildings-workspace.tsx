"use client";

import { Archive, Building2, LayoutGrid, List, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { ApiError } from "@/api/types/common";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { buildingConflict, buildingsApi, sameBuildingVersion } from "../api";
import { describeApiError, describeBuildingWriteError, formatDate, formatDateTime } from "../format";
import { organizationsApi } from "@/features/organizations/api";
import type { Building, BuildingSummary } from "../types";
import { BuildingConflictAlert, BuildingForm, buildingFormToInput, emptyForm, formFromBuilding, validateBuildingForm, type FormState } from "./building-form";
import { RetryButton } from "@/components/ui/retry-button";

const PAGE_SIZE = 20;
type StatusFilter = "active" | "archived" | "all";

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "active", label: "Đang hoạt động" },
  { value: "archived", label: "Đã lưu trữ" },
  { value: "all", label: "Tất cả" },
];

const loadError = "Không thể tải danh sách công trình. Hãy thử lại sau.";

function statusToFilter(status: StatusFilter) {
  return status === "all" ? undefined : status === "active";
}

/**
 * Building list/create/edit/archive. An OrganizationUser works inside their own tenant (no `organizationId`
 * is ever sent). PlatformAdmin must pick an organization: either through the `organizationId` prop (admin
 * route `/admin/organizations/[id]/buildings`) or the `?org=` picker on `/workspace/buildings`.
 */
export function BuildingsWorkspace({ organizationId: organizationIdProp }: { organizationId?: string } = {}) {
  const router = useRouter();
  const toast = useToast();
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = (["active", "archived", "all"].includes(get("status")) ? get("status") : "active") as StatusFilter;
  const view = get("view") === "cards" ? "cards" : "table";
  const urlSearch = get("q");

  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Building | null>(null);
  /** ETag of `editing`; a 412 replaces both with the server's newer version so the next save applies on top of it. */
  const [editEtag, setEditEtag] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Building | null>(null);
  const createKey = useIdempotencyKey();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateBuildingForm>>({});
  const submitting = useRef(false);
  const [archiving, setArchiving] = useState<BuildingSummary | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveEtag, setArchiveEtag] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState("");

  const isAdmin = user?.role === 0;
  // OrganizationUser: tenant comes from the account, so the parameter is never sent. PlatformAdmin: must choose.
  const scopedOrgId = isAdmin ? (organizationIdProp ?? (get("org") || undefined)) : undefined;
  const needsOrganization = ready && isAdmin && !scopedOrgId;
  const blocked = ready && user?.role === 1 && !user.organizationId;
  const enabled = Boolean(accessToken) && ready && !blocked && !needsOrganization;
  const { data, error, loading, reload } = useAsyncData(
    `buildings:${scopedOrgId ?? "own"}:${page}:${status}:${urlSearch}`,
    (signal) => buildingsApi.list(accessToken as string, { page, pageSize: PAGE_SIZE, search: urlSearch.trim() || undefined, isActive: statusToFilter(status), organizationId: scopedOrgId }, signal),
    enabled,
    { scope: scopedOrgId ?? "own" },
  );
  const organizations = useAsyncData(
    "buildings:org-picker",
    () => organizationsApi.list(accessToken as string, { pageSize: 100, page: 1 }),
    Boolean(accessToken) && ready && isAdmin && !organizationIdProp,
  );
  const organization = useAsyncData(
    `buildings:org:${scopedOrgId}`,
    () => organizationsApi.get(accessToken as string, scopedOrgId as string),
    Boolean(accessToken) && ready && isAdmin && Boolean(scopedOrgId),
    { keepPrevious: false },
  );
  const organizationName = organization.data?.name;

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const filtering = Boolean(urlSearch) || status !== "active";

  const openCreate = () => { setForm(emptyForm); setEditing(null); setEditEtag(null); setConflict(null); setFieldErrors({}); setFormError(""); setDrawer({ mode: "create" }); };

  const openEdit = async (id: string) => {
    if (!accessToken) return;
    setFieldErrors({});
    setFormError("");
    setConflict(null);
    try {
      const { data: building, etag } = await buildingsApi.getVersioned(accessToken, id);
      setEditing(building);
      setEditEtag(etag);
      setForm(formFromBuilding(building));
      setDrawer({ mode: "edit", id });
    } catch {
      toast.notify({ tone: "danger", title: "Không mở được công trình", description: "Hãy tải lại danh sách rồi thử lại." });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !drawer || saving || submitting.current) return;
    const errors = validateBuildingForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    submitting.current = true;
    setSaving(true);
    setFormError("");
    try {
      if (drawer.mode === "create") {
        const input = buildingFormToInput(form);
        // Same key while the payload is unchanged, so a retry after a lost response replays the first create instead of a duplicate.
        const created = await buildingsApi.create(accessToken, input, createKey.keyFor({ input, organizationId: scopedOrgId }), scopedOrgId);
        createKey.done();
        router.push(`${routes.workspaceBuildings}/${created.data.id}`);
      } else {
        // No ETag yet (header not readable on the first read): read it now rather than send a PUT the server rejects with 428.
        let etag = editEtag;
        if (!etag) {
          // The ETag read now belongs to the data read with it: if that data moved on since the drawer opened, show it as a
          // conflict instead of sending the old fields under the new ETag.
          const fresh = await buildingsApi.getVersioned(accessToken, drawer.id);
          if (!editing || !sameBuildingVersion(fresh.data, editing)) {
            setEditing(fresh.data);
            setEditEtag(fresh.etag);
            setConflict(fresh.data);
            return;
          }
          etag = fresh.etag;
        }
        if (!etag) { setFormError("Không đọc được phiên bản công trình (ETag). Hãy tải lại trang rồi thử lại."); return; }
        await buildingsApi.update(accessToken, drawer.id, buildingFormToInput(form, editing ?? undefined), etag, scopedOrgId);
        setDrawer(null);
        setConflict(null);
        toast.notify({ tone: "success", title: "Đã lưu công trình" });
        reload();
      }
    } catch (cause) {
      const stale = buildingConflict(cause);
      if (stale) {
        if (stale.current) setEditing(stale.current);
        setEditEtag(stale.etag);
        setConflict(stale.current ?? editing);
      } else {
        if (cause instanceof ApiError && cause.code === "IDEMPOTENCY_KEY_CONFLICT") createKey.done();
        setFormError(`${describeBuildingWriteError(cause, "Không thể lưu công trình.")} Nội dung bạn nhập vẫn được giữ lại.`);
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const openArchive = (building: BuildingSummary) => { setArchiving(building); setArchiveEtag(null); setArchiveNotice(""); };

  const changedNotice = (building: BuildingSummary) => `Công trình vừa được thay đổi ở nơi khác (cập nhật ${formatDateTime(building.updatedAt)}). Thông tin trên là bản mới nhất; bấm “Lưu trữ” lần nữa nếu vẫn muốn lưu trữ.`;

  const confirmArchive = async () => {
    if (!accessToken || !archiving) return;
    setArchiveBusy(true);
    try {
      let etag = archiveEtag;
      if (!etag) {
        // The list carries no ETag: read the detail first, and stop if it moved on since the list was loaded.
        const fresh = await buildingsApi.getVersioned(accessToken, archiving.id);
        etag = fresh.etag;
        if (Date.parse(fresh.data.updatedAt) !== Date.parse(archiving.updatedAt)) {
          setArchiving(fresh.data);
          setArchiveEtag(etag);
          setArchiveNotice(changedNotice(fresh.data));
          return;
        }
      }
      if (!etag) { setArchiveNotice("Không đọc được phiên bản công trình (ETag). Hãy tải lại trang rồi thử lại."); return; }
      await buildingsApi.archive(accessToken, archiving.id, etag, scopedOrgId);
      toast.notify({ tone: "success", title: "Đã lưu trữ công trình", description: archiving.name });
      setArchiving(null);
      reload();
    } catch (cause) {
      const stale = buildingConflict(cause);
      if (stale) {
        const current = stale.current ?? archiving;
        setArchiving(current);
        setArchiveEtag(stale.etag);
        setArchiveNotice(changedNotice(current));
      } else {
        toast.notify({ tone: "danger", title: "Không thể lưu trữ công trình", description: describeBuildingWriteError(cause, "Hãy thử lại sau.") });
      }
    } finally {
      setArchiveBusy(false);
    }
  };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  const crumbs: Crumb[] | undefined = isAdmin ? [
    { label: "Quản trị", href: routes.adminOverview },
    { label: "Tổ chức", href: routes.adminOrganizations },
    { label: "Công trình" },
  ] : undefined;
  const orgPicker = isAdmin && !organizationIdProp;

  if (blocked) {
    return <><PageHeader title="Công trình" description="Quản lý công trình và các phiên bản mô hình IFC của tổ chức." />
      <Alert tone="warning" title="Tài khoản chưa thuộc tổ chức nào">Hãy liên hệ PlatformAdmin để được gắn vào một tổ chức trước khi quản lý công trình.</Alert></>;
  }

  const pageDescription = isAdmin
    ? "Xem và quản lý công trình thay mặt tổ chức. Mọi thao tác đều áp dụng cho tổ chức đã chọn."
    : "Chọn một công trình để tiếp tục hành trình: IFC, kịch bản, phiên bản, phát hành.";

  const organizationSelect = orgPicker && <div className="ops-toolbar">
    <div className="ops-field ops-toolbar-grow">
      <label htmlFor="building-org">Tổ chức</label>
      <Select id="building-org" value={scopedOrgId ?? ""} disabled={organizations.loading && !organizations.data} onChange={(event) => setParams({ org: event.target.value })}>
        <option value="">Chọn tổ chức…</option>
        {(organizations.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? "" : " (đã khóa)"}</option>)}
      </Select>
    </div>
  </div>;

  if (needsOrganization) {
    return <>
      <PageHeader title="Công trình" description={pageDescription} breadcrumbs={crumbs} />
      {organizationSelect}
      {organizations.error !== undefined && <Alert tone="danger" title="Không tải được danh sách tổ chức" action={<RetryButton error={organizations.error} onRetry={organizations.reload} />}>Hãy thử lại sau.</Alert>}
      <EmptyState icon={Building2} title="Chọn tổ chức để xem công trình" description="Công trình thuộc về từng tổ chức. PlatformAdmin cần chọn tổ chức trước khi xem hoặc tạo công trình." action={<Button asChild variant="secondary"><Link href={routes.adminOrganizations}>Mở danh sách tổ chức</Link></Button>} />
    </>;
  }

  const rowActions = (building: BuildingSummary) => <span className="ops-actions" style={{ justifyContent: "flex-end" }}>
    <Button asChild size="sm" variant="secondary"><Link href={`${routes.workspaceBuildings}/${building.id}`} aria-label={`Mở hành trình ${building.name}`}>Mở</Link></Button>
    <Button size="sm" variant="quiet" onClick={() => void openEdit(building.id)} aria-label={`Chỉnh sửa ${building.name}`}><Pencil size={14} aria-hidden="true" />Sửa</Button>
    {building.isActive && <Button size="sm" variant="quiet" onClick={() => openArchive(building)} aria-label={`Lưu trữ ${building.name}`}><Archive size={14} aria-hidden="true" />Lưu trữ</Button>}
  </span>;

  const statusBadge = (building: BuildingSummary) => <StatusBadge tone={building.isActive ? "success" : "neutral"}>{building.isActive ? "Hoạt động" : "Đã lưu trữ"}</StatusBadge>;

  return <>
    <PageHeader
      eyebrow={isAdmin ? undefined : "Huấn luyện"}
      title={isAdmin && organizationName ? `Công trình · ${organizationName}` : "Công trình"}
      description={pageDescription}
      breadcrumbs={crumbs}
      actions={<><Button variant="quiet" onClick={reload} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{loading ? "Đang tải…" : "Tải lại"}</Button><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo công trình</Button></>}
    />

    {organizationSelect}
    {organization.error !== undefined && <Alert tone="danger" title="Không đọc được tổ chức">Tổ chức không tồn tại hoặc bạn không có quyền xem. Hãy chọn lại từ danh sách tổ chức.</Alert>}

    <div className="ops-toolbar">
      <div className="ops-field ops-toolbar-grow" style={{ position: "relative" }}>
        <label htmlFor="building-search" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Tìm công trình</label>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 13, color: "var(--dim)" }} />
        <Input id="building-search" style={{ paddingLeft: 36 }} placeholder="Tìm công trình" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
      </div>
      <Select aria-label="Trạng thái" style={{ width: 180 }} value={status} onChange={(event) => setParams({ status: event.target.value === "active" ? "" : event.target.value })}>
        {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
      <div className="ops-segmented" role="group" aria-label="Kiểu hiển thị">
        <button type="button" aria-pressed={view === "table"} aria-label="Dạng bảng" title="Dạng bảng" onClick={() => setParams({ view: "" })}><List size={16} aria-hidden="true" /></button>
        <button type="button" aria-pressed={view === "cards"} aria-label="Dạng thẻ" title="Dạng thẻ" onClick={() => setParams({ view: "cards" })}><LayoutGrid size={16} aria-hidden="true" /></button>
      </div>
    </div>

    {error !== undefined && <Alert tone="danger" title="Không tải được danh sách" action={<RetryButton error={error} onRetry={reload} />}>{describeApiError(error, loadError)}</Alert>}

    {view === "table"
      ? <Table caption="Danh sách công trình">
        <thead><tr><th>Công trình</th><th>Loại</th><th>Số tầng</th><th>Trạng thái</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>
          {loading && !data && <TableMessage colSpan={6}><SkeletonRows rows={5} label="Đang tải danh sách công trình…" /></TableMessage>}
          {items.map((building) => <tr key={building.id}>
            <td><Link className="ops-cell-primary" href={`${routes.workspaceBuildings}/${building.id}`}>{building.name}</Link></td>
            <td>{building.buildingType || "Chưa phân loại"}</td>
            <td>{building.totalFloors}</td>
            <td>{statusBadge(building)}</td>
            <td>{formatDate(building.updatedAt)}</td>
            <td className="ops-cell-actions">{rowActions(building)}</td>
          </tr>)}
          {data && !items.length && <TableMessage colSpan={6}>{filtering
            ? <EmptyState icon={Search} title="Chưa có công trình phù hợp." description="Thử đổi từ khóa hoặc bộ lọc trạng thái." />
            : <EmptyState icon={Building2} title="Tạo công trình đầu tiên" description="Thêm công trình, tải lên mô hình IFC rồi xây dựng kịch bản sơ tán cho đúng không gian thật." action={<Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo công trình</Button>} />}</TableMessage>}
        </tbody>
      </Table>
      : <>
        {loading && !data && <SkeletonRows rows={4} label="Đang tải danh sách công trình…" />}
        {data && !items.length && (filtering
          ? <EmptyState icon={Search} title="Chưa có công trình phù hợp." description="Thử đổi từ khóa hoặc bộ lọc trạng thái." />
          : <EmptyState icon={Building2} title="Tạo công trình đầu tiên" description="Thêm công trình, tải lên mô hình IFC rồi xây dựng kịch bản sơ tán cho đúng không gian thật." action={<Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo công trình</Button>} />)}
        <div className="ops-card-grid">
          {items.map((building) => <article key={building.id} className="ops-item-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><h3><Link href={`${routes.workspaceBuildings}/${building.id}`}>{building.name}</Link></h3>{statusBadge(building)}</div>
            <dl><dt>Loại</dt><dd>{building.buildingType || "Chưa phân loại"}</dd><dt>Số tầng</dt><dd>{building.totalFloors}</dd></dl>
            {rowActions(building)}
          </article>)}
        </div>
      </>}

    {totalCount > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} disabled={loading} />}

    <Drawer
      open={drawer !== null}
      onOpenChange={(open) => { if (!open && !saving) setDrawer(null); }}
      title={drawer?.mode === "edit" ? "Chỉnh sửa công trình" : "Tạo công trình"}
      description={drawer?.mode === "edit" ? "Các thông tin không hiển thị ở đây (tọa độ, liên hệ) được giữ nguyên." : "Sau khi tạo, bạn sẽ chuyển tới trang công trình để tải lên mô hình IFC."}
    >
      <form onSubmit={submit} noValidate className="ops-stack">
        {conflict && <BuildingConflictAlert current={conflict} onUseLatest={() => { setForm(formFromBuilding(conflict)); setConflict(null); }} />}
        <BuildingForm form={form} errors={fieldErrors} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
        {formError && <Alert tone="danger">{formError}</Alert>}
        <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
          <Button type="button" variant="quiet" onClick={() => setDrawer(null)} disabled={saving}>Hủy</Button>
          <Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : drawer?.mode === "edit" ? "Lưu thay đổi" : "Tạo và thêm IFC"}</Button>
        </div>
      </form>
    </Drawer>

    <Modal
      open={archiving !== null}
      onOpenChange={(open) => { if (!open && !archiveBusy) setArchiving(null); }}
      title="Lưu trữ công trình?"
      description={archiving ? `“${archiving.name}” sẽ chuyển sang trạng thái đã lưu trữ. Dữ liệu IFC và kịch bản không bị xóa.` : undefined}
      footer={<><Button variant="quiet" onClick={() => setArchiving(null)} disabled={archiveBusy}>Hủy</Button><Button variant="danger" onClick={() => void confirmArchive()} disabled={archiveBusy}>{archiveBusy ? "Đang lưu trữ…" : "Lưu trữ"}</Button></>}
    >
      {archiveNotice && <Alert tone="warning" title="Công trình đã thay đổi">{archiveNotice}</Alert>}
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Công trình đã lưu trữ không xuất hiện trong danh sách mặc định; bạn có thể xem lại bằng bộ lọc “Đã lưu trữ”.</p>
    </Modal>
  </>;
}
