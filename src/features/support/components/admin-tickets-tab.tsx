"use client";

import { Inbox, Search } from "lucide-react";
import { useMemo } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams, useUrlSearch } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, TableSearch, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { accountsApi } from "@/features/accounts/api";
import { formatDateTime } from "@/utils/date-range";
import { supportApi } from "../api";
import { organizationName, personName, priorityLabel, priorityOptions, priorityTone, ticketStatusLabel, ticketStatusOptions, ticketStatusTone } from "../labels";
import type { Ticket } from "../types";
import { AdminTicketPanel } from "./admin-ticket-panel";
import { errorText } from "./ticket-thread";
import { PendingBox } from "./pending-box";
import styles from "./support.module.css";

const PAGE_SIZE = 20;

/**
 * Ticket queue (Figma Admin v2 "Hỗ trợ & audit · Ticket"): status / priority / assignee / organization filters live in
 * the URL and reach the server; the subject search narrows the loaded page (the API has no text search). A row opens the
 * ticket in a right drawer (`?ticket=`), where assignment, transitions and the thread live.
 */
export function AdminTicketsTab({ accessToken, myId }: { accessToken: string; myId: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("status");
  const priority = get("priority");
  const assignedTo = get("assignedTo");
  const organizationId = get("organizationId");
  const ticketId = get("ticket");
  const urlSearch = get("q");
  const [searchText, setSearchText] = useUrlSearch(urlSearch, setParams);

  const list = useAsyncData(
    `admin-tickets:${page}:${status}:${priority}:${assignedTo}:${organizationId}`,
    (signal) => supportApi.listTickets("admin", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined, priority: priority || undefined, assignedTo: assignedTo || undefined, organizationId: organizationId || undefined }, signal),
    true,
  );
  const admins = useAsyncData("admin-tickets:admins", () => accountsApi.list(accessToken, { role: 0, isActive: true, page: 1, pageSize: 100 }), true);
  const organizations = useAsyncData("admin-tickets:orgs", () => accountsApi.organizations(accessToken), true);

  const adminOptions = useMemo(() => (admins.data?.items ?? []).map((admin) => ({ id: admin.id, name: admin.fullName || admin.email })), [admins.data]);
  const nameOf = (id: string | null) => (id ? adminOptions.find((admin) => admin.id === id)?.name ?? "Quản trị viên khác" : "Chưa phân công");
  const loaded = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const needle = urlSearch.trim().toLowerCase();
  const items = needle ? loaded.filter((ticket) => `${ticket.subject} ${ticket.ticketNumber}`.toLowerCase().includes(needle)) : loaded;
  const filtering = Boolean(status || priority || assignedTo || organizationId || needle);

  const open = (id: string) => setParams({ ticket: id, page });
  const close = () => setParams({ ticket: null, page });

  const columns: DataColumn<Ticket>[] = [
    { key: "subject", header: "Chủ đề", primary: true, render: (ticket) => <CellTitle title={<span className={styles.clip}>{ticket.subject}</span>} sub={<span className={styles.mono}>{ticket.ticketNumber}</span>} /> },
    { key: "from", header: "Tổ chức / người gửi", width: 220, render: (ticket) => <CellTitle title={personName(ticket.createdBy)} sub={organizationName(ticket.organization)} /> },
    { key: "priority", header: "Ưu tiên", width: 130, render: (ticket) => <StatusBadge tone={priorityTone(ticket.priority)}>{priorityLabel(ticket.priority)}</StatusBadge> },
    { key: "status", header: "Trạng thái", width: 150, render: (ticket) => <StatusBadge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</StatusBadge> },
    { key: "assignee", header: "Người xử lý", width: 170, hideBelow: 1100, render: (ticket) => ticket.assignedTo ? nameOf(ticket.assignedTo) : <span className="ops-muted">Chưa phân công</span> },
    { key: "updated", header: "Cập nhật", width: 170, hideBelow: 900, render: (ticket) => formatDateTime(ticket.updatedAt) },
  ];

  const assigneeOptions = [{ value: myId, label: "Giao cho tôi", group: "Nhanh" }, ...adminOptions.filter((admin) => admin.id !== myId).map((admin) => ({ value: admin.id, label: admin.name, group: "Quản trị viên" }))];
  const organizationOptions = (organizations.data?.items ?? []).map((organization) => ({ value: organization.id, label: organization.name }));

  return <>
    <DataTable<Ticket>
      caption="Danh sách yêu cầu hỗ trợ"
      data-testid="admin-tickets-table"
      columns={columns}
      rows={items}
      rowKey={(ticket) => ticket.id}
      loading={list.loading && !list.data}
      onRowClick={(ticket) => open(ticket.id)}
      rowTone={(ticket) => (ticket.status === "Closed" ? "muted" : ticket.priority === "Urgent" && ticket.status !== "Resolved" ? "warning" : undefined)}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được danh sách yêu cầu" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert> : undefined}
      toolbar={<>
        <TableSearch value={searchText} onChange={setSearchText} label="Tìm yêu cầu" placeholder="Tìm theo chủ đề hoặc mã" />
        <FilterChips label="Bộ lọc yêu cầu">
          <FilterChip label="Trạng thái" value={status} onChange={(value) => setParams({ status: value })} options={ticketStatusOptions.map((value) => ({ value, label: ticketStatusLabel(value) }))} />
          <FilterChip label="Mức" value={priority} onChange={(value) => setParams({ priority: value })} options={priorityOptions.map((value) => ({ value, label: priorityLabel(value) }))} />
        </FilterChips>
        <Combobox aria-label="Người phụ trách" value={assignedTo} onChange={(value) => setParams({ assignedTo: value })} options={assigneeOptions} placeholder="Người phụ trách: tất cả" searchPlaceholder="Tìm quản trị viên" loading={admins.loading && !admins.data} clearable className={styles.toolbarPick} />
        <Combobox aria-label="Tổ chức" value={organizationId} onChange={(value) => setParams({ organizationId: value })} options={organizationOptions} placeholder="Tổ chức: tất cả" searchPlaceholder="Tìm tổ chức" groupLabel="Tổ chức" loading={organizations.loading && !organizations.data} clearable className={styles.toolbarPick} />
        {filtering && <Button variant="quiet" onClick={() => { setSearchText(""); setParams({ status: null, priority: null, assignedTo: null, organizationId: null, q: null }); }}>Xóa bộ lọc</Button>}
      </>}
      empty={<EmptyState icon={filtering ? Search : Inbox} title={filtering ? "Không có yêu cầu phù hợp." : "Chưa có yêu cầu nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Yêu cầu do học viên và tổ chức gửi sẽ xuất hiện ở đây."} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.hint}>Bấm một hàng để mở yêu cầu: đổi trạng thái, mức ưu tiên, người phụ trách và trả lời.</p>

    <PendingBox
      title="Tính năng sắp có"
      items={[
        "Tệp đính kèm: hiện yêu cầu hỗ trợ chỉ nhận nội dung chữ.",
        "Thông báo qua email hoặc điện thoại khi có trả lời: hệ thống chưa tự gửi.",
      ]}
    />

    <Drawer open={Boolean(ticketId)} onOpenChange={(value) => { if (!value) close(); }} size="lg" data-testid="admin-ticket-drawer" title="Chi tiết yêu cầu" description="Phân công, đổi trạng thái và trao đổi với người gửi.">
      {ticketId && <AdminTicketPanel key={ticketId} ticketId={ticketId} accessToken={accessToken} myId={myId} admins={adminOptions} onChanged={list.reload} />}
    </Drawer>
  </>;
}
