"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { plainRuns, replaceText, runsText, splitRuns, type Run } from "@/features/learn/rich-text";
import { setSelectionOffsets } from "../rich-dom";
import { RichTextInput, type RichKeyInfo, type RichRange } from "./rich-text-input";

const MAX_ITEMS = 50;

/**
 * A list block edited like a document (Figma "Learn · Trình soạn v3"): one line per item with its number or bullet in
 * front. Enter splits the item at the caret (on an empty last item it leaves the list), Backspace on an empty item removes
 * it, pasting several lines makes several items. Items keep their formatting (BE#172). Numbers follow the order.
 */
export function ListItems({ items, ordered, onChange, onExit, disabled, blockId, onSelect, onUndo, onRedo }: {
  items: Run[][]; ordered: boolean; onChange: (items: Run[][]) => void;
  /** Enter on an empty last item: the list ends (with `items`, the empty one dropped) and a paragraph follows. */
  onExit: (items: Run[][]) => void;
  disabled?: boolean;
  /** Prefix of each item's `data-rich-key` (`{blockId}:{index}`), so the toolbar can address one item. */
  blockId: string;
  onSelect?: (item: number, range: RichRange) => void;
  onUndo?: () => void; onRedo?: () => void;
}) {
  const rows = items.length ? items : [[]];
  const list = useRef<HTMLElement>(null);
  // Where the caret goes after the change a key made; applied once the new rows are rendered.
  const focusAt = useRef<{ index: number; end: boolean } | null>(null);
  useEffect(() => {
    const target = focusAt.current;
    if (!target) return;
    focusAt.current = null;
    const input = list.current?.querySelector<HTMLElement>(`[data-rich-key="${CSS.escape(`${blockId}:${target.index}`)}"]`);
    if (!input) return;
    input.focus();
    setSelectionOffsets(input, target.end ? (input.textContent ?? "").length : 0);
  });
  const focus = (index: number, end: boolean) => {
    focusAt.current = { index, end };
    const input = list.current?.querySelector<HTMLElement>(`[data-rich-key="${CSS.escape(`${blockId}:${index}`)}"]`);
    if (input) { input.focus(); setSelectionOffsets(input, end ? (input.textContent ?? "").length : 0); focusAt.current = null; }
  };

  const set = (index: number, value: Run[]) => onChange(rows.map((item, position) => (position === index ? value : item)));
  const onKey = (index: number) => (event: KeyboardEvent<HTMLDivElement>, info: RichKeyInfo) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!info.length && index === rows.length - 1 && rows.length > 1) { onExit(rows.slice(0, -1)); return; }
      if (rows.length >= MAX_ITEMS) return;
      // Enter in the middle of an item splits it, like a word processor.
      const [before, after] = splitRuns(replaceText(info.runs, info.start, info.end, ""), info.start);
      onChange([...rows.slice(0, index), before, after, ...rows.slice(index + 1)]);
      focusAt.current = { index: index + 1, end: false };
      return;
    }
    if (event.key === "Backspace" && !info.length && rows.length > 1) {
      event.preventDefault();
      onChange(rows.filter((_, position) => position !== index));
      focusAt.current = { index: Math.max(0, index - 1), end: true };
      return;
    }
    if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); focus(index - 1, true); }
    if (event.key === "ArrowDown" && index < rows.length - 1) { event.preventDefault(); focus(index + 1, true); }
  };
  const onPaste = (index: number) => (text: string) => {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    const keep = runsText(rows[index]).trim() ? [rows[index]] : [];
    const next = [...rows.slice(0, index), ...keep, ...lines.map(plainRuns), ...rows.slice(index + 1)].slice(0, MAX_ITEMS);
    onChange(next);
    focusAt.current = { index: Math.min(next.length - 1, index + lines.length - (keep.length ? 0 : 1)), end: true };
    return true;
  };

  const Tag = ordered ? "ol" : "ul";
  return <Tag ref={list as RefObject<HTMLOListElement & HTMLUListElement>} className="doc-list" data-ordered={ordered}>
    {rows.map((item, index) => <li key={index}>
      <span className="doc-list-marker" aria-hidden="true">{ordered ? `${index + 1}.` : "•"}</span>
      <RichTextInput singleLine aria-label={`Mục ${index + 1}`} richKey={`${blockId}:${index}`} runs={item} disabled={disabled}
        placeholder={index === 0 ? "Mục đầu tiên" : "Mục tiếp theo"} onChange={(runs) => set(index, runs)} onKeyDown={onKey(index)} onPasteText={onPaste(index)}
        onSelect={(range) => onSelect?.(index, range)} onUndo={onUndo} onRedo={onRedo} />
    </li>)}
  </Tag>;
}
