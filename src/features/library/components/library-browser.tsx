"use client";

import { FileText, Library, Search } from "lucide-react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { TableSearch } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonDetail, SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubTabs } from "@/components/ui/sub-tabs";
import { Pagination } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuthSession } from "@/features/auth/auth-session";
import { libraryApi } from "../api";
import { describeLibraryError } from "../errors";
import { LIBRARY_KINDS, isKind, kindLabel, type LibraryItem } from "../types";
import { VersionPreview } from "./version-preview";
import "./library-filters.css";
import { LoadingBlock } from "@/components/ui/spinner";

// The organization list route has no server-side search (BE: only `kind`, `page`, `pageSize`, max 100), so the page is
// requested at its largest size and the search / capability filters narrow what is loaded.
const PAGE_SIZE = 100;
const NO_CAPABILITY = "none";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USE_AS_TEMPLATE_HINT = "“Dùng làm mẫu” chỉ dùng được bên trong trình soạn kịch bản. Mở một công trình, vào trình soạn và chọn thẻ Thư viện để áp dụng.";

function ItemDrawer({ accessToken, itemId, onClose }: { accessToken: string; itemId: string; onClose: () => void }) {
  const query = useAsyncData(`library-org-item:${itemId}`, (signal) => libraryApi.getItem(accessToken, itemId, signal), true, { keepPrevious: false });
  const item = query.data;
  const version = item?.latestPublished ?? null;
  const view = query.error !== undefined && !item ? describeLibraryError(query.error) : null;
  return <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} size="md" title={version?.name ?? (item ? item.code : "Mẫu thư viện")} description={item ? `${kindLabel[item.kind]} · ${item.code}` : "Chỉ xem. Áp dụng vào kịch bản trong trình soạn thảo, thẻ Thư viện."}
    eyebrow={version ? <><StatusBadge tone="success">Đã xuất bản · v{version.versionNumber}</StatusBadge>{version.requiredCapabilities.length > 0 && <StatusBadge tone="warning">Có yêu cầu năng lực</StatusBadge>}</> : undefined}
    data-testid="org-item-drawer"
    footer={<>
      <Button variant="quiet" onClick={onClose}>Đóng</Button>
      <Tooltip content={USE_AS_TEMPLATE_HINT}><span style={{ display: "inline-flex" }}><Button disabled aria-describedby="org-lib-use-hint" style={{ pointerEvents: "none" }}>Dùng làm mẫu</Button></span></Tooltip>
    </>}>
    {!item && !view && <SkeletonDetail rows={6} label="Đang tải mẫu…" />}
    {view && <Alert tone="danger" title={view.kind === "notFound" ? "Mẫu không còn khả dụng" : "Không tải được mẫu"} action={view.kind === "notFound" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={query.reload}>Thử lại</Button>}>{view.kind === "notFound" ? "Mẫu đã ngừng dùng hoặc chưa có phiên bản đã xuất bản." : view.message}</Alert>}
    {version && <div className="ops-stack" data-testid="org-item-detail">
      <VersionPreview version={version} />
      <Alert tone="info" title="Áp dụng là sao chép">Khi bạn áp dụng, nội dung được sao chép vào bản nháp của bạn sau bước xem trước. Cập nhật mẫu về sau không đổi kịch bản đã soạn hoặc đã phát hành.</Alert>
      <p id="org-lib-use-hint" className="ops-field-hint" style={{ margin: 0 }}>{USE_AS_TEMPLATE_HINT}</p>
    </div>}
  </Drawer>;
}

function ItemCard({ item, onOpen }: { item: LibraryItem; onOpen: () => void }) {
  const version = item.latestPublished;
  const capabilities = version?.requiredCapabilities ?? [];
  const shown = capabilities.slice(0, 3);
  return <article className="org-lib-card" data-testid={`org-item-${item.code}`}>
    <div className="org-lib-head">
      <span className="org-lib-icon" aria-hidden="true"><FileText size={20} /></span>
      <div style={{ minWidth: 0 }}>
        <h3 className="org-lib-title">{version?.name ?? item.code}</h3>
        <p className="org-lib-sub">{kindLabel[item.kind]} · <code className="org-lib-code">{item.code}</code></p>
      </div>
    </div>
    <div className="org-lib-chips" aria-label="Năng lực yêu cầu">
      {shown.length === 0 ? <span className="org-lib-chip" data-empty>Không yêu cầu năng lực</span> : shown.map((id) => <span key={id} className="org-lib-chip">{id}</span>)}
      {capabilities.length > shown.length && <span className="org-lib-chip">+{capabilities.length - shown.length}</span>}
    </div>
    <div className="org-lib-foot">
      <span className="org-lib-meta">{version ? `Phiên bản ${version.versionNumber} · Đã xuất bản${version.publishedAt ? ` ${formatDateTime(version.publishedAt)}` : ""}` : "Chưa có phiên bản"}</span>
      <Button variant="secondary" size="sm" onClick={onOpen} aria-label={`Xem mẫu ${item.code}`}>Xem chi tiết</Button>
    </div>
  </article>;
}

