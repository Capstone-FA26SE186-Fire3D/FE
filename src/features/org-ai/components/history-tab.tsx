"use client";

import { FileEdit, History, Search, Sparkles } from "lucide-react";
import Link from "next/link";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { billingApi } from "@/features/billing/api";
import { formatDateTime, formatNumber, formatQuota } from "@/features/billing/format";

import { orgAiApi } from "../api";
import { aiErrorText, isSuccessfulDraft, operationLabel, resultTypeLabel, statusLabel, statusTone } from "../labels";
import { AI_OPERATIONS, AI_RESULT_TYPES, AI_STATUSES, urlFilter, urlId, type AiRequest } from "../types";
import styles from "../org-ai.module.css";
import { RequestPanel } from "./request-panel";
import { BILLING_AI_HREF } from "./request-view";

const PAGE_SIZE = 20;

/** Figma 48:1988 KPI tiles. Only numbers the API gives: the pooled balance and the count of requests waiting for an admin. */
function Kpis({ accessToken }: { accessToken: string }) {
  const quota = useAsyncData("org-ai:kpi:quota", (signal) => billingApi.getAiQuota(accessToken, undefined, signal));
  const reconcile = useAsyncData("org-ai:kpi:reconcile", (signal) => orgAiApi.listRequests(accessToken, { status: "NeedsReconcile", page: 1, pageSize: 1 }, signal));
  const units = quota.data?.units ?? [];
  return <div className={styles.kpis} data-testid="ai-kpis">
    <div className="ops-kpi">
      <span className="ops-kpi-label">Hạn mức còn lại</span>
      <div className="ops-kpi-row"><span className="ops-kpi-value" data-testid="ai-kpi-quota">{quota.data ? (units.length ? units.map((unit) => formatQuota(unit.available, unit.quotaUnit)).join(" · ") : "0") : quota.error !== undefined ? "—" : "…"}</span></div>
      <span className="ops-kpi-hint">Gộp từ gói công trình và các lần nạp thêm đã thanh toán · <Link href={BILLING_AI_HREF}>Nạp thêm</Link></span>
    </div>
    <div className="ops-kpi">
      <span className="ops-kpi-label">Cần đối soát</span>
      <div className="ops-kpi-row"><span className="ops-kpi-value" data-testid="ai-kpi-reconcile">{reconcile.data ? formatNumber(reconcile.data.total) : reconcile.error !== undefined ? "—" : "…"}</span></div>
      <span className="ops-kpi-hint">Yêu cầu quá thời gian chờ; quản trị FET3D sẽ kiểm tra lại</span>
    </div>
  </div>;
}

/**
 * Requests of the caller's organization, newest first (`GET /api/ai/requests`); filters and page live in the URL. A row
 * opens the request in a drawer (`?request=`). `variant="saved"` is the same list limited to finished scenario drafts, with
 * the apply action. The list carries no question text for requests stored before BE#89 (`input` is then absent).
 */
