"use client";

import { BookOpen, Search } from "lucide-react";
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
import { POST_STATUSES, kindLabel } from "@/features/learn/types";
import { learnAdminApi } from "../api";
import { describeLearnError } from "../errors";
import { postStatusView } from "../status";

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
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  return <>
    <div className="ops-toolbar">
      <Select aria-label="Trạng thái bài" style={{ width: 200 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option>
        {POST_STATUSES.map((value) => <option key={value} value={value}>{postStatusView[value].label}</option>)}
      </Select>
      {status && <Button variant="quiet" onClick={() => setParams({ status: null })}>Xóa bộ lọc</Button>}
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách bài" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeLearnError(list.error).message}</Alert>}

    <Table caption="Danh sách bài Learn">
      <thead><tr><th>Bài</th><th>Loại</th><th>Trạng thái</th><th>Bản công khai</th><th>Cập nhật</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={6} label="Đang tải danh sách bài…" /></TableMessage>}
        {items.map((post) => {
          const view = postStatusView[post.publicationStatus];
          const published = post.publishedVersion;
          return <tr key={post.id}>
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
          </tr>;
        })}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={status ? Search : BookOpen} title={status ? "Không có bài ở trạng thái này." : "Chưa có bài nào"} description={status ? "Thử đổi hoặc xóa bộ lọc." : "Tạo bài đầu tiên: lưu bản nháp rồi xuất bản khi nội dung và nguồn đã sẵn sàng."} action={!status && <Button size="sm" onClick={onCreate}>Tạo bài</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}
  </>;
}
