"use client";

import { useEffect, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { normalizeRuns, replaceText, runsText, toggleMark, wordAt, type Mark, type Run } from "@/features/learn/rich-text";
import { cn } from "@/utils/cn";
import { readRuns, renderRuns, selectionOffsets, setSelectionOffsets } from "../rich-dom";
import "@/features/learn/rich-text.css";

export type RichRange = { start: number; end: number };
export type RichKeyInfo = RichRange & { length: number; runs: Run[] };

const SHORTCUT: Record<string, Mark> = { b: "bold", i: "italic", u: "underline" };

/**
 * A text field that holds formatted runs (BE#172): typing works like any field, bold/italic/underline come from Ctrl+B/I/U
 * or the editor's toolbar, and only plain text can be pasted or dropped. The DOM is the source while typing; anything
 * else (shortcuts, toolbar, paste, a line break) changes the runs and the field redraws them, keeping the caret.
 * `onKeyDown` sees each key first with the caret's offsets; calling preventDefault there skips the field's own handling.
 */
export function RichTextInput({ runs, onChange, singleLine = false, newlineOnEnter = false, placeholder, richKey, disabled = false, className, onKeyDown, onSelect, onPasteText, onUndo, onRedo, ...aria }: {
  runs: Run[];
  onChange: (runs: Run[]) => void;
  singleLine?: boolean;
  /** Enter starts a new line inside the field (a callout); otherwise Enter is left to `onKeyDown` and only Shift+Enter breaks. */
  newlineOnEnter?: boolean;
  placeholder?: string;
  /** Identifies the field for `focusRich` (the toolbar's link box gives the focus back through it). */
  richKey?: string;
  disabled?: boolean;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>, info: RichKeyInfo) => void;
  onSelect?: (range: RichRange) => void;
  /** Return true when the paste was handled (a list turns pasted lines into items). */
  onPasteText?: (text: string, info: RichKeyInfo) => boolean;
  /** Page undo/redo: the browser's own undo would fight the redraws. */
  onUndo?: () => void;
  onRedo?: () => void;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}) {
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);
  const caret = useRef<RichRange | null>(null);
  const select = useRef(onSelect);
  const key = JSON.stringify(normalizeRuns(runs));

  useLayoutEffect(() => { select.current = onSelect; });

  // Redraw only when the runs differ from what the field shows (typing already shows its own change).
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || shown.current === key) return;
    const focused = document.activeElement === element;
    const keep = caret.current ?? (focused ? selectionOffsets(element) : null);
    caret.current = null;
    renderRuns(element, normalizeRuns(runs));
    shown.current = key;
    if (keep && focused) setSelectionOffsets(element, keep.start, keep.end);
  });

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const locked = () => element.getAttribute("contenteditable") !== "true" || element.closest("fieldset")?.disabled === true;
    // Browser formatting (context menu, Ctrl+B before React sees it), drops and undo would bypass the runs.
    const beforeInput = (event: InputEvent) => {
      if (locked() || event.inputType.startsWith("format") || event.inputType.startsWith("history") || event.inputType === "insertFromDrop" || event.inputType === "insertParagraph" || (singleLine && event.inputType === "insertLineBreak")) event.preventDefault();
    };
    const selectionChange = () => {
      if (document.activeElement !== element) return;
      const range = selectionOffsets(element);
      if (range) select.current?.(range);
    };
    element.addEventListener("beforeinput", beforeInput);
    document.addEventListener("selectionchange", selectionChange);
    return () => { element.removeEventListener("beforeinput", beforeInput); document.removeEventListener("selectionchange", selectionChange); };
  }, [singleLine]);

  const current = () => (root.current ? normalizeRuns(readRuns(root.current)) : normalizeRuns(runs));
  const range = (): RichRange => (root.current && selectionOffsets(root.current)) || { start: runsText(current()).length, end: runsText(current()).length };
  const info = (): RichKeyInfo => { const now = current(); return { ...range(), length: runsText(now).length, runs: now }; };
  const commit = (next: Run[], at: RichRange) => { caret.current = at; onChange(next); };

  const onInput = () => {
    const element = root.current;
    if (!element) return;
    const next = normalizeRuns(readRuns(element));
    // An emptied field drops the <br> browsers leave behind, so the placeholder shows again.
    if (!next.length && element.childNodes.length) element.replaceChildren();
    shown.current = JSON.stringify(next);
    onChange(next);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    onKeyDown?.(event, info());
    if (event.defaultPrevented) return;
    const mod = event.ctrlKey || event.metaKey;
    const letter = event.key.toLowerCase();
    if (mod && !event.altKey && SHORTCUT[letter] && !event.shiftKey) {
      event.preventDefault();
      const { start, end, runs: now } = info();
      const [from, to] = start === end ? wordAt(runsText(now), start) : [start, end];
      if (from < to) commit(toggleMark(now, from, to, SHORTCUT[letter]), { start, end });
      return;
    }
    if (mod && letter === "z") { event.preventDefault(); if (event.shiftKey) onRedo?.(); else onUndo?.(); return; }
    if (mod && letter === "y") { event.preventDefault(); onRedo?.(); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      if (singleLine || (!event.shiftKey && !newlineOnEnter)) return;
      const { start, end, runs: now } = info();
      commit(replaceText(now, start, end, "\n"), { start: start + 1, end: start + 1 });
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    const raw = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!raw) return;
    const now = info();
    if (onPasteText?.(raw, now)) return;
    const text = singleLine ? raw.replace(/\s*\n\s*/g, " ") : raw;
    commit(replaceText(now.runs, now.start, now.end, text), { start: now.start + text.length, end: now.start + text.length });
  };

  return <div ref={root} role="textbox" aria-multiline={!singleLine} contentEditable={!disabled} suppressContentEditableWarning spellCheck
    className={cn("rt-input", className)} data-placeholder={placeholder} data-rich-key={richKey} data-single-line={singleLine ? "true" : undefined} aria-disabled={disabled || undefined}
    onInput={onInput} onKeyDown={onKey} onPaste={onPaste} onDrop={(event) => event.preventDefault()}
    onFocus={() => { const element = root.current; const at = element && selectionOffsets(element); if (at) select.current?.(at); }}
    {...aria} />;
}
