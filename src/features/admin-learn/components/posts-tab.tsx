"use client";

import { BookOpen, Search } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { Chip, Chips, Split } from "@/features/admin-overview/components/admin-kit";
import { LEARN_KINDS, POST_STATUSES, kindLabel, type LearnKind } from "@/features/learn/types";
import { learnAdminApi } from "../api";
import { describeLearnError } from "../errors";
import { postStatusView } from "../status";
import { LifecycleRules } from "./lifecycle-rules";
import { QuickEditPane } from "./quick-edit-pane";
import "./learn-quick.css";

const PAGE_SIZE = 20;

/**
 * All posts in every state (status filter and pagination in the URL). The list endpoint embeds only the published version, so
 * a post that was never published shows its slug but no title until it is opened (a backend gap, reported).
 */
export function PostsTab({ accessToken, onOpen, onCreate }: { accessToken: string; onOpen: (postId: string) => void; onCreate: () => void }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const rawStatus = get("status");
  const status = (POST_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : "";
  const list = useAsyncData(`learn-posts:${status}:${page}`, (signal) => learnAdminApi.listPosts(accessToken, { status, page, pageSize: PAGE_SIZE }, signal));
  // The API has no kind filter (kind belongs to a version), so the chips only narrow the page that is loaded.
  const [kind, setKind] = useState<LearnKind | "">("");
  const loaded = list.data?.items ?? [];
  const items = kind ? loaded.filter((post) => post.publishedVersion?.kind === kind) : loaded;
  const total = list.data?.total ?? 0;
  // The row whose side pane is open (`?quick=<id>`); the row itself still opens the full editor.
  const quick = get("quick");
  const quickPost = quick ? (loaded.find((post) => post.id === quick) ?? null) : null;

  return <>
    <Chips label="Loại bài (chỉ lọc trong trang đang xem)">
      <Chip active={kind === ""} onClick={() => setKind("")}>Tất cả loại</Chip>
      {LEARN_KINDS.map((value) => <Chip key={value} active={kind === value} onClick={() => setKind(value)}>{kindLabel[value]}</Chip>)}
    </Chips>
    <div className="adm-filters">
      <Select aria-label="Trạng thái bài" data-w style={{ width: 200 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Trạng thái: tất cả</option>
        {POST_STATUSES.map((value) => <option key={value} value={value}>{postStatusView[value].label}</option>)}
      </Select>
      {status && <Button variant="quiet" onClick={() => setParams({ status: null })}>Xóa bộ lọc</Button>}
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách bài" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeLearnError(list.error).message}</Alert>}

    {kind && <p className="adm-note" role="status" style={{ margin: "0 0 10px" }}>Máy chủ chưa có bộ lọc theo loại: chỉ áp dụng cho {loaded.length} bài của trang đang mở; bài chưa có bản xuất bản không có loại.</p>}

    <Split>
      <div>
    <Table caption="Danh sách bài Learn">
      <thead><tr><th>Bài</th><th>Loại</th><th>Trạng thái</th><th>Bản công khai</th><th>Cập nhật</th><th><span className="sr-only">Sửa nhanh</span></th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={6}><SkeletonRows rows={6} label="Đang tải danh sách bài…" /></TableMessage>}
        {items.map((post) => {
          const view = postStatusView[post.publicationStatus];
          const published = post.publishedVersion;
          return <tr key={post.id} className="learn-quick-row" data-selected={quick === post.id ? "true" : undefined}>
            <td>
              <button type="button" className="ops-cell-primary" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", minHeight: 44 }} onClick={() => onOpen(post.id)} aria-label={`Mở bài ${published?.title ?? post.slug}`}>
                <span style={{ display: "block", overflowWrap: "anywhere" }}>{published?.title ?? "Chưa có bản xuất bản"}</span>
                <span className="ops-cell-sub">{post.slug}</span>
              </button>
            </td>
            <td>{published ? kindLabel[published.kind] : "—"}</td>
            <td><StatusBadge tone={view.tone}>{view.label}</StatusBadge></td>
            <td>{published ? `v${published.versionNumber}` : "—"}</td>
            <td>{formatDateTime(post.updatedAt)}</td>
            <td className="ops-cell-actions"><Button size="sm" variant="quiet" aria-pressed={quick === post.id} aria-label={`Sửa nhanh bài ${published?.title ?? post.slug}`} onClick={() => setParams({ quick: quick === post.id ? null : post.id, page }, "replace")}>Sửa nhanh</Button></td>
          </tr>;
        })}
        {list.data && !items.length && <TableMessage colSpan={6}><EmptyState icon={status ? Search : BookOpen} title={status ? "Không có bài ở trạng thái này." : "Chưa có bài nào"} description={status ? "Thử đổi hoặc xóa bộ lọc." : "Tạo bài đầu tiên: lưu bản nháp rồi xuất bản khi nội dung và nguồn đã sẵn sàng."} action={!status && <Button size="sm" onClick={onCreate}>Tạo bài</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}
      </div>
      <div className="learn-quick-col">
        <QuickEditPane accessToken={accessToken} postId={quick || null} fallbackName={quickPost ? (quickPost.publishedVersion?.title ?? quickPost.slug) : "Sửa nhanh"} onClose={() => setParams({ quick: null, page }, "replace")} onOpenEditor={onOpen} onChanged={list.reload} />
        <LifecycleRules />
      </div>
    </Split>
  </>;
}
