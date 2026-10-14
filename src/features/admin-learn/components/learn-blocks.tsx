"use client";

import { ArrowDown, ArrowUp, Film, Heading2, ImageIcon, ListOrdered, MessageSquareWarning, Pilcrow, Plus, ShieldCheck, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { blockLabel, extraFieldNames, isKnownType, KNOWN_TYPES, newBlock, updateFields, type EditorBlock, type KnownType } from "../blocks";
import type { ContentIssue } from "../content";
import type { MediaCheck } from "../use-media-checks";

const icons: Record<KnownType, LucideIcon> = { heading: Heading2, paragraph: Pilcrow, list: ListOrdered, callout: MessageSquareWarning, image: ImageIcon, video: Film };
const toneLabel = { info: "Thông tin", warning: "Cần chú ý", danger: "Cảnh báo" } as const;
const text = (value: unknown) => (typeof value === "string" ? value : "");

type Common = { disabled: boolean };

function VideoFields({ block, onChange, check, onCheck }: { block: EditorBlock; onChange: (block: EditorBlock) => void; check: MediaCheck | undefined; onCheck: (blockId: string, url: string) => void }) {
  const url = text(block.fields.url);
  const current = check && check.url === url.trim() ? check : undefined;
  const savedProvider = text(block.fields.provider);
  return <>
    <Field label="Liên kết video" required hint="Liên kết đầy đủ từ YouTube, Facebook hoặc TikTok (https). Máy chủ kiểm tra và chuẩn hóa liên kết; không nhận mã nhúng hay liên kết rút gọn.">
      {(p) => <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Input {...p} style={{ flex: "1 1 260px", minWidth: 0 }} inputMode="url" value={url} onChange={(event) => onChange(updateFields(block, { url: event.target.value }))} onBlur={() => { if (url.trim() && (!check || check.url !== url.trim())) onCheck(block.id, url); }} />
        <Button type="button" variant="secondary" disabled={!url.trim() || current?.state === "checking"} onClick={() => onCheck(block.id, url)}><ShieldCheck size={16} aria-hidden="true" />{current?.state === "checking" ? "Đang kiểm tra…" : "Kiểm tra liên kết"}</Button>
      </div>}
    </Field>
    <div aria-live="polite" data-testid="media-result">
      {current?.state === "ok" && current.descriptor && <div style={{ display: "grid", gap: 6, padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg-soft)" }}>
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}><StatusBadge tone="success">Hợp lệ</StatusBadge><StatusBadge tone="info">{current.descriptor.provider}</StatusBadge><span className="ops-field-hint">Mã video: {current.descriptor.videoId}</span></span>
        <span className="ops-field-hint" style={{ overflowWrap: "anywhere" }}>Liên kết chuẩn: <a href={current.descriptor.canonicalUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ember)" }}>{current.descriptor.canonicalUrl}</a></span>
        <span className="ops-field-hint">Người đọc thấy thẻ liên kết sang {current.descriptor.provider} cùng phần tóm tắt của bài; video không được nhúng trong trang.</span>
      </div>}
      {current?.state === "invalid" && <p role="alert" className="ops-field-error" style={{ margin: 0 }}><TriangleAlert size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {current.message}</p>}
      {current?.state === "error" && <p role="alert" className="ops-field-error" style={{ margin: 0 }}>Chưa kiểm tra được: {current.message}. Bấm “Kiểm tra liên kết” để thử lại; máy chủ vẫn kiểm tra khi lưu.</p>}
      {!current && savedProvider && <span className="ops-field-hint">Đã lưu: {savedProvider}{text(block.fields.videoId) ? ` · ${text(block.fields.videoId)}` : ""}. Người đọc thấy thẻ liên kết, không nhúng video.</span>}
    </div>
  </>;
}

function BlockFields({ block, onChange, check, onCheck }: { block: EditorBlock; onChange: (block: EditorBlock) => void; check: MediaCheck | undefined; onCheck: (blockId: string, url: string) => void }) {
  const set = (patch: Record<string, unknown>) => onChange(updateFields(block, patch));
  switch (block.type) {
    case "heading": return <div className="ops-form-grid">
      <Field label="Nội dung tiêu đề" required className="ops-span-all">{(p) => <Input {...p} maxLength={200} value={text(block.fields.text)} onChange={(event) => set({ text: event.target.value })} />}</Field>
      <Field label="Cấp tiêu đề">{(p) => <Select {...p} value={String(block.fields.level ?? 2)} onChange={(event) => set({ level: Number(event.target.value) })}><option value="2">Cấp 2 (mục chính)</option><option value="3">Cấp 3</option><option value="4">Cấp 4</option></Select>}</Field>
    </div>;
    case "paragraph": return <Field label="Nội dung" required hint="Văn bản thuần. Xuống dòng được giữ nguyên.">{(p) => <Textarea {...p} rows={4} value={text(block.fields.text)} onChange={(event) => set({ text: event.target.value })} />}</Field>;
    case "list": {
      const items = Array.isArray(block.fields.items) ? block.fields.items.map(text) : [""];
      return <div className="ops-form-grid">
        <Field label="Các mục (mỗi dòng một mục)" required hint="Tối đa 50 mục, mỗi mục tối đa 1000 ký tự." className="ops-span-all">{(p) => <Textarea {...p} rows={5} value={items.join("\n")} onChange={(event) => set({ items: event.target.value.split("\n") })} />}</Field>
        <Field label="Kiểu danh sách">{(p) => <Select {...p} value={block.fields.ordered === true ? "ordered" : "bullets"} onChange={(event) => set({ ordered: event.target.value === "ordered" })}><option value="bullets">Gạch đầu dòng</option><option value="ordered">Đánh số</option></Select>}</Field>
      </div>;
    }
    case "callout": return <div className="ops-form-grid">
      <Field label="Mức nhấn mạnh">{(p) => <Select {...p} value={text(block.fields.tone) || "info"} onChange={(event) => set({ tone: event.target.value })}>{(Object.keys(toneLabel) as Array<keyof typeof toneLabel>).map((tone) => <option key={tone} value={tone}>{toneLabel[tone]}</option>)}</Select>}</Field>
      <Field label="Nội dung" required className="ops-span-all">{(p) => <Textarea {...p} rows={3} value={text(block.fields.text)} onChange={(event) => set({ text: event.target.value })} />}</Field>
    </div>;
    case "image": return <div className="ops-form-grid">
      <Field label="Đường dẫn ảnh (https)" required className="ops-span-all">{(p) => <Input {...p} inputMode="url" value={text(block.fields.url)} onChange={(event) => set({ url: event.target.value })} />}</Field>
      <Field label="Mô tả ảnh (alt)" required hint="Dành cho người đọc màn hình và khi ảnh không tải được." className="ops-span-all">{(p) => <Input {...p} maxLength={300} value={text(block.fields.alt)} onChange={(event) => set({ alt: event.target.value })} />}</Field>
    </div>;
    case "video": return <VideoFields block={block} onChange={onChange} check={check} onCheck={onCheck} />;
    default: return <div style={{ display: "grid", gap: 8 }}>
      <p className="ops-field-hint" style={{ margin: 0 }}>Khối loại “{block.type}” không có trong danh sách khối được hỗ trợ. Nội dung được giữ nguyên khi lưu và máy chủ sẽ quyết định; có thể xóa khối này.</p>
      <pre style={{ margin: 0, padding: 10, maxHeight: 160, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg-soft)", fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(block.fields, null, 2)}</pre>
    </div>;
  }
}

function BlockCard({ block, index, total, onChange, onMove, onRemove, issues, check, onCheck }: {
  block: EditorBlock; index: number; total: number; onChange: (block: EditorBlock) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void;
  issues: ContentIssue[]; check: MediaCheck | undefined; onCheck: (blockId: string, url: string) => void;
}) {
  const known = isKnownType(block.type);
  const Icon = known ? icons[block.type as KnownType] : TriangleAlert;
  const label = `${known ? blockLabel[block.type as KnownType] : "Khối không hỗ trợ"} ${index + 1}`;
  const extras = extraFieldNames(block);
  return <li style={{ listStyle: "none", display: "grid", gap: 12, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)" }} data-testid="content-block" data-block-type={block.type}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon size={16} aria-hidden="true" style={{ color: "var(--dim)" }} />
      <strong style={{ fontSize: 13 }}>{label}</strong>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
        <Button type="button" size="icon" variant="quiet" aria-label={`Chuyển ${label} lên`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={16} aria-hidden="true" /></Button>
        <Button type="button" size="icon" variant="quiet" aria-label={`Chuyển ${label} xuống`} disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={16} aria-hidden="true" /></Button>
        <Button type="button" size="icon" variant="quiet" aria-label={`Xóa ${label}`} onClick={onRemove}><Trash2 size={16} aria-hidden="true" /></Button>
      </span>
    </div>
    <BlockFields block={block} onChange={onChange} check={check} onCheck={onCheck} />
    {known && extras.length > 0 && <p className="ops-field-hint" style={{ margin: 0 }} data-testid="block-extras">Trường lạ được giữ nguyên khi lưu: {extras.join(", ")}. Máy chủ sẽ từ chối nếu trường đó không thuộc loại khối này.</p>}
    {issues.length > 0 && <ul role="alert" style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }} className="ops-field-error">{issues.map((issue, position) => <li key={`${issue.path}-${position}`}>{issue.message}</li>)}</ul>}
  </li>;
}

/** Content blocks of `fet3d.learn/1`: heading, paragraph, list, callout, image and external video links. No HTML, iframe or script. */
export function BlockEditor({ blocks, onChange, disabled, issues, checks, onCheck }: Common & {
  blocks: EditorBlock[]; onChange: (blocks: EditorBlock[]) => void; issues: ContentIssue[]; checks: Record<string, MediaCheck>; onCheck: (blockId: string, url: string) => void;
}) {
  const [adding, setAdding] = useState<KnownType>("paragraph");
  const move = (index: number, delta: -1 | 1) => {
    const next = blocks.slice();
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };
  const generalIssues = issues.filter((issue) => !/^\$\.blocks\[\d+\]/.test(issue.path) && issue.path.startsWith("$.blocks"));
  const issuesFor = (index: number) => issues.filter((issue) => issue.path === `$.blocks[${index}]` || issue.path.startsWith(`$.blocks[${index}].`));
  return <div className="ops-stack">
    {generalIssues.length > 0 && <ul role="alert" className="ops-field-error" style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{generalIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
    {blocks.length === 0 && <p style={{ margin: 0, padding: 16, border: "1px dashed var(--line-strong)", borderRadius: 10, color: "var(--muted)", fontSize: 14 }}>Chưa có khối nội dung. Thêm đoạn văn, danh sách, ảnh hoặc video bên dưới.</p>}
    <ol style={{ margin: 0, padding: 0, display: "grid", gap: 12 }} aria-label="Các khối nội dung">
      {blocks.map((block, index) => <BlockCard key={block.id} block={block} index={index} total={blocks.length} issues={issuesFor(index)} check={checks[block.id]} onCheck={onCheck}
        onChange={(next) => onChange(blocks.map((item) => (item.id === block.id ? next : item)))} onMove={(delta) => move(index, delta)} onRemove={() => onChange(blocks.filter((item) => item.id !== block.id))} />)}
    </ol>
    {!disabled && <div className="ops-toolbar" style={{ marginBottom: 0 }}>
      <Select aria-label="Loại khối" style={{ width: 200 }} value={adding} onChange={(event) => setAdding(event.target.value as KnownType)}>
        {KNOWN_TYPES.map((type) => <option key={type} value={type}>{blockLabel[type]}</option>)}
      </Select>
      <Button type="button" variant="secondary" onClick={() => onChange([...blocks, newBlock(adding)])}><Plus size={16} aria-hidden="true" />Thêm khối</Button>
    </div>}
  </div>;
}
