import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode, TableHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const visuallyHidden: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

export function Table({ className, caption, children, ...props }: TableHTMLAttributes<HTMLTableElement> & { caption?: string }) {
  return <div className="ops-table-wrap"><table className={cn("ops-table", className)} {...props}>{caption && <caption style={visuallyHidden}>{caption}</caption>}{children}</table></div>;
}

/** Full-width row for loading / empty / error states inside a table body. */
export function TableMessage({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <tr><td colSpan={colSpan} style={{ padding: 0 }}>{children}</td></tr>;
}

/** Offset pagination. The caller owns page state (usually the URL). */
export function Pagination({ page, pageSize, totalCount, onPageChange, disabled, className }: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalCount, page * pageSize);
  return <nav className={cn("ops-pagination", className)} aria-label="Phân trang">
    <span aria-live="polite">{totalCount === 0 ? "Không có kết quả" : `${from}–${to} / ${totalCount}`}</span>
    <div>
      <Button size="sm" variant="quiet" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Trang trước"><ChevronLeft size={16} aria-hidden="true" />Trước</Button>
      <span>Trang {page}/{pages}</span>
      <Button size="sm" variant="quiet" disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Trang sau">Sau<ChevronRight size={16} aria-hidden="true" /></Button>
    </div>
  </nav>;
}
