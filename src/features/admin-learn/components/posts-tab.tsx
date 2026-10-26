"use client";

import { BookOpen, Eye, EyeOff, PenLine, RotateCcw, Search, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/dialog";
import type { RowMenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { LEARN_KINDS, POST_STATUSES, kindLabel, type LearnKind } from "@/features/learn/types";
import { etagFor, learnAdminApi } from "../api";
import { commandDone, commandKey } from "../command-keys";
import { describeLearnError, type LearnErrorView } from "../errors";
import { loadPostWithVersion, type LoadedPost } from "../load-post";
import { lifecycleBody, lifecycleCopy, lifecycleFor, postStatusView } from "../status";
import type { AdminPost, LifecycleOperation } from "../types";
import { QuickEditDrawer } from "./quick-edit-pane";
import "./learn-quick.css";

const PAGE_SIZE = 20;
const kindTone: Record<LearnKind, Tone> = { Article: "info", Tip: "ember", Video: "neutral" };
const lifecycleIcon = { hide: EyeOff, show: Eye, delete: Trash2, restore: RotateCcw } as const;

/** A "···" command on one row: a lifecycle operation (post ETag from the list row) or publishing its Draft (loaded on demand). */
type RowAction = { post: AdminPost; op: LifecycleOperation | "publish"; loaded: LoadedPost | null; loading: boolean };

const titleOf = (post: AdminPost) => post.publishedVersion?.title ?? post.slug;

/**
 * All posts in every state (Figma 53:758): a DataTable whose row opens the "sửa nhanh" drawer (`?quick=<id>`), the status
 * filter and pagination in the URL, and a "···" menu mirroring the drawer's status actions. The list endpoint embeds only
 * the published version, so a post that was never published shows its slug but no title until it is opened (BE#154).
 */
export function PostsTab({ accessToken, onOpen, onCreate }: { accessToken: string; onOpen: (postId: string) => void; onCreate: () => void }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const rawStatus = get("status");
  const status = (POST_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : "";
  const list = useAsyncData(`learn-posts:${status}:${page}`, (signal) => learnAdminApi.listPosts(accessToken, { status, page, pageSize: PAGE_SIZE }, signal));
  // The admin list API has neither a text search nor a kind filter (kind belongs to a version), so both only narrow the loaded page.
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<LearnKind | "">("");
  const loaded = list.data?.items ?? [];
  const needle = search.trim().toLowerCase();
  const items = loaded.filter((post) => (!kind || post.publishedVersion?.kind === kind) && (!needle || `${titleOf(post)} ${post.slug}`.toLowerCase().includes(needle)));
  const total = list.data?.total ?? 0;
  const quick = get("quick");
  const quickPost = quick ? (loaded.find((post) => post.id === quick) ?? null) : null;
  const [action, setAction] = useState<RowAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<LearnErrorView | null>(null);
  const filtering = Boolean(status || kind || needle);

  const startAction = async (post: AdminPost, op: LifecycleOperation | "publish") => {
    setActionError(null);
    if (op !== "publish") { setAction({ post, op, loaded: null, loading: false }); return; }
    setAction({ post, op, loaded: null, loading: true });
    try {
      const detail = await loadPostWithVersion(accessToken, post.id, "");
      if (detail.version?.data.status !== "Draft") {
        setAction(null);
        toast.notify({ tone: "info", title: "Không có bản nháp để xuất bản", description: `${titleOf(post)} · mở trình soạn để tạo bản nháp mới.` });
        return;
      }
      setAction({ post, op, loaded: detail, loading: false });
    } catch (cause) {
      setAction(null);
      const view = describeLearnError(cause);
      toast.notify({ tone: "danger", title: view.title, description: view.message });
    }
  };

  const runAction = async () => {
    if (!action || actionBusy || action.loading) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (action.op === "publish") {
        const version = action.loaded?.version;
        if (!version) return;
        const intent = { op: "publish-version", versionId: version.data.id, etag: version.etag };
        await learnAdminApi.publishVersion(accessToken, version.data.id, version.etag, commandKey(intent));
        commandDone(intent);
        toast.notify({ tone: "success", title: "Đã xuất bản", description: `Phiên bản ${version.data.versionNumber}` });
      } else {
        const etag = etagFor(action.post.revision);
        const intent = { op: action.op, postId: action.post.id, etag };
        const result = await learnAdminApi.lifecycle(accessToken, action.post.id, action.op, etag, commandKey(intent));
        commandDone(intent);
        toast.notify({ tone: "success", title: lifecycleCopy[action.op].done, description: `Bài hiện ${postStatusView[result.data.publicationStatus].label.toLowerCase()}` });
      }
      setAction(null);
      list.reload();
    } catch (cause) {
      const view = describeLearnError(cause);
      setActionError(view);
      if (view.kind === "stale") list.reload();
    } finally {
      setActionBusy(false);
    }
  };

  const columns: DataColumn<AdminPost>[] = [
    { key: "title", header: "Bài", primary: true, render: (post) => <CellTitle title={post.publishedVersion?.title ?? "Chưa có bản xuất bản"} sub={post.slug} /> },
    { key: "kind", header: "Loại", width: 120, render: (post) => (post.publishedVersion ? <StatusBadge tone={kindTone[post.publishedVersion.kind]}>{kindLabel[post.publishedVersion.kind]}</StatusBadge> : "—") },
    { key: "situations", header: "Tình huống", hideBelow: 1200, render: (post) => (post.publishedVersion?.situations.length ? post.publishedVersion.situations.map((item) => item.name).join(", ") : "—") },
    { key: "status", header: "Trạng thái", width: 150, render: (post) => { const view = postStatusView[post.publicationStatus]; return <StatusBadge tone={view.tone}>{view.label}</StatusBadge>; } },
    { key: "published", header: "Bản công khai", width: 130, hideBelow: 900, render: (post) => (post.publishedVersion ? `v${post.publishedVersion.versionNumber}` : "—") },
    { key: "updated", header: "Cập nhật", width: 170, hideBelow: 768, render: (post) => formatDateTime(post.updatedAt) },
  ];

  const rowMenu = (post: AdminPost): RowMenuItem[] => [
    { label: "Mở trình soạn", icon: PenLine, onSelect: () => onOpen(post.id) },
    ...(post.publicationStatus !== "Deleted" ? [{ label: "Xuất bản bản nháp", icon: Send, onSelect: () => void startAction(post, "publish"), separator: true } satisfies RowMenuItem] : []),
    ...lifecycleFor[post.publicationStatus].map((op, index) => ({ label: lifecycleCopy[op].label, icon: lifecycleIcon[op], tone: lifecycleCopy[op].danger ? ("danger" as const) : undefined, separator: index === 0 && post.publicationStatus === "Deleted", onSelect: () => void startAction(post, op) })),
  ];

  const copy = action && action.op !== "publish" ? lifecycleCopy[action.op] : null;

  return <>
    {list.error !== undefined && <Alert tone="danger" className="mb-4" title="Không tải được danh sách bài" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeLearnError(list.error).message}</Alert>}
    <DataTable
      caption="Danh sách bài học"
      data-testid="learn-posts-table"
      columns={columns}
      rows={items}
      rowKey={(post) => post.id}
      loading={list.loading && !list.data}
      onRowClick={(post) => setParams({ quick: post.id, page })}
      rowMenu={rowMenu}
      rowTone={(post) => (post.publicationStatus === "Deleted" ? "muted" : undefined)}
      toolbar={<>
        <TableSearch value={search} onChange={setSearch} label="Tìm bài" placeholder="Tìm theo tiêu đề hoặc đường dẫn rút gọn (trang đang xem)" />
        <FilterChips label="Bộ lọc bài">
          <FilterChip label="Loại" value={kind} onChange={(value) => setKind((LEARN_KINDS as readonly string[]).includes(value) ? (value as LearnKind) : "")} options={LEARN_KINDS.map((value) => ({ value, label: kindLabel[value] }))} hint="Lọc theo loại chỉ áp dụng cho trang đang xem." />
          <FilterChip label="Trạng thái" value={status} onChange={(value) => setParams({ status: value })} options={POST_STATUSES.map((value) => ({ value, label: postStatusView[value].label }))} />
        </FilterChips>
      </>}
      empty={<EmptyState icon={filtering ? Search : BookOpen} title={filtering ? "Không có bài phù hợp." : "Chưa có bài nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc. Tìm kiếm và lọc theo loại chỉ áp dụng cho trang đang mở." : "Tạo bài đầu tiên: lưu bản nháp rồi xuất bản khi nội dung và nguồn đã sẵn sàng."} action={!filtering && <Button size="sm" onClick={onCreate}>Tạo bài</Button>} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className="learn-list-note" style={{ marginTop: 10 }}>
      Bấm hàng để sửa nhanh tiêu đề, tóm tắt và tình huống; menu “···” xuất bản, ẩn, xóa hoặc khôi phục; chỉnh sửa đầy đủ (nội dung, phiên bản) mở trình soạn.
      {(kind || needle) && ` Tìm kiếm và lọc theo loại chỉ áp dụng cho ${loaded.length} bài của trang đang mở; bài chưa xuất bản lần nào thì chưa có loại.`}
    </p>

    {quick && <QuickEditDrawer key={quick} accessToken={accessToken} postId={quick} fallbackName={quickPost ? titleOf(quickPost) : "Sửa nhanh"} onClose={() => setParams({ quick: null, page })} onOpenEditor={onOpen} onChanged={list.reload} />}

    {action && <Modal open onOpenChange={(open) => { if (!open && !actionBusy) { setAction(null); setActionError(null); } }} size="sm"
      title={action.op === "publish" ? "Xuất bản bản nháp này?" : copy?.title ?? ""}
      description={action.op === "publish" ? "Bản nháp trở thành bản công khai và không sửa được nữa. Muốn sửa tiếp phải tạo bản nháp mới." : lifecycleBody(action.op, !!action.post.publishedVersionId)}
      footer={<>
        <Button variant="quiet" disabled={actionBusy} onClick={() => { setAction(null); setActionError(null); }}>Hủy</Button>
        {actionError?.kind === "stale"
          ? <Button variant="secondary" onClick={() => { setAction(null); setActionError(null); }}>Đã tải bản mới, đóng</Button>
          : <Button variant={copy?.danger ? "danger" : "primary"} disabled={actionBusy || action.loading} onClick={() => void runAction()}>{action.loading ? "Đang tải…" : actionBusy ? "Đang gửi…" : actionError?.kind === "retry" ? "Thử lại" : action.op === "publish" ? "Xuất bản" : copy?.confirm}</Button>}
      </>}>
      <div className="ops-stack">
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Bài: <strong style={{ color: "var(--text)" }}>{titleOf(action.post)}</strong>{action.loaded?.version ? ` · v${action.loaded.version.data.versionNumber}` : ""}</p>
        {actionError && <Alert tone={actionError.kind === "stale" ? "warning" : "danger"} title={actionError.title}>{actionError.message}</Alert>}
      </div>
    </Modal>}
  </>;
}
