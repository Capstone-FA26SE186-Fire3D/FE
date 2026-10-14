"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { billingApi } from "../api";
import { EXPIRY_REMINDER_DAYS } from "../entitlements";
import { billingErrorText } from "../errors";
import { daysUntil, formatDate, formatDateTime } from "../format";
import "../billing.css";

const PAGE_SIZE = 10;

/**
 * Banner for unread, still-relevant expiry reminders (the BE creates them 5 days before a period ends).
 * Renewal stays a per-Building choice: the banner only points at the reminders.
 */
export function ReminderBanner({ accessToken, refreshKey, onOpen }: { accessToken: string; refreshKey?: number; onOpen: () => void }) {
  const unread = useAsyncData(`billing:notifications:banner:${refreshKey ?? 0}`, (signal) => billingApi.listNotifications(accessToken, { unread: true, pageSize: 20 }, signal));
  const relevant = (unread.data?.items ?? []).filter((item) => item.stillRelevant);
  if (relevant.length === 0) return null;
  return <Alert tone="warning" title={`${relevant.length} nhắc gia hạn chưa đọc`} className="mb-4" action={<Button size="sm" variant="secondary" className="mt-3" onClick={onOpen}>Xem nhắc gia hạn</Button>}>
    {relevant.slice(0, 3).map((item) => `${item.buildingName ?? "Công trình"}: hết hạn ${formatDate(item.referenceEndsAt)}`).join("; ")}{relevant.length > 3 ? "…" : ""}. Hệ thống nhắc trước {EXPIRY_REMINDER_DAYS} ngày; gia hạn chọn lọc theo từng công trình.
  </Alert>;
}

/** Expiry reminders from `GET /api/organizations/me/notifications`; marking read is idempotent (first read time is kept). */
export function NotificationsPanel({ accessToken, onChanged, onRenew }: { accessToken: string; onChanged?: () => void; onRenew?: (buildingId: string) => void }) {
  const toast = useToast();
  const { page, get, setParams, setPage } = useUrlParams({ pageSize: PAGE_SIZE });
  const unreadOnly = get("unread") === "1";
  const list = useAsyncData(`billing:notifications:${page}:${unreadOnly}`, (signal) => billingApi.listNotifications(accessToken, { unread: unreadOnly ? true : undefined, page, pageSize: PAGE_SIZE }, signal));
  const [busy, setBusy] = useState<string | null>(null);

  const markRead = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await billingApi.markNotificationRead(accessToken, id);
      list.reload();
      onChanged?.();
    } catch (cause) {
      toast.notify({ tone: "danger", title: "Không đánh dấu được đã đọc", description: billingErrorText(cause) });
    } finally {
      setBusy(null);
    }
  };

  const items = list.data?.items ?? [];
  return <div className="ops-stack" data-testid="notifications">
    <div className="bill-row">
      <p className="bill-muted">Nhắc gia hạn trước {EXPIRY_REMINDER_DAYS} ngày khi kỳ dịch vụ sắp hết; không còn nhắc cho kỳ đã gia hạn.</p>
      <label className="bill-check"><input type="checkbox" checked={unreadOnly} onChange={(event) => setParams({ unread: event.target.checked ? "1" : null })} /><span>Chỉ chưa đọc</span></label>
    </div>
    {list.error !== undefined && <Alert tone="danger" title="Không tải được thông báo" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>{billingErrorText(list.error)}</Alert>}
    {list.loading && !list.data && <SkeletonRows rows={3} label="Đang tải thông báo…" />}
    {list.data && items.length === 0 && <EmptyState icon={Bell} title={unreadOnly ? "Không có thông báo chưa đọc" : "Chưa có thông báo"} description="Thông báo hết hạn xuất hiện khi một công trình còn dưới 5 ngày dịch vụ mà chưa có kỳ gia hạn." />}
    <ul className="bill-list">
      {items.map((item) => {
        const days = daysUntil(item.referenceEndsAt);
        return <li key={item.id} data-testid="notification" data-read={item.readAt ? "true" : "false"} data-relevant={item.stillRelevant ? "true" : "false"}>
          <div className="bill-row">
            <div style={{ minWidth: 0 }}>
              <strong className="bill-wrap">{item.title}</strong>
              <p className="bill-muted bill-wrap" style={{ margin: "4px 0 0" }}>{item.body}</p>
              <p className="bill-dim" style={{ margin: "6px 0 0" }}>{item.buildingName ?? "Công trình"} · kỳ kết thúc {formatDate(item.referenceEndsAt)}{item.stillRelevant && days !== null && days >= 0 ? ` (còn ${days} ngày)` : ""} · gửi {formatDateTime(item.createdAt)}</p>
            </div>
            <div className="ops-actions">
              {!item.stillRelevant && <StatusBadge tone="neutral">Đã gia hạn hoặc hết kỳ</StatusBadge>}
              {item.readAt ? <StatusBadge tone="neutral">Đã đọc</StatusBadge> : <StatusBadge tone="ember">Chưa đọc</StatusBadge>}
              {item.stillRelevant && onRenew && <Button size="sm" variant="secondary" onClick={() => onRenew(item.buildingId)} aria-label={`Gia hạn ${item.buildingName ?? "công trình"}`}>Gia hạn</Button>}
              {!item.readAt && <Button size="sm" variant="quiet" onClick={() => void markRead(item.id)} disabled={busy === item.id} aria-label={`Đánh dấu đã đọc: ${item.title}`}><CheckCheck size={14} aria-hidden="true" />{busy === item.id ? "Đang lưu…" : "Đã đọc"}</Button>}
            </div>
          </div>
        </li>;
      })}
    </ul>
    {(list.data?.totalCount ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data?.totalCount ?? 0} onPageChange={setPage} disabled={list.loading} />}
  </div>;
}
