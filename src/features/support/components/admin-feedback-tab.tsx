"use client";

import { MessageSquareText, RefreshCw, Search, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { supportApi, type FeedbackWithEtag } from "../api";
import { feedbackStatusLabel, feedbackStatusOptions, feedbackStatusTone, organizationName, personName } from "../labels";
import type { FeedbackStatus } from "../types";
import { PendingBox } from "./pending-box";
import { errorText } from "./ticket-thread";
import styles from "./support.module.css";

const PAGE_SIZE = 20;
const nextStatuses: Record<FeedbackStatus, FeedbackStatus[]> = {
  Submitted: ["Submitted", "Reviewed"],
  Reviewed: ["Reviewed", "Closed"],
  Closed: ["Closed"],
};

/**
 * One feedback from `GET /api/admin/feedback/{id}` (creator with email, organization, ETag). The status change is a
 * PATCH with that ETag; on 412 the chosen status stays and the admin can load the newer version to compare.
 */
function FeedbackDetail({ id, accessToken, onChanged }: { id: string; accessToken: string; onChanged: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<FeedbackWithEtag | null>(null);
  const [loadError, setLoadError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);
  const [choice, setChoice] = useState<FeedbackStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [staleEtag, setStaleEtag] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(undefined);
      supportApi.getFeedback(accessToken, id, controller.signal)
        .then((value) => { if (!controller.signal.aborted) setState(value); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [accessToken, id, token]);
  const reload = useCallback(() => setToken((value) => value + 1), []);

  if (!state) {
    if (loadError !== undefined) return <Alert tone="danger" title="Không mở được phản hồi" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{errorText(loadError, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>;
    return <SkeletonRows rows={5} label="Đang tải phản hồi…" />;
  }

  const { feedback, etag } = state;
  // After reloading a newer version the earlier choice may no longer be a valid next step.
  const chosen = choice && nextStatuses[feedback.status].includes(choice) ? choice : feedback.status;
  const reloaded = staleEtag !== null && etag !== staleEtag;

  const save = async () => {
    if (saving || chosen === feedback.status) return;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await supportApi.updateFeedbackStatus(accessToken, feedback.id, chosen, etag);
      setState(updated);
      setChoice(null);
      setStaleEtag(null);
      toast.notify({ tone: "success", title: "Đã cập nhật phản hồi", description: feedbackStatusLabel(updated.feedback.status) });
      onChanged();
    } catch (cause) {
      if (cause instanceof ApiError && cause.isPreconditionFailed) setStaleEtag(etag);
      else if (cause instanceof ApiError && cause.status === 404) setSaveError("Không cập nhật được: phản hồi hoặc tổ chức gửi phản hồi không còn khả dụng.");
      else setSaveError(errorText(cause, "Không cập nhật được phản hồi. Lựa chọn của bạn vẫn được giữ lại; hãy thử lại."));
    } finally {
      setSaving(false);
    }
  };

  return <div className="ops-stack">
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <StatusBadge tone={feedbackStatusTone(feedback.status)}>{feedbackStatusLabel(feedback.status)}</StatusBadge>
      <StatusBadge tone="neutral">{feedback.category}</StatusBadge>
      {feedback.rating !== null && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: 13 }}><Star size={14} aria-hidden="true" />{feedback.rating}/5</span>}
      <Button size="sm" variant="quiet" onClick={reload} disabled={loading} aria-label="Tải lại phản hồi" style={{ marginLeft: "auto" }}><RefreshCw size={14} aria-hidden="true" />{loading ? "Đang tải…" : "Tải lại"}</Button>
    </div>
    <p className={styles.description}>{feedback.message}</p>
    <dl className={styles.meta}>
      <dt>Người gửi</dt><dd>{personName(feedback.createdBy)}{feedback.createdBy?.email && <span className="ops-cell-sub">{feedback.createdBy.email}</span>}</dd>
      <dt>Tổ chức</dt><dd>{organizationName(feedback.organization)}</dd>
      <dt>Gửi lúc</dt><dd>{formatDateTime(feedback.createdAt)}</dd>
      <dt>Đã xem lúc</dt><dd>{formatDateTime(feedback.reviewedAt)}</dd>
    </dl>
    {staleEtag !== null && <Alert tone="warning" title={reloaded ? "Đã tải bản mới nhất" : "Phản hồi vừa được cập nhật ở nơi khác"} action={!reloaded && <Button size="sm" variant="secondary" className="mt-3" onClick={reload} disabled={loading}>{loading ? "Đang tải…" : "Tải bản mới để đối chiếu"}</Button>}>
      {reloaded ? `Máy chủ hiện: ${feedbackStatusLabel(feedback.status)}. Lựa chọn của bạn vẫn được giữ nếu còn hợp lệ; kiểm tra rồi bấm Lưu.` : "Lựa chọn của bạn được giữ nguyên, chưa ghi đè gì. Tải bản mới để đối chiếu rồi lưu lại."}
    </Alert>}
    {saveError && <Alert tone="danger">{saveError}</Alert>}
    <Field label="Trạng thái xử lý" hint="Phản hồi đi theo thứ tự Mới gửi → Đã xem → Đã đóng.">
      {(p) => <Select {...p} value={chosen} disabled={feedback.status === "Closed"} onChange={(event) => setChoice(event.target.value as FeedbackStatus)}>{nextStatuses[feedback.status].map((value) => <option key={value} value={value}>{feedbackStatusLabel(value)}</option>)}</Select>}
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
  const feedbackId = get("feedback");

  const list = useAsyncData(
    `admin-feedback:${page}:${status}:${organizationId}`,
    (signal) => supportApi.listFeedback("admin", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined, organizationId: organizationId || undefined }, signal),
    true,
  );
  const organizations = useAsyncData("admin-feedback:orgs", () => accountsApi.organizations(accessToken), true);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
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
      <thead><tr><th>Phản hồi</th><th>Người gửi</th><th>Đánh giá</th><th>Trạng thái</th><th>Gửi lúc</th></tr></thead>
      <tbody>
        {list.loading && !list.data && <TableMessage colSpan={5}><SkeletonRows rows={5} label="Đang tải phản hồi…" /></TableMessage>}
        {items.map((item) => <tr key={item.id}>
          <td>
            <button type="button" className={styles.rowButton} onClick={() => setParams({ feedback: item.id, page })} aria-label={`Mở phản hồi ${item.category}`}>
              <span className={styles.clip}>{item.message}</span>
              <span className="ops-cell-sub">{item.category}</span>
            </button>
          </td>
          <td><span className={styles.clipSmall}>{personName(item.createdBy)}</span><span className="ops-cell-sub">{organizationName(item.organization)}</span></td>
          <td>{item.rating === null ? "—" : `${item.rating}/5`}</td>
          <td><StatusBadge tone={feedbackStatusTone(item.status)}>{feedbackStatusLabel(item.status)}</StatusBadge></td>
          <td>{formatDateTime(item.createdAt)}</td>
        </tr>)}
        {list.data && !items.length && <TableMessage colSpan={5}><EmptyState icon={filtering ? Search : MessageSquareText} title={filtering ? "Không có phản hồi phù hợp." : "Chưa có phản hồi nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Phản hồi của học viên và tổ chức sẽ xuất hiện ở đây."} /></TableMessage>}
      </tbody>
    </Table>
    {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={total} onPageChange={setPage} disabled={list.loading} />}

    <PendingBox title="Chưa có từ backend" items={["Tệp đính kèm: API phản hồi chỉ nhận văn bản thuần.", "Thông báo email/push khi phản hồi được xử lý."]} />

    <Drawer open={Boolean(feedbackId)} onOpenChange={(value) => { if (!value) setParams({ feedback: null, page }); }} title="Chi tiết phản hồi" description="Xem người gửi, đánh dấu đã xem hoặc đóng phản hồi.">
      {feedbackId && <FeedbackDetail key={feedbackId} id={feedbackId} accessToken={accessToken} onChanged={list.reload} />}
    </Drawer>
  </>;
}
