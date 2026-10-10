"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

function parse(text: string): number | undefined | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return undefined;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Numeric text field. The text the author types is kept as typed (so "1." or "-" are allowed mid-edit); a valid number is
 * committed on every keystroke, an invalid one is flagged and NOT committed. A blank commits `undefined` (not entered yet).
 */
export function NumberField({ label, value, onCommit, unit, hint, error, disabled, required, "data-testid": testId }: {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  unit?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  "data-testid"?: string;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [seen, setSeen] = useState(value);
  const [invalid, setInvalid] = useState(false);
  // External change (undo, gizmo drag, reload): resync the text unless it already means that number.
  if (value !== seen) {
    setSeen(value);
    if (parse(text) !== value) { setText(value === undefined ? "" : String(value)); setInvalid(false); }
  }
  const shownError = error ?? (invalid ? "Nhập một số (dùng dấu chấm hoặc phẩy thập phân)." : undefined);
  return <Field label={unit ? `${label} (${unit})` : label} hint={hint} error={shownError} required={required}>
    {(props) => <Input {...props} data-testid={testId} inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled} value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = parse(next);
        if (parsed === null) { setInvalid(true); return; }
        setInvalid(false);
        setSeen(parsed);
        onCommit(parsed);
      }}
      onBlur={() => { if (!invalid) setText(value === undefined ? "" : String(value)); }} />}
  </Field>;
}

export function TextField({ label, value, onCommit, hint, error, disabled, maxLength, required, multiline, rows = 4, "data-testid": testId }: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  "data-testid"?: string;
}) {
  return <Field label={label} hint={hint} error={error} required={required}>
    {(props) => multiline
      ? <Textarea {...props} data-testid={testId} rows={rows} maxLength={maxLength} disabled={disabled} value={value} onChange={(event) => onCommit(event.target.value)} />
      : <Input {...props} data-testid={testId} maxLength={maxLength} disabled={disabled} value={value} onChange={(event) => onCommit(event.target.value)} />}
  </Field>;
}

/** Editable list of strings (objectives, routes, capabilities). Each row commits through `onChange(index, value)`. */
export function StringList({ label, items, onChange, onAdd, onRemove, addLabel, placeholder, error, hint, maxLength, disabled, testId }: {
  label: string;
  items: string[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  addLabel: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  return <div className="ops-field" role="group" aria-labelledby={`${id}-label`} data-testid={testId}>
    <span id={`${id}-label`} className="ops-field-label">{label}</span>
    {hint && <span className="ops-field-hint">{hint}</span>}
    <ul className="se-list">
      {items.map((item, index) => <li key={index}>
        <Input aria-label={`${label} ${index + 1}`} aria-invalid={error && !item.trim() ? true : undefined} value={item} maxLength={maxLength} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(index, event.target.value)} />
        <Button type="button" variant="ghost" size="icon" aria-label={`Xóa ${label.toLowerCase()} ${index + 1}`} disabled={disabled} onClick={() => onRemove(index)}><Trash2 size={16} aria-hidden="true" /></Button>
      </li>)}
    </ul>
    <div><Button type="button" variant="quiet" size="sm" disabled={disabled} onClick={onAdd}><Plus size={14} aria-hidden="true" /> {addLabel}</Button></div>
    {error && <span className="ops-field-error" role="alert">{error}</span>}
  </div>;
}
