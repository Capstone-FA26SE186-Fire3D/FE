import { formatDateTime } from "@/features/scenarios/components/versions/version-content";
import { endReasonLabel } from "@/features/training-history/labels";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "2 phút 47 giây" from milliseconds. */
export function formatPlayTime(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} giây`;
  return seconds === 0 ? `${minutes} phút` : `${minutes} phút ${seconds} giây`;
}

/** What happened to the player, from the runtime's summary flags. */
function outcomeText(summary: Record<string, unknown>) {
  if (summary.reachedExit === true) return "Đã thoát ra ngoài an toàn";
  if (summary.collapsed === true) return "Nhân vật bị ngất trong đám cháy";
  if (summary.reachedExit === false) return "Chưa thoát ra ngoài";
  return null;
}

/**
 * Result the phone sent when the playtest ended (BE `PlaytestCompletionView`: `summary` is what the runtime sent, not
 * scored by BE). Shown in plain words: whether the player got out, how the run ended, how long it took and when the
 * result arrived. Event counters and the completion hash are for support, not for the author (UAT 18/11/2026: the raw
 * JSON was hard to read).
 */
export function CompletionView({ completion }: { completion: unknown }) {
  if (completion === null || completion === undefined) {
    return <p className="ver-note">Hệ thống chưa có kết quả cho lượt chạy thử này.</p>;
  }
  const record = isRecord(completion) ? completion : {};
  const summary = isRecord(record.summary) ? record.summary : record;
  const outcome = outcomeText(summary);
  const ending = typeof summary.endReason === "string" ? endReasonLabel(summary.endReason) : null;
  const playTime = typeof summary.elapsedMs === "number" ? formatPlayTime(summary.elapsedMs) : null;
  const arrived = typeof record.completedAt === "string" ? formatDateTime(record.completedAt) : null;
  if (!outcome && !ending && !playTime && !arrived) {
    return <p className="ver-note" data-testid="playtest-completion">Ứng dụng điện thoại đã chơi xong và gửi kết quả.</p>;
  }
  return <dl className="ver-dl" data-testid="playtest-completion">
    {outcome && <><dt>Kết quả</dt><dd>{outcome}</dd></>}
    {ending && <><dt>Cách kết thúc</dt><dd>{ending}</dd></>}
    {playTime && <><dt>Thời gian chơi</dt><dd>{playTime}</dd></>}
    {arrived && <><dt>Nhận kết quả lúc</dt><dd>{arrived}</dd></>}
  </dl>;
}
