"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { LEARN_LIMITS } from "../query";
import "../learn.css";

const DEBOUNCE_MS = 300;

/**
 * Search box bound to the URL `search` value. Typing is debounced into the URL (replace, so Back is not flooded); Enter and the
 * clear button apply at once. The API refuses 1 character, so a single character waits for the next one instead of failing.
 * Text is sent as typed (trimmed): case and diacritics are the server's job.
 */
export function LearnSearchBox({ value, onCommit }: { value: string; onCommit: (search: string, mode: "push" | "replace") => void }) {
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [pushed, setPushed] = useState(value);

  // An outside change (Back/Forward, a removed filter chip, "Xóa bộ lọc") updates the box; our own pushes do not.
  if (value !== seen) {
    setSeen(value);
    if (value !== pushed) {
      setPushed(value);
      setText(value);
    }
  }

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < LEARN_LIMITS.searchMin;

  useEffect(() => {
    if (trimmed === value || tooShort) return;
    const timer = window.setTimeout(() => { setPushed(trimmed); onCommit(trimmed, "replace"); }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed, value, tooShort, onCommit]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (tooShort || trimmed === value) return;
    setPushed(trimmed);
    onCommit(trimmed, "push");
  };

  const clear = () => {
    setText("");
    if (value === "") return;
    setPushed("");
    onCommit("", "push");
  };

  return <form className="learn-search" role="search" onSubmit={submit}>
    <label className="learn-search-label" htmlFor={inputId}>Tìm bài học</label>
    <div className="learn-search-row">
      <div className="learn-search-field">
        <Search size={18} aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          name="search"
          className="learn-search-input"
          value={text}
          maxLength={LEARN_LIMITS.searchMax}
          autoComplete="off"
          spellCheck={false}
          placeholder="Ví dụ: thoát hiểm, thang máy"
          aria-describedby={hintId}
          aria-invalid={tooShort || undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape" && text) { event.preventDefault(); clear(); } }}
        />
        {text !== "" && <button type="button" className="learn-search-clear" onClick={clear} aria-label="Xóa từ khóa"><X size={18} aria-hidden="true" /></button>}
      </div>
      <button type="submit" className="learn-search-submit">Tìm</button>
    </div>
    <p id={hintId} className="learn-search-hint" role={tooShort ? "status" : undefined} data-invalid={tooShort || undefined}>
      {tooShort ? `Nhập ít nhất ${LEARN_LIMITS.searchMin} ký tự để tìm.` : `Tìm trong tiêu đề và mô tả, có dấu hoặc không dấu (${LEARN_LIMITS.searchMin}–${LEARN_LIMITS.searchMax} ký tự).`}
    </p>
  </form>;
}
