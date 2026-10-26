"use client";

import { ArrowDown, ArrowUp, Film, GripVertical, Heading2, ImageIcon, List, ListOrdered, MessageSquareWarning, Pilcrow, Plus, ShieldCheck, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { SupportCode } from "@/components/ui/support-code";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { blockLabel, extraFieldNames, isKnownType, KNOWN_TYPES, newBlock, updateFields, type EditorBlock, type KnownType } from "../blocks";
import type { ContentIssue } from "../content";
import { slashMatches, type SlashItem } from "../doc-actions";
import { ListItems } from "./list-items";
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
    <Field label="Liên kết video" required hint="Liên kết đầy đủ từ YouTube, Facebook hoặc TikTok (https). Hệ thống kiểm tra liên kết; không nhận mã nhúng hay liên kết rút gọn.">
      {(p) => <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Input {...p} style={{ flex: "1 1 260px", minWidth: 0 }} inputMode="url" value={url} onChange={(event) => onChange(updateFields(block, { url: event.target.value }))} onBlur={() => { if (url.trim() && (!check || check.url !== url.trim())) onCheck(block.id, url); }} />
        <Button type="button" variant="secondary" disabled={!url.trim() || current?.state === "checking"} onClick={() => onCheck(block.id, url)}><ShieldCheck size={16} aria-hidden="true" />{current?.state === "checking" ? "Đang kiểm tra…" : "Kiểm tra liên kết"}</Button>
      </div>}
    </Field>
    <div aria-live="polite" data-testid="media-result">
      {current?.state === "ok" && current.descriptor && <div style={{ display: "grid", gap: 6, padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg-soft)" }}>
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}><StatusBadge tone="success">Hợp lệ</StatusBadge><StatusBadge tone="info">{current.descriptor.provider}</StatusBadge></span>
        <span className="ops-field-hint" style={{ overflowWrap: "anywhere" }}>Liên kết chuẩn: <a href={current.descriptor.canonicalUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ember)" }}>{current.descriptor.canonicalUrl}</a></span>
        <span className="ops-field-hint">Người đọc xem video ngay trong bài; nếu {current.descriptor.provider} tắt nhúng, bài vẫn có liên kết mở trang gốc.</span>
      </div>}
      {current?.state === "invalid" && <p role="alert" className="ops-field-error" style={{ margin: 0 }}><TriangleAlert size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {current.message}</p>}
      {current?.state === "error" && <p role="alert" className="ops-field-error" style={{ margin: 0 }}>Chưa kiểm tra được: {current.message}. Bấm “Kiểm tra liên kết” để thử lại; máy chủ vẫn kiểm tra khi lưu.</p>}
      {!current && savedProvider && <span className="ops-field-hint">Đã lưu video {savedProvider}. Người đọc xem ngay trong bài.</span>}
    </div>
  </>;
}

type TextKeys = {
  onTextKey?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Docs mode: a list is edited one item per line; leaving it (Enter on an empty last item) opens a paragraph. */
  doc?: boolean; onExitList?: (items: string[]) => void;
};

