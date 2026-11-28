import { apiClient } from "@/api/client";
import { ApiError, type PageResponse } from "@/api/types/common";
import type { EditorPreviewV1 } from "@/features/scenario-editor/api";
import { draftEtag } from "@/features/scenario-editor/store/etag";

const auth = (accessToken: string): HeadersInit => ({ Authorization: `Bearer ${accessToken}` });

export type ExpertReviewKind = "Scenario" | "Infrastructure";
export type ExpertReviewStatus = "Submitted" | "Approved" | "Rejected";
export type ExpertAction = "approve" | "reject";
export const REASON_MAX = 2000;

/**
 * BE `ExpertReviewItem` (BE#211, BE#213, BE#242). Every item is assigned round-robin to one FireSafetyExpert; only that
 * expert decides it. `revision` is the ETag number; `revisionId` is the IFC revision. For kind Infrastructure, `reviewId`
 * is the infrastructure id and the scenario fields are null. Also the item shape of `GET /api/admin/reviews`.
 */
export type ExpertReviewItem = {
  reviewId: string;
  /** BE#242: the expert holding the item; all three null while no expert was available (the item waits unassigned). */
  assigneeId: string | null;
  assigneeName: string | null;
  assignedAt: string | null;
  kind: ExpertReviewKind | string;
  status: ExpertReviewStatus | string;
  revision: number;
  scenarioVersionId: string | null;
  revisionId: string;
  submittedBy: string;
  submittedByName: string | null;
  submittedAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  reason: string | null;
  organizationId: string;
  organizationName: string;
  buildingId: string;
  buildingName: string;
  scenarioId: string | null;
  scenarioName: string | null;
  versionNumber: number;
  infrastructureId: string | null;
};

export type ExpertReviewPage = PageResponse<ExpertReviewItem>;
/** `assignee` query of BE#242: `me` (the server's default, the items assigned to the caller) or `all`. */
export type ExpertAssigneeFilter = "me" | "all";

/** Display name of the holder; an assigned item whose name is missing still reads as an expert. */
export const assigneeLabel = (item: Pick<ExpertReviewItem, "assigneeName">) => item.assigneeName?.trim() || "Chuyên viên PCCC";

/** Scenario: `content` is the frozen merged document (scenario objects + infrastructure items). Infrastructure: `{geometry, runtimeVersion, items}`. */
export type ExpertReviewDetail = { review: ExpertReviewItem; content: unknown | null; rubric: unknown | null; learningObjectives: unknown | null; learnerInstructions: string | null };
export type LoadedExpertReview = { detail: ExpertReviewDetail; etag: string | null };
export type ExpertReviewQuery = { kind?: ExpertReviewKind; status?: ExpertReviewStatus; assignee?: ExpertAssigneeFilter; page: number; pageSize: number };

export const expertReviewsApi = {
  list(accessToken: string, query: ExpertReviewQuery, signal?: AbortSignal) {
    return apiClient.request<ExpertReviewPage>("/api/expert/reviews", { headers: auth(accessToken), query, signal });
  },
  async detail(accessToken: string, reviewId: string, signal?: AbortSignal): Promise<LoadedExpertReview> {
    const response = await apiClient.requestWithMeta<ExpertReviewDetail>(`/api/expert/reviews/${encodeURIComponent(reviewId)}`, { headers: auth(accessToken), signal });
    return { detail: response.data, etag: draftEtag(response.headers, response.data.review.revision) };
  },
  /** The 3D model of the reviewed revision (same shape as the editor preview), signed for a short time. */
  preview(accessToken: string, reviewId: string, signal?: AbortSignal) {
    return apiClient.request<EditorPreviewV1>(`/api/expert/reviews/${encodeURIComponent(reviewId)}/preview`, { headers: auth(accessToken), signal });
  },
  /** `If-Match` (the review's revision) + `Idempotency-Key`. Reject carries a reason of 1–2000 characters; approve has no body. */
  decide(accessToken: string, action: ExpertAction, reviewId: string, etag: string, idempotencyKey: string, reason?: string) {
    return apiClient.request<ExpertReviewItem>(`/api/expert/reviews/${encodeURIComponent(reviewId)}/${action}`, {
      headers: auth(accessToken), method: "POST", ifMatch: etag, idempotencyKey, ...(action === "reject" ? { json: { reason: (reason ?? "").trim() } } : {}),
    });
  },
};

