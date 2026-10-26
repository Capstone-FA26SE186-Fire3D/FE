"use client";

import { Bold, Check, Film, Highlighter, ImageIcon, Italic, Link2, Link2Off, List, ListOrdered, MessageSquareWarning, Minus, Palette, Redo2, Strikethrough, Underline, Undo2, type LucideIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Select } from "@/components/ui/field";
import { formatOf, formatRange, TONES, toneLabel, toggleMark, wordAt, runsText, type Mark, type Run, type Tone } from "@/features/learn/rich-text";
import { httpsUrl } from "@/features/learn/safe-url";
import { newBlock, type EditorBlock } from "../blocks";
import { DOC_STYLES, insertAfter, richKeyOf, selectionRuns, styleOf, toCallout, toList, withSelectionRuns, withStyle, type DocStyle, type RichSelection } from "../doc-actions";
import { focusRich } from "../rich-dom";

// Buttons keep the caret in the text: pressing one must not move the focus away from the field being formatted.
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

function Tool({ icon: Icon, label, onClick, disabled, pressed, title, expanded, children }: { icon?: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; pressed?: boolean; title?: string; expanded?: boolean; children?: ReactNode }) {
  return <button type="button" className="doc-tool" aria-label={label} title={title ?? label} disabled={disabled} aria-pressed={pressed} aria-expanded={expanded} onMouseDown={keepFocus} onClick={onClick}>
    {Icon ? <Icon size={17} aria-hidden="true" /> : children}
  </button>;
}

const MARK_TOOLS: Array<{ mark: Mark; icon: LucideIcon; label: string; keys?: string }> = [
  { mark: "bold", icon: Bold, label: "In đậm", keys: "Ctrl+B" },
  { mark: "italic", icon: Italic, label: "In nghiêng", keys: "Ctrl+I" },
  { mark: "underline", icon: Underline, label: "Gạch chân", keys: "Ctrl+U" },
  { mark: "strike", icon: Strikethrough, label: "Gạch ngang" },
];

/** Swatches of the theme colour tokens (the backend accepts no colour codes). */
function TonePalette({ label, value, kind, onPick }: { label: string; value: Tone; kind: "color" | "highlight"; onPick: (tone: Tone) => void }) {
  return <div className="doc-pop" role="group" aria-label={label}>
    <p className="doc-pop-head">{label}</p>
    <div className="doc-swatches">
      {TONES.map((tone) => <button key={tone} type="button" className="doc-swatch" data-kind={kind} data-tone={tone} aria-label={`${label}: ${toneLabel[tone]}`} aria-pressed={value === tone} title={toneLabel[tone]} onMouseDown={keepFocus} onClick={() => onPick(tone)}>
        <span className="rt-run" data-color={kind === "color" && tone !== "default" ? tone : undefined} data-highlight={kind === "highlight" && tone !== "default" ? tone : undefined}>A</span>
        {value === tone && <Check size={12} aria-hidden="true" className="doc-swatch-check" />}
      </button>)}
    </div>
  </div>;
}

function LinkBox({ initial, onApply, onRemove, onCancel }: { initial: string; onApply: (url: string) => void; onRemove: (() => void) | null; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const url = httpsUrl(value.trim());
    if (!url) { setError("Dán đường dẫn đầy đủ bắt đầu bằng https://"); return; }
    onApply(url);
  };
  return <form className="doc-pop doc-link-box" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <label className="doc-pop-head" htmlFor="doc-link-url">Liên kết</label>
    <input id="doc-link-url" className="ops-input" inputMode="url" autoFocus placeholder="https://…" value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} />
    {error && <p className="ops-field-error" role="alert" style={{ margin: 0 }}>{error}</p>}
    <div className="doc-link-actions">
      {onRemove && <button type="button" className="doc-link-remove" onClick={onRemove}><Link2Off size={14} aria-hidden="true" />Bỏ liên kết</button>}
      <button type="button" className="doc-link-cancel" onClick={onCancel}>Hủy</button>
      <button type="submit" className="doc-link-apply">Gắn liên kết</button>
    </div>
  </form>;
}

/**
 * Sticky formatting bar of the Docs-style editor (Figma "Learn · Trình soạn v3"). Block tools act on the focused block
 * (paragraph style, lists, callouts, inserting an image, video or divider); text tools act on the selection inside a text
 * field (or the word at the caret): bold, italic, underline, strike, theme colour, highlight and links (BE#172).
 * Undo/redo cover the whole page.
 */