/** Organization view of the Library: active items with a Published version, read only. The Library is shared content, not tenant data. */
export function LibraryBrowser() {
  const { accessToken, ready, user } = useAuthSession();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const rawKind = get("kind");
  const kind = isKind(rawKind) ? rawKind : "";
  const selected = get("item");
  const list = useAsyncData(`library-org:${kind}:${page}`, (signal) => libraryApi.listItems(accessToken ?? "", { kind, page, pageSize: PAGE_SIZE }, signal), ready && Boolean(accessToken) && (user?.role === 0 || user?.role === 1));
  const urlSearch = get("q");
  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);
  const capability = get("cap");
  const loaded = list.data?.items ?? [];
  const capabilities = [...new Set(loaded.flatMap((item) => item.latestPublished?.requiredCapabilities ?? []))].sort();
  const needle = urlSearch.trim().toLowerCase();
  const items = loaded.filter((item) => {
    const version = item.latestPublished;
    if (needle && !`${item.code} ${version?.name ?? ""}`.toLowerCase().includes(needle)) return false;
    if (capability === NO_CAPABILITY) return !version?.requiredCapabilities.length;
    if (capability) return Boolean(version?.requiredCapabilities.includes(capability));
    return true;
  });
  const narrowed = needle !== "" || capability !== "";
  const capabilityOptions: ComboboxOption[] = [
    { value: "", label: "Tất cả", group: "Năng lực" },
    { value: NO_CAPABILITY, label: "Không yêu cầu năng lực", group: "Năng lực" },
    ...(capability && capability !== NO_CAPABILITY && !capabilities.includes(capability) ? [{ value: capability, label: capability, group: "Trong trang đã tải" }] : []),
    ...capabilities.map((value) => ({ value, label: value, group: "Trong trang đã tải" })),
  ];

  const header = <PageHeader title="Thư viện mẫu" description="Kịch bản mẫu, tiêu chí chấm mẫu và thiết bị game đã được ứng dụng FET3D hỗ trợ. Chỉ để tham khảo và dùng làm điểm xuất phát; bạn vẫn tự soạn được." eyebrow="Huấn luyện" breadcrumbs={[{ label: "Thư viện mẫu" }]} />;
  if (!ready) return <LoadingBlock label="Đang kiểm tra phiên đăng nhập…" />;

  return <div className="org">
    {header}
    <div className="org-lib-toolbar">
      <SubTabs label="Loại mẫu" value={kind || "all"} onValueChange={(value) => setParams({ kind: value === "all" ? "" : value, item: null })}
        items={[{ value: "all", label: "Tất cả", "data-testid": "filter-kind-all" }, ...LIBRARY_KINDS.map((value) => ({ value, label: kindLabel[value], count: kind === value && list.data ? list.data.total : undefined, "data-testid": `filter-kind-${value}` }))]} />
      <div className="org-lib-filters" role="search" aria-label="Lọc thư viện">
        <TableSearch value={searchText} onChange={setSearchText} label="Tìm mẫu" placeholder="Tìm theo mã hoặc tên mẫu" />
        <Combobox aria-label="Năng lực yêu cầu" className="org-lib-cap" value={capability} onChange={(value) => setParams({ cap: value })} options={capabilityOptions} placeholder="Năng lực: Tất cả" searchPlaceholder="Tìm năng lực…" data-testid="filter-capability" />
        {narrowed && <Button variant="quiet" onClick={() => { setSearchText(""); setParams({ q: null, cap: null }); }}>Xóa bộ lọc</Button>}
      </div>
    </div>
    {narrowed && list.data && <p className="org-lib-hint" role="status">Máy chủ chưa lọc theo tên hoặc năng lực: kết quả chỉ tính trên {loaded.length} mẫu đã tải{list.data.total > loaded.length ? ` (trang ${page}/${Math.ceil(list.data.total / PAGE_SIZE)})` : ""}. Có {items.length} mẫu khớp.</p>}

    {list.error !== undefined && (() => {
      const view = describeLibraryError(list.error);
      return <Alert tone="danger" title={view.kind === "denied" ? "Không có quyền xem thư viện" : "Không tải được thư viện"} action={view.kind === "denied" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{view.message}</Alert>;
    })()}

    {list.loading && !list.data && <SkeletonRows rows={4} label="Đang tải thư viện mẫu…" />}
    <div className="org-lib-grid" aria-label="Mẫu đã xuất bản">
      {items.map((item) => <ItemCard key={item.id} item={item} onOpen={() => setParams({ item: item.id })} />)}
    </div>
    {list.data && !items.length && <EmptyState icon={kind || narrowed ? Search : Library} title={narrowed && loaded.length ? "Không có mẫu khớp bộ lọc" : kind ? "Chưa có mẫu thuộc loại này" : "Thư viện chưa có mẫu nào"} description={narrowed && loaded.length ? "Thử đổi hoặc xóa bộ lọc." : "Chưa có mẫu nào được xuất bản. Bạn vẫn soạn kịch bản đầy đủ bằng tay; quản trị hệ thống sẽ bổ sung mẫu khi có."} />}
    {(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data?.total ?? 0} onPageChange={setPage} disabled={list.loading} />}

    <p className="org-lib-note">{USE_AS_TEMPLATE_HINT} Thêm thiết bị vào thư viện không tự bổ sung khả năng gameplay: chỉ những đối tượng mà ứng dụng FET3D đang hỗ trợ mới đặt được.</p>

    {selected && UUID.test(selected) && accessToken && <ItemDrawer accessToken={accessToken} itemId={selected} onClose={() => setParams({ item: null })} />}
  </div>;
}
