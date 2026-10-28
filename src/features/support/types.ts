export type TicketStatus = "Open" | "InProgress" | "Resolved" | "Closed";
export type TicketPriority = "Low" | "Normal" | "High" | "Urgent";
export type FeedbackStatus = "Submitted" | "Reviewed" | "Closed";

/** Support envelope is `{items,total,page,pageSize}` (not `totalCount`). */
export type SupportPage<T> = { items: T[]; total: number; page: number; pageSize: number };

/** Ticket count per status in the caller's scope (other filters applied, status filter ignored). Every key is present. */
export type SupportTicketStatusCounts = Record<TicketStatus, number>;
/** BE `SupportTicketPage`: `total` follows every filter including status; `counts` ignores status. */
export type SupportTicketPage = SupportPage<Ticket> & { counts: SupportTicketStatusCounts };

/**
 * Who sent a ticket/feedback/message. `displayName` is the current label (not a snapshot) and is null when the
 * user was deleted (`available:false`). `email` is only present in PlatformAdmin responses (`/api/admin/...`).
 */
export type SupportPerson = { id: string; displayName: string | null; available: boolean; email?: string | null };
/** The organization stored on the resource when it was created, not the creator's current membership. */
export type SupportOrganization = { id: string; name: string | null; available: boolean };

export type SupportMessage = { id: string; authorId: string; message: string; createdAt: string; author?: SupportPerson | null };

export type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string | null;
  resolvedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Only present on detail responses. */
  messages?: SupportPage<SupportMessage>;
  createdBy?: SupportPerson | null;
  organization?: SupportOrganization | null;
};

export type Feedback = {
  id: string;
  category: string;
  message: string;
  rating: number | null;
  status: FeedbackStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: SupportPerson | null;
  organization?: SupportOrganization | null;
};

export type SupportFilters = {
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: string;
  assignedTo?: string;
  organizationId?: string;
};

/** `feedbackId` / `sessionId` optionally link the ticket to a feedback or a learner session (BE `CreateTicketRequest`). */
export type CreateTicketInput = { subject: string; description: string; feedbackId?: string; sessionId?: string };
export type CreateFeedbackInput = { category: string; message: string; rating?: number; sessionId?: string };
/** `reason` (1-1000 chars, optional) is recorded only in the audit trail. */
export type AdminTicketUpdate = { status: TicketStatus; priority: TicketPriority; assignedTo: string | null; reason?: string };
export type AdminFeedbackUpdate = { status: FeedbackStatus; reason?: string };

export type AuditLog = {
  id: string;
  userId: string | null;
  organizationId: string | null;
  action: string;
  targetEntity: string | null;
  targetId: string | null;
  correlationId: string | null;
  createdAt: string;
  /** Current labels; null when unknown or deleted. */
  actorDisplayName?: string | null;
  organizationName?: string | null;
  /** BE `AuditMetadata.ActorType` (e.g. user vs system writer); null when unknown. */
  actorType?: string | null;
};

/** Allowlisted field change: values are only status/priority names, GUIDs, dates, booleans or non-negative numbers. */
export type AuditFieldChange = { field: string; before: unknown; after: unknown };
/** `reason` is administrative free text; this UI never renders it, only whether one was recorded. */
export type AuditDetail = AuditLog & { changes: AuditFieldChange[]; reason?: string | null };

export type AuditFilters = {
  actorId?: string;
  organizationId?: string;
  action?: string;
  targetEntity?: string;
  targetId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/** Audit envelope also echoes the effective range (defaults to the last 30 days). */
export type AuditPage = { items: AuditLog[]; total: number; page: number; pageSize: number; from: string; to: string };
