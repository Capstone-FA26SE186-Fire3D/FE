"use client";

import { CheckCheck, Eye, MessageSquareText, RefreshCw, Search, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/api";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FilterChip, FilterChips } from "@/components/ui/filter-chip";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { accountsApi } from "@/features/accounts/api";
import { formatDateTime } from "@/utils/date-range";
import { supportApi, type FeedbackWithEtag } from "../api";
import { feedbackStatusLabel, feedbackStatusOptions, feedbackStatusTone, organizationName, personName } from "../labels";
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
/** The single forward step a row menu may take (Submitted → Reviewed → Closed). */
const forwardStep: Partial<Record<FeedbackStatus, FeedbackStatus>> = { Submitted: "Reviewed", Reviewed: "Closed" };

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
    return <SkeletonDetail rows={5} />;
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
    <div className={styles.ticketHead}>
      <StatusBadge tone={feedbackStatusTone(feedback.status)}>{feedbackStatusLabel(feedback.status)}</StatusBadge>
      <StatusBadge tone="neutral">{feedback.category}</StatusBadge>
      {feedback.rating !== null && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: 13 }}><Star size={14} aria-hidden="true" />{feedback.rating}/5</span>}
      <Button size="sm" variant="quiet" onClick={reload} disabled={loading} aria-label="Tải lại phản hồi" style={{ marginLeft: "auto" }}><RefreshCw size={14} aria-hidden="true" />{loading ? "Đang tải…" : "Tải lại"}</Button>
    </div>
    <p className={styles.description}>{feedback.message}</p>
    <dl className="ops-kv">
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
      {(p) => <Combobox {...p} aria-label="Trạng thái xử lý" value={chosen} disabled={feedback.status === "Closed"} onChange={(value) => setChoice(value as FeedbackStatus)} options={nextStatuses[feedback.status].map((value) => ({ value, label: feedbackStatusLabel(value) }))} groupLabel="Bước tiếp theo" />}
    </Field>
    <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
      <Button onClick={() => void save()} disabled={saving || chosen === feedback.status}>{saving ? "Đang lưu…" : "Lưu trạng thái"}</Button>
    </div>
  </div>;
}

