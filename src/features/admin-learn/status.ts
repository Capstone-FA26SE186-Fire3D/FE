import type { Tone } from "@/components/ui/status-badge";
import type { KnowledgeSource, LifecycleOperation, PostStatus, SourceStatus, VersionStatus } from "./types";

/** What each post status means for readers and for RAG (BE docs/learn-library.md). The backend stays the authority. */
export const postStatusView: Record<PostStatus, { tone: Tone; label: string; visibility: string }> = {
  Unpublished: { tone: "info", label: "Chưa xuất bản", visibility: "Chưa từng có bản công khai. Người đọc nhận 404 và bài không là nguồn RAG." },
  Published: { tone: "success", label: "Đang công khai", visibility: "Khách đọc được bản đang xuất bản. Bản này là nguồn RAG hợp lệ theo quyền backend." },
  Hidden: { tone: "neutral", label: "Đã ẩn", visibility: "Không công khai (người đọc nhận 410, không thấy nội dung). Vẫn giữ bản đã xuất bản và vẫn có thể là nguồn RAG hợp lệ theo quyền backend." },
  Deleted: { tone: "danger", label: "Đã xóa", visibility: "Xóa mềm: không công khai và bị loại khỏi RAG. Lịch sử vẫn được giữ và có thể khôi phục." },
};

export const versionStatusView: Record<VersionStatus, { tone: Tone; label: string }> = {
  Draft: { tone: "warning", label: "Bản nháp" },
  Published: { tone: "success", label: "Đã xuất bản" },
};

export const sourceStatusView: Record<SourceStatus, { tone: Tone; label: string }> = {
  Draft: { tone: "warning", label: "Chưa duyệt" },
  Approved: { tone: "success", label: "Đã duyệt" },
  Retired: { tone: "neutral", label: "Đã ngừng dùng" },
};

/** Operations the backend accepts per status (anything else is 409 LEARN_STATE_CONFLICT). */
export const lifecycleFor: Record<PostStatus, LifecycleOperation[]> = {
  Unpublished: ["delete"],
  Published: ["hide", "delete"],
  Hidden: ["show", "delete"],
  Deleted: ["restore"],
};

export const lifecycleCopy: Record<LifecycleOperation, { label: string; title: string; confirm: string; danger?: boolean; done: string }> = {
  hide: { label: "Ẩn bài", title: "Ẩn bài khỏi công khai?", confirm: "Ẩn bài", done: "Đã ẩn bài", },
  show: { label: "Hiện lại", title: "Hiện bài trở lại?", confirm: "Hiện bài", done: "Đã hiện bài" },
  delete: { label: "Xóa bài", title: "Xóa mềm bài này?", confirm: "Xóa bài", danger: true, done: "Đã xóa bài" },
  restore: { label: "Khôi phục", title: "Khôi phục bài?", confirm: "Khôi phục", done: "Đã khôi phục bài" },
};

export function lifecycleBody(operation: LifecycleOperation, hasPublishedVersion: boolean): string {
  switch (operation) {
    case "hide": return "Khách không còn đọc được bài (nhận 410). Bài giữ bản đã xuất bản, vẫn có thể là nguồn RAG hợp lệ theo quyền backend và hiện lại được.";
    case "show": return "Bài công khai trở lại với bản đã xuất bản gần nhất.";
    case "delete": return "Bài bị loại khỏi công khai và khỏi RAG ngay; lịch sử vẫn được giữ và khôi phục được. Bookmark của học viên hiện là “không còn hiển thị”.";
    case "restore": return hasPublishedVersion ? "Bài từng xuất bản quay về trạng thái Đã ẩn, không tự công khai. Dùng “Hiện lại” sau đó nếu muốn công khai." : "Bài chưa từng xuất bản quay về trạng thái Chưa xuất bản.";
  }
}

export const sourceRoleLabel: Record<string, string> = { Primary: "Nguồn chính", Reference: "Tham khảo", Transcript: "Bản ghi lời" };

/** Why a source cannot be published (from the backend's flags and dates). Null when it can. */
export function publishBlockReason(source: Pick<KnowledgeSource, "approvalStatus" | "canPublishReference" | "effectiveFrom" | "effectiveUntil" | "visibility">, now = Date.now()): string | null {
  if (source.canPublishReference) return null;
  if (source.visibility !== "Common") return "Không phải nguồn Common.";
  if (source.approvalStatus === "Draft") return "Nguồn chưa được duyệt (Draft).";
  if (source.approvalStatus === "Retired") return "Nguồn đã ngừng dùng (Retired).";
  if (source.effectiveFrom && Date.parse(source.effectiveFrom) > now) return "Nguồn chưa đến ngày có hiệu lực.";
  if (source.effectiveUntil && Date.parse(source.effectiveUntil) <= now) return "Nguồn đã hết hiệu lực.";
  return "Nguồn chưa đủ điều kiện làm nguồn trích dẫn khi xuất bản.";
}
