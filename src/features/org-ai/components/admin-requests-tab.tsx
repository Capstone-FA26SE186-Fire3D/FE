"use client";

import { Inbox, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ApiError } from "@/api/types/common";
import { useIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { accountsApi } from "@/features/accounts/api";
import { formatDateTime, formatQuota } from "@/features/billing/format";

import { adminAiApi } from "../api";
import { aiErrorText, audienceLabel, failureText, operationLabel, statusLabel, statusTone } from "../labels";
import { ADMIN_AI_OPERATIONS, AI_AUDIENCES, AI_STATUSES, urlFilter, urlId, type AiRequest } from "../types";
import styles from "../org-ai.module.css";
import { RequestPanel } from "./request-panel";

const PAGE_SIZE = 20;

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
      toast.notify({ tone: "success", title: "Đã lên lịch tra cứu nhà cung cấp", description: "Chưa phải kết quả: trạng thái cập nhật khi worker xử lý." });
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
      <dl className={styles.meta} data-testid="ai-admin-meta">
        <dt>Tổ chức</dt><dd>{orgName(request.organizationId)}</dd>
        <dt>Người gửi</dt><dd className={styles.mono}>{request.actorUserId ?? "—"}</dd>
        <dt>Chính sách</dt><dd className={styles.mono}>{request.policyId ?? "—"}</dd>
        <dt>Số lần gửi</dt><dd>{request.attempts ?? "—"}</dd>
        {request.failureCode && <><dt>Mã lỗi</dt><dd><span className={styles.mono}>{request.failureCode}</span> <span className={styles.dim}>{failureText(request.failureCode)}</span></dd></>}
        <dt>Đối soát yêu cầu lúc</dt><dd>{reconcileAt ? formatDateTime(reconcileAt) : "Chưa"}</dd>
        <dt>Cập nhật lúc</dt><dd>{formatDateTime(request.updatedAt)}</dd>
      </dl>
      {request.providerResult !== undefined && <div>
        <strong>Kết quả thô của nhà cung cấp (chỉ PlatformAdmin thấy)</strong>
        <pre className={styles.json} data-testid="ai-provider-result">{JSON.stringify(request.providerResult, null, 2)}</pre>
      </div>}
    </section>

    {request.status === "NeedsReconcile" && <section className={styles.section} aria-label="Đối soát">
      <h3>Đối soát</h3>
      <p className={styles.muted}>Đối soát chỉ lên lịch cho worker tra cứu yêu cầu này ở nhà cung cấp theo mã ổn định. Nó không sửa số đã dùng và không hoàn quota thủ công: có kết quả hợp lệ thì chốt theo kết quả, nhà cung cấp báo chưa nhận thì giải phóng giữ chỗ, còn lại giữ nguyên Chờ đối soát.</p>
      {reconcileAt && <Alert tone="info" title="Đã lên lịch tra cứu" >Yêu cầu đối soát lúc {formatDateTime(reconcileAt)}. Trạng thái bên trên tự cập nhật; 202 chưa phải là đã chốt.</Alert>}
      {error !== undefined && <Alert tone="danger" title="Chưa lên lịch được đối soát" action={<Button size="sm" variant="secondary" className="mt-3" onClick={() => void run()} disabled={busy}>Thử lại (cùng khóa)</Button>}>{aiErrorText(error)}{error instanceof ApiError && error.code === "AI_RECONCILE_NOT_ALLOWED" ? "" : " Nội dung thử lại dùng cùng khóa chống trùng."}</Alert>}
      <div><Button type="button" onClick={() => setConfirm(true)} disabled={!canReconcile || busy} data-testid="ai-reconcile"><RefreshCw size={16} aria-hidden="true" />Đối soát yêu cầu này</Button></div>
    </section>}

    <Modal open={confirm} onOpenChange={(open) => { if (!open && !busy) setConfirm(false); }} title="Đối soát yêu cầu AI?"
      description="Chỉ lên lịch tra cứu ở nhà cung cấp; không tự thay đổi quota hay kết quả."
      footer={<><Button type="button" variant="quiet" onClick={() => setConfirm(false)} disabled={busy}>Hủy</Button><Button type="button" onClick={() => void run()} disabled={busy} data-testid="ai-reconcile-confirm">{busy ? "Đang gửi…" : "Xác nhận đối soát"}</Button></>}>
      <p className={styles.muted}>Yêu cầu <span className={styles.mono}>{request.requestId}</span> đang giữ chỗ quota của {orgName(request.organizationId)}. Gửi lệnh đối soát?</p>
      {error !== undefined && <Alert tone="danger" title="Chưa gửi được">{aiErrorText(error)}</Alert>}
    </Modal>
  </div>;
}

