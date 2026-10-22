"use client";

import { Library, Search } from "lucide-react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/table";
import { useAuthSession } from "@/features/auth/auth-session";
import { libraryApi } from "../api";
import { describeLibraryError } from "../errors";
import { LIBRARY_KINDS, isKind, kindLabel } from "../types";
import { VersionPreview } from "./version-preview";

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ItemDrawer({ accessToken, itemId, onClose }: { accessToken: string; itemId: string; onClose: () => void }) {
  const query = useAsyncData(`library-org-item:${itemId}`, (signal) => libraryApi.getItem(accessToken, itemId, signal), true, { keepPrevious: false });
  const item = query.data;
  const view = query.error !== undefined && !item ? describeLibraryError(query.error) : null;
  return <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} title={item ? `${item.code} · ${kindLabel[item.kind]}` : "Mẫu thư viện"} description="Chỉ xem. Áp dụng vào kịch bản trong trình soạn thảo, thẻ Thư viện.">
    {!item && !view && <SkeletonRows rows={5} label="Đang tải mẫu…" />}
    {view && <Alert tone="danger" title={view.kind === "notFound" ? "Mẫu không còn khả dụng" : "Không tải được mẫu"} action={view.kind === "notFound" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={query.reload}>Thử lại</Button>}>{view.kind === "notFound" ? "Mẫu đã ngừng dùng hoặc chưa có phiên bản đã xuất bản." : view.message}</Alert>}
    {item?.latestPublished && <div className="ops-stack" data-testid="org-item-detail">
      <h3 style={{ margin: 0, fontSize: 16 }}>{item.latestPublished.name}</h3>
      <VersionPreview version={item.latestPublished} />
      <Alert tone="info" title="Áp dụng là sao chép">Khi bạn áp dụng, nội dung được sao chép vào bản nháp của bạn sau bước xem trước. Cập nhật mẫu về sau không đổi kịch bản đã soạn hoặc đã phát hành.</Alert>
    </div>}
  </Drawer>;
}

/** Organization view of the Library: active items with a Published version, read only. The Library is shared content, not tenant data. */
export function LibraryBrowser() {
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const rawKind = get("kind");
  const kind = isKind(rawKind) ? rawKind : "";
  const selected = get("item");
  const list = useAsyncData(`library-org:${kind}:${page}`, (signal) => libraryApi.listItems(accessToken ?? "", { kind, page, pageSize: PAGE_SIZE }, signal), ready && Boolean(accessToken) && (user?.role === 0 || user?.role === 1));
  const items = list.data?.items ?? [];

  const header = <PageHeader title="Thư viện mẫu" description="Template kịch bản, rubric mẫu và thiết bị hỗ trợ. Dùng hay không đều tùy chọn; bạn vẫn tự soạn được." eyebrow="Huấn luyện" breadcrumbs={[{ label: "Thư viện mẫu" }]} />;
  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;

  return <div className="org">
    {header}
    <div className="org-chips" role="group" aria-label="Loại mẫu" style={{ marginBottom: 20 }}>
      <button type="button" className="org-chip" aria-pressed={kind === ""} onClick={() => setParams({ kind: "", item: null })} data-testid="filter-kind-all">Tất cả</button>
      {LIBRARY_KINDS.map((value) => <button key={value} type="button" className="org-chip" aria-pressed={kind === value} onClick={() => setParams({ kind: value, item: null })} data-testid={`filter-kind-${value}`}>{kindLabel[value]}{kind === value && list.data ? ` · ${list.data.total}` : ""}</button>)}
    </div>

    {list.error !== undefined && (() => {
      const view = describeLibraryError(list.error);
      return <Alert tone="danger" title={view.kind === "denied" ? "Không có quyền xem thư viện" : "Không tải được thư viện"} action={view.kind === "denied" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{view.message}</Alert>;
    })()}

    {list.loading && !list.data && <SkeletonRows rows={4} label="Đang tải thư viện mẫu…" />}
    <div className="org-lib-grid" aria-label="Mẫu đã xuất bản">
      {items.map((item) => {
        const version = item.latestPublished;
        const needsRuntime = Boolean(version?.requiredCapabilities.length);
        return <article key={item.id} className="org-lib-card" data-testid={`org-item-${item.code}`}>
          <div className="org-lib-media" aria-hidden="true" />
          <div className="org-row" style={{ justifyContent: "flex-start" }}>
            <StatusBadge tone="success">Đã xuất bản{version ? ` · v${version.versionNumber}` : ""}</StatusBadge>
            {needsRuntime && <StatusBadge tone="warning">Yêu cầu năng lực runtime</StatusBadge>}
          </div>
          <div>
            <h3 className="org-lib-title">{version?.name ?? item.code}</h3>
            <p className="org-lib-sub">{kindLabel[item.kind]} · {item.code}{version?.publishedAt ? ` · xuất bản ${formatDateTime(version.publishedAt)}` : ""}</p>
          </div>
          <div className="ops-actions">
            <Button variant="secondary" onClick={() => setParams({ item: item.id })} aria-label={`Xem mẫu ${item.code}`}>Xem trước</Button>
          </div>
        </article>;
      })}
    </div>
    {list.data && !items.length && <EmptyState icon={kind ? Search : Library} title={kind ? "Chưa có mẫu thuộc loại này" : "Thư viện chưa có mẫu nào"} description="Chưa có mẫu nào được xuất bản. Bạn vẫn soạn kịch bản đầy đủ bằng tay; quản trị hệ thống sẽ bổ sung mẫu khi có." />}
    {(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data?.total ?? 0} onPageChange={setPage} disabled={list.loading} />}

    <div style={{ marginTop: 24 }}><Alert tone="info" title="Áp dụng mẫu là sao chép vào bản nháp của bạn">Mở một công trình, vào trình soạn kịch bản rồi chọn thẻ Thư viện để xem trước và áp dụng. Thêm thiết bị vào thư viện không tự thêm khả năng gameplay: chỉ những đối tượng mà runtime đang hỗ trợ mới đặt được.</Alert></div>

    {selected && UUID.test(selected) && accessToken && <ItemDrawer accessToken={accessToken} itemId={selected} onClose={() => setParams({ item: null })} />}
  </div>;
}
