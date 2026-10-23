"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * Compact filter button ("Công trình: tất cả ›") that opens a small panel under it. Closes on Escape, on a click outside
 * and after a choice; focus goes back to the button. The panel content is free-form (a list of options or a small form).
 */
export function ChipPopover({ label, value, active, disabled, hint, panelLabel, children, className, dataValue }: {
  label: string;
  value: ReactNode;
  /** A non-default value is selected: the chip is outlined. */
  active?: boolean;
  disabled?: boolean;
  /** Shown as the button's title, e.g. why it is disabled. */
  hint?: string;
  panelLabel?: string;
  children: (close: () => void) => ReactNode;
  className?: string;
  /** Raw selected value, exposed as `data-value` for tests and analytics. */
  dataValue?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = () => { setOpen(false); document.getElementById(`${id}-button`)?.focus(); };
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && open) { event.stopPropagation(); close(); } };

  return <div ref={root} className={cn("ops-fchip", className)} onKeyDown={onKeyDown}>
    <button id={`${id}-button`} type="button" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} title={hint} data-active={active || undefined} data-value={dataValue} onClick={() => setOpen((value) => !value)}>
      <span className="ops-fchip-label">{label}:</span> <span className="ops-fchip-value">{value}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div id={id} className="ops-fchip-pop" role="dialog" aria-label={panelLabel ?? label}>{children(close)}</div>}
  </div>;
}

export type ChipOption = { value: string; label: string };

/** Single choice from a short list. The empty value is the "all" option and leaves the chip unhighlighted. */
export function FilterChip({ label, value, options, onChange, disabled, hint, allLabel = "tất cả", className }: {
  label: string;
  value: string;
  options: ChipOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
  allLabel?: string;
  className?: string;
}) {
  const all: ChipOption = { value: "", label: allLabel };
  const list = [all, ...options];
  const current = list.find((option) => option.value === value)?.label ?? value;
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=option]"));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return <ChipPopover label={label} value={current} dataValue={value} active={value !== ""} disabled={disabled} hint={hint} className={className}>
    {(close) => <div role="listbox" aria-label={label} className="ops-fchip-list" onKeyDown={moveFocus}>
      {list.map((option, index) => <button key={option.value} type="button" role="option" data-value={option.value} aria-selected={option.value === value} className="ops-fchip-opt" autoFocus={option.value === value || (index === 0 && !list.some((item) => item.value === value))} onClick={() => { onChange(option.value); close(); }}>
        <span>{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>}
  </ChipPopover>;
}

export function FilterChips({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={cn("ops-fchips", className)} role="group" aria-label={label}>{children}</div>;
}
