"use client";

import { BookOpen, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { PrototypeControls } from "@/features/dev-prototype/prototype-controls";
import { useSampleQuery, type SampleMode } from "@/features/dev-prototype/use-sample-query";
import { SampleLearnStore } from "../sample-store";
import { kindLabel, postStatusView } from "../status";
import type { LearnKind, PostStatus } from "../types";
import { LearnEditor } from "./learn-editor";

const PAGE_SIZE = 6;
const isKind = (value: string): value is LearnKind => value === "Article" || value === "Tip" || value === "Video";
const isStatus = (value: string): value is PostStatus => value === "Unpublished" || value === "Published" || value === "Hidden" || value === "Deleted";

export function LearnPrototype() {
  const [store, setStore] = useState(() => new SampleLearnStore());
  const [rev, setRev] = useState(0);
  const [mode, setMode] = useState<SampleMode>("normal");
  const url = useUrlParams({ pageSize: PAGE_SIZE });
  const postId = url.get("post");
  const bump = () => setRev((value) => value + 1);

  return <div>
    <PrototypeControls mode={mode} onModeChange={setMode} onReset={() => { setStore(new SampleLearnStore()); bump(); url.setParams({ post: null }); }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--muted)" }}>
        <input type="checkbox" onChange={(event) => { store.setOffline(event.target.checked); }} />Mất kết nối khi ghi
      </label>
      {postId && postId !== "new" && <Button type="button" size="sm" variant="quiet" onClick={() => { store.editElsewhere(postId); }}>Giả lập: người khác sửa bài này</Button>}
    </PrototypeControls>
    {postId
      ? <LearnEditor port={store} postId={postId} mode={mode} rev={rev} onChanged={bump} onClose={() => url.setParams({ post: null })} onOpenPost={(id) => url.setParams({ post: id })} />
      : <LearnList store={store} rev={rev} mode={mode} url={url} />}
  </div>;
}

function LearnList({ store, rev, mode, url }: { store: SampleLearnStore; rev: number; mode: SampleMode; url: ReturnType<typeof useUrlParams> }) {
  const q = url.get("q");
  const kindParam = url.get("kind");
  const statusParam = url.get("status");
  const kind = isKind(kindParam) ? kindParam : "";
  const status = isStatus(statusParam) ? statusParam : "";
  const [text, setText] = useUrlSearch(q, url.setParams);
  const list = useSampleQuery(`learn:${rev}:${url.page}:${q}:${kind}:${status}`, mode, (m) =>
    m === "empty" ? { items: [], totalCount: 0, page: 1, pageSize: PAGE_SIZE } : store.list({ q, kind, status, page: url.page, pageSize: PAGE_SIZE }));
  const items = list.data?.items ?? [];
  const filtering = Boolean(q || kind || status);

  return <Panel title="Bài Learn" description="Bài viết, mẹo và video công khai theo tình huống. Chỉ bài Đã xuất bản mới hiển thị cho khách."
    actions={<Button onClick={() => url.setParams({ post: "new" })}><Plus size={16} aria-hidden="true" />Tạo bài</Button>} bodyClassName="ops-stack">
    <div className="ops-toolbar" style={{ marginBottom: 0 }}>
      <div className="ops-field ops-toolbar-grow" style={{ position: "relative" }}>
        <label htmlFor="learn-search" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Tìm bài</label>
        <Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 13, color: "var(--dim)" }} />
        <Input id="learn-search" style={{ paddingLeft: 36 }} placeholder="Tiêu đề hoặc slug" value={text} onChange={(event) => setText(event.target.value)} />
      </div>
      <Select aria-label="Loại bài" style={{ width: 150 }} value={kind} onChange={(event) => url.setParams({ kind: event.target.value })}>
        <option value="">Mọi loại</option>{(Object.keys(kindLabel) as LearnKind[]).map((value) => <option key={value} value={value}>{kindLabel[value]}</option>)}
      </Select>
      <Select aria-label="Trạng thái bài" style={{ width: 190 }} value={status} onChange={(event) => url.setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option>{(Object.keys(postStatusView) as PostStatus[]).map((value) => <option key={value} value={value}>{postStatusView[value].label}</option>)}
      </Select>
    </div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách bài" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>Hãy kiểm tra kết nối rồi thử lại.</Alert>}
    <Table caption="Danh sách bài Learn (dữ liệu mẫu)">
      <thead><tr><th>Bài</th><th>Loại</th><th>Trạng thái</th><th>Phiên bản</th><th>Cập nhật</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={5} label="Đang tải danh sách bài…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td><button type="button" className="ops-cell-primary" style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", minHeight: 24 }} onClick={() => url.setParams({ post: item.id })}>{item.title}<span className="ops-cell-sub">{item.slug}</span></button></td>
          <td>{kindLabel[item.kind]}</td>
          <td><StatusBadge tone={postStatusView[item.status].tone}>{postStatusView[item.status].label}</StatusBadge></td>
          <td>{item.publishedVersionNumber ? `Xuất bản v${item.publishedVersionNumber}` : "Chưa xuất bản"}{item.draftVersionNumber ? ` · nháp v${item.draftVersionNumber}` : ""}</td>
          <td>{formatDateTime(item.updatedAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtering ? Search : BookOpen} title={filtering ? "Không có bài phù hợp." : "Chưa có bài Learn"} description={filtering ? "Thử đổi từ khóa hoặc bộ lọc." : "Tạo bài đầu tiên: lưu nháp hoặc xuất bản ngay."} action={filtering ? <Button size="sm" variant="secondary" onClick={() => url.setParams({ q: null, kind: null, status: null })}>Xóa bộ lọc</Button> : <Button size="sm" onClick={() => url.setParams({ post: "new" })}>Tạo bài</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {(list.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} totalCount={list.data?.totalCount ?? 0} onPageChange={url.setPage} disabled={list.loading} />}
  </Panel>;
}
