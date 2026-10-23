"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { RowMenu, type RowMenuItem } from "@/components/ui/dropdown-menu";
import { AnimatePresence, m, presets } from "@/components/ui/motion";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { useMediaQuery } from "@/utils/use-media-query";

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Column width hint (px or CSS); the first column stretches when none is given. */
  width?: number | string;
  align?: "left" | "right" | "center";
  /** The column that names the row: drawn as the row's link and kept visible in card layout. */
  primary?: boolean;
  /** Hidden below this viewport width (px); the value still appears in card layout. */
  hideBelow?: number;
  /** Server-side sort key; the header becomes a sort button. */
  sortKey?: string;
  /** Not shown in the card layout (e.g. a second status chip). */
  cardHidden?: boolean;
  className?: string;
};

export type SortState = { key: string; dir: "asc" | "desc" };

type Props<T> = {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  /** Row click opens the record (detail drawer or page). Interactive cells stop propagation themselves. */
  onRowClick?: (row: T) => void;
  /** Alternative to onRowClick: the primary cell becomes a real link and the row navigates on click. */
  rowHref?: (row: T) => string;
  rowMenu?: (row: T) => RowMenuItem[];
  rowTone?: (row: T) => "muted" | "warning" | undefined;
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /** Actions for the floating bar shown while rows are ticked. */
  selectionActions?: (ids: string[]) => ReactNode;
  loading?: boolean;
  loadingRows?: number;
  empty: ReactNode;
  error?: ReactNode;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  /** Search box + filter chips + view toggle live here, inside the table card. */
  toolbar?: ReactNode;
  pagination?: { page: number; pageSize: number; totalCount: number; onPageChange: (page: number) => void };
  /** Below this width (px) the table turns into a card list. 0 disables. */
  cardBelow?: number;
  cardRender?: (row: T) => ReactNode;
  stickyFirst?: boolean;
  className?: string;
  "data-testid"?: string;
};

const ROW_INTERACTIVE = "a, button, input, select, textarea, [role=button], [role=menu], [data-row-stop]";

/**
 * DataTable v2 (Figma "bấm hàng mở chi tiết · menu ··· · không nút Mở"). Sorting, filtering and paging stay on the
 * server through the URL; this component only draws. Rows are clickable with a chevron, the "···" menu is mounted on
 * demand, ticking rows raises a floating selection bar, and under `cardBelow` the same rows render as cards.
 */
