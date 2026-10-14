import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { endReasonLabel, formatWhen, modeLabel, resultCellView, sessionStatusView, trainingTitle } from "../labels";
import type { HistoryItem } from "../types";

/**
 * One card per session. The session state and the stored result are two separate fields with their own badges and words:
 * "Đã hoàn thành" is never shown as "Đạt", and a session without a stored result says why instead of an empty cell.
 */
export function HistoryRow({ item, stale, onOpen }: { item: HistoryItem; stale: boolean; onOpen: (item: HistoryItem) => void }) {
  const { title, sub } = trainingTitle(item);
  const status = sessionStatusView(item.status);
  const result = resultCellView(item);
  const reason = endReasonLabel(item.endReason);
  return <li className="th-row" data-testid="history-row" data-session-id={item.sessionId} data-stale={stale || undefined}>
    <div className="th-head">
      <div>
        <strong className="th-title">{title}</strong>
        {sub && <span className="th-sub">{sub}</span>}
      </div>
      <Button size="sm" variant="secondary" onClick={() => onOpen(item)} aria-label={`Xem chi tiết lượt tập ${title}, bắt đầu ${formatWhen(item.startedAt)}`}>Xem chi tiết</Button>
    </div>
    <dl className="th-fields">
      <div><dt>Building</dt><dd>{item.building.name || "—"}</dd></div>
      <div><dt>Chế độ</dt><dd>{modeLabel(item.mode)}</dd></div>
      <div><dt>Bắt đầu</dt><dd><time dateTime={item.startedAt}>{formatWhen(item.startedAt)}</time></dd></div>
      <div data-testid="row-session-status"><dt>Trạng thái phiên</dt><dd><StatusBadge tone={status.tone}>{status.label}</StatusBadge>{reason && <small>{reason}</small>}</dd></div>
      <div data-testid="row-result-status"><dt>Kết quả</dt><dd><StatusBadge tone={result.tone}>{result.label}</StatusBadge></dd></div>
    </dl>
  </li>;
}
