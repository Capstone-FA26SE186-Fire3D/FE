"use client";

import { MessageSquareText, Search, Star } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination, Table, TableMessage } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { accountsApi } from "@/features/accounts/api";
import { formatDateTime } from "@/utils/date-range";
import { supportApi } from "../api";
import { feedbackStatusLabel, feedbackStatusOptions, feedbackStatusTone } from "../labels";
import type { Feedback, FeedbackStatus } from "../types";
import { PendingBox } from "./pending-box";
import { errorText } from "./ticket-thread";
import styles from "./support.module.css";

const PAGE_SIZE = 20;
const nextStatuses: Record<FeedbackStatus, FeedbackStatus[]> = {
  Submitted: ["Submitted", "Reviewed"],
  Reviewed: ["Reviewed", "Closed"],
  Closed: ["Closed"],
};

function FeedbackDetail({ feedback, accessToken, onSaved, onStale }: { feedback: Feedback; accessToken: string; onSaved: (feedback: Feedback) => void; onStale: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<FeedbackStatus>(feedback.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  // After reloading a newer version the earlier choice may no longer be a valid next step.
  const chosen = nextStatuses[feedback.status].includes(status) ? status : feedback.status;

  const save = async () => {
    if (saving || chosen === feedback.status) return;
    setSaving(true);
    setError("");
    try {
      const updated = await supportApi.updateFeedbackStatus(accessToken, feedback.id, chosen, feedback.revision);
      toast.notify({ tone: "success", title: "Đã cập nhật phản hồi", description: feedbackStatusLabel(updated.status) });
      setStale(false);
      onSaved(updated);
    } catch (cause) {
      if (cause instanceof ApiError && cause.isPreconditionFailed) setStale(true);
      else setError(errorText(cause, "Không cập nhật được phản hồi. Hãy thử lại."));
    } finally {
      setSaving(false);
    }
  };

  return <div className="ops-stack">
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <StatusBadge tone={feedbackStatusTone(feedback.status)}>{feedbackStatusLabel(feedback.status)}</StatusBadge>
      <StatusBadge tone="neutral">{feedback.category}</StatusBadge>
      {feedback.rating !== null && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: 13 }}><Star size={14} aria-hidden="true" />{feedback.rating}/5</span>}
    </div>
    <p className={styles.description}>{feedback.message}</p>
    <dl className={styles.meta}>
      <dt>Gửi lúc</dt><dd>{formatDateTime(feedback.createdAt)}</dd>
      <dt>Đã xem lúc</dt><dd>{formatDateTime(feedback.reviewedAt)}</dd>
    </dl>
    {stale && <Alert tone="warning" title="Phản hồi vừa được cập nhật ở nơi khác" action={<Button size="sm" variant="secondary" className="mt-3" onClick={onStale}>Tải lại danh sách</Button>}>Lựa chọn của bạn được giữ nguyên. Tải lại để lấy trạng thái mới nhất rồi lưu lại.</Alert>}
    {error && <Alert tone="danger">{error}</Alert>}
    <Field label="Trạng thái xử lý" hint="Phản hồi đi theo thứ tự Mới gửi → Đã xem → Đã đóng.">
      {(p) => <Select {...p} value={chosen} disabled={feedback.status === "Closed"} onChange={(event) => setStatus(event.target.value as FeedbackStatus)}>{nextStatuses[feedback.status].map((value) => <option key={value} value={value}>{feedbackStatusLabel(value)}</option>)}</Select>}
    </Field>
    <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
      <Button onClick={() => void save()} disabled={saving || chosen === feedback.status}>{saving ? "Đang lưu…" : "Lưu trạng thái"}</Button>
    </div>
  </div>;
}

export function AdminFeedbackTab({ accessToken }: { accessToken: string }) {
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("fbStatus");
  const organizationId = get("fbOrganizationId");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useAsyncData(
    `admin-feedback:${page}:${status}:${organizationId}`,
    (signal) => supportApi.listFeedback("admin", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined, organizationId: organizationId || undefined }, signal),
    true,
  );
  const organizations = useAsyncData("admin-feedback:orgs", () => accountsApi.organizations(accessToken), true);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const filtering = Boolean(status || organizationId);

  return <>
    <div className="ops-toolbar">
      <Select aria-label="Trạng thái phản hồi" style={{ width: 180 }} value={status} onChange={(event) => setParams({ fbStatus: event.target.value })}>
        <option value="">Mọi trạng thái</option>{feedbackStatusOptions.map((value) => <option key={value} value={value}>{feedbackStatusLabel(value)}</option>)}
      </Select>
      <Select aria-label="Tổ chức" style={{ width: 210 }} value={organizationId} onChange={(event) => setParams({ fbOrganizationId: event.target.value })}>
        <option value="">Mọi tổ chức</option>
        {(organizations.data?.items ?? []).map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </Select>
      {filtering && <Button variant="quiet" onClick={() => setParams({ fbStatus: null, fbOrganizationId: null })}>Xóa bộ lọc</Button>}
    </div>

    {list.error !== undefined && <Alert tone="danger" title="Không tải được phản hồi" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>}

    <Table caption="Danh sách phản hồi">
      <thead><tr><th>Phản hồi</th><th>Đánh giá</th><th>Trạng thái</th><th>Gửi lúc</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={5} label="Đang tải phản hồi…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td>
            <button type="button" className={styles.rowButton} onClick={() => setSelectedId(item.id)} aria-label={`Mở phản hồi ${item.category}`}>
              <span className={styles.clip}>{item.message}</span>
              <span className="ops-cell-sub">{item.category}</span>
            </button>
          </td>
          <td>{item.rating === null ? "—" : `${item.rating}/5`}</td>
          <td><StatusBadge tone={feedbackStatusTone(item.status)}>{feedbackStatusLabel(item.status)}</StatusBadge></td>
          <td>{formatDateTime(item.createdAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={filtering ? Search : MessageSquareText} title={filtering ? "Không có phản hồi phù hợp." : "Chưa có phản hồi nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Phản hồi của học viên và tổ chức sẽ xuất hiện ở đây."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <PendingBox title="Chưa có từ backend" items={["Người gửi và tổ chức của phản hồi (response chỉ có danh mục, nội dung, đánh giá, trạng thái).", "Route xem chi tiết một phản hồi: màn này mở từ dữ liệu của danh sách."]} />

    <Drawer open={selected !== null} onOpenChange={(value) => { if (!value) setSelectedId(null); }} title="Chi tiết phản hồi" description="Đánh dấu đã xem hoặc đóng phản hồi.">
      {selected && <FeedbackDetail key={selected.id} feedback={selected} accessToken={accessToken} onSaved={() => { setSelectedId(null); list.reload(); }} onStale={list.reload} />}
    </Drawer>
  </>;
}
