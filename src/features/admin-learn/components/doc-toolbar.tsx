"use client";

import { Bold, Highlighter, ImageIcon, Italic, Link2, List, ListOrdered, MessageSquareWarning, Minus, Palette, Redo2, Strikethrough, Underline, Undo2, Film, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Select } from "@/components/ui/field";
import { newBlock, type EditorBlock } from "../blocks";
import { DOC_STYLES, insertAfter, styleOf, toCallout, toList, withStyle, type DocStyle } from "../doc-actions";

/** Text formatting inside a block needs BE#172; the buttons are shown so authors know it is coming. */
const SOON = "Sắp có: định dạng chữ trong đoạn";

function Tool({ icon: Icon, label, onClick, disabled, pressed, title, children }: { icon?: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; pressed?: boolean; title?: string; children?: ReactNode }) {
  return <button type="button" className="doc-tool" aria-label={label} title={title ?? label} disabled={disabled} aria-pressed={pressed} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
    {Icon ? <Icon size={17} aria-hidden="true" /> : children}
  </button>;
}

/**
 * Sticky formatting bar of the Docs-style editor (Figma "Learn · Trình soạn v3"). It acts on the focused block: paragraph
 * style, lists, callouts, and inserts an image or video after it. Undo/redo cover the whole page (block moves too).
 */
export function DocToolbar({ blocks, active, onBlocks, canUndo, canRedo, onUndo, onRedo, disabled }: {
  blocks: EditorBlock[]; active: number; onBlocks: (blocks: EditorBlock[], focusId?: string) => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; disabled: boolean;
}) {
  const block = blocks[active];
  const style = styleOf(block);
  const replace = (next: EditorBlock) => onBlocks(blocks.map((item, index) => (index === active ? next : item)), next.id);
  const insert = (type: "image" | "video") => { const next = newBlock(type); onBlocks(insertAfter(blocks, active, next), next.id); };
  const textual = block && (block.type === "paragraph" || block.type === "heading" || block.type === "callout" || block.type === "list");
  return <div className="doc-toolbar" role="toolbar" aria-label="Định dạng bài">
    <Tool icon={Undo2} label="Hoàn tác" onClick={onUndo} disabled={disabled || !canUndo} />
    <Tool icon={Redo2} label="Làm lại" onClick={onRedo} disabled={disabled || !canRedo} />
    <span className="doc-tool-sep" aria-hidden="true" />
    <Select aria-label="Kiểu đoạn" className="doc-style" value={style ?? ""} disabled={disabled || !style} onChange={(event) => { if (block) replace(withStyle(block, event.target.value as DocStyle)); }}>
      {!style && <option value="">Kiểu đoạn</option>}
      {DOC_STYLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </Select>
    <span className="doc-tool-sep" aria-hidden="true" />
    <Tool icon={Bold} label="In đậm" title={SOON} disabled />
    <Tool icon={Italic} label="In nghiêng" title={SOON} disabled />
    <Tool icon={Underline} label="Gạch chân" title={SOON} disabled />
    <Tool icon={Strikethrough} label="Gạch ngang" title={SOON} disabled />
    <Tool icon={Palette} label="Màu chữ" title={SOON} disabled />
    <Tool icon={Highlighter} label="Tô nền chữ" title={SOON} disabled />
    <Tool icon={Link2} label="Gắn liên kết" title={SOON} disabled />
    <span className="doc-tool-sep" aria-hidden="true" />
    <Tool icon={List} label="Danh sách chấm" disabled={disabled || !textual} pressed={block?.type === "list" && block.fields.ordered !== true} onClick={() => block && replace(toList(block, false))} />
    <Tool icon={ListOrdered} label="Danh sách số" disabled={disabled || !textual} pressed={block?.type === "list" && block.fields.ordered === true} onClick={() => block && replace(toList(block, true))} />
    <Tool icon={MessageSquareWarning} label="Khung lưu ý" disabled={disabled || !textual} pressed={block?.type === "callout"} onClick={() => block && replace(toCallout(block))} />
    <span className="doc-tool-sep" aria-hidden="true" />
    <Tool icon={ImageIcon} label="Chèn ảnh" disabled={disabled} onClick={() => insert("image")} />
    <Tool icon={Film} label="Chèn video" disabled={disabled} onClick={() => insert("video")} />
    <Tool icon={Minus} label="Đường kẻ" title="Sắp có: khối đường kẻ" disabled />
  </div>;
}
