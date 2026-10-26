import type { Tone } from "@/components/ui/status-badge";
import type { FeedbackStatus, SupportOrganization, SupportPerson, TicketPriority, TicketStatus } from "./types";

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

const auditActionLabels: Record<string, string> = {
  Upload: "Tải lên", ConfirmForTraining: "Chốt gói phát hành", Reject: "Từ chối", Publish: "Phát hành", Revoke: "Thu hồi",
  Sync: "Đồng bộ", Login: "Đăng nhập", Logout: "Đăng xuất", Download: "Tải xuống", Delete: "Xóa", Create: "Tạo mới",
  Update: "Cập nhật", Rollback: "Quay về bản trước", Grant: "Cấp quyền sử dụng", Resume: "Tiếp tục", Payment: "Thanh toán", Support: "Hỗ trợ",
};
export const auditActionLabel = (action: string) => auditActionLabels[action] ?? "Thao tác khác";

/** Audit `TargetEntity` values are table or class names ("organizations", "SupportTicket"); show them as plain words. */
const auditTargetLabels: Record<string, string> = {
  release: "Bản phát hành", servicepackage: "Gói dịch vụ", quotation: "Báo giá", serviceentitlement: "Quyền sử dụng",
  billingaiquotagrant: "Hạn mức AI", supportticket: "Yêu cầu hỗ trợ", feedback: "Phản hồi", scenariocontentreview: "Lượt duyệt kịch bản",
  scenarioversion: "Phiên bản kịch bản", user: "Tài khoản", organization: "Tổ chức", building: "Công trình", processingjob: "Lượt xử lý IFC",
  billingcheckoutoperation: "Thanh toán", billingquotapolicyversion: "Chính sách hạn mức", enterprisequoterequest: "Yêu cầu báo giá doanh nghiệp",
  servicepackagediscountrule: "Quy tắc giảm giá", legacy: "Dữ liệu cũ",
};
export function auditTargetLabel(entity: string | null | undefined): string {
  if (!entity) return "—";
  const key = entity.toLowerCase().replace(/_/g, "").replace(/s$/, "");
  return auditTargetLabels[key] ?? "Đối tượng khác";
}

export const isGuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());

/** The BE keeps the ID but nulls the label when a user was deleted (`available:false`). */
export function personName(person: SupportPerson | null | undefined): string {
  if (!person) return "Chưa có thông tin người gửi";
  const name = person.displayName?.trim();
  if (name) return name;
  return person.available ? "Người dùng chưa có tên hiển thị" : "Tài khoản đã bị xóa";
}

/** A `null` organization means the resource has none (for example feedback from a Trainee). */
export function organizationName(organization: SupportOrganization | null | undefined): string {
  if (!organization) return "Không thuộc tổ chức";
  const name = organization.name?.trim();
  if (name) return name;
  return organization.available ? "Tổ chức chưa có tên" : "Tổ chức đã bị xóa";
}

const auditFieldLabels: Record<string, string> = {
  status: "Trạng thái", priority: "Ưu tiên", assignedTo: "Phụ trách", revision: "Phiên bản", resolvedAt: "Giải quyết lúc",
  reviewedBy: "Người xem xét", reviewedAt: "Xem xét lúc", submittedBy: "Người gửi", submittedAt: "Gửi lúc",
  publishedAt: "Phát hành lúc", publishedBy: "Người phát hành", revokedAt: "Thu hồi lúc", revokedBy: "Người thu hồi",
  isActive: "Đang hoạt động", commercialVersion: "Phiên bản thương mại", unitPrice: "Đơn giá", subtotalAmount: "Tạm tính",
  discountAmount: "Giảm giá", taxAmount: "Thuế", totalAmount: "Tổng cộng", durationMonths: "Thời hạn (tháng)",
  learnerLimit: "Giới hạn học viên", aiQuotaUnits: "Hạn mức AI", startsAt: "Bắt đầu", endsAt: "Kết thúc",
  buildingId: "Công trình", servicePackageId: "Gói dịch vụ", quotaUnits: "Hạn mức", quotaUnit: "Đơn vị hạn mức",
  policyVersionId: "Phiên bản chính sách", rollover: "Chuyển kỳ", reviewId: "Lượt duyệt", scenarioVersionId: "Phiên bản kịch bản",
  revisionId: "Bản IFC", validationRunId: "Lần kiểm tra", candidateArtifactId: "Tệp kết quả chờ duyệt", annotationSetId: "Bộ ghi chú",
  packageRevision: "Phiên bản gói", aiPolicyVersionId: "Phiên bản chính sách AI",
};
export const auditFieldLabel = (field: string) => auditFieldLabels[field] ?? "Thông tin khác";

const statusWords: Record<string, string> = {
  Open: "Mới", InProgress: "Đang xử lý", Resolved: "Đã giải quyết", Closed: "Đã đóng", Submitted: "Mới gửi", Reviewed: "Đã xem",
  Draft: "Bản nháp", Issued: "Đã phát hành báo giá", Accepted: "Đã chấp nhận", Expired: "Hết hạn", Cancelled: "Đã hủy", Active: "Đang dùng",
  Suspended: "Tạm ngưng", Approved: "Đã duyệt", Rejected: "Bị từ chối", Built: "Đã tạo", Published: "Đã phát hành", Revoked: "Đã thu hồi",
  ConfirmForTraining: "Đã chốt gói phát hành", Low: "Thấp", Normal: "Bình thường", High: "Cao", Urgent: "Khẩn cấp",
};

/** Renders one allowlisted audit value. Anything that is not a plain scalar shows as unavailable instead of raw JSON. */
export function formatAuditValue(value: unknown, formatDate: (iso: string) => string): { text: string; title?: string; mono?: boolean } {
  if (value === null || value === undefined) return { text: "Chưa có" };
  if (typeof value === "boolean") return { text: value ? "Có" : "Không" };
  if (typeof value === "number") return { text: value.toLocaleString("vi-VN") };
  if (typeof value === "string") {
    if (isGuid(value)) return { text: `${value.slice(0, 8)}…`, title: value, mono: true };
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))) return { text: formatDate(value) };
    return { text: statusWords[value] ?? value };
  }
  return { text: "Không hiển thị" };
}
