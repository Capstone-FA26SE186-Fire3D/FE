"use client";

import { Archive, ArchiveRestore, FilePlus2, FolderOpen, Library, Search } from "lucide-react";
import { useState } from "react";

import { commandDone, commandKey } from "@/api/command-keys";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { RowMenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { SubTabs, type SubTabItem } from "@/components/ui/sub-tabs";
import { useToast } from "@/components/ui/toast";
import { etagFor, libraryAdminApi } from "@/features/library/api";
import { describeLibraryError, type LibraryErrorView } from "@/features/library/errors";
import { LIBRARY_KINDS, isKind, kindLabel, type LibraryItem, type LibraryKind } from "@/features/library/types";

const PAGE_SIZE = 20;
export const STATES = ["active", "inactive", "unpublished"] as const;
type ItemState = (typeof STATES)[number];
const stateLabel: Record<ItemState, string> = { active: "Đang dùng", inactive: "Ngừng dùng", unpublished: "Chưa có bản xuất bản" };
const isState = (value: string): value is ItemState => (STATES as readonly string[]).includes(value);
const tabLabel: Record<LibraryKind, string> = { ScenarioTemplate: "Kịch bản mẫu", RubricSample: "Tiêu chí chấm mẫu", Equipment: "Thiết bị" };
const kindTone: Record<LibraryKind, Tone> = { ScenarioTemplate: "info", RubricSample: "ember", Equipment: "neutral" };

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
  return version.status === "Published" ? { label: "Đang dùng", tone: "success" } : { label: "Bản nháp", tone: "warning" };
}

/** Total items of one kind across the whole library (page size 1, only `total` is read). */
function useKindTotal(kind: LibraryKind, token: string, reloadKey: number) {
  const result = useAsyncData(`library-items:total:${kind}:${reloadKey}`, (signal) => libraryAdminApi.listItems(token, { kind, page: 1, pageSize: 1 }, signal));
  return result.data ? result.data.total : undefined;
}

/**
 * Items of every kind and state (Figma 53:1111): kind sub-tabs with totals, a DataTable whose row opens the item popup
 * (`?item=`), and a "···" menu (Mở · Tạo phiên bản · Ngừng dùng/Dùng lại, the only item write the API has). Kind and the
 * code search are applied by the server and live in the URL together with the page; the state filter only narrows the
 * page that is loaded and says so.
 */
