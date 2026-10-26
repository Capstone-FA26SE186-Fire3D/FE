import { newIdempotencyKey } from "@/api/idempotency";
import { isRecord } from "@/features/learn/parse";

/*
 * Editor model of `fet3d.learn/1` content blocks. A block keeps EVERY field the backend sent in `fields`, so nothing is
 * lost on a round trip: fields the editor has no control for are sent back untouched and the backend answers FIELD_UNKNOWN
 * or VALUE_UNSUPPORTED rather than the editor silently deleting data. The one exception is what the backend derives
 * itself: a video block is stored as {type, provider, videoId, url} but accepted as {type, url}.
 */

export const KNOWN_TYPES = ["heading", "paragraph", "list", "callout", "image", "video"] as const;
export type KnownType = (typeof KNOWN_TYPES)[number];
export type EditorBlock = { id: string; type: string; fields: Record<string, unknown> };

export const blockLabel: Record<KnownType, string> = { heading: "Tiêu đề phụ", paragraph: "Đoạn văn", list: "Danh sách", callout: "Ghi chú nổi bật", image: "Ảnh", video: "Video ngoài" };
export const isKnownType = (type: string): type is KnownType => (KNOWN_TYPES as readonly string[]).includes(type);

/** Keys the editor owns per type; anything else in `fields` is passed through as it came. */
const OWNED: Record<KnownType, readonly string[]> = {
  heading: ["text", "level"],
  paragraph: ["text"],
  list: ["ordered", "items"],
  callout: ["tone", "text"],
  image: ["url", "alt"],
  video: ["url"],
};
/** Derived by the backend from `url`; never sent back. */
const SERVER_DERIVED: Record<string, readonly string[]> = { video: ["provider", "videoId"] };

export function newBlock(type: KnownType): EditorBlock {
  const id = newIdempotencyKey();
  switch (type) {
    case "heading": return { id, type, fields: { text: "", level: 2 } };
    case "paragraph": return { id, type, fields: { text: "" } };
    case "list": return { id, type, fields: { ordered: false, items: [""] } };
    case "callout": return { id, type, fields: { tone: "info", text: "" } };
    case "image": return { id, type, fields: { url: "", alt: "" } };
    case "video": return { id, type, fields: { url: "" } };
  }
}

export function blocksFromWire(raw: unknown[]): EditorBlock[] {
  return raw.map((item) => {
    const id = newIdempotencyKey();
    if (!isRecord(item)) return { id, type: "unsupported", fields: { value: item } };
    const { type, ...fields } = item;
    return { id, type: typeof type === "string" ? type : "unsupported", fields };
  });
}

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

/** Blocks → request body. Text is trimmed like the backend trims it; empty list lines are dropped. */
export function blocksToWire(blocks: EditorBlock[]): Array<Record<string, unknown>> {
  return blocks.map((block) => {
    if (!isKnownType(block.type)) return { ...block.fields, type: block.type };
    const passthrough: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(block.fields)) {
      if (!OWNED[block.type].includes(key) && !(SERVER_DERIVED[block.type] ?? []).includes(key)) passthrough[key] = value;
    }
    const fields = block.fields;
    switch (block.type) {
      case "heading": return { ...passthrough, type: "heading", text: textOf(fields.text).trim(), level: typeof fields.level === "number" ? fields.level : 2 };
      case "paragraph": return { ...passthrough, type: "paragraph", text: textOf(fields.text).trim() };
      case "list": return { ...passthrough, type: "list", ordered: fields.ordered === true, items: (Array.isArray(fields.items) ? fields.items : []).map(textOf).map((item) => item.trim()).filter(Boolean) };
      case "callout": return { ...passthrough, type: "callout", tone: textOf(fields.tone) || "info", text: textOf(fields.text).trim() };
      case "image": return { ...passthrough, type: "image", url: textOf(fields.url).trim(), alt: textOf(fields.alt).trim() };
      case "video": return { ...passthrough, type: "video", url: textOf(fields.url).trim() };
    }
  });
}

/** Names of fields the editor cannot edit for this block (shown so an editor knows why the backend may reject it). */
export function extraFieldNames(block: EditorBlock): string[] {
  if (!isKnownType(block.type)) return Object.keys(block.fields);
  return Object.keys(block.fields).filter((key) => !OWNED[block.type as KnownType].includes(key) && !(SERVER_DERIVED[block.type] ?? []).includes(key));
}

export function updateFields(block: EditorBlock, patch: Record<string, unknown>): EditorBlock {
  return { ...block, fields: { ...block.fields, ...patch } };
}

/** The backend refuses any HTML-like tag in text (MARKUP_NOT_ALLOWED); a bare "<" such as "1 < 2" is fine. */
export const MARKUP = /<\s*[a-zA-Z/!?]/;
export const MARKUP_MESSAGE = "Chỉ nhận chữ thường: không dán mã trang web.";

/** Local checks that mirror what the backend enforces, for instant feedback. The backend stays the authority. */
export type BlockIssue = { index: number; path: string; message: string };

export function checkBlocks(blocks: EditorBlock[]): BlockIssue[] {
  const issues: BlockIssue[] = [];
  const add = (index: number, key: string, message: string) => issues.push({ index, path: `$.blocks[${index}]${key ? `.${key}` : ""}`, message });
  if (blocks.length === 0) issues.push({ index: -1, path: "$.blocks", message: "Cần ít nhất một khối nội dung (tối đa 200)." });
  if (blocks.length > 200) issues.push({ index: -1, path: "$.blocks", message: "Tối đa 200 khối." });
  blocks.forEach((block, index) => {
    const wire = blocksToWire([block])[0];
    const texts: Array<[string, string]> = block.type === "list" ? (wire.items as string[]).map((item): [string, string] => ["items", item]) : [["text", String(wire.text ?? "")], ["alt", String(wire.alt ?? "")]];
    for (const [key, value] of texts) if (value && MARKUP.test(value)) { add(index, key, MARKUP_MESSAGE); break; }
    switch (block.type) {
      case "heading": if (!wire.text) add(index, "text", "Nhập nội dung tiêu đề (tối đa 200 ký tự)."); else if (String(wire.text).length > 200) add(index, "text", "Tiêu đề phụ tối đa 200 ký tự."); break;
      case "paragraph": if (!wire.text) add(index, "text", "Nhập nội dung đoạn văn (tối đa 5000 ký tự)."); else if (String(wire.text).length > 5000) add(index, "text", "Đoạn văn tối đa 5000 ký tự."); break;
      case "callout": if (!wire.text) add(index, "text", "Nhập nội dung ghi chú (tối đa 2000 ký tự)."); break;
      case "list": if (!(wire.items as string[]).length) add(index, "items", "Danh sách cần ít nhất một mục (tối đa 50)."); break;
      case "image": if (!wire.url) add(index, "url", "Nhập đường dẫn ảnh https."); if (!wire.alt) add(index, "alt", "Thêm mô tả ảnh cho người dùng trình đọc màn hình."); break;
      case "video": if (!wire.url) add(index, "url", "Nhập liên kết video."); break;
      // Unknown block types are not judged here: they are sent unchanged and the backend names the problem.
    }
  });
  return issues;
}
