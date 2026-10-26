import { stripAccents } from "@/utils/strip-accents";
import { normalizeRuns, runLines, type Run } from "@/features/learn/rich-text";
import { itemsOf, newBlock, richOf, updateFields, withItems, withRich, type EditorBlock, type KnownType } from "./blocks";

/*
 * Docs-style editing on top of `fet3d.learn/1` blocks (Figma "Learn · Trình soạn v3"). The toolbar and the "/" menu change a
 * block's type or insert blocks; changing type keeps the text's formatting (runs, BE#172).
 */

const text = (value: unknown) => (typeof value === "string" ? value : "");
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
/** The block's formatted text, whatever its type (a list joins its items one per line). */
function runsOfBlock(block: EditorBlock): Run[] {
  if (block.type !== "list") return richOf(block);
  return normalizeRuns(itemsOf(block).flatMap((item, index) => (index > 0 ? [{ text: "\n" }, ...item] : item)));
}
/** Lines of formatted text with their spaces trimmed and empty lines dropped. */
const runRows = (runs: Run[]) => runLines(runs).map((row) => {
  const out = row.map((run) => ({ ...run }));
  if (out.length) { out[0].text = out[0].text.trimStart(); out[out.length - 1].text = out[out.length - 1].text.trimEnd(); }
  return normalizeRuns(out);
}).filter((row) => row.length > 0);
const joinRows = (rows: Run[][], separator: string) => normalizeRuns(rows.flatMap((row, index) => (index > 0 ? [{ text: separator }, ...row] : row)));

/** Same text, another style. Only paragraphs and headings have a style; anything else is returned unchanged. */
export function withStyle(block: EditorBlock, style: DocStyle): EditorBlock {
  if (block.type !== "paragraph" && block.type !== "heading") return block;
  const runs = style === "paragraph" ? runsOfBlock(block) : joinRows(runRows(runsOfBlock(block)), " ");
  if (style === "paragraph") return withRich({ id: block.id, type: "paragraph", fields: {} }, runs);
  return withRich({ id: block.id, type: "heading", fields: { level: style === "h3" ? 3 : style === "h4" ? 4 : 2 } }, runs);
}

/** A paragraph, heading or callout becomes a list (one item per line); a list switches between bullets and numbers. */
export function toList(block: EditorBlock, ordered: boolean): EditorBlock {
  if (block.type === "list") return updateFields(block, { ordered });
  if (block.type !== "paragraph" && block.type !== "heading" && block.type !== "callout") return block;
  const rows = runRows(runsOfBlock(block));
  return withItems({ id: block.id, type: "list", fields: { ordered } }, rows.length ? rows : [[]]);
}

/** A text block becomes a callout of `tone`; a callout of the same tone goes back to a paragraph. */
export function toCallout(block: EditorBlock, tone: "info" | "warning" | "danger" = "info"): EditorBlock {
  if (block.type === "callout") return text(block.fields.tone) === tone ? withRich({ id: block.id, type: "paragraph", fields: {} }, richOf(block)) : updateFields(block, { tone });
  if (block.type !== "paragraph" && block.type !== "heading" && block.type !== "list") return block;
  const runs = block.type === "list" ? joinRows(runRows(runsOfBlock(block)), "\n") : runsOfBlock(block);
  return withRich({ id: block.id, type: "callout", fields: { tone } }, runs);
}

/** Where the caret or selection is in a text field: the block, the list item (null for a heading, paragraph or callout) and offsets. */
export type RichSelection = { blockId: string; item: number | null; start: number; end: number };
export const richKeyOf = (selection: RichSelection) => (selection.item === null ? selection.blockId : `${selection.blockId}:${selection.item}`);

/** The runs a selection points into, or null when that block or item has no text field. */
export function selectionRuns(block: EditorBlock | undefined, item: number | null): Run[] | null {
  if (!block) return null;
  if (block.type === "list") return item === null ? null : itemsOf(block)[item] ?? null;
  return block.type === "paragraph" || block.type === "heading" || block.type === "callout" ? richOf(block) : null;
}
export function withSelectionRuns(block: EditorBlock, item: number | null, runs: Run[]): EditorBlock {
  if (block.type !== "list") return withRich(block, runs);
  return withItems(block, itemsOf(block).map((row, index) => (index === item ? runs : row)));
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
  { key: "image", label: "Ảnh", hint: "Tải ảnh từ máy hoặc dán đường dẫn", type: "image", make: make("image") },
  { key: "video", label: "Video", hint: "YouTube, TikTok, Facebook", type: "video", make: make("video") },
  { key: "divider", label: "Đường kẻ", hint: "Ngăn cách hai phần của bài", type: "divider", make: make("divider") },
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
  return blocks.reduce((sum, block) => sum + (block.type === "image" || block.type === "video" || block.type === "divider" ? 0 : count(blockText(block))), count(summary));
}
