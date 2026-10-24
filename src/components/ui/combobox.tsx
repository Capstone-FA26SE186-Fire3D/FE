"use client";

import { ChevronDown, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { stripAccents } from "@/utils/strip-accents";
import type { ComboboxGroup } from "./combobox-list";

export { stripAccents };

export type ComboboxOption = { value: string; label: string; hint?: string; group?: string; disabled?: boolean; keywords?: string[] };

// cmdk loads when a list is first opened (see combobox-list.tsx), not with every page that has a combobox trigger.
const listLoading = () => <div className="ops-combobox-empty" role="status">Đang tải…</div>;
const ComboboxSingleList = dynamic(() => import("./combobox-list").then((module) => module.ComboboxSingleList), { ssr: false, loading: listLoading });
const ComboboxMultiList = dynamic(() => import("./combobox-list").then((module) => module.ComboboxMultiList), { ssr: false, loading: listLoading });

type Shared = {
  id?: string;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Label of the suggestion group when options carry no `group` ("GỢI Ý" in the design). */
  groupLabel?: string;
  disabled?: boolean;
  className?: string;
  loading?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "data-testid"?: string;
};

/**
 * Searchable single choice: a trigger styled like an input that opens a cmdk list in a popover. BE stores plain
 * strings for fields like building type or city, so `allowCustom` lets the typed text be used as the value ("Khác…").
 */
export function Combobox({ id, value, onChange, options, placeholder = "Chọn…", searchPlaceholder = "Tìm…", emptyText = "Không có kết quả", groupLabel = "Gợi ý", allowCustom, customLabel = "Dùng", clearable, disabled, className, loading, ...aria }: Shared & {
  value: string;
  onChange: (value: string) => void;
  allowCustom?: boolean;
  /** Prefix of the free-text item: `Dùng “Nhà kho”`. */
  customLabel?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const groups = useMemo(() => groupOptions(options, groupLabel), [options, groupLabel]);
  const exact = options.some((option) => stripAccents(option.label) === stripAccents(search.trim()));
  const showCustom = allowCustom && search.trim() && !exact;
  const pick = (next: string) => { onChange(next); setOpen(false); setSearch(""); };

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
    <PopoverTrigger asChild>
      <button id={id} type="button" role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-haspopup="listbox" disabled={disabled} className={cn("ops-input ops-combobox", className)} data-placeholder={selected || value ? undefined : "true"} {...aria}>
        <span className="ops-combobox-value">{selected?.label ?? (value || placeholder)}</span>
        {clearable && value && !disabled ? <span role="button" tabIndex={0} aria-label="Xóa lựa chọn" className="ops-combobox-clear" onClick={(event) => { event.stopPropagation(); onChange(""); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onChange(""); } }}><X size={14} aria-hidden="true" /></span> : <ChevronDown size={16} aria-hidden="true" className="ops-combobox-chevron" />}
      </button>
    </PopoverTrigger>
    <PopoverContent className="ops-combobox-pop" style={{ width: "var(--radix-popover-trigger-width)" }} onOpenAutoFocus={(event) => event.preventDefault()}>
      <ComboboxSingleList label={searchPlaceholder} listId={listId} groups={groups} search={search} onSearch={setSearch} searchPlaceholder={searchPlaceholder} loading={loading} emptyText={emptyText} value={value} showCustom={Boolean(showCustom)} customLabel={customLabel} onPick={pick} />
    </PopoverContent>
  </Popover>;
}

/** Several choices; selected ones show as removable chips in the trigger. */
export function MultiCombobox({ id, values, onChange, options, placeholder = "Chọn…", searchPlaceholder = "Tìm…", emptyText = "Không có kết quả", groupLabel = "Gợi ý", disabled, className, loading, maxChips = 3, ...aria }: Shared & {
  values: string[];
  onChange: (values: string[]) => void;
  maxChips?: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();
  const groups = useMemo(() => groupOptions(options, groupLabel), [options, groupLabel]);
  const chosen = values.map((value) => options.find((option) => option.value === value) ?? { value, label: value });
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
    <PopoverTrigger asChild>
      <button id={id} type="button" role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-haspopup="listbox" disabled={disabled} className={cn("ops-input ops-combobox ops-combobox-multi", className)} data-placeholder={chosen.length ? undefined : "true"} {...aria}>
        <span className="ops-combobox-value">
          {chosen.length === 0 ? placeholder : <>
            {chosen.slice(0, maxChips).map((option) => <span key={option.value} className="ops-combobox-chip">{option.label}<span role="button" tabIndex={0} aria-label={`Bỏ ${option.label}`} onClick={(event) => { event.stopPropagation(); toggle(option.value); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggle(option.value); } }}><X size={12} aria-hidden="true" /></span></span>)}
            {chosen.length > maxChips && <span className="ops-combobox-chip">+{chosen.length - maxChips}</span>}
          </>}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="ops-combobox-chevron" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="ops-combobox-pop" style={{ width: "var(--radix-popover-trigger-width)" }} onOpenAutoFocus={(event) => event.preventDefault()}>
      <ComboboxMultiList label={searchPlaceholder} listId={listId} groups={groups} search={search} onSearch={setSearch} searchPlaceholder={searchPlaceholder} loading={loading} emptyText={emptyText} values={values} onToggle={toggle} onClear={() => onChange([])} />
    </PopoverContent>
  </Popover>;
}

function groupOptions(options: ComboboxOption[], fallback: string): ComboboxGroup[] {
  const map = new Map<string, ComboboxOption[]>();
  for (const option of options) {
    const name = option.group ?? fallback;
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(option);
  }
  return Array.from(map, ([name, items]) => ({ name, items }));
}

/** Helper for Field: `<Field label="Loại">{(p) => <Combobox {...p} … />}</Field>` works because Field passes id/aria props. */
export type ComboboxFieldProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

export function ComboboxHint({ children }: { children: ReactNode }) {
  return <span className="ops-field-hint">{children}</span>;
}