export function DocToolbar({ blocks, active, selection, onBlocks, canUndo, canRedo, onUndo, onRedo, disabled }: {
  blocks: EditorBlock[]; active: number; selection: RichSelection | null; onBlocks: (blocks: EditorBlock[], focusId?: string) => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; disabled: boolean;
}) {
  const [open, setOpen] = useState<"color" | "highlight" | "link" | null>(null);
  const block = blocks[active];
  const style = styleOf(block);
  const replace = (next: EditorBlock) => onBlocks(blocks.map((item, index) => (index === active ? next : item)), next.id);
  const insert = (type: "image" | "video" | "divider") => {
    const next = newBlock(type);
    // A divider has nothing to type into, so a paragraph follows it to keep writing.
    const after = type === "divider" ? newBlock("paragraph") : null;
    const inserted = insertAfter(blocks, active, next);
    onBlocks(after ? insertAfter(inserted, inserted.indexOf(next), after) : inserted, (after ?? next).id);
  };
  const textual = block && (block.type === "paragraph" || block.type === "heading" || block.type === "callout" || block.type === "list");

  // Text formatting: the selection's block and runs, and the range a tool changes (the word at a collapsed caret).
  const target = selection ? blocks.find((item) => item.id === selection.blockId) : undefined;
  const runs = selection ? selectionRuns(target, selection.item) : null;
  const range: [number, number] | null = selection && runs ? (selection.start === selection.end ? wordAt(runsText(runs), selection.start) : [Math.min(selection.start, selection.end), Math.max(selection.start, selection.end)]) : null;
  const canFormat = !disabled && !!range && range[0] < range[1];
  const format = runs && selection ? formatOf(runs, selection.start, selection.end) : null;
  const apply = (change: (runs: Run[], from: number, to: number) => Run[]) => {
    if (!canFormat || !target || !runs || !range || !selection) return;
    onBlocks(blocks.map((item) => (item.id === target.id ? withSelectionRuns(item, selection.item, change(runs, range[0], range[1])) : item)));
  };
  const refocus = () => { if (selection) requestAnimationFrame(() => focusRich(richKeyOf(selection), selection.start, selection.end)); };
  const toggle = (name: "color" | "highlight" | "link") => setOpen((current) => (current === name ? null : name));

  return <div className="doc-toolbar" role="toolbar" aria-label="Định dạng bài">
    <Tool icon={Undo2} label="Hoàn tác" title="Hoàn tác (Ctrl+Z)" onClick={onUndo} disabled={disabled || !canUndo} />
    <Tool icon={Redo2} label="Làm lại" title="Làm lại (Ctrl+Y)" onClick={onRedo} disabled={disabled || !canRedo} />
    <span className="doc-tool-sep" aria-hidden="true" />
    <Select aria-label="Kiểu đoạn" className="doc-style" value={style ?? ""} disabled={disabled || !style} onChange={(event) => { if (block) replace(withStyle(block, event.target.value as DocStyle)); }}>
      {!style && <option value="">Kiểu đoạn</option>}
      {DOC_STYLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </Select>
    <span className="doc-tool-sep" aria-hidden="true" />
    {MARK_TOOLS.map((tool) => <Tool key={tool.mark} icon={tool.icon} label={tool.label} title={tool.keys ? `${tool.label} (${tool.keys})` : tool.label} disabled={!canFormat} pressed={!!format?.marks.has(tool.mark)}
      onClick={() => apply((current, from, to) => toggleMark(current, from, to, tool.mark))} />)}
    <span className="doc-tool-anchor">
      <Tool icon={Palette} label="Màu chữ" disabled={!canFormat} expanded={open === "color"} pressed={!!format && format.color !== "default"} onClick={() => toggle("color")} />
      {open === "color" && canFormat && <TonePalette label="Màu chữ" kind="color" value={format?.color ?? "default"} onPick={(tone) => { apply((current, from, to) => formatRange(current, from, to, (run) => ({ ...run, color: tone }))); setOpen(null); }} />}
    </span>
    <span className="doc-tool-anchor">
      <Tool icon={Highlighter} label="Tô nền chữ" disabled={!canFormat} expanded={open === "highlight"} pressed={!!format && format.highlight !== "default"} onClick={() => toggle("highlight")} />
      {open === "highlight" && canFormat && <TonePalette label="Tô nền chữ" kind="highlight" value={format?.highlight ?? "default"} onPick={(tone) => { apply((current, from, to) => formatRange(current, from, to, (run) => ({ ...run, highlight: tone }))); setOpen(null); }} />}
    </span>
    <span className="doc-tool-anchor">
      <Tool icon={Link2} label="Gắn liên kết" disabled={!canFormat} expanded={open === "link"} pressed={!!format?.link} onClick={() => toggle("link")} />
      {open === "link" && canFormat && <LinkBox initial={format?.link ?? ""}
        onApply={(url) => { apply((current, from, to) => formatRange(current, from, to, (run) => ({ ...run, link: url }))); setOpen(null); refocus(); }}
        onRemove={format?.link ? () => { apply((current, from, to) => formatRange(current, from, to, (run) => ({ ...run, link: undefined }))); setOpen(null); refocus(); } : null}
        onCancel={() => { setOpen(null); refocus(); }} />}
    </span>
    <span className="doc-tool-sep" aria-hidden="true" />
    <Tool icon={List} label="Danh sách chấm" disabled={disabled || !textual} pressed={block?.type === "list" && block.fields.ordered !== true} onClick={() => block && replace(toList(block, false))} />
    <Tool icon={ListOrdered} label="Danh sách số" disabled={disabled || !textual} pressed={block?.type === "list" && block.fields.ordered === true} onClick={() => block && replace(toList(block, true))} />
    <Tool icon={MessageSquareWarning} label="Khung lưu ý" disabled={disabled || !textual} pressed={block?.type === "callout"} onClick={() => block && replace(toCallout(block))} />
    <span className="doc-tool-sep" aria-hidden="true" />
    <Tool icon={ImageIcon} label="Chèn ảnh" disabled={disabled} onClick={() => insert("image")} />
    <Tool icon={Film} label="Chèn video" disabled={disabled} onClick={() => insert("video")} />
    <Tool icon={Minus} label="Đường kẻ" title="Chèn đường kẻ ngăn cách" disabled={disabled} onClick={() => insert("divider")} />
  </div>;
}
