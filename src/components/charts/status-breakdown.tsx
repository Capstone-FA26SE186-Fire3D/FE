import type { CSSProperties, ReactNode } from "react";
import { fmtNumber } from "./chart-config";

export type StatusPart = {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Texture so two neutral states never differ by colour alone. */
  pattern?: "stripes";
  /** Short line under the label in the tile, e.g. what the state means. */
  hint?: string;
};

const share = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);
const percent = (value: number) => `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

/**
 * Part-to-whole of a few states (payments, AI requests): the total as a headline and one tile per state with its count, its share
 * and a thin meter of that share under the number, so each state reads on its own. Replaces the donut whose legend values drifted
 * to the far edge of wide cards (and a single 100 % bar that said nothing when one state held everything). Zero states keep their
 * tile, dimmed, so the set of states never changes shape. Server-renderable.
 */
export function StatusBreakdown({ parts, unit, headline, format = fmtNumber }: {
  parts: StatusPart[];
  /** What is counted, e.g. "yêu cầu". */
  unit: string;
  /** Optional line beside the total, e.g. the success share. */
  headline?: ReactNode;
  format?: (value: number) => string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return <div className="ops-status">
    <div className="ops-status-head">
      <p className="ops-status-total"><strong>{format(total)}</strong> <span>{unit}</span></p>
      {headline && <p className="ops-status-headline">{headline}</p>}
    </div>
    <ul className="ops-status-tiles">
      {parts.map((part) => {
        const value = share(part.value, total);
        return <li key={part.key} data-zero={part.value === 0 || undefined}>
          <span className="ops-status-label"><span className="ops-chart-swatch" data-pattern={part.pattern} style={{ "--seg": part.color, background: part.color } as CSSProperties} aria-hidden="true" />{part.label}</span>
          <span className="ops-status-value"><strong>{format(part.value)}</strong><small>{percent(value)}</small></span>
          <span className="ops-status-meter" aria-hidden="true"><span data-pattern={part.pattern} style={{ width: `${value}%`, "--seg": part.color } as CSSProperties} /></span>
          {part.hint && <span className="ops-status-hint">{part.hint}</span>}
        </li>;
      })}
    </ul>
  </div>;
}
