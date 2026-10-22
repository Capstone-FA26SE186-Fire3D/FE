"use client";

import { Library, Search } from "lucide-react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { Chip, Chips } from "@/features/admin-overview/components/admin-kit";
import { formatCount } from "@/features/admin-overview/format";
import { libraryAdminApi } from "@/features/library/api";
import { describeLibraryError } from "@/features/library/errors";
import { LIBRARY_KINDS, isKind, kindLabel, type LibraryItem, type LibraryKind } from "@/features/library/types";

const PAGE_SIZE = 20;
export const STATES = ["active", "inactive", "unpublished"] as const;
type ItemState = (typeof STATES)[number];
const stateLabel: Record<ItemState, string> = { active: "Đang dùng", inactive: "Ngừng dùng", unpublished: "Chưa có bản xuất bản" };
const isState = (value: string): value is ItemState => (STATES as readonly string[]).includes(value);
const chipLabel: Record<LibraryKind, string> = { ScenarioTemplate: "Template", RubricSample: "Rubric mẫu", Equipment: "Thiết bị" };

const matches = (item: LibraryItem, state: ItemState | "") => state === "" || (state === "active" ? item.isActive : state === "inactive" ? !item.isActive : item.latestPublished === null);

/** The version a row describes: the one organizations see, otherwise the newest version (a Draft). */
function shownVersion(item: LibraryItem): { number: number; status: "Published" | "Draft" } | null {
  if (item.latestPublished) return { number: item.latestPublished.versionNumber, status: "Published" };
  const newest = [...item.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  return newest ? { number: newest.versionNumber, status: newest.status } : null;
}

function itemStatus(item: LibraryItem): { label: string; tone: Tone } {
  if (!item.isActive) return { label: "Ngừng dùng", tone: "neutral" };
  const version = shownVersion(item);
  if (!version) return { label: "Chưa có phiên bản", tone: "warning" };
  return version.status === "Published" ? { label: "Published", tone: "success" } : { label: "Draft", tone: "warning" };
}

/** Total items of one kind across the whole library (page size 1, only `total` is read). */
function useKindTotal(kind: LibraryKind, token: string, reloadKey: number) {
  const result = useAsyncData(`library-items:total:${kind}:${reloadKey}`, (signal) => libraryAdminApi.listItems(token, { kind, page: 1, pageSize: 1 }, signal));
  return result.data ? result.data.total : null;
}

/**
 * Items of every kind and state. Kind and the code search are applied by the server and live in the URL together with the
 * page. The state filter only narrows the page that is loaded and says so; it never changes the paging.
 */
export function ItemsList({ accessToken, reloadKey, onOpen, onCreate }: { accessToken: string; reloadKey: number; onOpen: (itemId: string) => void; onCreate: () => void }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const rawKind = get("kind");
  const kind = isKind(rawKind) ? rawKind : "";
  const rawState = get("state");
  const state = isState(rawState) ? rawState : "";
  const urlSearch = get("q");
  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);
  const list = useAsyncData(`library-items:${kind}:${urlSearch}:${page}:${reloadKey}`, (signal) => libraryAdminApi.listItems(accessToken, { kind, search: urlSearch, page, pageSize: PAGE_SIZE }, signal));
  const totals: Record<LibraryKind, number | null> = {
    ScenarioTemplate: useKindTotal("ScenarioTemplate", accessToken, reloadKey),
    RubricSample: useKindTotal("RubricSample", accessToken, reloadKey),
    Equipment: useKindTotal("Equipment", accessToken, reloadKey),
  };
  const loaded = list.data?.items ?? [];
  const items = loaded.filter((item) => matches(item, state));
  const total = list.data?.total ?? 0;
  const filtered = kind !== "" || state !== "" || urlSearch !== "";

  return <>
    <Chips label="Loại mục">
      {LIBRARY_KINDS.map((value) => {
        const count = formatCount(totals[value]);
        return <Chip key={value} active={kind === value} onClick={() => setParams({ kind: kind === value ? null : value })} data-testid={`chip-${value}`}>{count === null ? chipLabel[value] : `${chipLabel[value]} · ${count}`}</Chip>;
      })}
    </Chips>

    <div className="adm-filters">
      <div className="adm-search">
        <label htmlFor="library-search" className="sr-only">Tìm theo mã</label>
        <Search size={16} aria-hidden="true" />
        <Input id="library-search" placeholder="Tìm theo mã" value={searchText} onChange={(event) => setSearchText(event.target.value)} maxLength={80} />
      </div>
      <Select aria-label="Trạng thái mục (trong trang này)" data-w style={{ width: 220 }} value={state} onChange={(event) => setParams({ state: event.target.value, page })} data-testid="filter-state">
        <option value="">Trạng thái: tất cả</option>
        {STATES.map((value) => <option key={value} value={value}>{stateLabel[value]}</option>)}
      </Select>
      {filtered && <Button variant="quiet" onClick={() => { setSearchText(""); setParams({ kind: null, state: null, q: null, page: 1 }); }}>Xóa bộ lọc</Button>}
    </div>
    {state && <p className="ops-field-hint" style={{ margin: "0 0 10px" }}>Máy chủ chưa có bộ lọc trạng thái: bộ lọc này chỉ áp dụng cho {loaded.length} mục của trang đang mở.</p>}

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách thư viện" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeLibraryError(list.error).message}</Alert>}

    <Table caption="Danh sách mục thư viện tổ chức">
      <thead><tr><th>Mục</th><th>Loại</th><th>Phiên bản</th><th>Trạng thái</th><th>Năng lực yêu cầu</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={7}><SkeletonRows rows={6} label="Đang tải danh sách thư viện…" /></TableMessage>}
        {items.map((item) => {
          const version = shownVersion(item);
          const status = itemStatus(item);
          const capabilities = item.latestPublished ? item.latestPublished.requiredCapabilities.length : null;
          return <tr key={item.id} data-testid={`item-row-${item.code}`}>
            <td>
              <button type="button" className="ops-cell-primary" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", minHeight: 44 }} onClick={() => onOpen(item.id)} aria-label={`Mở mục ${item.code}`}>
                <span style={{ display: "block", overflowWrap: "anywhere" }}>{item.latestPublished?.name || item.code}</span>
                <span className="ops-cell-sub">{item.latestPublished ? `${item.code} · ` : ""}{item.versions.length} phiên bản</span>
              </button>
            </td>
            <td>{kindLabel[item.kind]}</td>
            <td>{version ? `v${version.number}` : "—"}</td>
            <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
            <td>{capabilities === null ? "—" : `${capabilities} năng lực`}</td>
            <td>{formatDateTime(item.updatedAt)}</td>
            <td className="ops-cell-actions"><Button size="sm" variant="secondary" onClick={() => onOpen(item.id)} aria-label={`${item.isActive ? "Chỉnh sửa" : "Xem"} mục ${item.code}`}>{item.isActive ? "Chỉnh sửa" : "Xem"}</Button></td>
          </tr>;
        })}
        {list.data && !items.length && <TableMessage colSpan={7}><EmptyState icon={filtered ? Search : Library} title={filtered ? "Không có mục khớp bộ lọc." : "Thư viện chưa có mục nào"}
          description={filtered ? "Thử đổi hoặc xóa bộ lọc." : "Chưa có mẫu nào. Thư viện không có dữ liệu sẵn: thêm mục (template, rubric mẫu hoặc thiết bị), tạo phiên bản và xuất bản để tổ chức dùng được. Rubric mẫu cần danh mục rubric đã được cấu hình ở máy chủ."}
          action={!filtered && <Button size="sm" onClick={onCreate}>Thêm mục</Button>} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <div style={{ marginTop: 18 }}>
      <Alert tone="info" title="Thêm metadata thiết bị không tự thêm khả năng gameplay">
        Chỉ đối tượng mà runtime đang hỗ trợ mới dùng được trong kịch bản; thông tin thiết bị chỉ để mô tả và hiển thị.
      </Alert>
    </div>
  </>;
}