export function validateReason(reason: string): string | undefined {
  const length = reason.trim().length;
  if (length === 0) return `Nhập lý do chưa đạt (1–${REASON_MAX} ký tự).`;
  if (length > REASON_MAX) return `Lý do tối đa ${REASON_MAX} ký tự (đang ${length}).`;
  return undefined;
}

/**
 * How the dialog reacts to a failed decision.
 * - `reload`: the server's state is the truth (someone decided first, the content changed, no access): close and re-read.
 * - `fix`: the reason is invalid.
 * - `retry`: nothing is known to be written (network, 429/5xx): the same Idempotency-Key makes a retry safe.
 */
export type DecisionFailure = { kind: "retry" | "reload" | "fix"; message: string; code?: string };

export function describeDecisionError(error: unknown): DecisionFailure {
  if (!(error instanceof ApiError)) return { kind: "retry", message: "Không kết nối được tới máy chủ hoặc chưa nhận được phản hồi. Bấm Thử lại an toàn: kết quả không bị ghi hai lần." };
  const code = error.code;
  if (error.status === 412) return { kind: "reload", code, message: "Một Chuyên viên PCCC khác vừa thẩm định mục này trước bạn. Đang tải lại kết quả hiện tại." };
  if (code === "CONTENT_REVIEW_NOT_PENDING" || code === "FIRE_INFRASTRUCTURE_NOT_PENDING") return { kind: "reload", code, message: "Mục này đã có kết quả thẩm định và kết quả không đổi được. Đang tải lại." };
  if (code === "CONTENT_HASH_MISMATCH") return { kind: "reload", code, message: "Nội dung đã thay đổi so với bản bạn đang xem. Đang tải lại; hãy xem lại rồi thẩm định." };
  if (code === "IDEMPOTENCY_KEY_CONFLICT" || error.status === 409 || error.status === 428) return { kind: "reload", code, message: "Kết quả không ghi được ở trạng thái hiện tại. Đang tải lại để hiển thị trạng thái đúng." };
  if (code === "REVIEW_NOT_ASSIGNED_TO_YOU") return { kind: "reload", code, message: "Mục này đã giao cho Chuyên viên khác nên bạn không quyết định được. Tải lại để xem người đang giữ." };
  if (error.status === 401) return { kind: "reload", code, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại; chưa có kết quả nào được ghi." };
  if (error.status === 403) return { kind: "reload", code, message: "Chỉ Chuyên viên PCCC thẩm định được mục này." };
  if (error.status === 404) return { kind: "reload", code, message: "Không tìm thấy mục này. Có thể tổ chức hoặc công trình đã bị vô hiệu hóa." };
  if (error.status === 400) return { kind: "fix", code, message: error.fieldMessage("reason") ?? "Lý do chưa hợp lệ. Hãy kiểm tra rồi gửi lại." };
  if (error.isRateLimited) return { kind: "retry", code, message: `Máy chủ đang bận.${error.retryAfterSeconds ? ` Thử lại sau ${error.retryAfterSeconds} giây.` : " Thử lại sau ít phút."}` };
  return { kind: "retry", code, message: "Chưa ghi được kết quả. Lý do bạn nhập vẫn được giữ; bấm Thử lại an toàn." };
}

export const KIND_LABEL: Record<string, string> = { Scenario: "Tình huống", Infrastructure: "Hạ tầng PCCC" };
export const STATUS_LABEL: Record<string, { label: string; tone: "info" | "success" | "danger" | "neutral" }> = {
  Submitted: { label: "Chờ thẩm định", tone: "info" },
  Approved: { label: "Đạt thẩm định", tone: "success" },
  Rejected: { label: "Chưa đạt", tone: "danger" },
};
export const statusOf = (status: string) => STATUS_LABEL[status] ?? { label: "Không rõ", tone: "neutral" as const };
/** What the row is called: the scenario name, or the infrastructure of a building. */
export const reviewTitle = (item: ExpertReviewItem) => (item.kind === "Infrastructure" ? `Hạ tầng PCCC · ${item.buildingName}` : item.scenarioName ?? "Tình huống");