export function HistoryTab({ accessToken, variant, onApply }: { accessToken: string; variant: "history" | "saved"; onApply: (request: AiRequest) => void }) {
  const saved = variant === "saved";
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = saved ? "Succeeded" : urlFilter(get("status"), AI_STATUSES);
  const resultType = saved ? "ScenarioDraft" : urlFilter(get("resultType"), AI_RESULT_TYPES);
  const operation = saved ? "ScenarioDraft" : urlFilter(get("operation"), AI_OPERATIONS);
  const mine = get("mine") === "1";
  const requestId = urlId(get("request"));

  const list = useAsyncData(
    `org-ai:${variant}:${page}:${status}:${resultType}:${operation}:${mine}`,
    (signal) => orgAiApi.listRequests(accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined, resultType: resultType || undefined, operation: operation || undefined, mine: mine || undefined }, signal),
  );
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = !saved && Boolean(status || resultType || operation || mine);

  const columns: DataColumn<AiRequest>[] = [
    {
      key: "text", header: saved ? "Yêu cầu đề xuất" : "Câu hỏi / mục đích", primary: true,
      render: (row) => <CellTitle title={<span className={styles.clip} data-testid="ai-row-text">{row.input?.text?.trim() || operationLabel(row.operation)}</span>} sub={<span className={styles.mono}>{row.requestId.slice(0, 8)}…</span>} />,
    },
    { key: "operation", header: "Loại", width: 170, cardHidden: saved, render: (row) => <StatusBadge tone={row.operation === "ScenarioDraft" ? "ember" : "info"}>{operationLabel(row.operation)}</StatusBadge> },
    { key: "status", header: "Trạng thái", width: 190, render: (row) => <StatusBadge tone={statusTone(row.status, row.resultType)} data-testid="ai-row-status">{statusLabel(row.status, row.resultType)}</StatusBadge> },
    { key: "building", header: "Công trình", width: 200, hideBelow: 900, render: (row) => row.input?.buildingName ?? "—" },
    { key: "usage", header: "Sử dụng", width: 140, hideBelow: 1100, render: (row) => (row.consumedUnits != null ? formatQuota(row.consumedUnits, row.quotaUnit) : row.reservedUnits !== undefined ? `Tạm trừ ${formatQuota(row.reservedUnits, row.quotaUnit)}` : "—") },
    { key: "createdAt", header: "Thời gian", width: 160, render: (row) => formatDateTime(row.createdAt) },
  ];

  return <div className={styles.stack}>
    {!saved && <Kpis accessToken={accessToken} />}
    <DataTable<AiRequest>
      data-testid="ai-history"
      caption={saved ? "Đề xuất kịch bản đã lưu" : "Lịch sử yêu cầu AI của tổ chức"}
      columns={columns} rows={items} rowKey={(row) => row.requestId}
      onRowClick={(row) => setParams({ request: row.requestId })}
      rowMenu={(row) => [
        { label: "Đọc lại hội thoại", icon: History, onSelect: () => setParams({ request: row.requestId }) },
        ...(isSuccessfulDraft(row) ? [{ label: "Dùng làm bản nháp", icon: FileEdit, onSelect: () => onApply(row) }] : []),
      ]}
      loading={list.loading && !list.data}
      error={list.error !== undefined ? <Alert tone="danger" title={saved ? "Không tải được đề xuất đã lưu" : "Không tải được lịch sử yêu cầu AI"} action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert> : undefined}
      empty={saved
        ? <EmptyState icon={Sparkles} title="Chưa có đề xuất kịch bản nào" description="Mở trợ lý, chọn chế độ “Đề xuất kịch bản” và mô tả tình huống cho một công trình; đề xuất hoàn tất sẽ nằm ở đây." />
        : <EmptyState icon={filtering ? Search : History} title={filtering ? "Không có yêu cầu phù hợp." : "Chưa có yêu cầu AI nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Yêu cầu hỏi đáp và đề xuất kịch bản của tổ chức sẽ xuất hiện ở đây."} />}
      toolbar={<>
        {!saved && <>
          <Select aria-label="Loại yêu cầu" style={{ width: 180 }} value={operation} onChange={(event) => setParams({ operation: event.target.value })}>
            <option value="">Mọi loại</option>{AI_OPERATIONS.map((value) => <option key={value} value={value}>{operationLabel(value)}</option>)}
          </Select>
          <Select aria-label="Trạng thái" style={{ width: 200 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
            <option value="">Mọi trạng thái</option>{AI_STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
          </Select>
          <Select aria-label="Kết quả" style={{ width: 200 }} value={resultType} onChange={(event) => setParams({ resultType: event.target.value })}>
            <option value="">Mọi kết quả</option>{AI_RESULT_TYPES.map((value) => <option key={value} value={value}>{resultTypeLabel(value)}</option>)}
          </Select>
        </>}
        <label className={styles.radio} data-on={mine}><input type="checkbox" checked={mine} onChange={(event) => setParams({ mine: event.target.checked ? "1" : null })} />Chỉ của tôi</label>
        {filtering && <Button variant="quiet" onClick={() => setParams({ status: null, resultType: null, operation: null, mine: null })}>Xóa bộ lọc</Button>}
      </>}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.dim}>Bấm một hàng để đọc lại hội thoại trong ngăn bên phải. Yêu cầu tạo trước khi máy chủ lưu nội dung câu hỏi chỉ hiện loại yêu cầu.</p>

    <Drawer open={requestId !== ""} onOpenChange={(open) => { if (!open) setParams({ request: null }); }} size="md" title="Đọc lại hội thoại" description="Trạng thái lấy từ máy chủ và tự cập nhật khi còn đang xử lý." data-testid="ai-request-drawer">
      {requestId && <RequestPanel key={requestId} accessToken={accessToken} requestId={requestId} onApply={onApply} />}
    </Drawer>
  </div>;
}
