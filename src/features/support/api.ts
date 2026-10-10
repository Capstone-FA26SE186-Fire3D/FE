import { apiClient } from "@/api/client";
import type {
  AdminTicketUpdate,
  AuditFilters,
  AuditLog,
  AuditPage,
  CreateFeedbackInput,
  CreateTicketInput,
  Feedback,
  FeedbackStatus,
  SupportFilters,
  SupportMessage,
  SupportPage,
  Ticket,
} from "./types";

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

/** Support ETag is `"support-<revision>"`; the body always carries `revision`, so fall back to it. */
export const supportEtag = (revision: number) => `"support-${revision}"`;
const etagOf = (headers: Headers, revision: number) => headers.get("etag") ?? supportEtag(revision);

export type TicketWithEtag = { ticket: Ticket; etag: string };
type MessagePaging = { page?: number; pageSize?: number };

export type TicketScope = "user" | "admin";

const ticketsBase = (scope: TicketScope) => (scope === "admin" ? "/api/admin/support/tickets" : "/api/support/tickets");

export const supportApi = {
  listTickets(scope: TicketScope, accessToken: string, filters: SupportFilters, signal?: AbortSignal) {
    return apiClient.request<SupportPage<Ticket>>(ticketsBase(scope), { headers: auth(accessToken), query: filters, signal });
  },
  async getTicket(scope: TicketScope, accessToken: string, id: string, paging: MessagePaging = {}, signal?: AbortSignal): Promise<TicketWithEtag> {
    const response = await apiClient.requestWithMeta<Ticket>(`${ticketsBase(scope)}/${id}`, { headers: auth(accessToken), query: { page: paging.page ?? 1, pageSize: paging.pageSize ?? 100 }, signal });
    return { ticket: response.data, etag: etagOf(response.headers, response.data.revision) };
  },
  /** One idempotency key per message intent: pass the same key when retrying the same text. */
  addMessage(scope: TicketScope, accessToken: string, id: string, message: string, idempotencyKey: string) {
    return apiClient.request<SupportMessage>(`${ticketsBase(scope)}/${id}/messages`, { headers: auth(accessToken), json: { message }, idempotencyKey });
  },
  createTicket(accessToken: string, input: CreateTicketInput, idempotencyKey: string) {
    return apiClient.request<Ticket>("/api/support/tickets", { headers: auth(accessToken), json: input, idempotencyKey });
  },
  /** PlatformAdmin only. `etag` must be the `"support-N"` of the ticket as last read; 412 means it changed. */
  async updateTicket(accessToken: string, id: string, input: AdminTicketUpdate, etag: string): Promise<TicketWithEtag> {
    const response = await apiClient.requestWithMeta<Ticket>(`/api/admin/support/tickets/${id}`, { headers: auth(accessToken), json: input, method: "PATCH", ifMatch: etag });
    return { ticket: response.data, etag: etagOf(response.headers, response.data.revision) };
  },

  listFeedback(scope: TicketScope, accessToken: string, filters: SupportFilters, signal?: AbortSignal) {
    return apiClient.request<SupportPage<Feedback>>(scope === "admin" ? "/api/admin/feedback" : "/api/feedback", { headers: auth(accessToken), query: filters, signal });
  },
  createFeedback(accessToken: string, input: CreateFeedbackInput, idempotencyKey: string) {
    return apiClient.request<Feedback>("/api/feedback", { headers: auth(accessToken), json: input, idempotencyKey });
  },
  updateFeedbackStatus(accessToken: string, id: string, status: FeedbackStatus, revision: number) {
    return apiClient.request<Feedback>(`/api/admin/feedback/${id}/status`, { headers: auth(accessToken), json: { status }, method: "PATCH", ifMatch: supportEtag(revision) });
  },

  listAuditLogs(accessToken: string, filters: AuditFilters, signal?: AbortSignal) {
    return apiClient.request<AuditPage>("/api/admin/audit-logs", { headers: auth(accessToken), query: filters, signal });
  },
};

export type { AuditLog };