function BlockFields({ block, onChange, check, onCheck, onTextKey, doc, onExitList }: { block: EditorBlock; onChange: (block: EditorBlock) => void; check: MediaCheck | undefined; onCheck: (blockId: string, url: string) => void } & TextKeys) {
  const set = (patch: Record<string, unknown>) => onChange(updateFields(block, patch));
  switch (block.type) {
    case "heading": return <div className="ops-form-grid">
      <Field label="Nội dung tiêu đề" required className="ops-span-all">{(p) => <Input {...p} maxLength={200} placeholder="Tiêu đề" value={text(block.fields.text)} onKeyDown={onTextKey} onChange={(event) => set({ text: event.target.value })} />}</Field>
      <Field label="Cấp tiêu đề">{(p) => <Select {...p} value={String(block.fields.level ?? 2)} onChange={(event) => set({ level: Number(event.target.value) })}><option value="2">Cấp 2 (mục chính)</option><option value="3">Cấp 3</option><option value="4">Cấp 4</option></Select>}</Field>
    </div>;
    case "paragraph": return <Field label="Nội dung" required hint="Chữ thường. Enter: đoạn mới · Shift+Enter: xuống dòng · gõ “/” để chèn khối.">{(p) => <Textarea {...p} rows={2} placeholder="Gõ nội dung, hoặc gõ “/” để chèn tiêu đề, danh sách, ảnh, video…" value={text(block.fields.text)} onKeyDown={onTextKey} onChange={(event) => set({ text: event.target.value })} />}</Field>;
    case "list": {
      const items = Array.isArray(block.fields.items) ? block.fields.items.map(text) : [""];
      if (doc) return <div className="doc-list-wrap">
        <ListItems items={items} ordered={block.fields.ordered === true} onChange={(next) => set({ items: next })} onExit={(next) => onExitList?.(next)} />
        <Select aria-label="Kiểu danh sách" className="doc-list-kind" value={block.fields.ordered === true ? "ordered" : "bullets"} onChange={(event) => set({ ordered: event.target.value === "ordered" })}><option value="bullets">Gạch đầu dòng</option><option value="ordered">Đánh số</option></Select>
      </div>;
      return <div className="ops-form-grid">
        <Field label="Các mục (mỗi dòng một mục)" required hint="Mỗi dòng một mục · tối đa 50 mục, mỗi mục tối đa 1000 ký tự." className="ops-span-all">{(p) => <Textarea {...p} rows={3} placeholder="Mỗi dòng một mục" value={items.join("\n")} onChange={(event) => set({ items: event.target.value.split("\n") })} />}</Field>
        <Field label="Kiểu danh sách">{(p) => <Select {...p} value={block.fields.ordered === true ? "ordered" : "bullets"} onChange={(event) => set({ ordered: event.target.value === "ordered" })}><option value="bullets">Gạch đầu dòng</option><option value="ordered">Đánh số</option></Select>}</Field>
      </div>;
    }
    case "callout": return <div className="ops-form-grid">
      <Field label="Mức nhấn mạnh">{(p) => <Select {...p} value={text(block.fields.tone) || "info"} onChange={(event) => set({ tone: event.target.value })}>{(Object.keys(toneLabel) as Array<keyof typeof toneLabel>).map((tone) => <option key={tone} value={tone}>{toneLabel[tone]}</option>)}</Select>}</Field>
      <Field label="Nội dung" required className="ops-span-all">{(p) => <Textarea {...p} rows={2} placeholder="Nội dung cần nhấn mạnh" value={text(block.fields.text)} onChange={(event) => set({ text: event.target.value })} />}</Field>
    </div>;
    case "image": return <div className="ops-form-grid">
      <Field label="Đường dẫn ảnh (https)" required className="ops-span-all">{(p) => <Input {...p} inputMode="url" value={text(block.fields.url)} onChange={(event) => set({ url: event.target.value })} />}</Field>
      <Field label="Mô tả ảnh" required hint="Dành cho người đọc màn hình và khi ảnh không tải được." className="ops-span-all">{(p) => <Input {...p} maxLength={300} value={text(block.fields.alt)} onChange={(event) => set({ alt: event.target.value })} />}</Field>
    </div>;
    case "video": return <VideoFields block={block} onChange={onChange} check={check} onCheck={onCheck} />;
    default: return <div style={{ display: "grid", gap: 8 }}>
      <p className="ops-field-hint" style={{ margin: 0 }}>Khối này không còn được hỗ trợ trong trình soạn. Nội dung được giữ nguyên khi lưu; nếu máy chủ từ chối, hãy xóa khối này.</p>
      <SupportCode code={block.type} detail={JSON.stringify(block.fields)} />
    </div>;
  }
}

/** "/" menu under an empty paragraph: what the block can become. Keyboard: ↑ ↓ to move, Enter to pick, Esc to close. */
function SlashMenu({ items, selected, onPick, id }: { items: SlashItem[]; selected: number; onPick: (item: SlashItem) => void; id: string }) {
  return <div className="doc-slash" role="listbox" id={id} aria-label="Chèn khối">
    <p className="doc-slash-head">Chèn khối</p>
    {items.map((item, index) => {
      const Icon = item.key === "numbers" ? ListOrdered : item.key === "bullets" ? List : item.key === "warning" ? TriangleAlert : icons[item.type];
      return <button key={item.key} type="button" role="option" aria-selected={index === selected} className="doc-slash-item" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(item)}>
        <span className="doc-slash-icon"><Icon size={16} aria-hidden="true" /></span><span><strong>{item.label}</strong><small>{item.hint}</small></span>
      </button>;
    })}
    {items.length === 0 && <p className="doc-slash-empty">Không có khối nào khớp.</p>}
  </div>;
}

