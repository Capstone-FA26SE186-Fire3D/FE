import { Alert } from "@/components/ui/alert";
import { formatDateTime } from "@/features/scenarios/components/versions/version-content";

import type { PlaytestRejectedEvents } from "../types";

/** BE rejection codes (`PlaytestRejectedEvents.byCode`) in plain words. */
const reasonText: Record<string, string> = {
  EVENT_TYPE_UNSUPPORTED: "Loại sự kiện mà phiên bản ứng dụng của gói này chưa hỗ trợ",
  EVENT_PAYLOAD_INVALID: "Nội dung sự kiện không đúng định dạng",
};
const OTHER_REASON = "Lý do khác";

/**
 * Events the phone sent that the server stored but did not accept (`rejectedEvents` of `GET /api/playtests/{id}`): the
 * total, the count per reason and, folded away for whoever investigates, the newest ones exactly as the server lists them.
 * Nothing is shown while the server reports none.
 */
export function RejectedEventsView({ rejected }: { rejected: PlaytestRejectedEvents | null | undefined }) {
  if (!rejected || rejected.total <= 0) return null;
  const reasons = Object.entries(rejected.byCode).filter(([, count]) => count > 0);
  return <Alert tone="warning" title={`${rejected.total} sự kiện từ điện thoại không được ghi nhận`} className="pt-rejected">
    <div data-testid="playtest-rejected">
      <p>Hệ thống đã nhận nhưng không dùng các sự kiện này, nên kết quả có thể thiếu một số thao tác trong lúc chơi.</p>
      {reasons.length > 0 && <ul className="ver-list">
        {reasons.map(([code, count]) => <li key={code}>{reasonText[code] ?? OTHER_REASON}: {count}</li>)}
      </ul>}
      {rejected.recent.length > 0 && <details className="support-code">
        <summary>Thông tin cho bộ phận hỗ trợ</summary>
        {rejected.recent.map((event) => <span key={event.eventId} data-testid="playtest-rejected-event">
          Sự kiện thứ {event.sequence}, nhận lúc {formatDateTime(event.receivedAt)}: <code>{event.type}</code> · <code>{event.code}</code>
        </span>)}
        {rejected.total > rejected.recent.length && <span>Chỉ liệt kê {rejected.recent.length} sự kiện mới nhất.</span>}
      </details>}
    </div>
  </Alert>;
}
