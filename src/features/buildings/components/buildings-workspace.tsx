"use client";

import { Archive, BarChart3, Building2, LayoutGrid, List, PenLine, Pencil, Play, Plus, RefreshCw, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useIdempotencyKey } from "@/api/idempotency";
import { ApiError } from "@/api/types/common";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DataTable, CellTitle, TableSearch, ViewToggle, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { PageHeader, type Crumb } from "@/components/ui/page-header";
import { RetryButton } from "@/components/ui/retry-button";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton, LoadingBlock } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { useAuthSession } from "@/features/auth/auth-session";
import { organizationsApi } from "@/features/organizations/api";
import { buildingConflict, buildingsApi, sameBuildingVersion } from "../api";
import { buildingTypes } from "../data/building-types";
import { describeApiError, describeBuildingWriteError, formatDateTime } from "../format";

const shortDate = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatShortDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : shortDate.format(date); };
import type { Building, BuildingSummary } from "../types";
import { useBuildingStep, type BuildingStep } from "../use-building-step";
import { BuildingConflictAlert, BuildingForm, buildingFormToInput, emptyForm, formFromBuilding, validateBuildingForm, type FormState } from "./building-form";

const PAGE_SIZE = 20;
type StatusFilter = "active" | "archived" | "all";

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "active", label: "Đang dùng" },
  { value: "archived", label: "Đã lưu trữ" },
  { value: "all", label: "Tất cả" },
];
const typeOptions = buildingTypes.map((type) => ({ value: type, label: type }));

const loadError = "Không thể tải danh sách công trình. Hãy thử lại sau.";

function statusToFilter(status: StatusFilter) {
  return status === "all" ? undefined : status === "active";
}

const ACTION_ICONS = { upload: Upload, progress: Play, author: PenLine, open: Building2 } as const;

function detailHref(id: string, step?: BuildingStep["action"]) {
  if (!step) return `${routes.workspaceBuildings}/${id}`;
  const query = new URLSearchParams({ tab: step.tab });
  if (step.sub) query.set("sub", step.sub);
  if (step.upload) query.set("upload", "1");
  return `${routes.workspaceBuildings}/${id}?${query}`;
}

/** "Bước hiện tại" chip: two light reads per row, resolved lazily; the row never waits for them. */
function StepCell({ accessToken, building, enabled }: { accessToken: string; building: BuildingSummary; enabled: boolean }) {
  const step = useBuildingStep(accessToken, building.id, enabled);
  if (!building.isActive) return <StatusBadge tone="neutral">Đã lưu trữ</StatusBadge>;
  if (!step.data) return step.error !== undefined ? <span className="ops-muted">—</span> : <Skeleton style={{ height: 22, width: 110, borderRadius: 999 }} />;
  return <StatusBadge tone={step.data.tone} data-testid="building-step">{step.data.label}</StatusBadge>;
}

/** "Việc tiếp theo" button: the one action that moves this building forward (Figma list column). */
function NextActionCell({ accessToken, building, enabled }: { accessToken: string; building: BuildingSummary; enabled: boolean }) {
  const step = useBuildingStep(accessToken, building.id, enabled);
  if (!building.isActive) return null;
  const action = step.data?.action ?? (step.error !== undefined ? { label: "Mở công trình", icon: "open" as const, tab: "journey" as const } : null);
  if (!action) return <Skeleton style={{ height: 36, width: 120 }} />;
  const Icon = ACTION_ICONS[action.icon];
  return <Button asChild size="sm" variant="secondary" className="bd-next-action"><Link href={detailHref(building.id, action)} data-row-stop onClick={(event) => event.stopPropagation()}><Icon size={14} aria-hidden="true" />{action.label}</Link></Button>;
}

/**
 * Building list (Figma "Danh sách công trình" v2): DataTable with search, status/type chips and a table/cards toggle;
 * click a row to open it; "Thêm công trình" and "Sửa" are modals; "Lưu trữ" sits in the row menu behind a confirmation
 * (one-way: BE sets isActive=false and nothing restores it). OrganizationUser works in their own tenant; PlatformAdmin
 * picks an organization (`organizationId` prop or `?org=`).
 */
