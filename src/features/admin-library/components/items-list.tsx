"use client";

import { Library, Search } from "lucide-react";

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
import { libraryAdminApi } from "@/features/library/api";
import { describeLibraryError } from "@/features/library/errors";
import { LIBRARY_KINDS, isKind, kindLabel, type LibraryItem } from "@/features/library/types";

const PAGE_SIZE = 20;
export const STATES = ["active", "inactive", "unpublished"] as const;
type ItemState = (typeof STATES)[number];
const stateLabel: Record<ItemState, string> = { active: "Đang dùng", inactive: "Ngừng dùng", unpublished: "Chưa có bản xuất bản" };
const isState = (value: string): value is ItemState => (STATES as readonly string[]).includes(value);

const matches = (item: LibraryItem, state: ItemState | "") => state === "" || (state === "active" ? item.isActive : state === "inactive" ? !item.isActive : item.latestPublished === null);

/**
 * Items of every kind and state (kind filter and page live in the URL, applied by the server). The API has no status filter, so
 * the state filter only narrows the page that is loaded and says so; it never changes the paging.
 */
export function ItemsList({ accessToken, reloadKey, onOpen, onCreate }: { accessToken: string; reloadKey: number; onOpen: (itemId: string) => void; onCreate: () => void }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const rawKind = get("kind");
  const kind = isKind(rawKind) ? rawKind : "";
  const rawState = get("state");
  const state = isState(rawState) ? rawState : "";
  const list = useAsyncData(`library-items:${kind}:${page}:${reloadKey}`, (signal) => libraryAdminApi.listItems(accessToken, { kind, page, pageSize: PAGE_SIZE }, signal));
  const loaded = list.data?.items ?? [];
  const items = loaded.filter((item) => matches(item, state));
  const total = list.data?.total ?? 0;
  const filtered = kind !== "" || state !== "";

  return <>
    <div className="ops-toolbar">
      <Select aria-label="Loại mục" style={{ width: 200 }} value={kind} onChange={(event) => setParams({ kind: event.target.value })} data-testid="filter-kind">
        <option value="">Mọi loại</option>
        {LIBRARY_KINDS.map((value) => <option key={value} value={value}>{kindLabel[value]}</option>)}
      </Select>
      <Select aria-label="Trạng thái mục (trong trang này)" style={{ width: 240 }} value={state} onChange={(event) => setParams({ state: event.target.value, page })} data-testid="filter-state">
        <option value="">Mọi trạng thái (trang này)</option>
        {STATES.map((value) => <option key={value} value={value}>{stateLabel[value]}</option>)}
      </Select>
      {filtered && <Button variant="quiet" onClick={() => setParams({ kind: null, state: null, page: 1 })}>Xóa bộ lọc</Button>}
    </div>
    {state && <p className="ops-field-hint" style={{ margin: 0 }}>Máy chủ chưa có bộ lọc trạng thái: bộ lọc này chỉ áp dụng cho {loaded.length} mục của trang đang mở.</p>}

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách thư viện" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeLibraryError(list.error).message}</Alert>}

    <Table caption="Danh sách mục thư viện tổ chức">
      <thead><tr><th>Mã</th><th>Loại</th><th>Trạng thái</th><th>Bản tổ chức thấy</th><th>Cập nhật</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={6} label="Đang tải danh sách thư viện…" /></TableMessage>}
        {items.map((item) => <tr key={item.id} data-testid={`item-row-${item.code}`}>
          <td>
            <button type="button" className="ops-cell-primary" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", minHeight: 44 }} onClick={() => onOpen(item.id)} aria-label={`Mở mục ${item.code}`}>
              <span style={{ display: "block", overflowWrap: "anywhere" }}>{item.code}</span>
              <span className="ops-cell-sub">{item.versions.length} phiên bản</span>
            </button>
          </td>
          <td>{kindLabel[item.kind]}</td>
          <td><StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang dùng" : "Ngừng dùng"}</StatusBadge></td>
          <td style={{ minWidth: 200, overflowWrap: "anywhere" }}>{item.latestPublished ? `v${item.latestPublished.versionNumber} · ${item.latestPublished.name}` : <StatusBadge tone="warning">Chưa xuất bản</StatusBadge>}</td>
          <td>{formatDateTime(item.updatedAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtered ? Search : Library} title={filtered ? "Không có mục khớp bộ lọc." : "Thư viện chưa có mục nào"}
          description={filtered ? "Thử đổi hoặc xóa bộ lọc." : "Chưa có mẫu nào. Thư viện không có dữ liệu sẵn: thêm mục (template, rubric mẫu hoặc thiết bị), tạo phiên bản và xuất bản để tổ chức dùng được. Rubric mẫu cần danh mục rubric đã được cấu hình ở máy chủ."}
          action={!filtered && <Button size="sm" onClick={onCreate}>Thêm mục</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}
  </>;
}
