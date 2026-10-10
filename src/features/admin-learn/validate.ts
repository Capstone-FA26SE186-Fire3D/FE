import { isSafeImageUrl, parseMediaUrl } from "./media";
import type { CatalogSource, DraftContent } from "./types";

export type DraftIssue = { path: string; message: string };

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug: string): string | undefined {
  if (!slug.trim()) return "Nhập đường dẫn (slug) cho bài.";
  if (slug.length > 120) return "Slug tối đa 120 ký tự.";
  if (!SLUG_PATTERN.test(slug)) return "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang (vd: thoat-nan-khoi-khoi).";
  return undefined;
}

/**
 * Mirror of the editorial rules in the Docs, for instant feedback. `forPublish` adds what publish/show enforce
 * (at least one block, a situation, a video fallback, only Approved Common sources). The backend decides;
 * this never replaces its response.
 */
export function validateDraft(content: DraftContent, options: { forPublish: boolean; sources?: CatalogSource[] }): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!content.title.trim()) issues.push({ path: "title", message: "Nhập tiêu đề." });
  else if (content.title.length > 200) issues.push({ path: "title", message: "Tiêu đề tối đa 200 ký tự." });
  if (content.summary.length > 500) issues.push({ path: "summary", message: "Tóm tắt tối đa 500 ký tự." });
  if (content.coverImageUrl.trim() && !isSafeImageUrl(content.coverImageUrl)) issues.push({ path: "coverImageUrl", message: "Ảnh bìa phải là đường dẫn https." });

  content.blocks.forEach((block, index) => {
    const at = `blocks[${index}]`;
    if ((block.type === "heading" || block.type === "paragraph") && !block.text.trim()) issues.push({ path: at, message: `Khối ${index + 1}: nội dung đang trống.` });
    if (block.type === "image") {
      if (!isSafeImageUrl(block.url)) issues.push({ path: at, message: `Khối ${index + 1}: ảnh phải là đường dẫn https.` });
      if (!block.alt.trim()) issues.push({ path: at, message: `Khối ${index + 1}: thêm mô tả ảnh (alt) để người dùng đọc màn hình nắm được nội dung.` });
    }
    if (block.type === "video") {
      const parsed = parseMediaUrl(block.url);
      if (!parsed.ok) issues.push({ path: at, message: `Khối ${index + 1}: ${parsed.reason}` });
      if (!block.fallbackSummary.trim()) issues.push({ path: at, message: `Khối ${index + 1}: video cần tóm tắt dự phòng để hiển thị khi không mở được video.` });
    }
  });

  if (options.forPublish) {
    if (content.blocks.length === 0) issues.push({ path: "blocks", message: "Cần ít nhất một khối nội dung để xuất bản." });
    if (content.kind === "Video" && !content.blocks.some((block) => block.type === "video")) issues.push({ path: "blocks", message: "Bài loại Video cần ít nhất một khối video." });
    if (content.situationIds.length === 0) issues.push({ path: "situationIds", message: "Chọn ít nhất một tình huống để bài tìm được theo tình huống." });
    const unapproved = (options.sources ?? []).filter((source) => content.sourceIds.includes(source.id) && source.status !== "Approved");
    if (unapproved.length > 0) issues.push({ path: "sourceIds", message: `Nguồn chưa được duyệt: ${unapproved.map((source) => source.title).join("; ")}. Bản nháp có thể giữ, nhưng xuất bản/hiện bài cần nguồn Common đã duyệt.` });
  }
  return issues;
}
