"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const MAX_ITEMS = 50;

/**
 * A list block edited like a document (Figma "Learn · Trình soạn v3"): one line per item with its number or bullet in
 * front. Enter adds an item below (on an empty last item it leaves the list), Backspace on an empty item removes it,
 * pasting several lines makes several items. Numbers follow the order, so they renumber on every change.
 */
export function ListItems({ items, ordered, onChange, onExit, disabled }: {
  items: string[]; ordered: boolean; onChange: (items: string[]) => void;
  /** Enter on an empty last item: the list ends (with `items`, the empty one dropped) and a paragraph follows. */
  onExit: (items: string[]) => void;
  disabled?: boolean;
}) {
  const rows = items.length ? items : [""];
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  // Where the caret goes after the change a key made; applied once the new rows are rendered.
  const focusAt = useRef<{ index: number; end: boolean } | null>(null);
  const setFocusAt = (target: { index: number; end: boolean }) => { focusAt.current = target; };
  useEffect(() => {
    const target = focusAt.current;
    if (!target) return;
    focusAt.current = null;
    const input = inputs.current[target.index];
    if (input) { input.focus(); const at = target.end ? input.value.length : 0; input.setSelectionRange(at, at); }
  });

  const set = (index: number, value: string) => onChange(rows.map((item, position) => (position === index ? value : item)));
  const onKey = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    const value = rows[index];
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!value.trim() && index === rows.length - 1 && rows.length > 1) { onExit(rows.slice(0, -1)); return; }
      if (rows.length >= MAX_ITEMS) return;
      const caret = event.currentTarget.selectionStart ?? value.length;
      // Enter in the middle of an item splits it, like a word processor.
      onChange([...rows.slice(0, index), value.slice(0, caret), value.slice(caret), ...rows.slice(index + 1)]);
      setFocusAt({ index: index + 1, end: false });
      return;
    }
    if (event.key === "Backspace" && !value && rows.length > 1) {
      event.preventDefault();
      onChange(rows.filter((_, position) => position !== index));
      setFocusAt({ index: Math.max(0, index - 1), end: true });
      return;
    }
    if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); inputs.current[index - 1]?.focus(); }
    if (event.key === "ArrowDown" && index < rows.length - 1) { event.preventDefault(); inputs.current[index + 1]?.focus(); }
  };
  const onPaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    const lines = event.clipboardData.getData("text").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return;
    event.preventDefault();
    const next = [...rows.slice(0, index), ...(rows[index].trim() ? [rows[index]] : []), ...lines, ...rows.slice(index + 1)].slice(0, MAX_ITEMS);
    onChange(next);
    setFocusAt({ index: Math.min(next.length - 1, index + lines.length - (rows[index].trim() ? 0 : 1)), end: true });
  };

  const Tag = ordered ? "ol" : "ul";
  return <Tag className="doc-list" data-ordered={ordered}>
    {rows.map((item, index) => <li key={index}>
      <span className="doc-list-marker" aria-hidden="true">{ordered ? `${index + 1}.` : "•"}</span>
      <input ref={(node) => { inputs.current[index] = node; }} aria-label={`Mục ${index + 1}`} value={item} maxLength={1000} disabled={disabled}
        placeholder={index === 0 ? "Mục đầu tiên" : "Mục tiếp theo"} onChange={(event) => set(index, event.target.value)} onKeyDown={onKey(index)} onPaste={onPaste(index)} />
    </li>)}
  </Tag>;
}
