import type { ReactNode } from "react";
import type { Run } from "../rich-text";
import "../rich-text.css";

/*
 * Formatted text as React elements: marks become <strong>/<em>/<u>/<s>, colours and highlights are theme classes, a link is
 * an https <a> that opens in a new tab without a referrer. Text stays text nodes; nothing from the API becomes markup.
 */

function RunView({ run }: { run: Run }) {
  let node: ReactNode = run.text;
  if (run.marks?.includes("strike")) node = <s>{node}</s>;
  if (run.marks?.includes("underline")) node = <u>{node}</u>;
  if (run.marks?.includes("italic")) node = <em>{node}</em>;
  if (run.marks?.includes("bold")) node = <strong>{node}</strong>;
  if (run.color || run.highlight) node = <span className="rt-run" data-color={run.color} data-highlight={run.highlight}>{node}</span>;
  if (run.link) node = <a className="rt-link" href={run.link} target="_blank" rel="noopener noreferrer nofollow">{node}</a>;
  return node;
}

/** `runs` when the block is formatted, else its plain `text`. */
export function RichText({ text, runs }: { text: string; runs?: Run[] | null }) {
  if (!runs?.length) return text;
  return runs.map((run, index) => <RunView key={index} run={run} />);
}
