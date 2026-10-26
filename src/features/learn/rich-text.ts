import { isRecord, list } from "./parse";
import { httpsUrl } from "./safe-url";

/*
 * Formatted text of `fet3d.learn/1` (BE#172, BE docs/learn-library.md "Formatted text"). heading, paragraph and callout carry
 * `text` and, only when something is formatted, `runs`; a list keeps `items` as strings and adds `itemRuns`. A run is plain
 * text with optional marks, a theme colour or highlight token and an https link: never HTML. The reader and the editor share
 * these helpers so both read, normalise and slice runs the same way the backend stores them.
 */

export const MARKS = ["bold", "italic", "underline", "strike"] as const;
export type Mark = (typeof MARKS)[number];
export const TONES = ["default", "ember", "danger", "warning", "success", "info"] as const;
export type Tone = (typeof TONES)[number];
export type Run = { text: string; marks?: Mark[]; color?: Tone; highlight?: Tone; link?: string };

const isMark = (value: unknown): value is Mark => (MARKS as readonly unknown[]).includes(value);
const isTone = (value: unknown): value is Tone => (TONES as readonly unknown[]).includes(value);

/** Runs from the API, or null when there are none. Unknown marks, tokens and unsafe links are dropped, never rendered. */
export function parseRuns(raw: unknown): Run[] | null {
  if (!Array.isArray(raw)) return null;
  const runs = list(raw).flatMap((item): Run[] => {
    if (!isRecord(item) || typeof item.text !== "string") return [];
    const run: Run = { text: item.text };
    const marks = list(item.marks).filter(isMark);
    if (marks.length) run.marks = marks;
    if (isTone(item.color)) run.color = item.color;
    if (isTone(item.highlight)) run.highlight = item.highlight;
    const link = httpsUrl(item.link);
    if (link) run.link = link;
    return [run];
  });
  return runs.length ? normalizeRuns(runs) : null;
}

export const plainRuns = (text: string): Run[] => (text ? [{ text }] : []);
export const runsText = (runs: Run[]) => runs.map((run) => run.text).join("");

/** Stored form, like the backend: no empty runs, no `default` tokens, marks deduplicated in a fixed order, equal neighbours merged. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const source of runs) {
    if (!source.text) continue;
    const run: Run = { text: source.text };
    const marks = MARKS.filter((mark) => source.marks?.includes(mark));
    if (marks.length) run.marks = marks;
    if (source.color && source.color !== "default") run.color = source.color;
    if (source.highlight && source.highlight !== "default") run.highlight = source.highlight;
    if (source.link) run.link = source.link;
    const last = out.at(-1);
    if (last && sameFormat(last, run)) last.text += run.text;
    else out.push(run);
  }
  return out;
}

export function sameFormat(a: Run, b: Run): boolean {
  return (a.marks ?? []).join() === (b.marks ?? []).join() && (a.color ?? "default") === (b.color ?? "default") && (a.highlight ?? "default") === (b.highlight ?? "default") && (a.link ?? "") === (b.link ?? "");
}

export const isFormatted = (runs: Run[]) => runs.some((run) => run.marks?.length || (run.color && run.color !== "default") || (run.highlight && run.highlight !== "default") || run.link);

/** The characters [start, end) with their formatting. */
export function sliceRuns(runs: Run[], start: number, end: number): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    const from = Math.max(start, at);
    const to = Math.min(end, at + run.text.length);
    if (from < to) out.push({ ...run, text: run.text.slice(from - at, to - at) });
    at += run.text.length;
  }
  return out;
}

export const splitRuns = (runs: Run[], at: number): [Run[], Run[]] => [sliceRuns(runs, 0, at), sliceRuns(runs, at, Number.MAX_SAFE_INTEGER)];

/** `runs` with [start, end) replaced by plain `text` that takes the formatting of the character before it (like typing). */
export function replaceText(runs: Run[], start: number, end: number, text: string): Run[] {
  const before = sliceRuns(runs, 0, start);
  const after = sliceRuns(runs, end, Number.MAX_SAFE_INTEGER);
  const style = before.at(-1) ?? after[0];
  const inserted: Run[] = text ? [{ ...(style ?? {}), text }] : [];
  return normalizeRuns([...before, ...inserted, ...after]);
}

/** Runs split into lines at "\n" (a paragraph becoming list items). */
export function runLines(runs: Run[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const run of runs) {
    run.text.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...run, text: part });
    });
  }
  return lines.map(normalizeRuns);
}

/** The word around a collapsed caret, so a format button with no selection formats that word (like word processors). */
export function wordAt(text: string, at: number): [number, number] {
  let start = at;
  let end = at;
  while (start > 0 && !/\s/.test(text[start - 1])) start -= 1;
  while (end < text.length && !/\s/.test(text[end])) end += 1;
  return [start, end];
}

/** Applies `change` to every run in [start, end); runs outside keep their formatting. */
export function formatRange(runs: Run[], start: number, end: number, change: (run: Run) => Run): Run[] {
  if (start >= end) return runs;
  return normalizeRuns([...sliceRuns(runs, 0, start), ...sliceRuns(runs, start, end).map(change), ...sliceRuns(runs, end, Number.MAX_SAFE_INTEGER)]);
}

/** What the toolbar shows for [start, end): marks every character has, and the colour, highlight and link when they are uniform. */
export type RangeFormat = { marks: Set<Mark>; color: Tone; highlight: Tone; link: string | null };
export function formatOf(runs: Run[], start: number, end: number): RangeFormat {
  const [from, to] = start === end ? wordAt(runsText(runs), start) : [start, end];
  const part = from === to ? sliceRuns(runs, Math.max(0, from - 1), from) : sliceRuns(runs, from, to);
  if (!part.length) return { marks: new Set(), color: "default", highlight: "default", link: null };
  const marks = new Set(MARKS.filter((mark) => part.every((run) => run.marks?.includes(mark))));
  const uniform = <T,>(pick: (run: Run) => T, fallback: T) => (part.every((run) => pick(run) === pick(part[0])) ? pick(part[0]) : fallback);
  return { marks, color: uniform((run) => run.color ?? "default", "default"), highlight: uniform((run) => run.highlight ?? "default", "default"), link: uniform((run) => run.link ?? null, null) };
}

/** Bold, italic…: added to the whole range unless every character already has it, then removed. */
export function toggleMark(runs: Run[], start: number, end: number, mark: Mark): Run[] {
  const remove = formatOf(runs, start, end).marks.has(mark);
  return formatRange(runs, start, end, (run) => ({ ...run, marks: remove ? run.marks?.filter((item) => item !== mark) : [...(run.marks ?? []), mark] }));
}

/** Vietnamese names of the theme colours (toolbar swatches). */
export const toneLabel: Record<Tone, string> = { default: "Mặc định", ember: "Cam", danger: "Đỏ", warning: "Vàng", success: "Xanh lá", info: "Xanh dương" };
