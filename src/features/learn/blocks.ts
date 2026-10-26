import { isRecord, list, str } from "./parse";
import { httpsUrl, isVideoProvider, videoLink, type VideoProvider } from "./safe-url";

/** Blocks the reader can render. Anything else is dropped (and counted) instead of being rendered as raw data. */
export type RenderBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "callout"; tone: "info" | "warning" | "danger"; text: string }
  | { type: "image"; url: string; alt: string }
  | { type: "video"; provider: VideoProvider; videoId: string; url: string };

export type ParsedBlocks = { blocks: RenderBlock[]; skipped: number };

/** `fet3d.learn/1` blocks → typed render blocks. Text is kept as plain text and rendered as text nodes, never as HTML. */
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

function parseBlock(item: unknown): RenderBlock | null {
  if (!isRecord(item)) return null;
  switch (item.type) {
    case "heading": {
      const text = str(item.text).trim();
      const level = item.level === 3 ? 3 : item.level === 4 ? 4 : 2;
      return text ? { type: "heading", level, text } : null;
    }
    case "paragraph": {
      const text = str(item.text).trim();
      return text ? { type: "paragraph", text } : null;
    }
    case "list": {
      const items = list(item.items).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
      return items.length ? { type: "list", ordered: item.ordered === true, items } : null;
    }
    case "callout": {
      const text = str(item.text).trim();
      const tone = item.tone === "warning" || item.tone === "danger" ? item.tone : "info";
      return text ? { type: "callout", tone, text } : null;
    }
    case "image": {
      const url = httpsUrl(item.url);
      return url ? { type: "image", url, alt: str(item.alt).trim() } : null;
    }
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
