"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api";
import { useIdempotencyKey } from "@/api/idempotency";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { formatDateTime } from "@/utils/date-range";
import { supportApi, type TicketScope } from "../api";
import type { SupportMessage, Ticket } from "../types";
import styles from "./support.module.css";

const MESSAGE_PAGE_SIZE = 100;
const MAX_MESSAGE_PAGES = 10;
export const MESSAGE_MAX = 10000;

export type TicketDetailState = { ticket: Ticket; etag: string; messages: SupportMessage[]; messageTotal: number };

/**
 * Loads a ticket plus its whole message history (ascending). Message pages are fetched until `total` is
 * reached (capped), so the newest message is always in view after a reload.
 */
async function loadDetail(scope: TicketScope, accessToken: string, id: string, signal: AbortSignal): Promise<TicketDetailState> {
  const first = await supportApi.getTicket(scope, accessToken, id, { page: 1, pageSize: MESSAGE_PAGE_SIZE }, signal);
  const messages = [...(first.ticket.messages?.items ?? [])];
  const total = first.ticket.messages?.total ?? messages.length;
  for (let page = 2; messages.length < total && page <= MAX_MESSAGE_PAGES; page += 1) {
    const next = await supportApi.getTicket(scope, accessToken, id, { page, pageSize: MESSAGE_PAGE_SIZE }, signal);
    messages.push(...(next.ticket.messages?.items ?? []));
  }
  return { ticket: first.ticket, etag: first.etag, messages, messageTotal: total };
}

export function useTicketDetail(scope: TicketScope, accessToken: string | null, id: string) {
  const [state, setState] = useState<TicketDetailState | null>(null);
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      loadDetail(scope, accessToken, id, controller.signal)
        .then((value) => { if (!controller.signal.aborted) setState(value); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [scope, accessToken, id, token]);

  const reload = useCallback(() => setToken((value) => value + 1), []);
  /** Applies a fresh ticket body (e.g. the PATCH response) without refetching; keeps the loaded messages. */
  const applyTicket = useCallback((ticket: Ticket, etag: string) => {
    setState((current) => (current ? { ...current, ticket: { ...ticket, messages: current.ticket.messages }, etag } : current));
  }, []);
  return { state, error, loading, reload, applyTicket };
}

export function errorText(cause: unknown, fallback: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    if (cause.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (cause.status === 404) return "Không tìm thấy mục này. Có thể đã bị xóa hoặc bạn không có quyền xem.";
    if (cause.status === 429) return cause.retryAfterSeconds ? `Thao tác quá nhanh. Thử lại sau ${cause.retryAfterSeconds} giây.` : "Thao tác quá nhanh. Hãy thử lại sau ít phút.";
    if (cause.code === "TICKET_CLOSED") return "Ticket đã đóng nên không nhận tin nhắn mới. Mở lại ticket để tiếp tục trao đổi.";
    if (cause.code === "IDEMPOTENCY_KEY_CONFLICT") return "Yêu cầu trước đó đã được gửi với nội dung khác. Hãy tải lại rồi gửi lại.";
    if (cause.status >= 400 && cause.status < 500 && cause.message) return cause.message;
  }
  return fallback;
}

export function MessageList({ messages, label, empty }: { messages: SupportMessage[]; label: (authorId: string) => { name: string; mine: boolean }; empty: string }) {
  if (!messages.length) return <p className={styles.muted}>{empty}</p>;
  return <ol className={styles.thread} aria-label="Lịch sử trao đổi">
    {messages.map((message) => {
      const author = label(message.authorId);
      return <li key={message.id} className={styles.bubble} data-mine={author.mine ? "true" : undefined}>
        <div className={styles.bubbleMeta}><strong>{author.name}</strong><time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time></div>
        <p>{message.message}</p>
      </li>;
    })}
  </ol>;
}

/**
 * Message composer. The Idempotency-Key is bound to the trimmed text: a retry after an error/timeout or a
 * double click replays the same operation; changing the text mints a new key; success clears it.
 */
export function MessageComposer({ ticketId, disabledReason, onSend }: { ticketId: string; disabledReason?: string; onSend: (message: string, idempotencyKey: string) => Promise<void> }) {
  const { keyFor, done } = useIdempotencyKey();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const trimmed = text.trim();
  const tooLong = trimmed.length > MESSAGE_MAX;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !trimmed || tooLong || disabledReason) return;
    inFlight.current = true;
    setSending(true);
    setError("");
    try {
      await onSend(trimmed, keyFor({ ticketId, message: trimmed }));
      done();
      setText("");
    } catch (cause) {
      setError(errorText(cause, "Không gửi được tin nhắn. Nội dung của bạn vẫn được giữ lại; bấm Gửi để thử lại."));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return <form onSubmit={submit} noValidate className="ops-stack" style={{ gap: 10 }}>
    <Field label="Tin nhắn mới" hint={`${trimmed.length.toLocaleString("vi-VN")} / ${MESSAGE_MAX.toLocaleString("vi-VN")} ký tự`} error={tooLong ? `Tin nhắn tối đa ${MESSAGE_MAX.toLocaleString("vi-VN")} ký tự.` : undefined}>
      {(p) => <Textarea {...p} rows={3} value={text} disabled={Boolean(disabledReason)} onChange={(event) => setText(event.target.value)} placeholder="Nhập nội dung trao đổi…" />}
    </Field>
    {disabledReason && <Alert tone="info">{disabledReason}</Alert>}
    {error && <Alert tone="danger">{error}</Alert>}
    <div className="ops-actions" style={{ justifyContent: "flex-end" }}>
      <Button type="submit" disabled={sending || !trimmed || tooLong || Boolean(disabledReason)}><Send size={16} aria-hidden="true" />{sending ? "Đang gửi…" : "Gửi tin nhắn"}</Button>
    </div>
  </form>;
}
