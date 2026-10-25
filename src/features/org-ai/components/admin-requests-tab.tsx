"use client";

import { Eye, Inbox, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ApiError } from "@/api/types/common";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { ChartCard } from "@/components/charts/chart-card";
import { Donut } from "@/components/charts/lazy";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { SupportCode } from "@/components/ui/support-code";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { accountsApi } from "@/features/accounts/api";
import { formatDateTime, formatNumber, formatQuota } from "@/features/billing/format";

import { adminAiApi } from "../api";
import { aiErrorText, audienceLabel, failureText, operationLabel, statusLabel, statusTone } from "../labels";
import { ADMIN_AI_OPERATIONS, AI_AUDIENCES, AI_STATUSES, urlFilter, urlId, type AiRequest } from "../types";
import styles from "../org-ai.module.css";
import { RequestPanel } from "./request-panel";

const PAGE_SIZE = 20;

/** Request counts by status from the platform training report (`aiUsage.requests`, last 30 days). */
export type RequestUsage = { data: Record<string, number> | null; loading: boolean; failed: boolean };

/** Admin-only part of one request: tenant, attempts, provider payload and the reconcile command. */
function AdminDetail({ accessToken, request, refresh, orgName }: { accessToken: string; request: AiRequest; refresh: () => void; orgName: (id: string | undefined) => string }) {
  const toast = useToast();
  const { keyFor, done } = useIdempotencyKey();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [scheduled, setScheduled] = useState<AiRequest | null>(null);
  const canReconcile = request.status === "NeedsReconcile" && !request.reconcileRequestedAt && !scheduled;
  const reconcileAt = request.reconcileRequestedAt ?? scheduled?.reconcileRequestedAt;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      // One key per request id: a retry after a timeout or a 5xx replays this same command, never a second one.
      const result = await adminAiApi.reconcile(accessToken, request.requestId, keyFor({ requestId: request.requestId }));
      done();
      setScheduled(result);
      setConfirm(false);
      toast.notify({ tone: "success", title: "Đã lên lịch tra cứu nhà cung cấp", description: "Chưa phải kết quả: trạng thái tự cập nhật khi hệ thống tra cứu xong." });
      refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.stack}>
    <section className={styles.section} aria-label="Thông tin quản trị">
      <h3>Thông tin quản trị</h3>
      <dl className="ops-kv" data-testid="ai-admin-meta">
        <dt>Tổ chức</dt><dd>{request.audience === "trainee" ? "Học viên (không tính vào hạn mức tổ chức)" : orgName(request.organizationId)}</dd>
        <dt>Người gửi</dt><dd className={styles.mono}>{request.actorUserId ?? "—"}</dd>
        <dt>Chính sách</dt><dd className={styles.mono}>{request.policyId ?? "—"}</dd>
        <dt>Số lần gửi</dt><dd>{request.attempts ?? "—"}</dd>
        {request.failureCode && <><dt>Lỗi</dt><dd>{failureText(request.failureCode)}<SupportCode code={request.failureCode} /></dd></>}
        <dt>Đối soát yêu cầu lúc</dt><dd>{reconcileAt ? formatDateTime(reconcileAt) : "Chưa"}</dd>
        <dt>Cập nhật lúc</dt><dd>{formatDateTime(request.updatedAt)}</dd>
      </dl>
      {request.providerResult !== undefined && <div>
        <strong>Kết quả gốc từ nhà cung cấp AI (chỉ quản trị FET3D thấy)</strong>
        <pre className={styles.json} data-testid="ai-provider-result">{JSON.stringify(request.providerResult, null, 2)}</pre>
      </div>}
    </section>

    {request.status === "NeedsReconcile" && <section className={styles.section} aria-label="Đối soát">
      <h3>Đối soát</h3>
      <p className={styles.muted}>Đối soát nhờ hệ thống hỏi lại nhà cung cấp AI về yêu cầu này. Thao tác không sửa số đã dùng và không tự hoàn hạn mức: nhà cung cấp có kết quả hợp lệ thì chốt theo kết quả, báo chưa nhận thì trả lại phần giữ chỗ, còn lại vẫn ở trạng thái Chờ đối soát.</p>
      {reconcileAt && <Alert tone="info" title="Đã lên lịch tra cứu">Yêu cầu đối soát lúc {formatDateTime(reconcileAt)}. Trạng thái bên trên tự cập nhật; đã lên lịch chưa có nghĩa là đã có kết quả.</Alert>}
      {error !== undefined && <Alert tone="danger" title="Chưa lên lịch được đối soát" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void run()} disabled={busy}>Thử lại</Button>}>{aiErrorText(error)}{error instanceof ApiError && error.code === "AI_RECONCILE_NOT_ALLOWED" ? "" : " Bấm thử lại sẽ không tạo lệnh trùng."}</Alert>}
      <div><Button type="button" onClick={() => setConfirm(true)} disabled={!canReconcile || busy} data-testid="ai-reconcile"><RefreshCw size={16} aria-hidden="true" />Đối soát yêu cầu này</Button></div>
    </section>}

    <Modal open={confirm} onOpenChange={(open) => { if (!open && !busy) setConfirm(false); }} size="sm" title="Đối soát yêu cầu AI?"
      description="Chỉ lên lịch hỏi lại nhà cung cấp; không tự thay đổi hạn mức hay kết quả."
      footer={<><Button type="button" variant="quiet" onClick={() => setConfirm(false)} disabled={busy}>Hủy</Button><Button type="button" onClick={() => void run()} disabled={busy} data-testid="ai-reconcile-confirm">{busy ? "Đang gửi…" : "Xác nhận đối soát"}</Button></>}>
      <p className={styles.muted}>Yêu cầu này đang giữ chỗ hạn mức của {orgName(request.organizationId)}. Gửi lệnh đối soát?</p>
      {error !== undefined && <Alert tone="danger" title="Chưa gửi được">{aiErrorText(error)}</Alert>}
    </Modal>
  </div>;
}

