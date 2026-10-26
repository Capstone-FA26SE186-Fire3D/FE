import { newIdempotencyKey } from "@/api/idempotency";
import { isRecord, list } from "@/features/learn/parse";
import { isFormatted, normalizeRuns, parseRuns, plainRuns, runsText, type Run } from "@/features/learn/rich-text";

/*
 * Editor model of `fet3d.learn/1` content blocks. A block keeps EVERY field the backend sent in `fields`, so nothing is
 * lost on a round trip: fields the editor has no control for are sent back untouched and the backend answers FIELD_UNKNOWN
 * or VALUE_UNSUPPORTED rather than the editor silently deleting data. The one exception is what the backend derives
 * itself: a video block is stored as {type, provider, videoId, url} but accepted as {type, url}.
 *
 * Formatted text (BE#172) is held the way the backend stores it: `text` is always the plain text and `runs` (lists:
 * `itemRuns`) exists only when something is formatted. On the wire a block sends `runs` OR `text`, never both.
 */

export const KNOWN_TYPES = ["heading", "paragraph", "list", "callout", "image", "video", "divider"] as const;
export type KnownType = (typeof KNOWN_TYPES)[number];
export type EditorBlock = { id: string; type: string; fields: Record<string, unknown> };

export const blockLabel: Record<KnownType, string> = { heading: "Tiêu đề phụ", paragraph: "Đoạn văn", list: "Danh sách", callout: "Ghi chú nổi bật", image: "Ảnh", video: "Video ngoài", divider: "Đường kẻ" };
export const isKnownType = (type: string): type is KnownType => (KNOWN_TYPES as readonly string[]).includes(type);

