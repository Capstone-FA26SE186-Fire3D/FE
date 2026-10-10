"use client";

import { RefreshCw, UserCheck } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/utils/date-range";
import { supportApi } from "../api";
import { allowedTicketTransitions, priorityLabel, priorityOptions, priorityTone, ticketStatusLabel, ticketStatusTone } from "../labels";
import type { AdminTicketUpdate, TicketPriority, TicketStatus } from "../types";
import { errorText, MessageComposer, MessageList, useTicketDetail } from "./ticket-thread";
import styles from "./support.module.css";

export type AdminOption = { id: string; name: string };

/**
 * Admin view of one ticket: summary, assign / transition (PATCH with If-Match "support-N") and the thread.
 * On 412 the admin's pending choices stay in the form; they can load the newer version to compare and save again.
 */
export function AdminTicketPanel({ ticketId, accessToken, myId, admins, onChanged }: {
  ticketId: string;
  accessToken: string;
  myId: string;
  admins: AdminOption[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const { state, error, loading, reload, applyTicket } = useTicketDetail("admin", accessToken, ticketId);
  const [draft, setDraft] = useState<Partial<AdminTicketUpdate>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [staleEtag, setStaleEtag] = useState<string | null>(null);

  if (!state) {
    if (error !== undefined) {
      return <Alert tone="danger" title="Không mở được ticket" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{errorText(error, "Hãy kiểm tra kết nối rồi thử lại.")}</Alert>;
    }
    return <SkeletonRows rows={6} label="Đang tải ticket…" />;
  }

  const { ticket, etag, messages } = state;
  const effective: AdminTicketUpdate = {
    status: draft.status ?? ticket.status,
    priority: draft.priority ?? ticket.priority,
    assignedTo: draft.assignedTo === undefined ? ticket.assignedTo : draft.assignedTo,
  };
  const dirty = effective.status !== ticket.status || effective.priority !== ticket.priority || effective.assignedTo !== ticket.assignedTo;
  const nameOf = (id: string | null) => (id ? admins.find((admin) => admin.id === id)?.name ?? `Quản trị viên khác (${id.slice(0, 8)}…)` : "Chưa phân công");
  const assigneeOptions = [...admins, ...(ticket.assignedTo && !admins.some((admin) => admin.id === ticket.assignedTo) ? [{ id: ticket.assignedTo, name: nameOf(ticket.assignedTo) }] : [])];
  const reloaded = staleEtag !== null && etag !== staleEtag;

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await supportApi.updateTicket(accessToken, ticket.id, effective, etag);
      applyTicket(result.ticket, result.etag);
      setDraft({});
      setStaleEtag(null);
      toast.notify({ tone: "success", title: "Đã cập nhật ticket", description: `${result.ticket.ticketNumber} · ${ticketStatusLabel(result.ticket.status)}` });
      onChanged();
    } catch (cause) {
      if (cause instanceof ApiError && cause.isPreconditionFailed) setStaleEtag(etag);
      else setSaveError(errorText(cause, "Không cập nhật được ticket. Lựa chọn của bạn vẫn được giữ lại; hãy thử lại."));
    } finally {
      setSaving(false);
    }
  };

  const claim = () => setDraft((current) => ({ ...current, assignedTo: myId, ...(ticket.status === "Open" ? { status: "InProgress" as TicketStatus } : {}) }));

  return <div>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span className={styles.mono}>{ticket.ticketNumber}</span>
      <StatusBadge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabel(ticket.status)}</StatusBadge>
      <StatusBadge tone={priorityTone(ticket.priority)}>{priorityLabel(ticket.priority)}</StatusBadge>
      <Button size="sm" variant="quiet" onClick={reload} disabled={loading} aria-label="Tải lại ticket" style={{ marginLeft: "auto" }}><RefreshCw size={14} aria-hidden="true" />{loading ? "Đang tải…" : "Tải lại"}</Button>
    </div>
    <h3 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, overflowWrap: "anywhere" }}>{ticket.subject}</h3>
    <p className={styles.description}>{ticket.description}</p>
    <dl className={styles.meta} style={{ marginTop: 12 }}>
      <dt>Tạo lúc</dt><dd>{formatDateTime(ticket.createdAt)}</dd>
      <dt>Cập nhật</dt><dd>{formatDateTime(ticket.updatedAt)}</dd>
      {ticket.resolvedAt && <><dt>Giải quyết</dt><dd>{formatDateTime(ticket.resolvedAt)}</dd></>}
      <dt>Phụ trách</dt><dd>{nameOf(ticket.assignedTo)}</dd>
    </dl>

    <section className={styles.section} aria-label="Phân công và trạng thái">
      <h3>Phân công &amp; trạng thái</h3>
      {staleEtag !== null && <Alert tone="warning" title={reloaded ? "Đã tải bản mới nhất" : "Ticket vừa được thay đổi ở nơi khác"} action={!reloaded && <Button size="sm" variant="secondary" className="mt-3" onClick={reload} disabled={loading}>{loading ? "Đang tải…" : "Tải bản mới để đối chiếu"}</Button>}>
        {reloaded
          ? `Máy chủ hiện: ${ticketStatusLabel(ticket.status)} · ${priorityLabel(ticket.priority)} · ${nameOf(ticket.assignedTo)}. Lựa chọn của bạn vẫn được giữ; kiểm tra rồi bấm Lưu để áp dụng, hoặc đặt lại.`
          : "Có thể có tin nhắn mới hoặc quản trị viên khác đã cập nhật. Lựa chọn của bạn được giữ nguyên, chưa ghi đè gì."}
      </Alert>}
      <div className="ops-form-grid">
        <Field label="Trạng thái">{(p) => <Select {...p} value={effective.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TicketStatus })}>{allowedTicketTransitions[ticket.status].map((status) => <option key={status} value={status}>{ticketStatusLabel(status)}</option>)}</Select>}</Field>
        <Field label="Ưu tiên">{(p) => <Select {...p} value={effective.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TicketPriority })}>{priorityOptions.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority)}</option>)}</Select>}</Field>
        <Field label="Phân công cho" className="ops-span-all">{(p) => <Select {...p} value={effective.assignedTo ?? ""} onChange={(event) => setDraft({ ...draft, assignedTo: event.target.value || null })}><option value="">Chưa phân công</option>{assigneeOptions.map((admin) => <option key={admin.id} value={admin.id}>{admin.id === myId ? `${admin.name} (tôi)` : admin.name}</option>)}</Select>}</Field>
      </div>
      {saveError && <Alert tone="danger">{saveError}</Alert>}
      <div className="ops-actions">
        <Button onClick={() => void save()} disabled={!dirty || saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</Button>
        {ticket.assignedTo !== myId && <Button variant="secondary" onClick={claim} disabled={saving}><UserCheck size={16} aria-hidden="true" />Nhận xử lý</Button>}
        {dirty && <Button variant="quiet" onClick={() => { setDraft({}); setStaleEtag(null); setSaveError(""); }} disabled={saving}>Đặt lại</Button>}
      </div>
    </section>

    <section className={styles.section} aria-label="Trao đổi">
      <h3>Trao đổi ({state.messageTotal})</h3>
      <MessageList messages={messages} empty="Chưa có tin nhắn nào. Gửi tin đầu tiên để phản hồi người tạo ticket." label={(authorId) => authorId === myId ? { name: "Bạn", mine: true } : admins.some((admin) => admin.id === authorId) ? { name: admins.find((admin) => admin.id === authorId)?.name ?? "Quản trị viên", mine: true } : { name: "Người dùng", mine: false }} />
      <MessageComposer
        ticketId={ticket.id}
        disabledReason={ticket.status === "Closed" ? "Ticket đã đóng. Đổi trạng thái về “Mới” và lưu để tiếp tục trao đổi." : undefined}
        onSend={async (message, key) => {
          await supportApi.addMessage("admin", accessToken, ticket.id, message, key);
          toast.notify({ tone: "success", title: "Đã gửi tin nhắn" });
          reload();
          onChanged();
        }}
      />
    </section>
  </div>;
}
