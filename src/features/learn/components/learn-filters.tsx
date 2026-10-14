"use client";

import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useId, useState } from "react";
import { LEARN_LIMITS, hasLearnFilters, type LearnQuery } from "../query";
import { LEARN_KINDS, kindLabel, type LearnKind, type PublicSituation } from "../types";
import "../learn.css";

type Selection = Pick<LearnQuery, "search" | "kinds" | "situations">;

const toggle = (values: string[], value: string) => (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
const kindName = (value: string) => (LEARN_KINDS as readonly string[]).includes(value) ? kindLabel[value as LearnKind] : value;

/** Kind and situation chips. Several choices in one group widen the result (OR); the two groups and the search narrow it (AND). */
export function LearnFilterPanel({ selection, situations, situationsFailed, onRetrySituations, onChange }: {
  selection: Selection;
  situations: PublicSituation[] | undefined;
  situationsFailed: boolean;
  onRetrySituations: () => void;
  onChange: (patch: Partial<Pick<LearnQuery, "kinds" | "situations">>) => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const count = selection.kinds.length + selection.situations.length;
  const known = new Set(situations?.map((item) => item.slug));
  const unknownSelected = situations ? selection.situations.filter((slug) => !known.has(slug)) : [];
  const atLimit = selection.situations.length >= LEARN_LIMITS.situationMax;

  return <div className="learn-filters">
    <button type="button" className="learn-filters-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
      <SlidersHorizontal size={18} aria-hidden="true" />Bộ lọc{count > 0 ? ` (${count})` : ""}<ChevronDown size={18} aria-hidden="true" className="learn-filters-caret" />
    </button>
    <div id={panelId} className="learn-filters-panel" data-open={open}>
      <fieldset className="learn-filter-group">
        <legend className="learn-filter-label">Loại bài</legend>
        <div className="learn-chips">
          {LEARN_KINDS.map((kind) => <button key={kind} type="button" className="learn-chip" aria-pressed={selection.kinds.includes(kind)} onClick={() => onChange({ kinds: toggle(selection.kinds, kind) })}>{kindLabel[kind]}</button>)}
        </div>
      </fieldset>
      <fieldset className="learn-filter-group">
        <legend className="learn-filter-label">Tình huống</legend>
        <div className="learn-chips">
          <button type="button" className="learn-chip" aria-pressed={selection.situations.length === 0} onClick={() => onChange({ situations: [] })}>Tất cả</button>
          {situations?.map((item) => {
            const pressed = selection.situations.includes(item.slug);
            return <button key={item.id} type="button" className="learn-chip" aria-pressed={pressed} disabled={!pressed && atLimit} onClick={() => onChange({ situations: toggle(selection.situations, item.slug) })}>{item.name}</button>;
          })}
          {unknownSelected.map((slug) => <button key={slug} type="button" className="learn-chip" aria-pressed onClick={() => onChange({ situations: toggle(selection.situations, slug) })}>{slug}</button>)}
        </div>
        {atLimit && <p className="learn-filter-note" role="status">Đã chọn tối đa {LEARN_LIMITS.situationMax} tình huống.</p>}
        {situationsFailed && <p className="learn-filter-note" role="status">Không tải được danh sách tình huống. <button type="button" className="learn-inline-action" onClick={onRetrySituations}>Thử lại</button></p>}
        {!situationsFailed && situations?.length === 0 && <p className="learn-filter-note">Chưa có tình huống nào để lọc.</p>}
      </fieldset>
    </div>
  </div>;
}

/** What is applied right now, one removable chip per value, and one button that drops everything. */
export function LearnActiveFilters({ selection, situations, onChange, onClear }: {
  selection: Selection;
  situations: PublicSituation[] | undefined;
  onChange: (patch: Partial<Selection>) => void;
  onClear: () => void;
}) {
  const headingId = useId();
  if (!hasLearnFilters(selection)) return null;
  const situationName = (slug: string) => situations?.find((item) => item.slug === slug)?.name ?? slug;
  const chips = [
    ...(selection.search ? [{ key: "search", group: "Từ khóa", label: `“${selection.search}”`, remove: () => onChange({ search: "" }) }] : []),
    ...selection.kinds.map((kind) => ({ key: `kind:${kind}`, group: "Loại", label: kindName(kind), remove: () => onChange({ kinds: selection.kinds.filter((item) => item !== kind) }) })),
    ...selection.situations.map((slug) => ({ key: `situation:${slug}`, group: "Tình huống", label: situationName(slug), remove: () => onChange({ situations: selection.situations.filter((item) => item !== slug) }) })),
  ];
  return <section className="learn-active" aria-labelledby={headingId}>
    <h2 id={headingId} className="learn-filter-label">Đang lọc</h2>
    <ul className="learn-active-list">
      {chips.map((chip) => <li key={chip.key}>
        <button type="button" className="learn-active-chip" onClick={chip.remove} aria-label={`Bỏ lọc ${chip.group.toLowerCase()}: ${chip.label}`}>
          <span><small>{chip.group}</small> {chip.label}</span><X size={16} aria-hidden="true" />
        </button>
      </li>)}
    </ul>
    <button type="button" className="learn-inline-action" onClick={onClear}>Xóa bộ lọc</button>
  </section>;
}