/**
 * Donut "Yêu cầu theo trạng thái" from the platform training report (`aiUsage.requests`): counts the BE already computes
 * for the last 30 days, never derived from the current page. Shown under the table (Figma places it beside it on 1440).
 */
function StatusDonut({ usage }: { usage: RequestUsage }) {
  const slices = useMemo(() => {
    const counts = usage.data ?? {};
    const known = AI_STATUSES.map((status) => ({ key: status, label: statusLabel(status), value: counts[status] ?? 0, color: toneColor(status) }));
    const extra = Object.entries(counts).filter(([status]) => !(AI_STATUSES as readonly string[]).includes(status)).map(([status, value]) => ({ key: status, label: statusLabel(status), value, color: "var(--dim)" }));
    return [...known, ...extra];
  }, [usage.data]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return <ChartCard title="Yêu cầu theo trạng thái" description="30 ngày gần nhất · từ báo cáo sử dụng AI của máy chủ" height={170} loading={usage.loading} empty={!usage.loading && (usage.failed || !usage.data || total === 0)} emptyText={usage.failed ? "Chưa đọc được báo cáo sử dụng AI" : "Chưa có yêu cầu AI trong 30 ngày"} data-testid="ai-status-chart"
    table={<table className="ops-table"><caption className="ops-sr-only">Yêu cầu theo trạng thái</caption><thead><tr><th>Trạng thái</th><th>Số yêu cầu</th></tr></thead><tbody>{slices.map((slice) => <tr key={slice.key}><td>{slice.label}</td><td>{formatNumber(slice.value)}</td></tr>)}</tbody></table>}>
    <Donut slices={slices} center={{ value: formatNumber(total), caption: "yêu cầu" }} />
  </ChartCard>;
}

function toneColor(status: string) {
  switch (status) {
    case "Succeeded": return "var(--success)";
    case "Failed": case "Rejected": return "var(--danger)";
    case "NeedsReconcile": return "var(--warning)";
    default: return "var(--info)";
  }
}

/** Requests of every organization (`GET /api/admin/ai/requests`); filters and page live in the URL; a row opens the drawer. */
export function AdminRequestsTab({ accessToken, usage }: { accessToken: string; usage: RequestUsage }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = urlFilter(get("status"), AI_STATUSES);
  const operation = urlFilter(get("operation"), ADMIN_AI_OPERATIONS);
  const audience = urlFilter(get("audience"), AI_AUDIENCES);
  const organizationId = get("organizationId");
  const requestId = urlId(get("request"));

  const list = useAsyncData(
    `admin-ai:requests:${page}:${status}:${operation}:${audience}:${organizationId}`,
    (signal) => adminAiApi.listRequests(accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined, operation: operation || undefined, audience: audience || undefined, organizationId: organizationId || undefined }, signal),
  );
  const organizations = useAsyncData("admin-ai:orgs", () => accountsApi.organizations(accessToken));
  const orgNames = useMemo(() => Object.fromEntries((organizations.data?.items ?? []).map((item) => [item.id, item.name])), [organizations.data]);
  const orgName = (id: string | undefined) => (id ? orgNames[id] ?? `${id.slice(0, 8)}…` : "—");
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(status || operation || audience || organizationId);
  const open = (id: string) => setParams({ request: id });

  const columns: DataColumn<AiRequest>[] = [
    { key: "request", header: "Yêu cầu", primary: true, render: (item) => <CellTitle title={`${operationLabel(item.operation)} · ${formatDateTime(item.createdAt)}`} sub={<span className={styles.mono}>{item.requestId.slice(0, 8)}…</span>} /> },
    { key: "organization", header: "Tổ chức", width: 200, render: (item) => item.audience === "trainee" ? <CellTitle title="Học viên" sub="không tính vào hạn mức tổ chức" /> : orgName(item.organizationId) },
    { key: "status", header: "Trạng thái", width: 190, render: (item) => <CellTitle title={<StatusBadge tone={statusTone(item.status, item.resultType)}>{statusLabel(item.status, item.resultType)}</StatusBadge>} sub={item.reconcileRequestedAt ? "Đã yêu cầu đối soát" : undefined} /> },
    { key: "usage", header: "Sử dụng", width: 150, hideBelow: 900, render: (item) => (item.consumedUnits !== undefined ? formatQuota(item.consumedUnits, item.quotaUnit) : item.reservedUnits !== undefined ? `Giữ chỗ ${formatQuota(item.reservedUnits, item.quotaUnit)}` : "—") },
  ];

  return <div className={styles.stack}>
    <DataTable<AiRequest>
      caption="Yêu cầu AI toàn hệ thống"
      data-testid="ai-requests-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.requestId}
      loading={list.loading && !list.data}
      onRowClick={(item) => open(item.requestId)}
      rowTone={(item) => (item.status === "NeedsReconcile" ? "warning" : undefined)}
      rowMenu={(item) => [
        { label: "Xem chi tiết", icon: Eye, onSelect: () => open(item.requestId) },
        ...(item.status === "NeedsReconcile" ? [{ label: "Đối soát yêu cầu", icon: RefreshCw, onSelect: () => open(item.requestId), hint: "Xác nhận trong chi tiết", separator: true }] : []),
      ]}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được yêu cầu AI" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert> : undefined}
      toolbar={<>
        <FilterChips label="Bộ lọc yêu cầu AI">
          <FilterChip label="Trạng thái" value={status} onChange={(value) => setParams({ status: value })} options={AI_STATUSES.map((value) => ({ value, label: statusLabel(value) }))} />
          <FilterChip label="Thao tác" value={operation} onChange={(value) => setParams({ operation: value })} options={ADMIN_AI_OPERATIONS.map((value) => ({ value, label: operationLabel(value) }))} />
          <FilterChip label="Đối tượng" value={audience} onChange={(value) => setParams({ audience: value })} options={AI_AUDIENCES.map((value) => ({ value, label: audienceLabel(value) }))} />
        </FilterChips>
        <Combobox aria-label="Tổ chức" value={organizationId} onChange={(value) => setParams({ organizationId: value })} options={(organizations.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))} placeholder="Tổ chức: tất cả" searchPlaceholder="Tìm tổ chức" groupLabel="Tổ chức" loading={organizations.loading && !organizations.data} clearable className={styles.toolbarPick} />
        {filtering && <Button variant="quiet" onClick={() => setParams({ status: null, operation: null, audience: null, organizationId: null })}>Xóa bộ lọc</Button>}
        <Button variant="quiet" onClick={list.reload} disabled={list.loading} aria-label="Tải lại danh sách"><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
      </>}
      empty={<EmptyState icon={filtering ? Search : Inbox} title={filtering ? "Không có yêu cầu phù hợp." : "Chưa có yêu cầu AI nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Yêu cầu của các tổ chức sẽ xuất hiện ở đây."} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.hint}>Bấm hàng để mở chi tiết và đối soát.</p>

    <div className={styles.chartRow}><StatusDonut usage={usage} /></div>

    <Drawer open={requestId !== ""} onOpenChange={(open) => { if (!open) { setParams({ request: null }); list.reload(); } }} size="md" data-testid="ai-request-drawer" title="Chi tiết yêu cầu AI" description="Số liệu và nội dung do máy chủ trả; tự cập nhật khi còn đang xử lý hoặc đã lên lịch đối soát.">
      {requestId && <RequestPanel key={requestId} admin accessToken={accessToken} requestId={requestId}
        renderExtra={(request, refresh) => <AdminDetail accessToken={accessToken} request={request} refresh={refresh} orgName={orgName} />} />}
    </Drawer>
  </div>;
}
