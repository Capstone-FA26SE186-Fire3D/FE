"use client";

import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { V7Prototype } from "./v7-prototype";
import "../billing.css";

export const BILLING_V7_ISSUE = "https://github.com/Capstone-FA26SE186-Fire3D/BE/issues/56";

/**
 * Embedded "Chờ BE" block (PendingModule style) for Docs v7 commercial features: Upgrade, learner capacity,
 * pooled prepaid AI quota and top-up. Production shows only the blocker, the opening condition and the issue.
 * The sample prototype exists in development builds only.
 */
export function V7PendingBlock({ scope }: { scope: "building" | "admin" }) {
  return <Panel title={scope === "building" ? "Nâng cấp, suất học viên và quota AI" : "Cấu hình thương mại v7"} actions={<StatusBadge tone="warning">Chờ BE (#56)</StatusBadge>}
    description={scope === "building" ? "Nâng cấp gói, giới hạn học viên, quota AI dùng chung và top-up trả trước." : "Giới hạn học viên, quota AI và chính sách thương mại theo gói."} bodyClassName="ops-stack" data-testid="v7-pending">
    <Alert tone="warning" title="Điều đang chặn">
      API thương mại hiện theo v6.7: gói chưa có giới hạn học viên, quota AI hay chính sách thương mại; báo giá chưa có hành động Upgrade; chưa có số dư/lịch sử quota AI, top-up và số suất đã dùng.
    </Alert>
    <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Điều kiện mở</p>
      <p className="bill-muted">BE công bố contract v7 (gói mở rộng, Upgrade, top-up, quota và suất học viên trong phản hồi entitlement, mã lỗi riêng) và FE được kiểm chứng bằng test với API thật.</p></div>
    <div><p className="ops-field-label" style={{ margin: "0 0 6px" }}>Issue theo dõi</p>
      <a href={BILLING_V7_ISSUE} target="_blank" rel="noreferrer" style={{ color: "var(--ember)", fontSize: 14 }}>BE #56 · Billing v7 và quota AI trả trước</a></div>
    {process.env.NODE_ENV !== "production" && <V7Prototype />}
  </Panel>;
}