function BlockCard({ block, index, total, onChange, onMove, onRemove, onEnter, onEmptyBackspace, issues, check, onCheck, doc, active, onActive }: {
  block: EditorBlock; index: number; total: number; onChange: (block: EditorBlock) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void;
  /** Docs mode: Enter in a heading or paragraph opens a new paragraph below; Backspace in an empty paragraph removes it. */
  onEnter: (replaced?: EditorBlock) => void; onEmptyBackspace: () => void;
  issues: ContentIssue[]; check: MediaCheck | undefined; onCheck: (blockId: string, url: string) => void;
  doc: boolean; active: boolean; onActive: () => void;
}) {
  const known = isKnownType(block.type);
  const Icon = block.type === "list" ? (block.fields.ordered === true ? ListOrdered : List) : known ? icons[block.type as KnownType] : TriangleAlert;
  const label = `${known ? blockLabel[block.type as KnownType] : "Khối không hỗ trợ"} ${index + 1}`;
  const extras = extraFieldNames(block);
  const slashText = block.type === "paragraph" ? text(block.fields.text) : "";
  const slashOpen = doc && slashText.startsWith("/") && !slashText.includes("\n") && slashText.length <= 24;
  const matches = slashOpen ? slashMatches(slashText.slice(1)) : [];
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState("");
  const showMenu = slashOpen && dismissed !== slashText;
  const current = Math.min(selected, Math.max(matches.length - 1, 0));
  const pick = (item: SlashItem) => { const next = item.make(); onChange({ ...next, id: block.id }); setSelected(0); };
  const onTextKey = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!doc) return;
    if (showMenu) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const size = Math.max(matches.length, 1); setSelected((value) => (Math.min(value, size - 1) + (event.key === "ArrowDown" ? 1 : -1) + size) % size); return; }
      if (event.key === "Enter" && matches[current]) { event.preventDefault(); pick(matches[current]); return; }
      if (event.key === "Escape") { event.preventDefault(); setDismissed(slashText); return; }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onEnter(); return; }
    if (event.key === "Backspace" && block.type === "paragraph" && slashText === "" && total > 1) { event.preventDefault(); onEmptyBackspace(); }
  };
  return <li className={doc ? "doc-block" : undefined} style={doc ? undefined : { listStyle: "none", display: "grid", gap: 12, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)" }}
    data-testid="content-block" data-block-type={block.type} data-block-id={block.id} data-active={doc && active ? "true" : undefined}
    data-tone={block.type === "callout" ? text(block.fields.tone) || "info" : undefined} data-level={block.type === "heading" ? String(block.fields.level ?? 2) : undefined}
    data-ordered={block.type === "list" ? String(block.fields.ordered === true) : undefined} onFocusCapture={onActive}>
    <div className={doc ? "doc-block-bar" : undefined} style={doc ? undefined : { display: "flex", alignItems: "center", gap: 8 }}>
      {doc ? <GripVertical size={16} aria-hidden="true" className="doc-grip" /> : <Icon size={16} aria-hidden="true" style={{ color: "var(--dim)" }} />}
      <strong className={doc ? "doc-block-name" : undefined} style={doc ? undefined : { fontSize: 13 }}>{doc && <Icon size={13} aria-hidden="true" />}{label}</strong>
      <span className={doc ? "doc-block-tools" : undefined} style={doc ? undefined : { marginLeft: "auto", display: "inline-flex", gap: 4 }}>
        <Button type="button" size="icon" variant="quiet" aria-label={`Chuyển ${label} lên`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={16} aria-hidden="true" /></Button>
        <Button type="button" size="icon" variant="quiet" aria-label={`Chuyển ${label} xuống`} disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={16} aria-hidden="true" /></Button>
        <Button type="button" size="icon" variant="quiet" aria-label={`Xóa ${label}`} onClick={onRemove}><Trash2 size={16} aria-hidden="true" /></Button>
      </span>
    </div>
    <div className={doc ? "doc-block-body" : undefined}>
      <BlockFields block={block} onChange={onChange} check={check} onCheck={onCheck} onTextKey={onTextKey} doc={doc} onExitList={(items) => onEnter(updateFields(block, { items }))} />
      {showMenu && <SlashMenu items={matches} selected={current} onPick={pick} id={`slash-${block.id}`} />}
    </div>
    {known && extras.length > 0 && <p className="ops-field-hint" style={{ margin: 0 }} data-testid="block-extras">Khối có thông tin thừa (được giữ nguyên); máy chủ có thể từ chối khi lưu. Nếu vậy, hãy tạo lại khối này.<SupportCode detail={extras.join(", ")} /></p>}
    {issues.length > 0 && <ul role="alert" style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }} className="ops-field-error">{issues.map((issue, position) => <li key={`${issue.path}-${position}`}>{issue.message}</li>)}</ul>}
  </li>;
}

