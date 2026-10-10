import type { ReactNode } from "react";

/** Label/value pairs for detail screens. Wraps on narrow widths instead of overflowing. */
export function DetailList({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 | 3 }) {
  return <dl style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${columns === 1 ? "100%" : columns === 2 ? "220px" : "160px"}, 1fr))`, gap: "14px 20px", margin: 0 }}>
    {items.map((item) => <div key={item.label} style={{ minWidth: 0 }}>
      <dt className="ops-field-hint" style={{ margin: 0 }}>{item.label}</dt>
      <dd style={{ margin: "3px 0 0", color: "var(--text)", fontSize: 14, overflowWrap: "anywhere" }}>{item.value}</dd>
    </div>)}
  </dl>;
}

/** A hash or opaque id in monospace, fully visible (these are what a reviewer compares), wrapping instead of scrolling. */
export function HashValue({ value, label }: { value: string; label: string }) {
  return <code aria-label={label} style={{ display: "block", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg-soft)", color: "var(--text)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12, lineHeight: 1.5, overflowWrap: "anywhere", wordBreak: "break-all" }}>{value}</code>;
}

export const formatDateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—");
