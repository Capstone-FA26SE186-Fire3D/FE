export type TicketStatus = "Open" | "InProgress" | "Resolved" | "Closed";
export type TicketPriority = "Low" | "Normal" | "High" | "Urgent";
export type FeedbackStatus = "Submitted" | "Reviewed" | "Closed";

/** Support envelope is `{items,total,page,pageSize}` (not `totalCount`). */
export type SupportPage<T> = { items: T[]; total: number; page: number; pageSize: number };

export type SupportMessage = { id: string; authorId: string; message: string; createdAt: string };

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
};

export type SupportFilters = {
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: string;
  assignedTo?: string;
  organizationId?: string;
};

export type CreateTicketInput = { subject: string; description: string };
export type CreateFeedbackInput = { category: string; message: string; rating?: number };
export type AdminTicketUpdate = { status: TicketStatus; priority: TicketPriority; assignedTo: string | null };

export type AuditLog = {
  id: string;
  userId: string | null;
  organizationId: string | null;
  action: string;
  targetEntity: string | null;
  targetId: string | null;
  correlationId: string | null;
  createdAt: string;
};

export type AuditFilters = {
  actorId?: string;
  organizationId?: string;
  action?: string;
  targetId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/** Audit envelope also echoes the effective range (defaults to the last 30 days). */
export type AuditPage = { items: AuditLog[]; total: number; page: number; pageSize: number; from: string; to: string };
