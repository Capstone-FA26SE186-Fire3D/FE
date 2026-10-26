import { isRecord, list, str } from "./parse";
import { parseRuns, runsText, type Run } from "./rich-text";
import { httpsUrl, isVideoProvider, videoLink, type VideoProvider } from "./safe-url";

/** Blocks the reader can render. Anything else is dropped (and counted) instead of being rendered as raw data. */
export type RenderBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string; runs: Run[] | null }
  | { type: "paragraph"; text: string; runs: Run[] | null }
  | { type: "list"; ordered: boolean; items: string[]; itemRuns: Array<Run[] | null> }
  | { type: "callout"; tone: "info" | "warning" | "danger"; text: string; runs: Run[] | null }
  | { type: "image"; url: string; alt: string }
  | { type: "divider" }
  | { type: "video"; provider: VideoProvider; videoId: string; url: string };

export type ParsedBlocks = { blocks: RenderBlock[]; skipped: number };

/**
 * `fet3d.learn/1` blocks → typed render blocks. Text is kept as plain text and rendered as text nodes, never as HTML; formatted
 * blocks (BE#172) also carry their runs. `text` is always the plain text: heading anchors, search and reading time use it.
 */
export function parseBlocks(raw: unknown): ParsedBlocks {
  const blocks: RenderBlock[] = [];
  let skipped = 0;
  for (const item of list(raw)) {
    const parsed = parseBlock(item);
    if (parsed) blocks.push(parsed);
    else skipped += 1;
  }
  return { blocks, skipped };
}

/**
 * Plain text and runs of a text block. Stored content always has `text`; a request body (the editor's preview) may carry
 * only `runs`, so the text then comes from the runs.
 */
function textOf(item: Record<string, unknown>): { text: string; runs: Run[] | null } {
  const runs = parseRuns(item.runs);
  return { text: (str(item.text) || (runs ? runsText(runs) : "")).trim(), runs };
}

function parseBlock(item: unknown): RenderBlock | null {
  if (!isRecord(item)) return null;
  switch (item.type) {
    case "heading": {
      const { text, runs } = textOf(item);
      const level = item.level === 3 ? 3 : item.level === 4 ? 4 : 2;
      return text ? { type: "heading", level, text, runs } : null;
    }
    case "paragraph": {
      const { text, runs } = textOf(item);
      return text ? { type: "paragraph", text, runs } : null;
    }
    case "list": {
      // Stored: `items` are strings and `itemRuns` (one runs array per item) exists only when an item is formatted. A request
      // body has an item as a string or {runs}.
      const runsOf = list(item.itemRuns);
      const entries = list(item.items).flatMap((entry, index) => {
        const parsed = typeof entry === "string" ? { text: entry.trim(), runs: parseRuns(runsOf[index]) } : isRecord(entry) ? textOf(entry) : null;
        return parsed?.text ? [parsed] : [];
      });
      return entries.length ? { type: "list", ordered: item.ordered === true, items: entries.map((entry) => entry.text), itemRuns: entries.map((entry) => entry.runs) } : null;
    }
    case "callout": {
      const { text, runs } = textOf(item);
      const tone = item.tone === "warning" || item.tone === "danger" ? item.tone : "info";
      return text ? { type: "callout", tone, text, runs } : null;
    }
    case "image": {
      const url = httpsUrl(item.url);
      return url ? { type: "image", url, alt: str(item.alt).trim() } : null;
    }
    case "divider": return { type: "divider" };
    case "video": {
      if (!isVideoProvider(item.provider)) return null;
      const url = videoLink(item.provider, item.url);
      return url ? { type: "video", provider: item.provider, videoId: str(item.videoId), url } : null;
    }
    default:
      return null;
  }
}

/** Anchor id of a heading block, by its position among the rendered blocks (the reader's contents list links to it). */
export const headingId = (index: number) => `muc-${index + 1}`;

/** Level-2 headings with their anchors: the "Trong bài này" list of the reader. */
export function outlineOf(blocks: RenderBlock[]): Array<{ id: string; text: string }> {
  return blocks.flatMap((block, index) => (block.type === "heading" && block.level === 2 ? [{ id: headingId(index), text: block.text }] : []));
}

/** Rough reading time at about 200 words a minute (Vietnamese syllables count as words); at least one minute. */
export function readingMinutes(blocks: RenderBlock[], summary = ""): number {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  let total = words(summary);
  for (const block of blocks) {
    if (block.type === "heading" || block.type === "paragraph" || block.type === "callout") total += words(block.text);
    else if (block.type === "list") total += block.items.reduce((sum, item) => sum + words(item), 0);
  }
  return Math.max(1, Math.round(total / 200));
}
