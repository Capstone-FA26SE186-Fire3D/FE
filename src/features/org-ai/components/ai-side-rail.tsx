"use client";

import Link from "next/link";

import { useAsyncData } from "@/api/use-async-data";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { billingApi } from "@/features/billing/api";
import { formatDateTime, formatQuota } from "@/features/billing/format";

import { orgAiApi } from "../api";
import { operationLabel, statusLabel, statusTone } from "../labels";
import { BILLING_AI_HREF } from "./request-view";

/**
 * Right column of `/workspace/ai`: the organization's pooled prepaid quota (in the units the BE reports, never per
 * building) and the latest requests. Both are read-only views of existing endpoints.
 */
export function AiSideRail({ accessToken, onOpenRequest }: { accessToken: string; onOpenRequest: (requestId: string) => void }) {
  const quota = useAsyncData("org-ai:rail:quota", (signal) => billingApi.getAiQuota(accessToken, undefined, signal));
  const recent = useAsyncData("org-ai:rail:recent", (signal) => orgAiApi.listRequests(accessToken, { page: 1, pageSize: 5 }, signal));
  const units = quota.data?.units ?? [];
  const items = recent.data?.items ?? [];

  return <div className="org-stack">
    <section className="org-card" aria-labelledby="org-ai-quota-title">
      <h2 id="org-ai-quota-title" className="org-card-title">Quota AI trả trước</h2>
      <p className="org-card-sub">Gộp từ các gói công trình và top-up. Hết quota thì chặn yêu cầu mới.</p>
      {quota.error !== undefined && !quota.data && <p className="org-card-sub" role="alert">Chưa đọc được quota. <Button size="sm" variant="quiet" onClick={quota.reload}>Thử lại</Button></p>}
      {quota.loading && !quota.data && <p className="org-card-sub" role="status">Đang tải quota…</p>}
      {quota.data && units.length === 0 && <p className="org-card-sub">Tổ chức chưa có quota AI.</p>}
      <div className="org-stack-sm">
        {units.map((unit) => <div key={unit.quotaUnit} className="org-sub-card" data-testid="ai-rail-quota">
          <span className="org-meta">Còn lại</span>
          <p className="org-big">{formatQuota(unit.available, null)}</p>
          <p style={{ margin: 0 }}>đơn vị {unit.quotaUnit}</p>
        </div>)}
      </div>
      <div style={{ marginTop: 14 }}><Button asChild variant="secondary"><Link href={BILLING_AI_HREF}>Nạp quota AI</Link></Button></div>
    </section>

    <section className="org-card" aria-labelledby="org-ai-recent-title">
      <h2 id="org-ai-recent-title" className="org-card-title">Yêu cầu gần đây</h2>
      {recent.error !== undefined && !recent.data && <p className="org-card-sub" role="alert">Chưa đọc được lịch sử. <Button size="sm" variant="quiet" onClick={recent.reload}>Thử lại</Button></p>}
      {recent.data && items.length === 0 && <p className="org-card-sub">Chưa có yêu cầu AI nào.</p>}
      <ul className="org-stack-sm" style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((item) => <li key={item.requestId}>
          <button type="button" className="org-pick" onClick={() => onOpenRequest(item.requestId)} aria-label={`Gần đây: ${operationLabel(item.operation)} ${item.requestId.slice(0, 8)}`}>
            <span className="org-row"><span className="ops-mono">req-{item.requestId.slice(0, 4)}</span><StatusBadge tone={statusTone(item.status, item.resultType)}>{statusLabel(item.status, item.resultType)}</StatusBadge></span>
            <span className="org-meta">{operationLabel(item.operation)} · {formatDateTime(item.createdAt)}</span>
          </button>
        </li>)}
      </ul>
    </section>
  </div>;
}
