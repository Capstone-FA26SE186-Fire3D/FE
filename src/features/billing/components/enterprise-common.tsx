"use client";

import { MessageSquare } from "lucide-react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { billingApi } from "../api";
import { billingErrorText } from "../errors";
import { formatDateTime } from "../format";
import "../billing.css";

export const enterpriseStatus: Record<string, { label: string; tone: Tone }> = {
  New: { label: "Mới gửi", tone: "info" },
  Contacted: { label: "Đã liên hệ", tone: "ember" },
  Quoted: { label: "Đã có báo giá", tone: "success" },
  Rejected: { label: "Đã từ chối", tone: "danger" },
  Cancelled: { label: "Đã hủy", tone: "neutral" },
  Closed: { label: "Đã đóng", tone: "neutral" },
};

export function EnterpriseStatusBadge({ status }: { status: string }) {
  const item = enterpriseStatus[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}

/** Admin replies on one request, oldest first. Organizations read them; only PlatformAdmin appends. */
export function EnterpriseResponses({ accessToken, scope, requestId, refreshKey = 0 }: { accessToken: string; scope: "mine" | "admin"; requestId: string; refreshKey?: number }) {
  const list = useAsyncData(`enterprise:responses:${scope}:${requestId}:${refreshKey}`, (signal) => billingApi.listEnterpriseResponses(accessToken, scope, requestId, 1, 100, signal));
  const items = list.data?.items ?? [];
  return <div className="ops-stack" data-testid="enterprise-responses">
    <p className="ops-field-label" style={{ margin: 0 }}><MessageSquare size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />Phản hồi</p>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được phản hồi" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    {list.loading && !list.data && <SkeletonRows rows={2} label="Đang tải phản hồi…" />}
    {list.data && items.length === 0 && <p className="bill-muted">{scope === "mine" ? "Chưa có phản hồi. Đội kinh doanh sẽ trả lời ở đây và qua email liên hệ." : "Chưa có phản hồi nào."}</p>}
    <ul className="bill-list">{items.map((item) => <li key={item.id} data-testid="enterprise-response">
      <p className="bill-dim" style={{ margin: 0 }}>{item.authorName ?? "PlatformAdmin"} · {formatDateTime(item.createdAt)}</p>
      <p className="bill-wrap" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{item.message}</p>
    </li>)}</ul>
  </div>;
}