export function BuildingsWorkspace({ organizationId: organizationIdProp }: { organizationId?: string } = {}) {
  const router = useRouter();
  const toast = useToast();
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = (["active", "archived", "all"].includes(get("status")) ? get("status") : "active") as StatusFilter;
  const typeFilter = get("type");
  const view = get("view") === "cards" ? "cards" : "table";
  const urlSearch = get("q");

  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);
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

  // The type filter is client-side: BE has no type query and the list is one page of ≤20 anyway.
  const allItems = data?.items ?? [];
  const items = typeFilter ? allItems.filter((building) => (building.buildingType ?? "").localeCompare(typeFilter, "vi", { sensitivity: "base" }) === 0) : allItems;
  const totalCount = data?.totalCount ?? 0;
  const filtering = Boolean(urlSearch) || status !== "active" || Boolean(typeFilter);

  const openCreate = () => { setForm(emptyForm); setEditing(null); setEditEtag(null); setConflict(null); setFieldErrors({}); setFormError(""); setDialog({ mode: "create" }); };

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
      setDialog({ mode: "edit", id });
    } catch {
      toast.notify({ tone: "danger", title: "Không mở được công trình", description: "Hãy tải lại danh sách rồi thử lại." });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !dialog || saving || submitting.current) return;
    const errors = validateBuildingForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    submitting.current = true;
    setSaving(true);
    setFormError("");
    try {
      if (dialog.mode === "create") {
        const input = buildingFormToInput(form);
        // Same key while the payload is unchanged, so a retry after a lost response replays the first create instead of a duplicate.
        const created = await buildingsApi.create(accessToken, input, createKey.keyFor({ input, organizationId: scopedOrgId }), scopedOrgId);
        createKey.done();
        // Straight to the IFC tab: the next thing to do after creating a building is uploading its model.
        router.push(`${routes.workspaceBuildings}/${created.data.id}?tab=ifc`);
      } else {
        // No ETag yet (header not readable on the first read): read it now rather than send a PUT the server rejects with 428.
        let etag = editEtag;
        if (!etag) {
          const fresh = await buildingsApi.getVersioned(accessToken, dialog.id);
          if (!editing || !sameBuildingVersion(fresh.data, editing)) {
            setEditing(fresh.data);
            setEditEtag(fresh.etag);
            setConflict(fresh.data);
            return;
          }
          etag = fresh.etag;
        }
        if (!etag) { setFormError("Chưa xác định được bản thông tin công trình đang sửa. Hãy tải lại trang rồi thử lại."); return; }
        await buildingsApi.update(accessToken, dialog.id, buildingFormToInput(form, editing ?? undefined), etag, scopedOrgId);
        setDialog(null);
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
      if (!etag) { setArchiveNotice("Chưa xác định được bản thông tin công trình đang sửa. Hãy tải lại trang rồi thử lại."); return; }
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

  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;
  const crumbs: Crumb[] | undefined = isAdmin ? [
    { label: "Quản trị", href: routes.adminOverview },
    { label: "Tổ chức", href: routes.adminOrganizations },
    { label: "Công trình" },
  ] : undefined;
  const orgPicker = isAdmin && !organizationIdProp;

  if (blocked) {
    return <><PageHeader title="Công trình" description="Quản lý công trình và các phiên bản mô hình IFC của tổ chức." />
      <Alert tone="warning" title="Tài khoản chưa thuộc tổ chức nào">Hãy liên hệ quản trị FET3D để được thêm vào một tổ chức trước khi quản lý công trình.</Alert></>;
  }

  const pageDescription = isAdmin
    ? "Xem và quản lý công trình thay mặt tổ chức. Mọi thao tác đều áp dụng cho tổ chức đã chọn."
    : "Bấm vào một hàng để mở công trình; nút bên phải đưa bạn thẳng tới việc tiếp theo.";

  const organizationSelect = orgPicker && <div className="ops-toolbar">
    <div className="ops-field ops-toolbar-grow" style={{ maxWidth: 420 }}>
      <label htmlFor="building-org">Tổ chức</label>
      <Combobox id="building-org" value={scopedOrgId ?? ""} placeholder="Chọn tổ chức…" searchPlaceholder="Tìm tổ chức…" groupLabel="Tổ chức" loading={organizations.loading && !organizations.data} options={(organizations.data?.items ?? []).map((item) => ({ value: item.id, label: item.name, hint: item.isActive ? undefined : "Đã khóa" }))} onChange={(value) => setParams({ org: value })} aria-label="Tổ chức" />
    </div>
  </div>;

  if (needsOrganization) {
    return <>
      <PageHeader title="Công trình" description={pageDescription} breadcrumbs={crumbs} />
      {organizationSelect}
      {organizations.error !== undefined && <Alert tone="danger" title="Không tải được danh sách tổ chức" action={<RetryButton error={organizations.error} onRetry={organizations.reload} />}>Hãy thử lại sau.</Alert>}
      <EmptyState icon={Building2} title="Chọn tổ chức để xem công trình" description="Công trình thuộc về từng tổ chức. Hãy chọn tổ chức trước khi xem hoặc tạo công trình." action={<Button asChild variant="secondary"><Link href={routes.adminOrganizations}>Mở danh sách tổ chức</Link></Button>} />
    </>;
  }

  const createLabel = isAdmin ? "Tạo công trình" : "Thêm công trình";
  const token = accessToken ?? "";
  const stepsEnabled = Boolean(accessToken) && !isAdmin;

  const columns: DataColumn<BuildingSummary>[] = [
    { key: "name", header: "Công trình", primary: true, width: "34%", render: (building) => <CellTitle title={<span id={`building-name-${building.id}`}>{building.name}</span>} sub={building.buildingType ? undefined : "Chưa phân loại"} /> },
    { key: "type", header: "Loại", width: 130, render: (building) => building.buildingType || <span className="ops-muted">—</span> },
    { key: "floors", header: "Tầng", width: 70, align: "center", hideBelow: 900, render: (building) => building.totalFloors },
    ...(isAdmin
      ? [{ key: "status", header: "Trạng thái", width: 150, render: (building: BuildingSummary) => <StatusBadge tone={building.isActive ? "success" : "neutral"}>{building.isActive ? "Hoạt động" : "Đã lưu trữ"}</StatusBadge> }]
      : [{ key: "step", header: "Bước hiện tại", width: 190, render: (building: BuildingSummary) => <StepCell accessToken={token} building={building} enabled={stepsEnabled} /> }]),
    { key: "updated", header: "Cập nhật", width: 120, hideBelow: 1100, render: (building) => formatShortDate(building.updatedAt) },
    ...(isAdmin ? [] : [{ key: "next", header: "Việc tiếp theo", width: 170, cardHidden: true, render: (building: BuildingSummary) => <NextActionCell accessToken={token} building={building} enabled={stepsEnabled} /> }]),
  ];

  const empty: ReactNode = filtering
    ? <EmptyState icon={Search} title="Chưa có công trình phù hợp." description="Thử đổi từ khóa hoặc bộ lọc." />
    : <EmptyState icon={Building2} title="Tạo công trình đầu tiên" description="Thêm công trình, tải lên mô hình IFC rồi xây dựng kịch bản sơ tán cho đúng không gian thật." />;

  const toolbar = <>
    <TableSearch value={searchText} onChange={setSearchText} placeholder="Tìm theo tên công trình" label="Tìm công trình" />
    <FilterChip label="Trạng thái" value={status === "active" ? "" : status} options={statusOptions.filter((option) => option.value !== "active")} allLabel="Đang dùng" onChange={(value) => setParams({ status: value })} />
    <FilterChip label="Loại" value={typeFilter} options={typeOptions} onChange={(value) => setParams({ type: value })} />
    {isAdmin && <Button variant="quiet" size="sm" onClick={reload} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>}
    <ViewToggle value={view} onChange={(value) => setParams({ view: value === "table" ? "" : value })} options={[{ value: "table", label: "Dạng bảng", icon: <List size={16} aria-hidden="true" /> }, { value: "cards", label: "Dạng thẻ", icon: <LayoutGrid size={16} aria-hidden="true" /> }]} />
  </>;

  return <div className={isAdmin ? undefined : "org"} data-tour="buildings-list">
    <PageHeader
      eyebrow={isAdmin ? undefined : "Huấn luyện"}
      title={isAdmin && organizationName ? `Công trình · ${organizationName}` : isAdmin ? "Công trình" : "Công trình của tổ chức"}
      description={pageDescription}
      breadcrumbs={crumbs}
      actions={<Button onClick={openCreate}><Plus size={16} aria-hidden="true" />{createLabel}</Button>}
    />

    {organizationSelect}
    {organization.error !== undefined && <Alert tone="danger" title="Không đọc được tổ chức">Tổ chức không tồn tại hoặc bạn không có quyền xem. Hãy chọn lại từ danh sách tổ chức.</Alert>}
    {error !== undefined && <Alert tone="danger" title="Không tải được danh sách" action={<RetryButton error={error} onRetry={reload} />}>{describeApiError(error, loadError)}</Alert>}

    <DataTable<BuildingSummary>
      data-testid="buildings-table"
      caption="Danh sách công trình"
      columns={columns}
      rows={items}
      rowKey={(building) => building.id}
      rowHref={(building) => detailHref(building.id)}
      rowTone={(building) => (building.isActive ? undefined : "muted")}
      rowMenu={(building) => [
        { label: "Sửa thông tin", icon: Pencil, onSelect: () => void openEdit(building.id) },
        ...(building.isActive ? [{ label: "Lưu trữ", icon: Archive, tone: "danger" as const, separator: true, hint: "Không thể hoàn tác", onSelect: () => openArchive(building) }] : []),
      ]}
      toolbar={toolbar}
      loading={loading && !data}
      refreshing={loading && Boolean(data)}
      empty={empty}
      cardBelow={view === "cards" ? 100000 : 640}
      pagination={totalCount > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount, onPageChange: setPage } : undefined}
    />
    {!isAdmin && data && items.length > 0 && <p className="org-list-note">Hiển thị {items.length} trên {typeFilter ? allItems.length : totalCount} · Lưu trữ nằm trong menu “···” của từng hàng và không thể hoàn tác.</p>}
    {!isAdmin && data && items.length > 0 && <p className="ops-sr-only"><Link href={routes.workspaceAnalytics}><BarChart3 size={14} aria-hidden="true" />Xem báo cáo</Link></p>}

    <Modal
      open={dialog !== null}
      onOpenChange={(open) => { if (!open && !saving) setDialog(null); }}
      size="md"
      title={dialog?.mode === "edit" ? "Sửa thông tin công trình" : "Tạo công trình"}
      description={dialog?.mode === "edit" ? "Tọa độ và liên hệ không hiển thị ở đây được giữ nguyên." : "Sau khi tạo, bạn sẽ vào tab IFC để tải mô hình."}
      footer={<>
        <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={saving}>Hủy</Button>
        <SubmitButton type="submit" form="building-form" state={saving ? "busy" : "idle"}>{dialog?.mode === "edit" ? "Lưu thay đổi" : "Tạo công trình"}</SubmitButton>
      </>}
    >
      <form id="building-form" onSubmit={submit} noValidate className="ops-stack">
        {conflict && <BuildingConflictAlert current={conflict} onUseLatest={() => { setForm(formFromBuilding(conflict)); setConflict(null); }} />}
        <BuildingForm form={form} errors={fieldErrors} autoFocus onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
        {formError && <Alert tone="danger">{formError}</Alert>}
      </form>
    </Modal>

    <ConfirmDialog
      open={archiving !== null}
      onOpenChange={(open) => { if (!open) setArchiving(null); }}
      tone="danger"
      title="Lưu trữ công trình?"
      description={archiving ? `“${archiving.name}” sẽ rời khỏi danh sách đang dùng. Không thể hoàn tác: hệ thống chưa hỗ trợ khôi phục. Dữ liệu IFC và kịch bản không bị xóa.` : undefined}
      confirmLabel="Lưu trữ"
      busy={archiveBusy}
      onConfirm={confirmArchive}
    >
      {archiveNotice && <Alert tone="warning" title="Công trình đã thay đổi">{archiveNotice}</Alert>}
      <p className="ops-muted">Công trình đã lưu trữ vẫn xem được bằng bộ lọc “Đã lưu trữ”.</p>
    </ConfirmDialog>
  </div>;
}
