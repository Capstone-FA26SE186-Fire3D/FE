import { ChevronLeft, ChevronRight } from "lucide-react";
import "../learn.css";

/** Pagination for the public (dark) pages; the ops Pagination depends on the operations theme tokens. */
export function LearnPagination({ page, pageSize, total, onPageChange, disabled }: {
  page: number; pageSize: number; total: number; onPageChange: (page: number) => void; disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <nav className="learn-pagination" aria-label="Phân trang">
    <button type="button" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Trang trước"><ChevronLeft size={16} aria-hidden="true" />Trước</button>
    <span aria-live="polite">Trang {page}/{pages} · {total} bài</span>
    <button type="button" disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Trang sau">Sau<ChevronRight size={16} aria-hidden="true" /></button>
  </nav>;
}
