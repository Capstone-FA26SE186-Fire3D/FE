import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { endReasonLabel, formatWhen, modeLabel, resultCellView, sessionStatusView, trainingTitle } from "../labels";
import type { HistoryItem } from "../types";

/**
 * One table row per session. The session state and the stored result are two separate columns with their own badges and
 * words: "Đã hoàn thành" is never shown as "Đạt", and a session without a stored result says why instead of an empty cell.
 * A click anywhere on the row opens the detail; the button stays the keyboard and screen-reader entry point.
 */
export function HistoryRow({ item, stale, selected, onOpen }: { item: HistoryItem; stale: boolean; selected: boolean; onOpen: (item: HistoryItem, opener: HTMLElement) => void }) {
  const { title, sub } = trainingTitle(item);
  const status = sessionStatusView(item.status);
  const result = resultCellView(item);
  const reason = endReasonLabel(item.endReason);
  return <tr className="th-row" data-testid="history-row" data-session-id={item.sessionId} data-stale={stale || undefined} aria-selected={selected}
    onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) onOpen(item, event.currentTarget.querySelector("button") as HTMLElement); }}>
    <td data-label="Phiên luyện tập">
      <strong className="th-title">{title}</strong>
      <span className="th-sub">{[modeLabel(item.mode), sub].filter(Boolean).join(" · ")}</span>
    </td>
    <td data-label="Tòa nhà">{item.building.name || "—"}</td>
    <td data-label="Lúc"><time dateTime={item.startedAt}>{formatWhen(item.startedAt)}</time></td>
    <td data-label="Hoàn thành phiên" data-testid="row-session-status"><StatusBadge tone={status.tone}>{status.label}</StatusBadge>{reason && <small>{reason}</small>}</td>
    <td data-label="Kết quả" data-testid="row-result-status" className="th-col-wide"><StatusBadge tone={result.tone}>{result.label}</StatusBadge></td>
    <td className="th-row-action"><Button size="sm" variant={selected ? "primary" : "secondary"} onClick={(event) => onOpen(item, event.currentTarget)} aria-label={`Xem chi tiết lượt tập ${title}, bắt đầu ${formatWhen(item.startedAt)}`}>Xem chi tiết</Button></td>
  </tr>;
}

export function HistoryTable({ children, busy }: { children: React.ReactNode; busy: boolean }) {
  return <div className="th-table-wrap">
    <table className="th-list" aria-busy={busy} aria-label="Danh sách lượt tập">
      <thead><tr><th scope="col">Phiên luyện tập</th><th scope="col">Tòa nhà</th><th scope="col">Lúc</th><th scope="col">Hoàn thành phiên</th><th scope="col" className="th-col-wide">Kết quả</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}