export function ItemsList({ accessToken, reloadKey, onOpen, onNewVersion, onCreate, onChanged }: { accessToken: string; reloadKey: number; onOpen: (itemId: string) => void; onNewVersion: (itemId: string) => void; onCreate: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const rawKind = get("kind");
  const kind = isKind(rawKind) ? rawKind : "";
  const rawState = get("state");
  const state = isState(rawState) ? rawState : "";
  const urlSearch = get("q");
  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);
  const list = useAsyncData(`library-items:${kind}:${urlSearch}:${page}:${reloadKey}`, (signal) => libraryAdminApi.listItems(accessToken, { kind, search: urlSearch, page, pageSize: PAGE_SIZE }, signal));
  const totals: Record<LibraryKind, number | undefined> = {
    ScenarioTemplate: useKindTotal("ScenarioTemplate", accessToken, reloadKey),
    RubricSample: useKindTotal("RubricSample", accessToken, reloadKey),
    Equipment: useKindTotal("Equipment", accessToken, reloadKey),
  };
  const loaded = list.data?.items ?? [];
  const items = loaded.filter((item) => matches(item, state));
  const total = list.data?.total ?? 0;
  const filtered = kind !== "" || state !== "" || urlSearch !== "";
  const [toggling, setToggling] = useState<LibraryItem | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState<LibraryErrorView | null>(null);

  const runToggle = async () => {
    if (!toggling || toggleBusy) return;
    setToggleBusy(true);
    setToggleError(null);
    const next = !toggling.isActive;
    const etag = etagFor(toggling.revision);
    const intent = { op: "library-item-active", itemId: toggling.id, etag, isActive: next };
    try {
      await libraryAdminApi.updateItem(accessToken, toggling.id, { isActive: next }, etag, commandKey(intent));
      commandDone(intent);
      toast.notify({ tone: "success", title: next ? "Đã dùng lại mục" : "Đã ngừng dùng mục", description: toggling.code });
      setToggling(null);
      onChanged();
    } catch (cause) {
      const view = describeLibraryError(cause);
      setToggleError(view);
      if (view.kind === "stale") onChanged();
    } finally {
      setToggleBusy(false);
    }
  };

  const tabs: SubTabItem[] = [
    { value: "", label: "Tất cả" },
    ...LIBRARY_KINDS.map((value) => ({ value, label: tabLabel[value], count: totals[value], "data-testid": `chip-${value}` })),
  ];

  const columns: DataColumn<LibraryItem>[] = [
    { key: "item", header: "Mục", primary: true, render: (item) => <CellTitle title={item.latestPublished?.name || item.code} sub={item.latestPublished ? item.code : `${item.versions.length} phiên bản`} /> },
    { key: "kind", header: "Loại", width: 150, hideBelow: 900, render: (item) => <StatusBadge tone={kindTone[item.kind]}>{kindLabel[item.kind]}</StatusBadge> },
    { key: "version", header: "Phiên bản xuất bản", width: 150, render: (item) => (item.latestPublished ? `v${item.latestPublished.versionNumber}` : shownVersion(item) ? `— (nháp v${shownVersion(item)!.number})` : "—") },
    { key: "status", header: "Trạng thái", width: 150, render: (item) => { const status = itemStatus(item); return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>; } },
    { key: "capabilities", header: "Năng lực yêu cầu", hideBelow: 1200, render: (item) => (item.latestPublished ? (item.latestPublished.requiredCapabilities.length ? item.latestPublished.requiredCapabilities.join(" · ") : "Không khai báo") : "—") },
    { key: "updated", header: "Cập nhật", width: 170, hideBelow: 768, render: (item) => formatDateTime(item.updatedAt) },
  ];

  const rowMenu = (item: LibraryItem): RowMenuItem[] => [
    { label: "Mở", icon: FolderOpen, onSelect: () => onOpen(item.id) },
    { label: "Tạo phiên bản", icon: FilePlus2, onSelect: () => onNewVersion(item.id) },
    { label: item.isActive ? "Ngừng dùng" : "Dùng lại", icon: item.isActive ? Archive : ArchiveRestore, tone: item.isActive ? "danger" : undefined, separator: true, onSelect: () => { setToggleError(null); setToggling(item); } },
  ];

  return <>
    <SubTabs label="Loại mục" value={kind} className="mb-4" items={tabs} onValueChange={(value) => setParams({ kind: isKind(value) ? value : null })} />
    {list.error !== undefined && <Alert tone="danger" className="mb-4" title="Không tải được danh sách thư viện" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{describeLibraryError(list.error).message}</Alert>}
    <DataTable
      caption="Danh sách mục thư viện tổ chức"
      data-testid="library-items-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={(item) => onOpen(item.id)}
      rowMenu={rowMenu}
      rowTone={(item) => (item.isActive ? undefined : "muted")}
      toolbar={<>
        <TableSearch value={searchText} onChange={setSearchText} label="Tìm theo mã" placeholder="Tìm theo mã mục" />
        <FilterChips label="Bộ lọc mục">
          {/* The server has no state filter: this chip narrows the loaded page only (and the note below says so). */}
          <FilterChip label="Trạng thái" value={state} onChange={(value) => setParams({ state: value, page })} options={STATES.map((value) => ({ value, label: stateLabel[value] }))} />
        </FilterChips>
      </>}
      empty={<EmptyState icon={filtered ? Search : Library} title={filtered ? "Không có mục khớp bộ lọc." : "Thư viện chưa có mục nào"}
        description={filtered ? "Thử đổi hoặc xóa bộ lọc." : "Chưa có mẫu nào. Thư viện không có dữ liệu sẵn: thêm mục (kịch bản mẫu, tiêu chí chấm mẫu hoặc thiết bị), tạo phiên bản và xuất bản để tổ chức dùng được. Tiêu chí chấm mẫu cần danh mục chỉ số chấm điểm đã được thiết lập trong hệ thống."}
        action={!filtered && <Button size="sm" onClick={onCreate}>Thêm mục</Button>} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className="ops-field-hint" style={{ margin: "10px 0 0" }}>
      Bấm hàng để mở mục với danh sách phiên bản và trình sửa theo loại; menu “···” tạo phiên bản hoặc ngừng dùng mục.
      {state && ` Bộ lọc trạng thái chỉ áp dụng cho ${loaded.length} mục của trang đang mở.`}
    </p>
    <div style={{ marginTop: 18 }}>
      <Alert tone="info" title="Thêm thông tin thiết bị không tự thêm chức năng trong game">
        Chỉ đối tượng mà ứng dụng FET3D đang hỗ trợ mới dùng được trong kịch bản; thông tin thiết bị chỉ để mô tả và hiển thị.
      </Alert>
    </div>

    {toggling && <ConfirmDialog open onOpenChange={(open) => { if (!open) { setToggling(null); setToggleError(null); } }} busy={toggleBusy}
      title={toggling.isActive ? "Ngừng dùng mục này?" : "Dùng lại mục này?"}
      description={toggling.isActive ? "Tổ chức không còn thấy mục này khi chọn mẫu mới. Bản đã xuất bản vẫn đọc được theo mã, nên kịch bản đã dùng không bị ảnh hưởng. Có thể dùng lại sau." : "Nếu mục có phiên bản đã xuất bản, tổ chức thấy lại mục này trong danh sách chọn."}
      tone={toggling.isActive ? "danger" : "primary"} confirmLabel={toggleError?.kind === "retry" ? "Thử lại" : toggling.isActive ? "Ngừng dùng" : "Dùng lại"} onConfirm={runToggle}>
      <div className="ops-stack">
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Mục <strong style={{ color: "var(--text)" }}>{toggling.code}</strong> · {kindLabel[toggling.kind]}</p>
        {toggleError && <Alert tone={toggleError.kind === "stale" ? "warning" : "danger"} title={toggleError.title}>{toggleError.kind === "stale" ? "Mục đã đổi ở nơi khác; danh sách đã tải lại. Mở lại menu rồi thử lại." : toggleError.message}</Alert>}
      </div>
    </ConfirmDialog>}
  </>;
}
