import type { Tone } from "@/components/ui/status-badge";
import type { LearnKind, LifecycleAction, PostStatus } from "./types";

/** Display + the behavior Docs v7 states for each post status. The backend remains the authority for all of it. */
export const postStatusView: Record<PostStatus, { tone: Tone; label: string; visibility: string }> = {
  Unpublished: { tone: "info", label: "Chưa xuất bản", visibility: "Không công khai, không là nguồn RAG. Chưa từng có bản xuất bản." },
  Published: { tone: "success", label: "Đã xuất bản", visibility: "Công khai cho khách. Bản đang xuất bản là bản được ghim." },
  Hidden: { tone: "neutral", label: "Đã ẩn", visibility: "Không công khai nhưng giữ bản đã ghim và vẫn có thể là nguồn RAG hợp lệ theo quyền backend." },
  Deleted: { tone: "danger", label: "Đã xóa", visibility: "Xóa mềm: không công khai, loại khỏi RAG, vẫn giữ lịch sử và có thể khôi phục." },
};

export const kindLabel: Record<LearnKind, string> = { Article: "Bài viết", Tip: "Mẹo", Video: "Video" };

export const lifecycleActionsFor: Record<PostStatus, LifecycleAction[]> = {
  Unpublished: ["publish", "delete"],
  Published: ["publish", "hide", "delete"],
  Hidden: ["show", "delete"],
  Deleted: ["restore"],
};

export const lifecycleCopy: Record<LifecycleAction, { label: string; title: string; body: string; confirm: string; danger?: boolean }> = {
  publish: { label: "Xuất bản bản nháp", title: "Xuất bản bản nháp này?", body: "Bản nháp trở thành bản công khai và bất biến. Muốn sửa tiếp phải tạo bản nháp mới; bản công khai cũ vẫn hiển thị cho tới khi bản mới được xuất bản.", confirm: "Xuất bản" },
  hide: { label: "Ẩn bài", title: "Ẩn bài khỏi công khai?", body: "Khách không còn đọc được bài. Bài vẫn giữ bản đã xuất bản và có thể là nguồn RAG hợp lệ theo quyền backend. Có thể hiện lại sau.", confirm: "Ẩn bài" },
  show: { label: "Hiện lại", title: "Hiện bài trở lại?", body: "Bài công khai trở lại với bản đã ghim. Cần các nguồn Common đang được duyệt; nếu không backend sẽ từ chối.", confirm: "Hiện bài" },
  delete: { label: "Xóa bài", title: "Xóa mềm bài này?", body: "Bài bị loại khỏi công khai và RAG ngay, lịch sử vẫn được giữ. Bạn có thể khôi phục sau.", confirm: "Xóa bài", danger: true },
  restore: { label: "Khôi phục", title: "Khôi phục bài?", body: "Bài từng công khai quay về trạng thái Đã ẩn; bài chưa từng công khai quay về Chưa xuất bản. Khôi phục không tự công khai bài.", confirm: "Khôi phục" },
};

export const lifecycleDone: Record<LifecycleAction, string> = {
  publish: "Đã xuất bản bài", hide: "Đã ẩn bài", show: "Đã hiện bài", delete: "Đã xóa bài", restore: "Đã khôi phục bài",
};
