export const fmt = (value: number) => value.toLocaleString("vi-VN");

/** A missing sample (`null`) is shown as such, never as 0 %. */
export function formatRate(rate: number | null, empty = "Chưa có mẫu"): string {
  return rate === null ? empty : `${(rate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

export function formatSeconds(seconds: number | null, empty = "Chưa có mẫu"): string {
  if (seconds === null) return empty;
  const total = Math.round(seconds);
  if (total < 60) return `${total} giây`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return rest ? `${minutes} phút ${rest} giây` : `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  return `${hours} giờ ${minutes % 60} phút`;
}

/** Currency codes come from the API (for example VND). Unknown codes fall back to "amount CODE". */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: currency === "VND" ? 0 : 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString("vi-VN")} ${currency}`;
  }
}

/** Axis tick for money: "3,5 Tr ₫" instead of the full amount, which would not fit the 40px axis. */
export function compactMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
  } catch {
    return `${amount.toLocaleString("vi-VN", { notation: "compact", maximumFractionDigits: 1 })} ${currency}`;
  }
}

export const shortId =(id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);