export function DataTable<T>({ columns, rows, rowKey, caption, onRowClick, rowHref, rowMenu, rowTone, selectable, selected, onSelectedChange, selectionActions, loading, loadingRows = 6, empty, error, sort, onSortChange, toolbar, pagination, cardBelow = 640, cardRender, stickyFirst = true, className, ...rest }: Props<T>) {
  const router = useRouter();
  const id = useId();
  const isCards = useMediaQuery(`(max-width: ${cardBelow - 1}px)`) && cardBelow > 0;
  const clickable = Boolean(onRowClick || rowHref);
  const primary = columns.find((column) => column.primary) ?? columns[0];
  const ids = rows.map(rowKey);
  const picked = selected ?? new Set<string>();
  const allPicked = ids.length > 0 && ids.every((rowId) => picked.has(rowId));

  const open = (row: T) => { if (onRowClick) onRowClick(row); else if (rowHref) router.push(rowHref(row)); };
  const onRowClickCapture = (row: T) => (event: MouseEvent<HTMLElement>) => {
    if (!clickable) return;
    if ((event.target as HTMLElement).closest(ROW_INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    open(row);
  };
  const onRowKey = (row: T) => (event: KeyboardEvent<HTMLElement>) => {
    if (!clickable || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(row); }
  };
  const toggleAll = () => onSelectedChange?.(allPicked ? new Set() : new Set(ids));
  const toggle = (rowId: string) => { const next = new Set(picked); if (next.has(rowId)) next.delete(rowId); else next.add(rowId); onSelectedChange?.(next); };
  const cycleSort = (key: string) => {
    if (!onSortChange) return;
    onSortChange({ key, dir: sort?.key === key && sort.dir === "asc" ? "desc" : "asc" });
  };

  const viewport = useViewportWidth();
  const visible = columns.filter((column) => !column.hideBelow || viewport >= column.hideBelow);

  return <div className={cn("ops-dt", className)} data-loading={loading || undefined} data-testid={rest["data-testid"]}>
    {toolbar && <div className="ops-dt-toolbar">{toolbar}</div>}
    {loading && rows.length === 0 ? <SkeletonTable rows={loadingRows} columns={Math.min(visible.length, 6)} /> : error ? <div className="ops-dt-message">{error}</div> : rows.length === 0 ? <div className="ops-dt-message">{empty}</div> : isCards ? (
      <ul className="ops-dt-cards" aria-label={caption}>
        {rows.map((row) => {
          const key = rowKey(row);
          return <li key={key} className={cn("ops-dt-card", clickable && "is-clickable")} data-tone={rowTone?.(row)} data-selected={picked.has(key) || undefined} onClick={onRowClickCapture(row)} onKeyDown={onRowKey(row)} tabIndex={clickable ? 0 : undefined}>
            {cardRender ? cardRender(row) : <>
              <div className="ops-dt-card-head">
                {selectable && <input type="checkbox" className="ops-check" aria-label={`Chọn ${key}`} checked={picked.has(key)} onChange={() => toggle(key)} data-row-stop />}
                <div className="ops-dt-card-title">{primary.render(row)}</div>
                {rowMenu && <RowMenu items={rowMenu(row)} />}
                {clickable && !rowMenu && <ChevronRight size={16} aria-hidden="true" className="ops-dt-chevron" />}
              </div>
              <dl className="ops-dt-card-body">
                {columns.filter((column) => column !== primary && !column.cardHidden).map((column) => <div key={column.key}><dt>{column.header}</dt><dd>{column.render(row)}</dd></div>)}
              </dl>
            </>}
          </li>;
        })}
      </ul>
    ) : (
      <div className="ops-dt-scroll" role="region" aria-label={caption} tabIndex={0}>
        <table className="ops-dt-table" data-sticky={stickyFirst || undefined}>
          <caption className="ops-sr-only">{caption}</caption>
          <thead><tr>
            {selectable && <th className="ops-dt-check"><input type="checkbox" className="ops-check" aria-label="Chọn tất cả" checked={allPicked} ref={(el) => { if (el) el.indeterminate = !allPicked && ids.some((rowId) => picked.has(rowId)); }} onChange={toggleAll} /></th>}
            {visible.map((column) => {
              const sorted = sort?.key === column.sortKey;
              const style: CSSProperties | undefined = column.width ? { width: column.width } : undefined;
              return <th key={column.key} style={style} data-align={column.align} aria-sort={column.sortKey ? (sorted ? (sort!.dir === "asc" ? "ascending" : "descending") : "none") : undefined} className={column.className}>
                {column.sortKey && onSortChange ? <button type="button" className="ops-dt-sort" onClick={() => cycleSort(column.sortKey!)}>{column.header}{sorted ? (sort!.dir === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />) : <ArrowUpDown size={13} aria-hidden="true" className="ops-dt-sort-idle" />}</button> : column.header}
              </th>;
            })}
            {(rowMenu || clickable) && <th className="ops-dt-end"><span className="ops-sr-only">Thao tác</span></th>}
          </tr></thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              const href = rowHref?.(row);
              return <tr key={key} className={cn(clickable && "is-clickable")} data-tone={rowTone?.(row)} data-selected={picked.has(key) || undefined} aria-selected={selectable ? picked.has(key) : undefined} onClick={onRowClickCapture(row)} onKeyDown={onRowKey(row)} tabIndex={clickable ? 0 : undefined} data-row-id={key}>
                {selectable && <td className="ops-dt-check"><input type="checkbox" className="ops-check" aria-label={`Chọn ${key}`} checked={picked.has(key)} onChange={() => toggle(key)} /></td>}
                {visible.map((column) => <td key={column.key} data-align={column.align} className={cn(column === primary && "ops-dt-primary", column.className)}>
                  {column === primary && href ? <Link href={href} prefetch={false} className="ops-dt-link" tabIndex={-1} aria-hidden="true">{column.render(row)}</Link> : column.render(row)}
                </td>)}
                {(rowMenu || clickable) && <td className="ops-dt-end"><span className="ops-dt-end-tools">{rowMenu && <RowMenu items={rowMenu(row)} />}{clickable && <ChevronRight size={16} aria-hidden="true" className="ops-dt-chevron" />}</span></td>}
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    )}
    {pagination && rows.length > 0 && <Pagination className="ops-dt-pagination" {...pagination} disabled={loading} />}
    <AnimatePresence>
      {selectable && picked.size > 0 && <m.div key="bar" className="ops-dt-selection" role="region" aria-label={`${picked.size} đã chọn`} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={presets.softSpring} id={`${id}-selection`}>
        <strong>{picked.size} đã chọn</strong>
        <div className="ops-dt-selection-actions">{selectionActions?.(Array.from(picked))}</div>
        <button type="button" className="ops-dt-selection-clear" onClick={() => onSelectedChange?.(new Set())} aria-label="Bỏ chọn"><X size={16} aria-hidden="true" /></button>
      </m.div>}
    </AnimatePresence>
  </div>;
}

const subscribeResize = (listener: () => void) => { window.addEventListener("resize", listener); return () => window.removeEventListener("resize", listener); };
/** Viewport width for `hideBelow` columns; 1440 on the server so the full table is in the HTML. */
function useViewportWidth() {
  return useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);
}

/** Search box for the toolbar: an input with a search icon and a clear button, bound to the URL by the caller. */
export function TableSearch({ value, onChange, placeholder = "Tìm…", label = "Tìm kiếm", className }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string; className?: string }) {
  return <label className={cn("ops-dt-search", className)}>
    <Search size={16} aria-hidden="true" />
    <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} />
    {value && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => onChange("")}><X size={14} aria-hidden="true" /></button>}
  </label>;
}

/** Table ⇄ cards toggle (Figma "View toggle"). */
export function ViewToggle({ value, onChange, options, label = "Kiểu hiển thị" }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string; icon: ReactNode }>; label?: string }) {
  return <div className="ops-view-toggle" role="group" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} aria-label={option.label} title={option.label} onClick={() => onChange(option.value)}>{option.icon}</button>)}
  </div>;
}

/** Two-line cell: name on top, muted detail under it. */
export function CellTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return <span className="ops-dt-title"><span className="ops-dt-title-main">{title}</span>{sub && <span className="ops-dt-title-sub">{sub}</span>}</span>;
}
