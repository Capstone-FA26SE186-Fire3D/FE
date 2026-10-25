"use client";

import { Compass, Plus, Search } from "lucide-react";
import { useId, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/dialog";
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
import type { AdminSituation } from "../types";

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

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} title="Tạo tình huống" description="Tình huống dùng để lọc bài công khai và gắn vào phiên bản bài. Hiện chưa sửa hay ngừng dùng được tình huống sau khi tạo."
    footer={<><Button type="button" variant="quiet" disabled={busy} onClick={onClose}>Hủy</Button><SubmitButton type="submit" form={formId} state={busy ? "busy" : "idle"}><Plus size={16} aria-hidden="true" />{busy ? "Đang tạo…" : error?.kind === "retry" ? "Thử lại" : "Tạo tình huống"}</SubmitButton></>}>
    <form id={formId} className="ops-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
      <Field label="Tên tình huống" required error={submitted ? nameProblem : undefined}>{(p) => <Input {...p} maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
      <Field label="Đường dẫn rút gọn" required hint="Dùng trong bộ lọc ở trang bài học công khai. Không đổi được sau khi tạo." error={submitted || error?.code === "SLUG_EXISTS" ? slugProblem : undefined}>{(p) => <Input {...p} maxLength={120} value={slug} onChange={(event) => { setSlug(event.target.value.toLowerCase()); if (error?.code === "SLUG_EXISTS") setError(null); }} />}</Field>
      <Field label="Mô tả (không bắt buộc)">{(p) => <Textarea {...p} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
      {error && error.code !== "SLUG_EXISTS" && <Alert tone="danger" title={error.title}>{error.message}</Alert>}
    </form>
  </Modal>;
}

/** Situation catalog (`GET/POST /api/admin/learn/situations`). The API has no update or deactivate route, so this is list + create only. */
export function SituationsTab({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const [search, setSearch] = useUrlSearch(get("q"), setParams, "q");
  const q = get("q");
  const active = get("active") === "true" || get("active") === "false" ? get("active") : "";
  const [creating, setCreating] = useState(false);
  const list = useAsyncData(`learn-situations:${q}:${active}:${page}`, (signal) => learnAdminApi.listSituations(accessToken, { search: q, isActive: active === "true" ? true : active === "false" ? false : undefined, page, pageSize: PAGE_SIZE }, signal));
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(q || active);

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
      rowTone={(item) => (item.isActive ? undefined : "muted")}
      toolbar={<>
        <TableSearch value={search} onChange={setSearch} label="Tìm tình huống" placeholder="Tên hoặc đường dẫn rút gọn" />
        <FilterChips label="Bộ lọc tình huống">
          <FilterChip label="Trạng thái" value={active} onChange={(value) => setParams({ active: value })} options={ACTIVE_OPTIONS} allLabel="mọi trạng thái" />
        </FilterChips>
        <Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo tình huống</Button>
      </>}
      empty={<EmptyState icon={filtering ? Search : Compass} title={filtering ? "Không có tình huống phù hợp." : "Chưa có tình huống nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Tạo tình huống để người đọc lọc bài và để gắn vào bài viết. Hệ thống không tạo sẵn dữ liệu."} action={!filtering && <Button size="sm" onClick={() => setCreating(true)}>Tạo tình huống</Button>} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    {creating && <CreateSituationModal accessToken={accessToken} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); list.reload(); }} />}
  </>;
}
