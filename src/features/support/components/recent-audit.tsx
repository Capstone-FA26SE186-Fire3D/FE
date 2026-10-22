"use client";

import { useAsyncData } from "@/api/use-async-data";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, TableMessage } from "@/components/ui/table";
import { formatDateTime } from "@/utils/date-range";
import { supportApi } from "../api";

const short = (id: string | null) => (id ? `${id.slice(0, 8)}…` : "—");

/**
 * "Nhật ký audit gần đây": the five newest records of the last 30 days with the fields the audit API returns (action,
 * targetEntity, targetId, correlationId, actor label). The full, filterable log is the "Nhật ký audit" tab.
 */
export function RecentAudit({ accessToken, onOpenAll }: { accessToken: string; onOpenAll: () => void }) {
  const list = useAsyncData("admin-support:recent-audit", (signal) => supportApi.listAuditLogs(accessToken, { page: 1, pageSize: 5 }, signal));
  const items = list.data?.items ?? [];
  return <div style={{ marginTop: 20 }}>
    <Panel title="Nhật ký audit gần đây" actions={<Button size="sm" variant="quiet" onClick={onOpenAll}>Xem toàn bộ nhật ký</Button>} bodyClassName="adm-flush">
      <Table caption="Nhật ký audit gần đây">
        <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Mã tương quan</th></tr></thead>
        <tbody>
          {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={3} label="Đang tải nhật ký audit…" /></TableMessage>}
          {list.error !== undefined && !list.data && <TableMessage colSpan={5}><p role="status" className="ops-muted" style={{ padding: 16 }}>Không tải được nhật ký gần đây. Mở “Nhật ký audit” để thử lại.</p></TableMessage>}
          {items.map((log) => <tr key={log.id}>
            <td>{formatDateTime(log.createdAt)}</td>
            <td>{log.actorDisplayName ?? short(log.userId)}</td>
            <td>{log.action}</td>
            <td>{log.targetEntity ?? "—"}{log.targetId && <span className="ops-cell-sub adm-mono">{short(log.targetId)}</span>}</td>
            <td><span className="adm-mono">{short(log.correlationId)}</span></td>
          </tr>)}
          {list.data && !items.length && <TableMessage colSpan={5}><p role="status" className="ops-muted" style={{ padding: 16 }}>Chưa có bản ghi audit trong 30 ngày gần đây.</p></TableMessage>}
        </tbody>
      </Table>
    </Panel>
  </div>;
}
