import type { Tone } from "@/components/ui/status-badge";

import type { PlaytestStatus } from "./types";

export type StatusView = { label: string; tone: Tone; detail: string };

const TERMINAL = ["completed", "cancelled", "canceled"];

export function isPlaytestTerminal(status: string | undefined) {
  return !!status && TERMINAL.includes(status.toLowerCase());
}

/** Lifecycle position so a late (older) response can never move the view backwards. Unknown names rank with Created. */
function rank(status: string) {
  switch (status.toLowerCase()) {
    case "launching": return 1;
    case "running": return 2;
    case "completed": case "cancelled": case "canceled": return 3;
    default: return 0;
  }
}

/**
 * Keeps the newest known state. A response that arrives late (an older poll, a slow request issued before Cancel) is
 * dropped when it is behind what is already shown, and a terminal state is never replaced by a different one.
 */
export function acceptStatus(current: PlaytestStatus | undefined, next: PlaytestStatus): PlaytestStatus {
  if (!current || current.id !== next.id) return next;
  const before = rank(current.status);
  const after = rank(next.status);
  if (after < before) return current;
  if (before === 3 && current.status.toLowerCase() !== next.status.toLowerCase()) return current;
  if (after === before && after === 1 && (next.grant?.generation ?? 0) < (current.grant?.generation ?? 0)) return current;
  return next;
}

/** Plain-language state from the status BE returned; Web never derives a state of its own. */
export function describeStatus(playtest: PlaytestStatus): StatusView {
  switch (playtest.status.toLowerCase()) {
    case "created":
      return playtest.boundToMobile
        ? { label: "Điện thoại đã nhận mã", tone: "info", detail: "Chờ bắt đầu chơi trên điện thoại." }
        : { label: "Đã chuẩn bị", tone: "pending", detail: "Đã chuẩn bị gói. Tạo mã QR để mở trên điện thoại; chưa trừ lượt dùng thử." };
    case "launching": return { label: "Đang khởi chạy", tone: "info", detail: "Điện thoại đang mở bài chạy thử." };
    case "running": return { label: "Đang chạy trên thiết bị", tone: "info", detail: "Đang chơi trên điện thoại. Kết quả hiện khi chơi xong." };
    case "completed": return { label: "Đã hoàn tất", tone: "success", detail: "Điện thoại đã gửi kết quả. Lượt chạy thử không tính vào thống kê học viên." };
    case "cancelled": case "canceled": return { label: "Đã hủy", tone: "neutral", detail: "Lượt chạy thử đã dừng. Lượt dùng thử (nếu đã trừ) không được hoàn tự động." };
    default: return { label: "Không rõ trạng thái", tone: "neutral", detail: "Trạng thái do hệ thống báo." };
  }
}

/** Opening a new handoff code is only allowed by BE before start (status Created) and while no Mobile session holds it. */
export function canIssueHandoff(playtest: PlaytestStatus) {
  return playtest.status.toLowerCase() === "created" && !playtest.boundToMobile;
}

export function canCancel(playtest: PlaytestStatus) {
  return playtest.recovery.canCancel && !isPlaytestTerminal(playtest.status);
}

export function msUntil(iso: string | null | undefined, now: number) {
  if (!iso) return undefined;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? undefined : at - now;
}

export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
