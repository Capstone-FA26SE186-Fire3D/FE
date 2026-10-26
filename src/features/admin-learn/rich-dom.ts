import { MARKS, normalizeRuns, runsText, type Mark, type Run, type Tone } from "@/features/learn/rich-text";

/*
 * Formatted runs ↔ the DOM of a contentEditable field. The DOM is always built with createElement + text nodes (never
 * innerHTML), and read back from a fixed vocabulary: <strong>/<em>/<u>/<s> (and what browsers use for them: <b>, <i>,
 * <strike>, <del>, inline font styles) plus data-color, data-highlight and data-link. Anything else is read as plain text.
 * Offsets count characters of the runs' text, "\n" included, so the model and the caret agree.
 */

const TAG_MARK: Record<string, Mark> = { STRONG: "bold", B: "bold", EM: "italic", I: "italic", U: "underline", S: "strike", STRIKE: "strike", DEL: "strike" };
const MARK_TAG: Record<Mark, string> = { bold: "strong", italic: "em", underline: "u", strike: "s" };
type Format = Omit<Run, "text">;

function runNode(run: Run): Node {
  let node: Node = document.createTextNode(run.text);
  for (const mark of [...MARKS].reverse()) {
    if (!run.marks?.includes(mark)) continue;
    const element = document.createElement(MARK_TAG[mark]);
    element.appendChild(node);
    node = element;
  }
  if (run.color || run.highlight) {
    const span = document.createElement("span");
    span.className = "rt-run";
    if (run.color) span.dataset.color = run.color;
    if (run.highlight) span.dataset.highlight = run.highlight;
    span.appendChild(node);
    node = span;
  }
  if (run.link) {
    const span = document.createElement("span");
    span.className = "rt-link";
    span.dataset.link = run.link;
    span.title = run.link;
    span.appendChild(node);
    node = span;
  }
  return node;
}

/** Replaces the field's content with `runs`. A trailing line break gets a marker <br> so the caret can sit on the new line. */
export function renderRuns(root: HTMLElement, runs: Run[]) {
  root.replaceChildren(...runs.map(runNode));
  if (runs.at(-1)?.text.endsWith("\n")) {
    const end = document.createElement("br");
    end.dataset.rtEnd = "";
    root.appendChild(end);
  }
}

function formatOf(element: HTMLElement, base: Format): Format {
  const format: Format = { ...base, marks: [...(base.marks ?? [])] };
  const add = (mark: Mark) => { if (!format.marks!.includes(mark)) format.marks!.push(mark); };
  const tagMark = TAG_MARK[element.tagName];
  if (tagMark) add(tagMark);
  const style = element.style;
  if (style.fontWeight === "bold" || Number(style.fontWeight) >= 600) add("bold");
  if (style.fontStyle === "italic") add("italic");
  if (style.textDecorationLine.includes("underline") || style.textDecoration.includes("underline")) add("underline");
  if (style.textDecorationLine.includes("line-through") || style.textDecoration.includes("line-through")) add("strike");
  if (element.dataset.color) format.color = element.dataset.color as Tone;
  if (element.dataset.highlight) format.highlight = element.dataset.highlight as Tone;
  if (element.dataset.link) format.link = element.dataset.link;
  return format;
}

/**
 * A <br> with nothing after it ends the field without starting a visible line: browsers leave one in a field emptied by
 * deleting, and the end marker is one. Neither is a character.
 */
function isEndBreak(br: HTMLElement, root: Node): boolean {
  if ("rtEnd" in br.dataset) return true;
  for (let at: Node | null = br; at && at !== root; at = at.parentNode) {
    let next = at.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE && !next.textContent) next = next.nextSibling;
    if (next) return false;
  }
  return true;
}

/** The runs a field (or a cloned part of it) shows. Not normalised, so offsets stay exact. */
export function readRuns(root: Node): Run[] {
  const runs: Run[] = [];
  const walk = (node: Node, format: Format) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? "").replace(/ /g, " ");
        if (text) runs.push({ ...format, text });
        return;
      }
      if (!(child instanceof HTMLElement)) return;
      if (child.tagName === "BR") {
        if (!isEndBreak(child, root)) runs.push({ text: "\n" });
        return;
      }
      // A block element a browser slipped in (rare: Enter and paste are handled by the editor) starts a new line.
      if ((child.tagName === "DIV" || child.tagName === "P") && runs.length && !runsText(runs).endsWith("\n")) runs.push({ text: "\n" });
      walk(child, formatOf(child, format));
    });
  };
  walk(root, {});
  return runs.map((run) => (run.marks?.length ? run : { ...run, marks: undefined }));
}

const textLength = (root: Node) => runsText(readRuns(root)).length;

/** Caret or selection inside `root` as character offsets, or null when the selection is elsewhere. */
export function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const offset = (node: Node, at: number) => {
    const before = document.createRange();
    before.selectNodeContents(root);
    before.setEnd(node, at);
    return textLength(before.cloneContents());
  };
  const start = offset(range.startContainer, range.startOffset);
  return { start, end: range.collapsed ? start : offset(range.endContainer, range.endOffset) };
}

function pointAt(root: HTMLElement, target: number): [Node, number] {
  let at = 0;
  let found: [Node, number] | null = null;
  const walk = (node: Node): boolean => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const length = child.textContent?.length ?? 0;
        if (target <= at + length) { found = [child, target - at]; return true; }
        at += length;
      } else if (child instanceof HTMLElement) {
        if (child.tagName === "BR") {
          const index = Array.from(node.childNodes).indexOf(child);
          if (target <= at || isEndBreak(child, root)) { found = [node, index]; return true; }
          at += 1;
        } else if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(root);
  return found ?? [root, root.childNodes.length];
}

/** Puts the caret (or a selection) at character offsets inside `root`. */
export function setSelectionOffsets(root: HTMLElement, start: number, end = start) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const [startNode, startOffset] = pointAt(root, start);
  const [endNode, endOffset] = end === start ? [startNode, startOffset] : pointAt(root, end);
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Focuses a field by its `data-rich-key` and restores a selection (after a popover such as the link box took the focus). */
export function focusRich(key: string, start: number, end: number) {
  const root = document.querySelector<HTMLElement>(`[data-rich-key="${CSS.escape(key)}"]`);
  if (!root) return;
  root.focus();
  setSelectionOffsets(root, start, end);
}

export const sameRuns = (a: Run[], b: Run[]) => JSON.stringify(normalizeRuns(a)) === JSON.stringify(normalizeRuns(b));
