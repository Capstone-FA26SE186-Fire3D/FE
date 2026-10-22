/** Short Vietnamese relative time for queues ("10 phút trước", "Hôm qua"). Falls back to the date for older values. */
export function relativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "—";
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hôm qua";
  if (days < 7) return `${days} ngày trước`;
  return new Date(time).toLocaleDateString("vi-VN");
}

/** "12" -> "12", 1260 -> "1.260" (vi-VN grouping), null -> null so tiles can show an em dash. */
export function formatCount(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("vi-VN") : null;
}
