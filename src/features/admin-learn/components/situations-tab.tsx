"use client";

import { Compass, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { SLUG_PATTERN } from "@/features/learn/slug";
import { learnAdminApi } from "../api";
import { commandDone, commandKey } from "../command-keys";
import { describeLearnError, type LearnErrorView } from "../errors";

const PAGE_SIZE = 20;

function CreateSituation({ accessToken, onCreated }: { accessToken: string; onCreated: () => void }) {
  const toast = useToast();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LearnErrorView | null>(null);
  const slugProblem = !slug ? "Nhập slug." : slug.length > 120 ? "Slug tối đa 120 ký tự." : !SLUG_PATTERN.test(slug) ? "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang." : error?.code === "SLUG_EXISTS" ? "Đã có tình huống dùng slug này. Chọn một slug khác." : undefined;
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
      setSlug(""); setName(""); setDescription(""); setSubmitted(false);
      onCreated();
    } catch (cause) {
      setError(describeLearnError(cause));
    } finally {
      setBusy(false);
    }
  };

  return <form className="ops-stack" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
    <Field label="Tên tình huống" required error={submitted ? nameProblem : undefined}>{(p) => <Input {...p} maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
    <Field label="Slug" required hint="Dùng trong bộ lọc công khai (?situation=slug). Không đổi được sau khi tạo." error={submitted || error?.code === "SLUG_EXISTS" ? slugProblem : undefined}>{(p) => <Input {...p} maxLength={120} value={slug} onChange={(event) => { setSlug(event.target.value.toLowerCase()); if (error?.code === "SLUG_EXISTS") setError(null); }} />}</Field>
    <Field label="Mô tả (không bắt buộc)">{(p) => <Textarea {...p} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
    {error && error.code !== "SLUG_EXISTS" && <Alert tone="danger" title={error.title}>{error.message}</Alert>}
    <div className="ops-actions"><Button type="submit" disabled={busy}><Plus size={16} aria-hidden="true" />{busy ? "Đang tạo…" : "Tạo tình huống"}</Button></div>
  </form>;
}

/** Situation catalog (`GET/POST /api/admin/learn/situations`). The API has no update or deactivate route, so this is list + create only. */
export function SituationsTab({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const [search, setSearch] = useUrlSearch(get("q"), setParams, "q");
  const q = get("q");
  const active = get("active");
  const [creating, setCreating] = useState(false);
  const list = useAsyncData(`learn-situations:${q}:${active}:${page}`, (signal) => learnAdminApi.listSituations(accessToken, { search: q, isActive: active === "true" ? true : active === "false" ? false : undefined, page, pageSize: PAGE_SIZE }, signal));
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(q || active);

  return <>
    <div className="ops-toolbar">
      <div className="ops-toolbar-grow" style={{ position: "relative", maxWidth: 360 }}>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 14, color: "var(--dim)" }} />
        <Input aria-label="Tìm tình huống" style={{ paddingLeft: 36 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc slug" maxLength={200} />
      </div>
      <Select aria-label="Trạng thái tình huống" style={{ width: 190 }} value={active} onChange={(event) => setParams({ active: event.target.value })}>
        <option value="">Mọi trạng thái</option><option value="true">Đang hoạt động</option><option value="false">Ngừng dùng</option>
      </Select>
      {filtering && <Button variant="quiet" onClick={() => { setSearch(""); setParams({ q: null, active: null }); }}>Xóa bộ lọc</Button>}
      <Button style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Tạo tình huống</Button>
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách tình huống" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeLearnError(list.error).message}</Alert>}

    <Table caption="Danh mục tình huống Learn">
      <thead><tr><th>Tình huống</th><th>Slug</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={5} label="Đang tải tình huống…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td><span className="ops-cell-primary">{item.name}</span>{item.description && <span className="ops-cell-sub">{item.description}</span>}</td>
          <td><code>{item.slug}</code></td>
          <td><StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang hoạt động" : "Ngừng dùng"}</StatusBadge></td>
          <td>{formatDateTime(item.updatedAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={filtering ? Search : Compass} title={filtering ? "Không có tình huống phù hợp." : "Chưa có tình huống nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Tạo tình huống để người đọc lọc bài và để gắn vào bài viết. Hệ thống không tạo sẵn dữ liệu."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={creating} onOpenChange={setCreating} title="Tạo tình huống" description="Một tình huống dùng để lọc bài công khai và gắn vào phiên bản bài.">
      <CreateSituation accessToken={accessToken} onCreated={() => { setCreating(false); list.reload(); }} />
    </Drawer>
  </>;
}
