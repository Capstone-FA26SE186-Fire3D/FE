"use client";

import type { KeyboardEvent } from "react";
import { KIND_ART, KIND_ART_SIZE } from "@/features/learn/kind-art";
import { kindLabel, LEARN_KINDS } from "@/features/learn/types";
import type { LearnKind } from "../types";

const KIND_HINT: Record<LearnKind, string> = {
  Article: "Hướng dẫn nhiều mục, có ảnh",
  Tip: "Một điều nên nhớ, đọc 1 phút",
  Video: "Kèm video YouTube, TikTok, Facebook",
};

/**
 * "Loại bài" as a radio group (Figma "Bài mới v3"): picture cards in the new-post modal, a compact segmented row in the
 * editor's side panel. Arrow keys move between kinds like a native radio group.
 */
export function KindPicker({ value, onChange, disabled, visual = false }: { value: LearnKind; onChange: (kind: LearnKind) => void; disabled?: boolean; visual?: boolean }) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step || disabled) return;
    event.preventDefault();
    const next = LEARN_KINDS[(LEARN_KINDS.indexOf(value) + step + LEARN_KINDS.length) % LEARN_KINDS.length];
    onChange(next);
    (event.currentTarget.querySelector<HTMLButtonElement>(`[data-kind="${next}"]`))?.focus();
  };
  return <div role="radiogroup" aria-label="Loại bài" className={visual ? "kind-cards" : "kind-seg"} onKeyDown={move}>
    {LEARN_KINDS.map((kind) => <button key={kind} type="button" role="radio" aria-checked={value === kind} tabIndex={value === kind ? 0 : -1} disabled={disabled} data-kind={kind}
      className={visual ? "kind-card" : "kind-seg-item"} onClick={() => onChange(kind)}>
      {visual && <span className="kind-card-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={KIND_ART[kind]} alt="" width={KIND_ART_SIZE.width} height={KIND_ART_SIZE.height} loading="lazy" decoding="async" />
      </span>}
      <span className="kind-card-text"><strong>{kindLabel[kind]}</strong>{visual && <small>{KIND_HINT[kind]}</small>}</span>
    </button>)}
  </div>;
}
