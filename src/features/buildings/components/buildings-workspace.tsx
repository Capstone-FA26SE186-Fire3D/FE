"use client";

import { Archive, Building2, LayoutGrid, List, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
import { buildingsApi } from "../api";
import type { Building, BuildingInput, BuildingSummary } from "../types";

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

type FormState = { name: string; buildingType: string; totalFloors: string; address: string; city: string; district: string };
const emptyForm: FormState = { name: "", buildingType: "", totalFloors: "1", address: "", city: "", district: "" };

function formFromBuilding(building: Building): FormState {
  return {
    name: building.name,
    buildingType: building.buildingType ?? "",
    totalFloors: String(building.totalFloors),
    address: building.location?.address ?? "",
    city: building.location?.city ?? "",
    district: building.location?.district ?? "",
  };
}

function validate(form: FormState) {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const name = form.name.trim();
  const floors = Number(form.totalFloors);
  if (!name) errors.name = "Nhập tên công trình.";
  else if (name.length > 200) errors.name = "Tên công trình tối đa 200 ký tự.";
  if (!Number.isInteger(floors) || floors < 1) errors.totalFloors = "Số tầng phải là số nguyên từ 1 trở lên.";
  return errors;
}

function withoutId<T extends { id: string }>(value: T): Omit<T, "id"> {
  const copy: Partial<T> = { ...value };
  delete copy.id;
  return copy as Omit<T, "id">;
}

/** Keeps coordinates/geojson/contact the form does not edit, so saving never wipes them. */
function toInput(form: FormState, existing?: Building): BuildingInput {
  const address = form.address.trim() || null;
  const city = form.city.trim() || null;
  const district = form.district.trim() || null;
  const kept = existing?.location ? withoutId(existing.location) : { address: null, city: null, district: null, latitude: null, longitude: null, geojson: null };
  const hasLocation = Boolean(address || city || district || existing?.location);
  return {
    name: form.name.trim(),
    buildingType: form.buildingType.trim() || null,
    totalFloors: Number(form.totalFloors),
    location: hasLocation ? { ...kept, address, city, district } : null,
    contact: existing?.contact ? withoutId(existing.contact) : null,
  };
}

function BuildingForm({ form, errors, onChange }: { form: FormState; errors: ReturnType<typeof validate>; onChange: (patch: Partial<FormState>) => void }) {
  return <div className="ops-stack">
    <fieldset className="ops-fieldset">
      <legend>Thông tin chung</legend>
      <Field label="Tên công trình" required error={errors.name}>{(p) => <Input {...p} required maxLength={200} value={form.name} onChange={(event) => onChange({ name: event.target.value })} />}</Field>
      <div className="ops-form-grid">
        <Field label="Loại công trình">{(p) => <Input {...p} maxLength={200} value={form.buildingType} placeholder="Chung cư, trường học…" onChange={(event) => onChange({ buildingType: event.target.value })} />}</Field>
        <Field label="Số tầng" required error={errors.totalFloors}>{(p) => <Input {...p} required min="1" inputMode="numeric" type="number" value={form.totalFloors} onChange={(event) => onChange({ totalFloors: event.target.value })} />}</Field>
      </div>
    </fieldset>
    <fieldset className="ops-fieldset">
      <legend>Vị trí (không bắt buộc)</legend>
      <Field label="Địa chỉ">{(p) => <Input {...p} maxLength={300} value={form.address} onChange={(event) => onChange({ address: event.target.value })} />}</Field>
      <div className="ops-form-grid">
        <Field label="Quận / huyện">{(p) => <Input {...p} maxLength={120} value={form.district} onChange={(event) => onChange({ district: event.target.value })} />}</Field>
        <Field label="Tỉnh / thành phố">{(p) => <Input {...p} maxLength={120} value={form.city} onChange={(event) => onChange({ city: event.target.value })} />}</Field>
      </div>
    </fieldset>
  </div>;
}

export function BuildingsWorkspace() {
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
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validate>>({});
  const [archiving, setArchiving] = useState<BuildingSummary | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const blocked = ready && user?.role === 0 && !user.organizationId;
  const enabled = Boolean(accessToken) && ready && !blocked;
  const { data, error, loading, reload } = useAsyncData(
    `buildings:${page}:${status}:${urlSearch}`,
    (signal) => buildingsApi.list(accessToken as string, { page, pageSize: PAGE_SIZE, search: urlSearch.trim() || undefined, isActive: statusToFilter(status) }, signal),
    enabled,
  );


  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const filtering = Boolean(urlSearch) || status !== "active";

  const openCreate = () => { setForm(emptyForm); setEditing(null); setFieldErrors({}); setFormError(""); setDrawer({ mode: "create" }); };

  const openEdit = async (id: string) => {
    if (!accessToken) return;
    setFieldErrors({});
    setFormError("");
    try {
      const building = await buildingsApi.get(accessToken, id);
      setEditing(building);
      setForm(formFromBuilding(building));
      setDrawer({ mode: "edit", id });
    } catch {
      toast.notify({ tone: "danger", title: "Không mở được công trình", description: "Hãy tải lại danh sách rồi thử lại." });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !drawer || saving) return;
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setFormError("");
    try {
      if (drawer.mode === "create") {
        const created = await buildingsApi.create(accessToken, toInput(form));
        router.push(`${routes.workspaceBuildings}/${created.id}`);
      } else {
        await buildingsApi.update(accessToken, drawer.id, toInput(form, editing ?? undefined));
        setDrawer(null);
        toast.notify({ tone: "success", title: "Đã lưu công trình" });
        reload();
      }
    } catch {
      setFormError("Không thể lưu công trình. Nội dung bạn nhập vẫn được giữ lại; hãy thử lại sau.");
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!accessToken || !archiving) return;
    setArchiveBusy(true);
    try {
      await buildingsApi.archive(accessToken, archiving.id);
      toast.notify({ tone: "success", title: "Đã lưu trữ công trình", description: archiving.name });
      setArchiving(null);
      reload();
    } catch {
      toast.notify({ tone: "danger", title: "Không thể lưu trữ công trình", description: "Hãy thử lại sau." });
    } finally {
      setArchiveBusy(false);
    }
  };

  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (blocked) {
    return <><PageHeader title="Công trình" description="Quản lý công trình và các phiên bản mô hình IFC của tổ chức." />
      <Alert tone="info" title="Công trình thuộc về tổ chức" action={<Button asChild variant="secondary" className="mt-3"><Link href={routes.adminOrganizations}>Quản lý tổ chức</Link></Button>}>PlatformAdmin hãy tạo tổ chức, cấp tài khoản OrganizationUser, rồi đăng nhập bằng tài khoản đó để tạo công trình.</Alert></>;
  }

  const rowActions = (building: BuildingSummary) => <span className="ops-actions" style={{ justifyContent: "flex-end" }}>
    <Button size="sm" variant="quiet" onClick={() => void openEdit(building.id)} aria-label={`Chỉnh sửa ${building.name}`}><Pencil size={14} aria-hidden="true" />Sửa</Button>
    {building.isActive && <Button size="sm" variant="quiet" onClick={() => setArchiving(building)} aria-label={`Lưu trữ ${building.name}`}><Archive size={14} aria-hidden="true" />Lưu trữ</Button>}
  </span>;

  const statusBadge = (building: BuildingSummary) => <StatusBadge tone={building.isActive ? "success" : "neutral"}>{building.isActive ? "Hoạt động" : "Đã lưu trữ"}</StatusBadge>;

  return <>
    <PageHeader
      title="Công trình"
      description="Quản lý công trình và các phiên bản mô hình IFC của tổ chức."
      actions={<><Button variant="quiet" onClick={reload} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{loading ? "Đang tải…" : "Tải lại"}</Button><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Tạo công trình</Button></>}
    />

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

    {error !== undefined && <Alert tone="danger" title="Không tải được danh sách" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{loadError}</Alert>}

    {view === "table"
      ? <Table caption="Danh sách công trình">
        <thead><tr><th>Công trình</th><th>Loại</th><th>Số tầng</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
        <tbody>
          {loading && !data && <TableMessage colSpan={5}><SkeletonRows rows={5} label="Đang tải danh sách công trình…" /></TableMessage>}
          {items.map((building) => <tr key={building.id}>
            <td><Link className="ops-cell-primary" href={`${routes.workspaceBuildings}/${building.id}`}>{building.name}</Link></td>
            <td>{building.buildingType || "Chưa phân loại"}</td>
            <td>{building.totalFloors}</td>
            <td>{statusBadge(building)}</td>
            <td className="ops-cell-actions">{rowActions(building)}</td>
          </tr>)}
          {data && !items.length && <TableMessage colSpan={5}>{filtering
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
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Công trình đã lưu trữ không xuất hiện trong danh sách mặc định; bạn có thể xem lại bằng bộ lọc “Đã lưu trữ”.</p>
    </Modal>
  </>;
}
