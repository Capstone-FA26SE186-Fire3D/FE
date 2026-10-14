import { ExternalLink, Film } from "lucide-react";
import { parseBlocks, type RenderBlock } from "../blocks";

/*
 * Renders `fet3d.learn/1` blocks from an allowlist of block types. All text is a React text node (escaped); there is no
 * dangerouslySetInnerHTML, no iframe and no third-party script. The API gives a video as {provider, videoId, canonical url}
 * and no embed descriptor, so a video is always a link-out card with the post summary as the fallback text.
 */

function Heading({ level, text }: { level: 2 | 3 | 4; text: string }) {
  if (level === 3) return <h3>{text}</h3>;
  if (level === 4) return <h4>{text}</h4>;
  return <h2>{text}</h2>;
}

const calloutLabel = { info: "Lưu ý", warning: "Cần chú ý", danger: "Cảnh báo" } as const;

function Block({ block, fallbackSummary }: { block: RenderBlock; fallbackSummary: string }) {
  switch (block.type) {
    case "heading": return <Heading level={block.level} text={block.text} />;
    case "paragraph": return <p className="learn-text">{block.text}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return <Tag className="learn-list">{block.items.map((item, index) => <li key={index}>{item}</li>)}</Tag>;
    }
    case "callout": return <aside className="learn-callout" data-tone={block.tone} role="note"><strong>{calloutLabel[block.tone]}</strong><p className="learn-text">{block.text}</p></aside>;
    case "image": return <figure className="learn-figure">
      {/* Remote https image from the API: plain <img> (no optimizer allowlist), no referrer sent. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={block.url} alt={block.alt} loading="lazy" referrerPolicy="no-referrer" />
      {block.alt && <figcaption>{block.alt}</figcaption>}
    </figure>;
    case "video": return <div className="learn-video" data-provider={block.provider} data-testid="video-fallback">
      <div className="learn-video-head"><Film size={18} aria-hidden="true" /><strong>Video trên {block.provider}</strong></div>
      {fallbackSummary && <p className="learn-text">{fallbackSummary}</p>}
      <a className="learn-video-link" href={block.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Xem video trên {block.provider}<span className="sr-only"> (mở trong tab mới)</span></a>
      <p className="learn-video-note">Video mở ở trang của {block.provider}, không phát ngay trong bài này.</p>
    </div>;
  }
}

export function BlockRenderer({ blocks: raw, fallbackSummary }: { blocks: unknown; fallbackSummary: string }) {
  const { blocks, skipped } = parseBlocks(raw);
  return <div className="article-body learn-blocks">
    {blocks.map((block, index) => <Block key={index} block={block} fallbackSummary={fallbackSummary} />)}
    {blocks.length === 0 && <p className="learn-note" role="status">Bài này chưa có nội dung hiển thị được.</p>}
    {skipped > 0 && <p className="learn-note" role="status">{skipped} phần nội dung không hiển thị được trên phiên bản này.</p>}
  </div>;
}