/** Feedback inbox (Figma "Hỗ trợ & audit · Phản hồi"): a row opens the detail drawer; the "···" menu takes the next status step. */
export function AdminFeedbackTab({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const status = get("fbStatus");
  const organizationId = get("fbOrganizationId");
  const feedbackId = get("feedback");
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useAsyncData(
    `admin-feedback:${page}:${status}:${organizationId}`,
    (signal) => supportApi.listFeedback("admin", accessToken, { page, pageSize: PAGE_SIZE, status: status || undefined, organizationId: organizationId || undefined }, signal),
    true,
  );
  const organizations = useAsyncData("admin-feedback:orgs", () => accountsApi.organizations(accessToken), true);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const filtering = Boolean(status || organizationId);
  const open = (id: string) => setParams({ feedback: id, page });

  /** Row-menu step: read the detail for its ETag (the list revision is not the ETag), then PATCH with it. */
  const step = async (item: Feedback) => {
    const next = forwardStep[item.status];
    if (!next || busyId) return;
    setBusyId(item.id);
    try {
      const detail = await supportApi.getFeedback(accessToken, item.id);
      const updated = await supportApi.updateFeedbackStatus(accessToken, item.id, next, detail.etag);
      toast.notify({ tone: "success", title: "Đã cập nhật phản hồi", description: feedbackStatusLabel(updated.feedback.status) });
      list.reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.isPreconditionFailed) toast.notify({ tone: "warning", title: "Phản hồi vừa được cập nhật ở nơi khác", description: "Chưa ghi đè gì. Mở chi tiết để xem trạng thái hiện tại." });
      else toast.notify({ tone: "danger", title: "Không cập nhật được phản hồi", description: errorText(cause, "Hãy thử lại.") });
      list.reload();
    } finally {
      setBusyId(null);
    }
  };

  const columns: DataColumn<Feedback>[] = [
    { key: "message", header: "Phản hồi", primary: true, render: (item) => <CellTitle title={<span className={styles.clip}>{item.message}</span>} sub={item.category} /> },
    { key: "from", header: "Người gửi", width: 220, render: (item) => <CellTitle title={personName(item.createdBy)} sub={organizationName(item.organization)} /> },
    { key: "rating", header: "Đánh giá", width: 110, render: (item) => item.rating === null ? "—" : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={14} aria-hidden="true" />{item.rating}/5</span> },
    { key: "status", header: "Trạng thái", width: 140, render: (item) => <StatusBadge tone={feedbackStatusTone(item.status)}>{feedbackStatusLabel(item.status)}</StatusBadge> },
    { key: "created", header: "Gửi lúc", width: 170, hideBelow: 900, render: (item) => formatDateTime(item.createdAt) },
  ];

  return <>
    <DataTable<Feedback>
      caption="Danh sách phản hồi"
      data-testid="admin-feedback-table"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      loading={list.loading && !list.data}
      onRowClick={(item) => open(item.id)}
      rowTone={(item) => (item.status === "Closed" ? "muted" : undefined)}
      rowMenu={(item) => [
        { label: "Xem chi tiết", icon: Eye, onSelect: () => open(item.id) },
        ...(forwardStep[item.status] ? [{ label: item.status === "Submitted" ? "Đánh dấu đã xem" : "Đóng phản hồi", icon: CheckCheck, onSelect: () => void step(item), disabled: busyId !== null, separator: true }] : []),
      ]}
      error={list.error !== undefined ? <Alert tone="danger" title="Không tải được phản hồi" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{errorText(list.error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert> : undefined}
      toolbar={<>
        <FilterChips label="Bộ lọc phản hồi">
          <FilterChip label="Trạng thái" value={status} onChange={(value) => setParams({ fbStatus: value })} options={feedbackStatusOptions.map((value) => ({ value, label: feedbackStatusLabel(value) }))} />
        </FilterChips>
        <Combobox aria-label="Tổ chức" value={organizationId} onChange={(value) => setParams({ fbOrganizationId: value })} options={(organizations.data?.items ?? []).map((organization) => ({ value: organization.id, label: organization.name }))} placeholder="Tổ chức: tất cả" searchPlaceholder="Tìm tổ chức" groupLabel="Tổ chức" loading={organizations.loading && !organizations.data} clearable className={styles.toolbarPick} />
        {filtering && <Button variant="quiet" onClick={() => setParams({ fbStatus: null, fbOrganizationId: null })}>Xóa bộ lọc</Button>}
      </>}
      empty={<EmptyState icon={filtering ? Search : MessageSquareText} title={filtering ? "Không có phản hồi phù hợp." : "Chưa có phản hồi nào"} description={filtering ? "Thử đổi hoặc xóa bộ lọc." : "Phản hồi của học viên và tổ chức sẽ xuất hiện ở đây."} />}
      pagination={total > PAGE_SIZE ? { page, pageSize: PAGE_SIZE, totalCount: total, onPageChange: setPage } : undefined}
    />
    <p className={styles.hint}>Bấm một hàng để xem người gửi và đổi trạng thái; menu “···” đi bước tiếp theo ngay trên danh sách.</p>

    <PendingBox title="Chưa có từ backend" items={["Tệp đính kèm: API phản hồi chỉ nhận văn bản thuần.", "Thông báo email/push khi phản hồi được xử lý."]} />

    <Drawer open={Boolean(feedbackId)} onOpenChange={(value) => { if (!value) setParams({ feedback: null, page }); }} size="md" data-testid="admin-feedback-drawer" title="Chi tiết phản hồi" description="Xem người gửi, đánh dấu đã xem hoặc đóng phản hồi.">
      {feedbackId && <FeedbackDetail key={feedbackId} id={feedbackId} accessToken={accessToken} onChanged={list.reload} />}
    </Drawer>
  </>;
}
