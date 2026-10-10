"use client";

import { Inbox, Search } from "lucide-react";
import { useMemo } from "react";
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
import { accountsApi } from "@/features/accounts/api";
import { formatDateTime } from "@/utils/date-range";
import { supportApi } from "../api";
import { priorityLabel, priorityOptions, priorityTone, ticketStatusLabel, ticketStatusOptions, ticketStatusTone } from "../labels";
import { AdminTicketPanel } from "./admin-ticket-panel";
import { errorText } from "./ticket-thread";
import { PendingBox } from "./pending-box";
import styles from "./support.module.css";

const PAGE_SIZE = 20;

export function AdminTicketsTab({ accessToken, myId }: { accessToken: string; myId: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("status");
  const priority = get("priority");
  const assignedTo = get("assignedTo");
  const organizationId = get("organizationId");
  const ticketId = get("ticket");

  const list = useAsyncData(
    `admin-tickets:${page}:${status}:${priority}:${assignedTo}:${organizationId}`,
    (signal) => supportApi.listTickets("admin", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined, priority: priority || undefined, assignedTo: assignedTo || undefined, organizationId: organizationId || undefined }, signal),
    true,
  );
  const admins = useAsyncData("admin-tickets:admins", () => accountsApi.list(accessToken, { role: 0, isActive: true, page: 1, pageSize: 100 }), true);
  const organizations = useAsyncData("admin-tickets:orgs", () => accountsApi.organizations(accessToken), true);

  const adminOptions = useMemo(() => (admins.data?.items ?? []).map((admin) => ({ id: admin.id, name: admin.fullName || admin.email })), [admins.data]);
  const nameOf = (id: string | null) => (id ? adminOptions.find((admin) => admin.id === id)?.name ?? `${id.slice(0, 8)}…` : "Chưa phân công");
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(status || priority || assignedTo || organizationId);

  const open = (id: string) => setParams({ ticket: id, page });
  const close = () => setParams({ ticket: null, page });

  return <>
    <div className="ops-toolbar">
      <Select aria-label="Trạng thái ticket" style={{ width: 170 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option>{ticketStatusOptions.map((value) => <option key={value} value={value}>{ticketStatusLabel(value)}</option>)}
      </Select>
      <Select aria-label="Mức ưu tiên" style={{ width: 170 }} value={priority} onChange={(event) => setParams({ priority: event.target.value })}>
        <option value="">Mọi mức ưu tiên</option>{priorityOptions.map((value) => <option key={value} value={value}>{priorityLabel(value)}</option>)}
      </Select>
      <Select aria-label="Người phụ trách" style={{ width: 210 }} value={assignedTo} onChange={(event) => setParams({ assignedTo: event.target.value })}>
        <option value="">Mọi người phụ trách</option>
        <option value={myId}>Giao cho tôi</option>
        {adminOptions.filter((admin) => admin.id !== myId).map((admin) => <option key={admin.id} value={admin.id}>{admin.name}</option>)}
      </Select>
      <Select aria-label="Tổ chức" style={{ width: 210 }} value={organizationId} onChange={(event) => setParams({ organizationId: event.target.value })}>
        <option value="">Mọi tổ chức</option>
        {(organizations.data?.items ?? []).map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </Select>
      {filtering && <Button variant="quiet" onClick={() => setParams({ status: null, priority: null, assignedTo: null, organizationId: null })}>Xóa bộ lọc</Button>}
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được danh sách ticket" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>}

    <Table caption="Danh sách ticket hỗ trợ">
      <thead><tr><th>Ticket</th><th>Trạng thái</th><th>Ưu tiên</th><th>Phụ trách</th><th>Cập nhật</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={6} label="Đang tải danh sách ticket…" /></TableMessage>}
        {items.map((ticket) => <tr key={ticket.id}>
          <td>
            <button type="button" className={styles.rowButton} onClick={() => open(ticket.id)} aria-label={`Mở ticket ${ticket.ticketNumber}: ${ticket.subject}`}>
              <span className={styles.clip}>{ticket.subject}</span>
              <span className="ops-cell-sub">{ticket.ticketNumber}</span>
            </button>
          </td>
          <td><StatusBadge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</StatusBadge></td>
          <td><StatusBadge tone={priorityTone(ticket.priority)}>{priorityLabel(ticket.priority)}</StatusBadge></td>
          <td>{nameOf(ticket.assignedTo)}</td>
          <td>{formatDateTime(ticket.updatedAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtering ? Search : Inbox} title={filtering ? "Không có ticket phù hợp." : "Chưa có ticket nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Ticket do học viên và tổ chức gửi sẽ xuất hiện ở đây."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <PendingBox
      title="Chưa có từ backend"
      items={[
        "Người tạo và tổ chức của ticket (response chỉ có mã ticket, nội dung, trạng thái); hiện chỉ lọc được theo tổ chức.",
        "Tên hiển thị của người gửi tin nhắn (chỉ có authorId).",
        "Tệp đính kèm và thông báo email/push khi có phản hồi.",
      ]}
    />

    <Drawer open={Boolean(ticketId)} onOpenChange={(value) => { if (!value) close(); }} title="Chi tiết ticket" description="Phân công, đổi trạng thái và trao đổi với người gửi." className={styles.wideDrawer}>
      {ticketId && <AdminTicketPanel key={ticketId} ticketId={ticketId} accessToken={accessToken} myId={myId} admins={adminOptions} onChanged={list.reload} />}
    </Drawer>
  </>;
}
