import { stableStringify } from "@/api/idempotency";
import { POST_SLUG_MAX, SLUG_PATTERN } from "@/features/learn/slug";
import { blocksFromWire, blocksToWire, checkBlocks, MARKUP, MARKUP_MESSAGE, type EditorBlock } from "./blocks";
import type { AdminVersion, LearnKind, SituationRef, VersionInput } from "./types";

/** What the editor form holds for one version. */
export type SourceEntry = { sourceId: string; role: string; locator: Record<string, unknown>; title: string; versionLabel: string };
export type EditorContent = {
  kind: LearnKind;
  title: string;
  summary: string;
  coverImageUrl: string;
  blocks: EditorBlock[];
  situations: SituationRef[];
  sources: SourceEntry[];
};

export const emptyContent = (): EditorContent => ({ kind: "Article", title: "", summary: "", coverImageUrl: "", blocks: [], situations: [], sources: [] });

export function contentFromVersion(version: AdminVersion): EditorContent {
  return {
    kind: version.kind,
    title: version.title,
    summary: version.summary,
    coverImageUrl: version.coverImageUrl ?? "",
    blocks: blocksFromWire(version.blocks),
    situations: version.situations,
    sources: version.sources.map((source) => ({ sourceId: source.sourceId, role: source.role, locator: source.locator, title: source.title, versionLabel: source.versionLabel })),
  };
}

/** Request body. Situation and source lists are put in a fixed order so equal content always serializes the same. */
export function toVersionInput(content: EditorContent): VersionInput {
  return {
    kind: content.kind,
    title: content.title.trim(),
    summary: content.summary.trim(),
    coverImageUrl: content.coverImageUrl.trim() || null,
    blocks: blocksToWire(content.blocks),
    situationIds: [...new Set(content.situations.map((item) => item.id))].sort(),
    sources: [...content.sources].sort((a, b) => (a.sourceId + a.role).localeCompare(b.sourceId + b.role)).map((source) => ({ sourceId: source.sourceId, role: source.role, locator: source.locator })),
  };
}

export const fingerprint = (content: EditorContent) => stableStringify(toVersionInput(content));

export type ContentIssue = { path: string; message: string };

const isHttpsCover = (value: string) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
};

/** Mirror of the backend's `LearnContent.Normalize` rules for instant feedback; the backend's answer is what counts. */
export function checkContent(content: EditorContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const title = content.title.trim();
  const summary = content.summary.trim();
  if (!title) issues.push({ path: "$.title", message: "Nhập tiêu đề (1–255 ký tự)." });
  else if (title.length > 255) issues.push({ path: "$.title", message: "Tiêu đề tối đa 255 ký tự." });
  else if (MARKUP.test(title)) issues.push({ path: "$.title", message: MARKUP_MESSAGE });
  if (!summary) issues.push({ path: "$.summary", message: "Nhập tóm tắt (1–2000 ký tự). Tóm tắt cũng là nội dung hiển thị thay cho video không nhúng được." });
  else if (summary.length > 2000) issues.push({ path: "$.summary", message: "Tóm tắt tối đa 2000 ký tự." });
  else if (MARKUP.test(summary)) issues.push({ path: "$.summary", message: MARKUP_MESSAGE });
  if (content.coverImageUrl.trim() && !isHttpsCover(content.coverImageUrl.trim())) issues.push({ path: "$.coverImageUrl", message: "Ảnh bìa phải là đường dẫn https tuyệt đối, không chứa thông tin đăng nhập." });
  for (const issue of checkBlocks(content.blocks)) issues.push({ path: issue.path, message: issue.index >= 0 ? `Khối ${issue.index + 1}: ${issue.message}` : issue.message });
  if (content.kind === "Video" && !content.blocks.some((block) => block.type === "video")) issues.push({ path: "$.blocks", message: "Bài loại Video cần ít nhất một khối video." });
  if (content.situations.length > 20) issues.push({ path: "$.situationIds", message: "Tối đa 20 tình huống." });
  if (content.sources.length > 20) issues.push({ path: "$.sources", message: "Tối đa 20 nguồn." });
  return issues;
}

/** Human labels of the parts that differ between the user's form and the server's version (for 412 comparison). */
export function describeDifferences(mine: EditorContent, server: AdminVersion): string[] {
  const theirs = toVersionInput(contentFromVersion(server));
  const own = toVersionInput(mine);
  const out: string[] = [];
  if (own.title !== theirs.title) out.push(`tiêu đề (máy chủ: “${theirs.title}”)`);
  if (own.summary !== theirs.summary) out.push("tóm tắt");
  if (own.kind !== theirs.kind) out.push(`loại bài (máy chủ: ${theirs.kind})`);
  if (own.coverImageUrl !== theirs.coverImageUrl) out.push("ảnh bìa");
  if (stableStringify(own.blocks) !== stableStringify(theirs.blocks)) out.push("khối nội dung");
  if (stableStringify(own.situationIds) !== stableStringify(theirs.situationIds)) out.push("tình huống");
  if (stableStringify(own.sources) !== stableStringify(theirs.sources)) out.push("nguồn");
  return out;
}

export function checkSlug(slug: string): string | undefined {
  if (!slug.trim()) return "Nhập đường dẫn (slug) cho bài.";
  if (slug.length > POST_SLUG_MAX) return `Slug tối đa ${POST_SLUG_MAX} ký tự.`;
  if (!SLUG_PATTERN.test(slug)) return "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang (ví dụ: thoat-nan-khoi-khoi).";
  return undefined;
}
