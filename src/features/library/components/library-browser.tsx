"use client";

import { Library, Search } from "lucide-react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { routes } from "@/configs/routes";
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

  const header = <PageHeader title="Thư viện mẫu" description="Template kịch bản, rubric mẫu và thiết bị do quản trị hệ thống xuất bản. Bạn có thể dùng hoặc tự soạn hoàn toàn; chọn mẫu và xem trước trong trình soạn kịch bản." breadcrumbs={[{ label: "Không gian tổ chức", href: routes.workspaceBuildings }, { label: "Thư viện mẫu" }]} />;
  if (!ready) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;

  return <>
    {header}
    <div className="ops-toolbar">
      <Select aria-label="Loại mẫu" style={{ width: 220 }} value={kind} onChange={(event) => setParams({ kind: event.target.value, item: null })} data-testid="filter-kind">
        <option value="">Mọi loại</option>
        {LIBRARY_KINDS.map((value) => <option key={value} value={value}>{kindLabel[value]}</option>)}
      </Select>
      {kind && <Button variant="quiet" onClick={() => setParams({ kind: null })}>Xóa bộ lọc</Button>}
    </div>

    {list.error !== undefined && (() => {
      const view = describeLibraryError(list.error);
      return <Alert tone="danger" title={view.kind === "denied" ? "Không có quyền xem thư viện" : "Không tải được thư viện"} action={view.kind === "denied" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{view.message}</Alert>;
    })()}

    <Table caption="Mẫu đã xuất bản">
      <thead><tr><th>Mã</th><th>Loại</th><th>Phiên bản đã xuất bản</th><th>Xuất bản</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={5} label="Đang tải thư viện mẫu…" /></TableMessage>}
        {items.map((item) => <tr key={item.id} data-testid={`org-item-${item.code}`}>
          <td><button type="button" className="ops-cell-primary" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", minHeight: 44, overflowWrap: "anywhere" }} onClick={() => setParams({ item: item.id })} aria-label={`Xem mẫu ${item.code}`}>{item.code}</button></td>
          <td>{kindLabel[item.kind]}</td>
          <td style={{ overflowWrap: "anywhere", minWidth: 200 }}>{item.latestPublished ? `v${item.latestPublished.versionNumber} · ${item.latestPublished.name}` : "—"}</td>
          <td>{formatDateTime(item.latestPublished?.publishedAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={kind ? Search : Library} title={kind ? "Chưa có mẫu thuộc loại này" : "Thư viện chưa có mẫu nào"} description="Chưa có mẫu nào được xuất bản. Bạn vẫn soạn kịch bản đầy đủ bằng tay; quản trị hệ thống sẽ bổ sung mẫu khi có." /></TableMessage>}
      </tbody>
    </Table>
    {(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data?.total ?? 0} onPageChange={setPage} disabled={list.loading} />}

    {selected && UUID.test(selected) && accessToken && <ItemDrawer accessToken={accessToken} itemId={selected} onClose={() => setParams({ item: null })} />}
  </>;
}
