"use client";

import { Archive, ArchiveRestore, Compass, Pencil, Plus, Save, Search } from "lucide-react";
import { useId, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import type { RowMenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { SubmitButton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { SLUG_PATTERN } from "@/features/learn/slug";
import { learnAdminApi } from "../api";
import { commandDone, commandKey } from "../command-keys";
import { describeLearnError, type LearnErrorView } from "../errors";
import type { AdminSituation, UpdateSituationInput } from "../types";

const PAGE_SIZE = 20;
const ACTIVE_OPTIONS = [{ value: "true", label: "Đang hoạt động" }, { value: "false", label: "Ngừng dùng" }];

/** "Tạo tình huống" modal: slug, name, optional description. The Idempotency-Key stays the same while the same input is retried. */
function CreateSituationModal({ accessToken, onClose, onCreated }: { accessToken: string; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LearnErrorView | null>(null);
  const slugProblem = !slug ? "Nhập đường dẫn rút gọn." : slug.length > 120 ? "Đường dẫn rút gọn tối đa 120 ký tự." : !SLUG_PATTERN.test(slug) ? "Đường dẫn rút gọn chỉ gồm chữ thường không dấu, số và dấu gạch ngang." : error?.code === "SLUG_EXISTS" ? "Đã có tình huống dùng đường dẫn rút gọn này. Chọn đường dẫn khác." : undefined;
  const nameProblem = !name.trim() ? "Nhập tên tình huống." : name.trim().length > 255 ? "Tên tối đa 255 ký tự." : undefined;

  const submit = async () => {
    if (busy) return;
    setSubmitted(true);
    if (slugProblem || nameProblem) return;
    setBusy(true);
    setError(null);
    const input = { slug, name: name.trim(), description: description.trim() };
    const intent = { op: "create-situation", input };
    try {
      const created = await learnAdminApi.createSituation(accessToken, input, commandKey(intent));
      commandDone(intent);
      toast.notify({ tone: "success", title: "Đã tạo tình huống", description: `${created.name} (${created.slug})` });
      onCreated();
    } catch (cause) {
      setError(describeLearnError(cause));
    } finally {
      setBusy(false);
    }
  };

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title="Tạo tình huống" description="Tình huống dùng để lọc bài công khai và gắn vào phiên bản bài. Tên và mô tả sửa được sau; đường dẫn rút gọn thì không."
    footer={<><Button type="button" variant="quiet" disabled={busy} onClick={onClose}>Hủy</Button><SubmitButton type="submit" form={formId} state={busy ? "busy" : "idle"}><Plus size={16} aria-hidden="true" />{busy ? "Đang tạo…" : error?.kind === "retry" ? "Thử lại" : "Tạo tình huống"}</SubmitButton></>}>
    <form id={formId} className="ops-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
      <Field label="Tên tình huống" required error={submitted ? nameProblem : undefined}>{(p) => <Input {...p} maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
      <Field label="Đường dẫn rút gọn" required hint="Dùng trong bộ lọc ở trang bài học công khai. Không đổi được sau khi tạo." error={submitted || error?.code === "SLUG_EXISTS" ? slugProblem : undefined}>{(p) => <Input {...p} maxLength={120} value={slug} onChange={(event) => { setSlug(event.target.value.toLowerCase()); if (error?.code === "SLUG_EXISTS") setError(null); }} />}</Field>
      <Field label="Mô tả (không bắt buộc)">{(p) => <Textarea {...p} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
      {error && error.code !== "SLUG_EXISTS" && <Alert tone="danger" title={error.title}>{error.message}</Alert>}
    </form>
  </Modal>;
}

/** A failed situation write in words; a 404 here is about the situation, not a post. */
function describeSituationError(cause: unknown): LearnErrorView {
  const view = describeLearnError(cause);
  return view.kind === "notFound" ? { ...view, message: "Tình huống này không còn tồn tại. Đóng hộp thoại để xem danh sách mới." } : view;
}

/**
 * "Sửa tình huống" popup: name and description only (`PATCH /api/admin/learn/situations/{id}`). The slug is shown but never
 * changes. Only the fields that differ are sent (the API needs at least one); an emptied description is sent as "" to clear it.
 */
function EditSituationModal({ accessToken, situation, onClose, onSaved }: { accessToken: string; situation: AdminSituation; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [name, setName] = useState(situation.name);
  const [description, setDescription] = useState(situation.description ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LearnErrorView | null>(null);
  const nameProblem = !name.trim() ? "Nhập tên tình huống." : name.trim().length > 255 ? "Tên tối đa 255 ký tự." : undefined;
  const descriptionProblem = description.trim().length > 2000 ? "Mô tả tối đa 2000 ký tự." : undefined;

  const submit = async () => {
    if (busy) return;
    setSubmitted(true);
    if (nameProblem || descriptionProblem) return;
    const input: UpdateSituationInput = {};
    if (name.trim() !== situation.name) input.name = name.trim();
    if (description.trim() !== (situation.description ?? "")) input.description = description.trim();
    if (Object.keys(input).length === 0) { onClose(); return; }
    setBusy(true);
    setError(null);
    try {
      const updated = await learnAdminApi.updateSituation(accessToken, situation.id, input);
      toast.notify({ tone: "success", title: "Đã lưu tình huống", description: updated.name });
      onSaved();
    } catch (cause) {
      setError(describeSituationError(cause));
    } finally {
      setBusy(false);
    }
  };

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title="Sửa tình huống" description="Tên mới hiện ngay ở bộ lọc bài công khai và trên các bài đã gắn tình huống này."
    footer={<><Button type="button" variant="quiet" disabled={busy} onClick={onClose}>Hủy</Button><SubmitButton type="submit" form={formId} state={busy ? "busy" : "idle"}><Save size={16} aria-hidden="true" />{busy ? "Đang lưu…" : error?.kind === "retry" ? "Thử lại" : "Lưu thay đổi"}</SubmitButton></>}>
    <form id={formId} className="ops-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
      <Field label="Tên tình huống" required error={submitted ? nameProblem : undefined}>{(p) => <Input {...p} maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
      <Field label="Đường dẫn rút gọn" hint="Không đổi được sau khi tạo.">{(p) => <Input {...p} value={situation.slug} readOnly disabled />}</Field>
      <Field label="Mô tả (không bắt buộc)" hint="Để trống để xóa mô tả." error={submitted ? descriptionProblem : undefined}>{(p) => <Textarea {...p} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
      {error && <Alert tone="danger" title={error.title}>{error.message}</Alert>}
    </form>
  </Modal>;
}

/**
 * Situation catalog: list and create (`GET/POST /api/admin/learn/situations`), edit name/description and stop or resume
 * (`PATCH /api/admin/learn/situations/{id}`). A situation is never deleted and its slug never changes.
 */
export function SituationsTab({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const [search, setSearch] = useUrlSearch(get("q"), setParams, "q");
  const q = get("q");
  const active = get("active") === "true" || get("active") === "false" ? get("active") : "";
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminSituation | null>(null);
  const [toggling, setToggling] = useState<AdminSituation | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState<LearnErrorView | null>(null);
  const list = useAsyncData(`learn-situations:${q}:${active}:${page}`, (signal) => learnAdminApi.listSituations(accessToken, { search: q, isActive: active === "true" ? true : active === "false" ? false : undefined, page, pageSize: PAGE_SIZE }, signal));
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(q || active);

  const runToggle = async () => {
    if (!toggling || toggleBusy) return;
    setToggleBusy(true);
    setToggleError(null);
    const next = !toggling.isActive;
    try {
      await learnAdminApi.updateSituation(accessToken, toggling.id, { isActive: next });
      toast.notify({ tone: "success", title: next ? "Đã dùng lại tình huống" : "Đã ngừng dùng tình huống", description: toggling.name });
      setToggling(null);
      list.reload();
    } catch (cause) {
      const view = describeSituationError(cause);
      setToggleError(view);
      if (view.kind === "notFound") list.reload();
    } finally {
      setToggleBusy(false);
    }
  };

  const rowMenu = (item: AdminSituation): RowMenuItem[] => [
    { label: "Sửa", icon: Pencil, onSelect: () => setEditing(item) },
    { label: item.isActive ? "Ngừng dùng" : "Dùng lại", icon: item.isActive ? Archive : ArchiveRestore, tone: item.isActive ? "danger" : undefined, separator: true, onSelect: () => { setToggleError(null); setToggling(item); } },
  ];

  const columns: DataColumn<AdminSituation>[] = [
    { key: "name", header: "Tình huống", primary: true, render: (item) => <CellTitle title={item.name} sub={item.description ?? undefined} /> },
    { key: "slug", header: "Đường dẫn rút gọn", width: 220, render: (item) => <code className="ops-mono">{item.slug}</code> },
    { key: "active", header: "Trạng thái", width: 160, render: (item) => <StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang hoạt động" : "Ngừng dùng"}</StatusBadge> },
    { key: "updated", header: "Cập nhật", width: 170, hideBelow: 900, render: (item) => formatDateTime(item.updatedAt) },
  ];

  return <>
    {list.error !== undefined && <Alert tone="danger" className="mb-4" title="Không tải được danh sách tình huống" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeLearnError(list.error).message}</Alert>}
    <DataTable
      caption="Danh mục tình huống bài học"
      data-testid="learn-situations-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={setEditing}
      rowMenu={rowMenu}
      rowTone={(item) => (item.isActive ? undefined : "muted")}
      toolbar={<>
        <TableSearch value={search} onChange={setSearch} label="Tìm tình huống" placeholder="Tên hoặc đường dẫn rút gọn" />
        <FilterChips label="Bộ lọc tình huống">
          <FilterChip label="Trạng thái" value={active} onChange={(value) => setParams({ active: value })} options={ACTIVE_OPTIONS} allLabel="mọi trạng thái" />
        </FilterChips>
        <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo tình huống</Button>
      </>}
      empty={<EmptyState icon={filtering ? Search : Compass} title={filtering ? "Không có tình huống phù hợp." : "Chưa có tình huống nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Tạo tình huống để người đọc lọc bài và để gắn vào bài viết. Hệ thống không tạo sẵn dữ liệu."} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    {creating && <CreateSituationModal accessToken={accessToken} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} />}
    {editing && <EditSituationModal key={editing.id} accessToken={accessToken} situation={editing} onClose={() => { setEditing(null); list.reload(); }} onSaved={() => { setEditing(null); list.reload(); }} />}
    {toggling && <ConfirmDialog open onOpenChange={(open) => { if (!open) { setToggling(null); setToggleError(null); } }} busy={toggleBusy}
      title={toggling.isActive ? "Ngừng dùng tình huống này?" : "Dùng lại tình huống này?"}
      description={toggling.isActive ? "Người đọc không còn lọc bài theo tình huống này và bài mới không gắn được nó. Bài đã xuất bản vẫn giữ tình huống, nhưng bài đang gắn nó sẽ không xuất bản hay hiện lại được cho tới khi dùng lại. Tình huống không bị xóa." : "Tình huống hiện lại trong bộ lọc bài công khai và gắn được vào bài mới."}
      tone={toggling.isActive ? "danger" : "primary"} confirmLabel={toggleError?.kind === "retry" ? "Thử lại" : toggling.isActive ? "Ngừng dùng" : "Dùng lại"} onConfirm={runToggle}>
      <div className="ops-stack">
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Tình huống <strong style={{ color: "var(--text)" }}>{toggling.name}</strong></p>
        {toggleError && <Alert tone="danger" title={toggleError.title}>{toggleError.message}</Alert>}
      </div>
    </ConfirmDialog>}
  </>;
}
