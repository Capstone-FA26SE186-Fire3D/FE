"use client";

import { History, Search } from "lucide-react";

import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { formatDateTime, formatQuota } from "@/features/billing/format";

import { orgAiApi } from "../api";
import { aiErrorText, operationLabel, resultTypeLabel, statusLabel, statusTone } from "../labels";
import { AI_OPERATIONS, AI_RESULT_TYPES, AI_STATUSES, type AiRequest } from "../types";
import styles from "../org-ai.module.css";
import { RequestPanel } from "./request-panel";

const PAGE_SIZE = 20;

/** Requests of the caller's organization, newest first (`GET /api/ai/requests`). Filters and page live in the URL. */
export function HistoryTab({ accessToken, onApply }: { accessToken: string; onApply: (request: AiRequest) => void }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("status");
  const resultType = get("resultType");
  const operation = get("operation");
  const mine = get("mine") === "1";
  const requestId = get("request");

  const list = useAsyncData(
    `org-ai:history:${page}:${status}:${resultType}:${operation}:${mine}`,
    (signal) => orgAiApi.listRequests(accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined, resultType: resultType || undefined, operation: operation || undefined, mine: mine || undefined }, signal),
  );
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(status || resultType || operation || mine);

  return <>
    <div className="ops-toolbar">
      <Select aria-label="Loại yêu cầu" style={{ width: 180 }} value={operation} onChange={(event) => setParams({ operation: event.target.value })}>
        <option value="">Mọi loại</option>{AI_OPERATIONS.map((value) => <option key={value} value={value}>{operationLabel(value)}</option>)}
      </Select>
      <Select aria-label="Trạng thái" style={{ width: 220 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option>{AI_STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
      </Select>
      <Select aria-label="Kết quả" style={{ width: 200 }} value={resultType} onChange={(event) => setParams({ resultType: event.target.value })}>
        <option value="">Mọi kết quả</option>{AI_RESULT_TYPES.map((value) => <option key={value} value={value}>{resultTypeLabel(value)}</option>)}
      </Select>
      <label className={styles.radio} data-on={mine}><input type="checkbox" checked={mine} onChange={(event) => setParams({ mine: event.target.checked ? "1" : null })} />Chỉ của tôi</label>
      {filtering && <Button variant="quiet" onClick={() => setParams({ status: null, resultType: null, operation: null, mine: null })}>Xóa bộ lọc</Button>}
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được lịch sử yêu cầu AI" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert>}

    <Table caption="Lịch sử yêu cầu AI của tổ chức" data-testid="ai-history">
      <thead><tr><th>Yêu cầu</th><th>Trạng thái</th><th>Sử dụng</th><th>Tạo lúc</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={6} label="Đang tải lịch sử…" /></TableMessage>}
        {items.map((item) => <tr key={item.requestId} data-testid="ai-history-row">
          <td>
            <button type="button" className={styles.rowButton} onClick={() => setParams({ request: item.requestId })} aria-label={`Mở yêu cầu ${operationLabel(item.operation)} ${item.requestId.slice(0, 8)}`}>{operationLabel(item.operation)}</button>
            <span className="ops-cell-sub"><span className={styles.mono}>{item.requestId.slice(0, 8)}…</span></span>
          </td>
          <td><StatusBadge tone={statusTone(item.status, item.resultType)}>{statusLabel(item.status, item.resultType)}</StatusBadge></td>
          <td>{item.consumedUnits !== undefined ? formatQuota(item.consumedUnits, item.quotaUnit) : item.reservedUnits !== undefined ? `Giữ chỗ ${formatQuota(item.reservedUnits, item.quotaUnit)}` : "—"}</td>
          <td>{formatDateTime(item.createdAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={filtering ? Search : History} title={filtering ? "Không có yêu cầu phù hợp." : "Chưa có yêu cầu AI nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Yêu cầu hỏi đáp và đề xuất kịch bản của tổ chức sẽ xuất hiện ở đây."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}
    <p className={styles.dim}>Danh sách chưa có nội dung câu hỏi hoặc công trình của từng yêu cầu (máy chủ chỉ trả trạng thái, nguồn, kết quả và sử dụng); mở một dòng để xem kết quả.</p>

    <Drawer open={requestId !== ""} onOpenChange={(open) => { if (!open) setParams({ request: null }); }} title="Chi tiết yêu cầu AI" description="Trạng thái lấy từ máy chủ và tự cập nhật khi còn đang xử lý." className={styles.wideDrawer}>
      {requestId && <RequestPanel key={requestId} accessToken={accessToken} requestId={requestId} onApply={onApply} />}
    </Drawer>
  </>;
}