/** Keys the editor owns per type; anything else in `fields` is passed through as it came. */
const OWNED: Record<KnownType, readonly string[]> = {
  heading: ["text", "runs", "level"],
  paragraph: ["text", "runs"],
  list: ["ordered", "items", "itemRuns"],
  callout: ["tone", "text", "runs"],
  image: ["url", "alt"],
  video: ["url"],
  divider: [],
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
    case "divider": return { id, type, fields: {} };
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

/** The formatted text of a heading, paragraph or callout (plain text as one unformatted run when it has no runs). */
export function richOf(block: EditorBlock): Run[] {
  return parseRuns(block.fields.runs) ?? plainRuns(textOf(block.fields.text));
}

/** Same block with new text: `text` follows the runs, `runs` is kept only while something is formatted. */
export function withRich(block: EditorBlock, runs: Run[]): EditorBlock {
  const clean = normalizeRuns(runs);
  const { runs: _old, ...fields } = block.fields;
  void _old;
  return { ...block, fields: isFormatted(clean) ? { ...fields, text: runsText(clean), runs: clean } : { ...fields, text: runsText(clean) } };
}

/** List items as runs, one array per item. */
export function itemsOf(block: EditorBlock): Run[][] {
  const items = Array.isArray(block.fields.items) ? block.fields.items : [];
  const formatted = list(block.fields.itemRuns);
  const rows = items.map((item, index) => parseRuns(formatted[index]) ?? plainRuns(textOf(item)));
  return rows.length ? rows : [[]];
}

export function withItems(block: EditorBlock, items: Run[][]): EditorBlock {
  const clean = items.map(normalizeRuns);
  const { itemRuns: _old, ...fields } = block.fields;
  void _old;
  const next = { ...fields, items: clean.map(runsText) };
  return { ...block, fields: clean.some(isFormatted) ? { ...next, itemRuns: clean } : next };
}

/** Runs with the joined text trimmed, like the backend trims text. */
export function trimRuns(runs: Run[]): Run[] {
  const out = normalizeRuns(runs).map((run) => ({ ...run }));
  while (out.length && !out[0].text.trimStart()) out.shift();
  while (out.length && !out[out.length - 1].text.trimEnd()) out.pop();
  if (out.length) { out[0].text = out[0].text.trimStart(); out[out.length - 1].text = out[out.length - 1].text.trimEnd(); }
  return out;
}

/** `runs` when formatted, else `text`: the backend refuses both (TEXT_OR_RUNS). */
const textBody = (runs: Run[]) => (isFormatted(runs) ? { runs } : { text: runsText(runs) });

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
      case "heading": return { ...passthrough, type: "heading", ...textBody(trimRuns(richOf(block))), level: typeof fields.level === "number" ? fields.level : 2 };
      case "paragraph": return { ...passthrough, type: "paragraph", ...textBody(trimRuns(richOf(block))) };
      case "list": {
        const items = itemsOf(block).map(trimRuns).filter((runs) => runs.length > 0).map((runs) => (isFormatted(runs) ? { runs } : runsText(runs)));
        return { ...passthrough, type: "list", ordered: fields.ordered === true, items };
      }
      case "callout": return { ...passthrough, type: "callout", tone: textOf(fields.tone) || "info", ...textBody(trimRuns(richOf(block))) };
      case "image": return { ...passthrough, type: "image", url: textOf(fields.url).trim(), alt: textOf(fields.alt).trim() };
      case "video": return { ...passthrough, type: "video", url: textOf(fields.url).trim() };
      case "divider": return { ...passthrough, type: "divider" };
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

const RUNS_MESSAGE = "Đoạn này đổi định dạng quá nhiều lần (tối đa 200 đoạn chữ khác kiểu). Bỏ bớt định dạng.";

export function checkBlocks(blocks: EditorBlock[]): BlockIssue[] {
  const issues: BlockIssue[] = [];
  const add = (index: number, key: string, message: string) => issues.push({ index, path: `$.blocks[${index}]${key ? `.${key}` : ""}`, message });
  if (blocks.length === 0) issues.push({ index: -1, path: "$.blocks", message: "Cần ít nhất một khối nội dung (tối đa 200)." });
  if (blocks.length > 200) issues.push({ index: -1, path: "$.blocks", message: "Tối đa 200 khối." });
  blocks.forEach((block, index) => {
    const textual = block.type === "heading" || block.type === "paragraph" || block.type === "callout";
    const runs = textual ? trimRuns(richOf(block)) : [];
    const text = runsText(runs);
    const items = block.type === "list" ? itemsOf(block).map(trimRuns).filter((item) => item.length > 0) : [];
    const texts: Array<[string, string]> = block.type === "list" ? items.map((item): [string, string] => ["items", runsText(item)]) : [["text", text], ["alt", textOf(block.fields.alt).trim()]];
    for (const [key, value] of texts) if (value && MARKUP.test(value)) { add(index, key, MARKUP_MESSAGE); break; }
    if (runs.length > 200 || items.some((item) => item.length > 200)) add(index, block.type === "list" ? "items" : "runs", RUNS_MESSAGE);
    switch (block.type) {
      case "heading": if (!text) add(index, "text", "Nhập nội dung tiêu đề (tối đa 200 ký tự)."); else if (text.length > 200) add(index, "text", "Tiêu đề phụ tối đa 200 ký tự."); break;
      case "paragraph": if (!text) add(index, "text", "Nhập nội dung đoạn văn (tối đa 5000 ký tự)."); else if (text.length > 5000) add(index, "text", "Đoạn văn tối đa 5000 ký tự."); break;
      case "callout": if (!text) add(index, "text", "Nhập nội dung ghi chú (tối đa 2000 ký tự)."); else if (text.length > 2000) add(index, "text", "Ghi chú tối đa 2000 ký tự."); break;
      case "list": if (!items.length) add(index, "items", "Danh sách cần ít nhất một mục (tối đa 50)."); else if (items.some((item) => runsText(item).length > 1000)) add(index, "items", "Mỗi mục tối đa 1000 ký tự."); break;
      case "image": if (!textOf(block.fields.url).trim()) add(index, "url", "Tải ảnh lên hoặc dán đường dẫn ảnh https."); if (!textOf(block.fields.alt).trim()) add(index, "alt", "Thêm mô tả ảnh cho người dùng trình đọc màn hình."); break;
      case "video": if (!textOf(block.fields.url).trim()) add(index, "url", "Nhập liên kết video."); break;
      // Unknown block types are not judged here: they are sent unchanged and the backend names the problem.
    }
  });
  return issues;
}
