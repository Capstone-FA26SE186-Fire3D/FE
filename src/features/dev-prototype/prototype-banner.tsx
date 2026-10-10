import { FlaskConical, Lock } from "lucide-react";

export const PROTOTYPE_LABEL = "Dữ liệu mẫu · chỉ môi trường phát triển";

/** Small pill for headings and cards that show sample data. */
export function PrototypeBadge() {
  return <span className="ops-proto" data-testid="prototype-badge"><Lock size={12} aria-hidden="true" style={{ marginRight: 4 }} />{PROTOTYPE_LABEL}</span>;
}

/**
 * Banner that frames a prototype area. Everything beneath it is local sample data and simulated
 * responses: it is not integration evidence and it is not present in production builds.
 */
export function PrototypeBanner({ note }: { note?: string }) {
  return <div role="note" aria-label={PROTOTYPE_LABEL} data-testid="prototype-banner" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", padding: "10px 14px", border: "1px dashed var(--warning)", borderRadius: 10, background: "var(--warning-soft)", color: "var(--text)", fontSize: 13 }}>
    <FlaskConical size={18} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--warning)" }} />
    <PrototypeBadge />
    <span style={{ color: "var(--muted)" }}>{note ?? "Không gọi API thật, không phải bằng chứng tích hợp. Dữ liệu được đặt lại khi tải lại trang."}</span>
  </div>;
}
