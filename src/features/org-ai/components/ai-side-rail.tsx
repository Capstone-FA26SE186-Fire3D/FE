"use client";

import Link from "next/link";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { billingApi } from "@/features/billing/api";
import { formatDateTime, formatNumber, formatQuota } from "@/features/billing/format";

import { orgAiApi } from "../api";
import { aiErrorText, operationLabel } from "../labels";
import styles from "../org-ai.module.css";
import { BILLING_AI_HREF } from "./request-view";

/**
 * "Quota & giới hạn" tab of `/workspace/ai`: the organization's pooled prepaid quota (in the units the BE reports, never
 * per building, never priced by the FE) and what one request of each operation reserves now. Read-only views of
 * `GET /api/organizations/me/ai-quota` and `GET /api/ai/organization/limits`.
 */
export function AiQuotaCard({ accessToken }: { accessToken: string }) {
  const quota = useAsyncData("org-ai:quota", (signal) => billingApi.getAiQuota(accessToken, undefined, signal));
  const limits = useAsyncData("org-ai:limits", (signal) => orgAiApi.limits(accessToken, signal));
  const units = quota.data?.units ?? [];
  const items = limits.data?.items ?? [];

  return <div className={styles.grid2} data-testid="ai-quota-card">
    <section className="org-card" aria-labelledby="org-ai-quota-title">
      <h2 id="org-ai-quota-title" className="org-card-title">Quota AI trả trước</h2>
      <p className="org-card-sub">Gộp từ các gói công trình và top-up đã thanh toán. Hết quota thì chặn yêu cầu tính phí mới; không có nợ trả sau.</p>
      {quota.loading && !quota.data && <SkeletonRows rows={2} label="Đang tải quota…" />}
      {quota.error !== undefined && !quota.data && <Alert tone="danger" title="Chưa đọc được quota" action={<Button size="sm" variant="secondary" className="mt-3" onClick={quota.reload}>Thử lại</Button>}>{aiErrorText(quota.error)}</Alert>}
      {quota.data && units.length === 0 && <p className="org-card-sub">Tổ chức chưa có quota AI.</p>}
      <div className="org-stack-sm">
        {units.map((unit) => <div key={unit.quotaUnit} className="org-sub-card" data-testid="ai-rail-quota">
          <span className="org-meta">Còn lại</span>
          <p className="org-big">{formatQuota(unit.available, null)}</p>
          <p style={{ margin: 0 }}>đơn vị {unit.quotaUnit}</p>
          <dl className={styles.meta} style={{ marginTop: 10 }}>
            <dt>Đã cấp</dt><dd>{formatNumber(unit.granted)}</dd>
            <dt>Đang giữ chỗ</dt><dd>{formatNumber(unit.reserved)}</dd>
            <dt>Đã dùng</dt><dd>{formatNumber(unit.consumed)}</dd>
            {unit.expired > 0 && <><dt>Đã hết hạn</dt><dd>{formatNumber(unit.expired)}</dd></>}
            {unit.scheduled > 0 && <><dt>Sắp hiệu lực</dt><dd>{formatNumber(unit.scheduled)}</dd></>}
          </dl>
        </div>)}
      </div>
      {quota.data && <p className={styles.dim} style={{ marginTop: 10 }}>Số liệu lúc {formatDateTime(quota.data.asOf)}.</p>}
      <div style={{ marginTop: 14 }}><Button asChild variant="secondary"><Link href={BILLING_AI_HREF}>Nạp quota AI</Link></Button></div>
    </section>

    <section className="org-card" aria-labelledby="org-ai-limits-title">
      <h2 id="org-ai-limits-title" className="org-card-title">Giới hạn theo chính sách</h2>
      <p className="org-card-sub">Mức giữ chỗ cho một yêu cầu và giới hạn đầu vào do PlatformAdmin quy định; máy chủ chốt theo mức dùng thực tế.</p>
      {limits.loading && !limits.data && <SkeletonRows rows={2} label="Đang tải giới hạn…" />}
      {limits.error !== undefined && !limits.data && <Alert tone="danger" title="Chưa đọc được giới hạn" action={<Button size="sm" variant="secondary" className="mt-3" onClick={limits.reload}>Thử lại</Button>}>{aiErrorText(limits.error)}</Alert>}
      {limits.data && items.length === 0 && <p className="org-card-sub">Chưa có chính sách AI đang hiệu lực.</p>}
      <div className="org-stack-sm">
        {items.map((item) => <div key={item.operation} className="org-sub-card" data-testid="ai-limit-row" data-operation={item.operation}>
          <h3>{operationLabel(item.operation)}</h3>
          {!item.policyActive
            ? <p>Chưa có chính sách đang hiệu lực; yêu cầu loại này sẽ không được gửi.</p>
            : <dl className={styles.meta} style={{ marginTop: 8 }}>
              <dt>Giữ chỗ mỗi yêu cầu</dt><dd>{item.estimatedReserve != null ? formatQuota(item.estimatedReserve, item.quotaUnit ?? undefined) : "—"}</dd>
              <dt>Đầu vào tối đa</dt><dd>{item.maxInputChars ? `${formatNumber(item.maxInputChars)} ký tự` : "—"}</dd>
              <dt>Nguồn tối đa</dt><dd>{item.maxSources ? formatNumber(item.maxSources) : "—"}</dd>
              <dt>Có thể gửi</dt><dd>{item.canSubmit ? "Có" : "Không, số dư dưới mức giữ chỗ"}</dd>
            </dl>}
        </div>)}
      </div>
    </section>
  </div>;
}
