import { stripAccents } from "@/utils/strip-accents";
import { newBlock, updateFields, type EditorBlock, type KnownType } from "./blocks";

/*
 * Docs-style editing on top of `fet3d.learn/1` blocks (Figma "Learn · Trình soạn v3"). The toolbar and the "/" menu only
 * change a block's type or insert blocks the API accepts today; text formatting inside a block waits for BE#172.
 */

const text = (value: unknown) => (typeof value === "string" ? value : "");
const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
/** The block's plain text, whatever its type (a list joins its items one per line). */
export function blockText(block: EditorBlock): string {
  if (block.type === "list") return (Array.isArray(block.fields.items) ? block.fields.items.map(text) : []).join("\n");
  return text(block.fields.text);
}

/** Paragraph style of a text block for the toolbar's style menu. */
export type DocStyle = "paragraph" | "h2" | "h3" | "h4";
export const DOC_STYLES: Array<{ value: DocStyle; label: string }> = [
  { value: "paragraph", label: "Đoạn văn" },
  { value: "h2", label: "Tiêu đề lớn" },
  { value: "h3", label: "Tiêu đề vừa" },
  { value: "h4", label: "Tiêu đề nhỏ" },
];
export function styleOf(block: EditorBlock | undefined): DocStyle | null {
  if (!block) return null;
  if (block.type === "paragraph") return "paragraph";
  if (block.type === "heading") return block.fields.level === 3 ? "h3" : block.fields.level === 4 ? "h4" : "h2";
  return null;
}
/** Same text, another style. Only paragraphs and headings have a style; anything else is returned unchanged. */
export function withStyle(block: EditorBlock, style: DocStyle): EditorBlock {
  if (block.type !== "paragraph" && block.type !== "heading") return block;
  const value = blockText(block).replace(/\s*\n\s*/g, style === "paragraph" ? "\n" : " ");
  if (style === "paragraph") return { id: block.id, type: "paragraph", fields: { text: value } };
  return { id: block.id, type: "heading", fields: { text: value, level: style === "h3" ? 3 : style === "h4" ? 4 : 2 } };
}

/** A paragraph, heading or callout becomes a list (one item per line); a list switches between bullets and numbers. */
export function toList(block: EditorBlock, ordered: boolean): EditorBlock {
  if (block.type === "list") return updateFields(block, { ordered });
  if (block.type !== "paragraph" && block.type !== "heading" && block.type !== "callout") return block;
  const items = lines(blockText(block));
  return { id: block.id, type: "list", fields: { ordered, items: items.length ? items : [""] } };
}

/** A text block becomes a callout of `tone`; a callout of the same tone goes back to a paragraph. */
export function toCallout(block: EditorBlock, tone: "info" | "warning" | "danger" = "info"): EditorBlock {
  if (block.type === "callout") return text(block.fields.tone) === tone ? { id: block.id, type: "paragraph", fields: { text: text(block.fields.text) } } : updateFields(block, { tone });
  if (block.type !== "paragraph" && block.type !== "heading" && block.type !== "list") return block;
  return { id: block.id, type: "callout", fields: { tone, text: blockText(block) } };
}

export function insertAfter(blocks: EditorBlock[], index: number, block: EditorBlock): EditorBlock[] {
  const at = index < 0 ? blocks.length : Math.min(index + 1, blocks.length);
  return [...blocks.slice(0, at), block, ...blocks.slice(at)];
}

/** Entries of the "/" menu: what a block can become. `make` builds the block that replaces an empty paragraph. */
export type SlashItem = { key: string; label: string; hint: string; type: KnownType; make: () => EditorBlock };
const make = (type: KnownType, fields: Record<string, unknown> = {}) => () => { const block = newBlock(type); return { ...block, fields: { ...block.fields, ...fields } }; };
export const SLASH_ITEMS: SlashItem[] = [
  { key: "h2", label: "Tiêu đề lớn", hint: "Mục chính của bài", type: "heading", make: make("heading", { level: 2 }) },
  { key: "h3", label: "Tiêu đề nhỏ", hint: "Mục con", type: "heading", make: make("heading", { level: 3 }) },
  { key: "paragraph", label: "Đoạn văn", hint: "Chữ thường", type: "paragraph", make: make("paragraph") },
  { key: "bullets", label: "Danh sách chấm", hint: "Các ý ngang nhau", type: "list", make: make("list", { ordered: false }) },
  { key: "numbers", label: "Danh sách số", hint: "Các bước theo thứ tự", type: "list", make: make("list", { ordered: true }) },
  { key: "note", label: "Lưu ý", hint: "Khung thông tin nổi bật", type: "callout", make: make("callout", { tone: "info" }) },
  { key: "warning", label: "Cảnh báo", hint: "Khung cần chú ý", type: "callout", make: make("callout", { tone: "warning" }) },
  { key: "image", label: "Ảnh", hint: "Dán đường dẫn ảnh https", type: "image", make: make("image") },
  { key: "video", label: "Video", hint: "YouTube, TikTok, Facebook", type: "video", make: make("video") },
];
/** Items whose label matches what was typed after "/" (accents ignored). */
export function slashMatches(query: string): SlashItem[] {
  const needle = stripAccents(query.trim().toLowerCase());
  return needle ? SLASH_ITEMS.filter((item) => stripAccents(item.label.toLowerCase()).includes(needle)) : SLASH_ITEMS;
}

/** Slug suggested from a title: no accents (đ → d), lowercase, words joined by "-", at most 180 characters. */
export function slugFromTitle(title: string): string {
  return stripAccents(title.replace(/[đĐ]/g, "d")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180).replace(/-+$/, "");
}

/** Words of the text the reader sees (title excluded), for the "Sẵn sàng xuất bản" counts. */
export function wordCount(blocks: EditorBlock[], summary: string): number {
  const count = (value: string) => value.split(/\s+/).filter(Boolean).length;
  return blocks.reduce((sum, block) => sum + (block.type === "image" || block.type === "video" ? 0 : count(blockText(block))), count(summary));
}
