import type { Tone } from "@/components/ui/status-badge";
import type { FeedbackStatus, TicketPriority, TicketStatus } from "./types";

const ticketStatuses: Record<TicketStatus, { label: string; tone: Tone }> = {
  Open: { label: "Mới", tone: "info" },
  InProgress: { label: "Đang xử lý", tone: "warning" },
  Resolved: { label: "Đã giải quyết", tone: "success" },
  Closed: { label: "Đã đóng", tone: "neutral" },
};

export const ticketStatusOptions = Object.keys(ticketStatuses) as TicketStatus[];
export const ticketStatusLabel = (status: string) => ticketStatuses[status as TicketStatus]?.label ?? status;
export const ticketStatusTone = (status: string): Tone => ticketStatuses[status as TicketStatus]?.tone ?? "neutral";

/** Forward flow Open → InProgress → Resolved → Closed; an admin may reopen Resolved/Closed. */
export const allowedTicketTransitions: Record<TicketStatus, TicketStatus[]> = {
  Open: ["Open", "InProgress"],
  InProgress: ["InProgress", "Resolved"],
  Resolved: ["Resolved", "Closed", "Open"],
  Closed: ["Closed", "Open"],
};

const priorities: Record<TicketPriority, { label: string; tone: Tone }> = {
  Low: { label: "Thấp", tone: "neutral" },
  Normal: { label: "Bình thường", tone: "info" },
  High: { label: "Cao", tone: "warning" },
  Urgent: { label: "Khẩn cấp", tone: "danger" },
};
export const priorityOptions = Object.keys(priorities) as TicketPriority[];
export const priorityLabel = (priority: string) => priorities[priority as TicketPriority]?.label ?? priority;
export const priorityTone = (priority: string): Tone => priorities[priority as TicketPriority]?.tone ?? "neutral";

const feedbackStatuses: Record<FeedbackStatus, { label: string; tone: Tone }> = {
  Submitted: { label: "Mới gửi", tone: "info" },
  Reviewed: { label: "Đã xem", tone: "success" },
  Closed: { label: "Đã đóng", tone: "neutral" },
};
export const feedbackStatusOptions = Object.keys(feedbackStatuses) as FeedbackStatus[];
export const feedbackStatusLabel = (status: string) => feedbackStatuses[status as FeedbackStatus]?.label ?? status;
export const feedbackStatusTone = (status: string): Tone => feedbackStatuses[status as FeedbackStatus]?.tone ?? "neutral";

/** Audit `Action` enum names from the BE (`AuditAction`). */
export const auditActions = ["Upload", "ConfirmForTraining", "Reject", "Publish", "Revoke", "Sync", "Login", "Logout", "Download", "Delete", "Create", "Update", "Rollback", "Grant", "Resume", "Payment", "Support"] as const;

export const isGuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
