"use client";

import { ArrowDown, ArrowUp, ExternalLink, Film, Heading2, ImageIcon, Pilcrow, Plus, Trash2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { newIdempotencyKey } from "@/api/idempotency";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { isSafeImageUrl, parseMediaUrl } from "../media";
import type { ContentBlock } from "../types";

const blockMeta: Record<ContentBlock["type"], { label: string; Icon: LucideIcon }> = {
  heading: { label: "Tiêu đề phụ", Icon: Heading2 },
  paragraph: { label: "Đoạn văn", Icon: Pilcrow },
  image: { label: "Ảnh", Icon: ImageIcon },
  video: { label: "Video", Icon: Film },
};

export function newBlock(type: ContentBlock["type"]): ContentBlock {
  const id = newIdempotencyKey();
  switch (type) {
    case "heading": return { id, type, text: "" };
    case "paragraph": return { id, type, text: "" };
    case "image": return { id, type, url: "", alt: "" };
    case "video": return { id, type, url: "", title: "", fallbackSummary: "" };
  }
}

/**
 * Preview of how the renderer treats a video: provider + canonical link + the mandatory fallback summary.
 * It never embeds an iframe or runs provider scripts; opening the video is an explicit link out.
 */
export function MediaPreview({ url, title, fallbackSummary }: { url: string; title: string; fallbackSummary: string }) {
  const parsed = parseMediaUrl(url);
  if (!parsed.ok) return null;
  return <div style={{ display: "grid", gap: 8, padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg-soft)" }} data-testid="media-preview">
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <StatusBadge tone="info">{parsed.provider}</StatusBadge>
      <strong style={{ fontSize: 14 }}>{title.trim() || "Video chưa đặt tên"}</strong>
    </div>
    <p style={{ margin: 0, color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>{fallbackSummary.trim() || "Chưa có tóm tắt dự phòng."}</p>
    <a href={parsed.canonicalUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ember)", fontSize: 13, overflowWrap: "anywhere" }}>
      <ExternalLink size={14} aria-hidden="true" />Mở trên {parsed.provider}<span className="ops-field-hint">({parsed.canonicalUrl})</span>
    </a>
    <p className="ops-field-hint" style={{ margin: 0 }}>Trang đọc chỉ hiển thị thẻ này. Không nhúng iframe, HTML hay script của bên thứ ba.</p>
  </div>;
}

function BlockCard({ block, index, total, onChange, onMove, onRemove }: {
  block: ContentBlock; index: number; total: number; onChange: (block: ContentBlock) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void;
}) {
  const meta = blockMeta[block.type];
  const label = `${meta.label} ${index + 1}`;
  return <li style={{ listStyle: "none", display: "grid", gap: 12, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)" }} data-testid="content-block">
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <meta.Icon size={16} aria-hidden="true" style={{ color: "var(--dim)" }} />
      <strong style={{ fontSize: 13 }}>{label}</strong>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
        <Button type="button" size="icon" variant="quiet" aria-label={`Chuyển ${label} lên`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={16} aria-hidden="true" /></Button>
        <Button type="button" size="icon" variant="quiet" aria-label={`Chuyển ${label} xuống`} disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={16} aria-hidden="true" /></Button>
        <Button type="button" size="icon" variant="quiet" aria-label={`Xóa ${label}`} onClick={onRemove}><Trash2 size={16} aria-hidden="true" /></Button>
      </span>
    </div>
    {(block.type === "heading" || block.type === "paragraph") && <Field label="Nội dung" required>
      {(p) => block.type === "heading"
        ? <Input {...p} maxLength={200} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
        : <Textarea {...p} rows={4} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />}
    </Field>}
    {block.type === "image" && <>
      <Field label="Đường dẫn ảnh (https)" required error={block.url && !isSafeImageUrl(block.url) ? "Ảnh phải là đường dẫn https." : undefined}>{(p) => <Input {...p} inputMode="url" value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />}</Field>
      <Field label="Mô tả ảnh (alt)" required hint="Dành cho người dùng đọc màn hình và khi ảnh không tải được.">{(p) => <Input {...p} maxLength={200} value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} />}</Field>
    </>}
    {block.type === "video" && <VideoFields block={block} onChange={onChange} />}
  </li>;
}

function VideoFields({ block, onChange }: { block: Extract<ContentBlock, { type: "video" }>; onChange: (block: ContentBlock) => void }) {
  const parsed = block.url.trim() ? parseMediaUrl(block.url) : null;
  return <>
    <Field label="Đường dẫn video" required hint="YouTube, Facebook hoặc TikTok (https)." error={parsed && !parsed.ok ? parsed.reason : undefined}>
      {(p) => <Input {...p} inputMode="url" value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />}
    </Field>
    <Field label="Tiêu đề video">{(p) => <Input {...p} maxLength={200} value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} />}</Field>
    <Field label="Tóm tắt dự phòng" required hint="Hiển thị khi video không mở được hoặc người đọc không phát được.">
      {(p) => <Textarea {...p} rows={3} maxLength={1000} value={block.fallbackSummary} onChange={(event) => onChange({ ...block, fallbackSummary: event.target.value })} />}
    </Field>
    <MediaPreview url={block.url} title={block.title} fallbackSummary={block.fallbackSummary} />
  </>;
}

export function BlockEditor({ blocks, onChange }: { blocks: ContentBlock[]; onChange: (blocks: ContentBlock[]) => void }) {
  const [adding, setAdding] = useState<ContentBlock["type"]>("paragraph");
  const move = (index: number, delta: -1 | 1) => {
    const next = blocks.slice();
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };
  return <div className="ops-stack">
    {blocks.length === 0 && <p style={{ margin: 0, padding: 16, border: "1px dashed var(--line-strong)", borderRadius: 10, color: "var(--muted)", fontSize: 14 }}>Chưa có khối nội dung. Thêm đoạn văn, ảnh hoặc video bên dưới.</p>}
    <ol style={{ margin: 0, padding: 0, display: "grid", gap: 12 }} aria-label="Các khối nội dung">
      {blocks.map((block, index) => <BlockCard key={block.id} block={block} index={index} total={blocks.length} onChange={(next) => onChange(blocks.map((item) => (item.id === block.id ? next : item)))} onMove={(delta) => move(index, delta)} onRemove={() => onChange(blocks.filter((item) => item.id !== block.id))} />)}
    </ol>
    <div className="ops-toolbar" style={{ marginBottom: 0 }}>
      <Select aria-label="Loại khối" style={{ width: 190 }} value={adding} onChange={(event) => setAdding(event.target.value as ContentBlock["type"])}>
        {(Object.keys(blockMeta) as Array<ContentBlock["type"]>).map((type) => <option key={type} value={type}>{blockMeta[type].label}</option>)}
      </Select>
      <Button type="button" variant="secondary" onClick={() => onChange([...blocks, newBlock(adding)])}><Plus size={16} aria-hidden="true" />Thêm khối</Button>
    </div>
  </div>;
}
