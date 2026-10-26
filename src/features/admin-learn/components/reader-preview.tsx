"use client";

import { BlockRenderer } from "@/features/learn/components/block-renderer";
import { readingMinutes, parseBlocks } from "@/features/learn/blocks";
import { httpsUrl } from "@/features/learn/safe-url";
import { kindLabel } from "@/features/learn/types";
import { blocksToWire } from "../blocks";
import type { EditorContent } from "../content";
import type { MediaCheck } from "../use-media-checks";
import "@/features/learn/learn.css";

/**
 * "Xem như người đọc": the page as the public reader will show it, from what is on screen (not yet saved). A video the
 * server has not canonicalised yet borrows the provider and id from the link check, so it previews like the real thing.
 */
export function ReaderPreview({ form, checks }: { form: EditorContent; checks: Record<string, MediaCheck> }) {
  const wire = blocksToWire(form.blocks).map((block, index) => {
    if (block.type !== "video") return block;
    const source = form.blocks[index];
    const check = checks[source.id];
    const descriptor = check?.state === "ok" && check.descriptor ? check.descriptor : null;
    const provider = typeof source.fields.provider === "string" ? source.fields.provider : descriptor?.provider;
    const videoId = typeof source.fields.videoId === "string" ? source.fields.videoId : descriptor?.videoId;
    return { ...block, provider, videoId, url: descriptor?.canonicalUrl ?? block.url };
  });
  const cover = httpsUrl(form.coverImageUrl.trim());
  const minutes = readingMinutes(parseBlocks(wire).blocks, form.summary);
  return <article className="doc-preview" data-testid="learn-reader-preview" aria-label="Xem như người đọc">
    <p className="lv2-kind" data-kind={form.kind}>{kindLabel[form.kind]}</p>
    <h1>{form.title.trim() || "Bài chưa có tiêu đề"}</h1>
    {form.summary.trim() && <p className="doc-preview-lede">{form.summary}</p>}
    <p className="doc-preview-meta">Bản nháp · {minutes} phút đọc</p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {cover && <img className="doc-preview-cover" src={cover} alt="" referrerPolicy="no-referrer" />}
    <BlockRenderer blocks={wire} fallbackSummary={form.summary} />
  </article>;
}