/**
 * Content blocks of `fet3d.learn/1`: heading, paragraph, list, callout, image and external video links. No HTML, iframe or script.
 * `doc` renders them as one page (Figma "Learn · Trình soạn v3"): seamless text, a grip bar per block, the "/" menu, Enter and
 * Backspace between paragraphs. The editor's toolbar reads the focused block through `onActive`.
 */
export function BlockEditor({ blocks, onChange, disabled, issues, checks, onCheck, doc = false, active = -1, onActive, focusId }: Common & {
  blocks: EditorBlock[]; onChange: (blocks: EditorBlock[]) => void; issues: ContentIssue[]; checks: Record<string, MediaCheck>; onCheck: (blockId: string, url: string) => void;
  doc?: boolean; active?: number; onActive?: (index: number) => void;
  /** A block the parent just inserted (toolbar): its first field gets the focus. */
  focusId?: string | null;
}) {
  const [adding, setAdding] = useState<KnownType>("paragraph");
  const focusNext = useRef<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { if (focusId) focusNext.current = focusId; }, [focusId]);
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    focusNext.current = null;
    list.current?.querySelector<HTMLElement>(`[data-block-id="${id}"] textarea, [data-block-id="${id}"] input`)?.focus();
  });
  const move = (index: number, delta: -1 | 1) => {
    const next = blocks.slice();
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };
  const add = (index: number, block: EditorBlock) => { focusNext.current = block.id; onChange([...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)]); };
  const generalIssues = issues.filter((issue) => !/^\$\.blocks\[\d+\]/.test(issue.path) && issue.path.startsWith("$.blocks"));
  const issuesFor = (index: number) => issues.filter((issue) => issue.path === `$.blocks[${index}]` || issue.path.startsWith(`$.blocks[${index}].`));
  return <div className={doc ? "doc-blocks" : "ops-stack"}>
    {generalIssues.length > 0 && <ul role="alert" className="ops-field-error" style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{generalIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
    {blocks.length === 0 && <p style={{ margin: 0, padding: 16, border: "1px dashed var(--line-strong)", borderRadius: 10, color: "var(--muted)", fontSize: 14 }}>Chưa có khối nội dung. Thêm đoạn văn, danh sách, ảnh hoặc video bên dưới.</p>}
    <ol ref={list} style={{ margin: 0, padding: 0, display: "grid", gap: doc ? 2 : 12 }} aria-label="Các khối nội dung">
      {blocks.map((block, index) => <BlockCard key={block.id} block={block} index={index} total={blocks.length} issues={issuesFor(index)} check={checks[block.id]} onCheck={onCheck}
        doc={doc} active={index === active} onActive={() => onActive?.(index)}
        onEnter={(replaced) => {
          // One change for "leave the list": the trimmed list and the new paragraph together.
          const paragraph = newBlock("paragraph");
          const base = replaced ? blocks.map((item) => (item.id === replaced.id ? replaced : item)) : blocks;
          focusNext.current = paragraph.id;
          onChange([...base.slice(0, index + 1), paragraph, ...base.slice(index + 1)]);
        }}
        onEmptyBackspace={() => { const neighbour = blocks[index - 1] ?? blocks[index + 1]; if (neighbour) focusNext.current = neighbour.id; onChange(blocks.filter((item) => item.id !== block.id)); }}
        onChange={(next) => { if (next.type !== block.type) focusNext.current = next.id; onChange(blocks.map((item) => (item.id === block.id ? next : item))); }}
        onMove={(delta) => move(index, delta)} onRemove={() => onChange(blocks.filter((item) => item.id !== block.id))} />)}
    </ol>
    {!disabled && <div className={doc ? "doc-add" : "ops-toolbar"} style={doc ? undefined : { marginBottom: 0 }}>
      <Select aria-label="Loại khối" style={{ width: 200 }} value={adding} onChange={(event) => setAdding(event.target.value as KnownType)}>
        {KNOWN_TYPES.map((type) => <option key={type} value={type}>{blockLabel[type]}</option>)}
      </Select>
      <Button type="button" variant={doc ? "quiet" : "secondary"} onClick={() => add(blocks.length - 1, newBlock(adding))}><Plus size={16} aria-hidden="true" />Thêm khối</Button>
    </div>}
  </div>;
}