export function AdminRequestsTab({ accessToken }: { accessToken: string }) {
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

  return <>
    <div className="ops-toolbar">
      <Select aria-label="Trạng thái" style={{ width: 220 }} value={status} onChange={(event) => setParams({ status: event.target.value })}>
        <option value="">Mọi trạng thái</option>{AI_STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
      </Select>
      <Select aria-label="Loại yêu cầu" style={{ width: 200 }} value={operation} onChange={(event) => setParams({ operation: event.target.value })}>
        <option value="">Mọi loại</option>{ADMIN_AI_OPERATIONS.map((value) => <option key={value} value={value}>{operationLabel(value)}</option>)}
      </Select>
      <Select aria-label="Đối tượng" style={{ width: 170 }} value={audience} onChange={(event) => setParams({ audience: event.target.value })}>
        <option value="">Mọi đối tượng</option>{AI_AUDIENCES.map((value) => <option key={value} value={value}>{audienceLabel(value)}</option>)}
      </Select>
      <Select aria-label="Tổ chức" style={{ width: 240 }} value={organizationId} onChange={(event) => setParams({ organizationId: event.target.value })}>
        <option value="">Mọi tổ chức</option>
        {(organizations.data?.items ?? []).map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </Select>
      {filtering && <Button variant="quiet" onClick={() => setParams({ status: null, operation: null, audience: null, organizationId: null })}>Xóa bộ lọc</Button>}
      <Button variant="quiet" onClick={list.reload} disabled={list.loading}><RefreshCw size={16} aria-hidden="true" />Tải lại</Button>
    </div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được yêu cầu AI" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{aiErrorText(list.error)}</Alert>}
    <Table caption="Yêu cầu AI toàn hệ thống" data-testid="admin-ai-requests">
      <thead><tr><th>Yêu cầu</th><th>Tổ chức</th><th>Trạng thái</th><th>Sử dụng</th><th>Tạo lúc</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={6} label="Đang tải yêu cầu AI…" /></TableMessage>}
        {items.map((item) => <tr key={item.requestId} data-testid="admin-ai-row">
          <td>
            <button type="button" className={styles.rowButton} onClick={() => setParams({ request: item.requestId })} aria-label={`Mở yêu cầu ${operationLabel(item.operation)} ${item.requestId.slice(0, 8)}`}>{operationLabel(item.operation)}</button>
            <span className="ops-cell-sub"><span className={styles.mono}>{item.requestId.slice(0, 8)}…</span></span>
          </td>
          <td>{item.audience === "trainee" ? <>Trainee<span className="ops-cell-sub">không thuộc quota tổ chức</span></> : orgName(item.organizationId)}</td>
          <td><StatusBadge tone={statusTone(item.status, item.resultType)}>{statusLabel(item.status, item.resultType)}</StatusBadge>{item.reconcileRequestedAt && <span className="ops-cell-sub">Đã yêu cầu đối soát</span>}</td>
          <td>{item.consumedUnits !== undefined ? formatQuota(item.consumedUnits, item.quotaUnit) : item.reservedUnits !== undefined ? `Giữ chỗ ${formatQuota(item.reservedUnits, item.quotaUnit)}` : "—"}</td>
          <td>{formatDateTime(item.createdAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtering ? Search : Inbox} title={filtering ? "Không có yêu cầu phù hợp." : "Chưa có yêu cầu AI nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Yêu cầu của các tổ chức sẽ xuất hiện ở đây."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <Drawer open={requestId !== ""} onOpenChange={(open) => { if (!open) { setParams({ request: null }); list.reload(); } }} title="Chi tiết yêu cầu AI" description="Số liệu và nội dung do máy chủ trả; tự cập nhật khi còn đang xử lý hoặc đã lên lịch đối soát." className={styles.wideDrawer}>
      {requestId && <RequestPanel key={requestId} admin accessToken={accessToken} requestId={requestId}
        renderExtra={(request, refresh) => <AdminDetail accessToken={accessToken} request={request} refresh={refresh} orgName={orgName} />} />}
    </Drawer>
  </>;
}
