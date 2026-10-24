"use client";

import { Command } from "cmdk";
import { Check, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";
import { stripAccents } from "@/utils/strip-accents";
import type { ComboboxOption } from "./combobox";

/**
 * The cmdk part of Combobox/MultiCombobox. It is loaded with `next/dynamic` the first time a list opens, so cmdk (and its
 * fuzzy-filter runtime) is not part of the first load of every page that merely shows a combobox trigger.
 */
export type ComboboxGroup = { name: string; items: ComboboxOption[] };

function score(value: string, search: string, keywords?: string[]) {
  const needle = stripAccents(search.trim());
  if (!needle) return 1;
  const hay = stripAccents([value, ...(keywords ?? [])].join(" "));
  if (hay.startsWith(needle)) return 1;
  if (hay.includes(needle)) return 0.7;
  const words = needle.split(/\s+/);
  return words.every((word) => hay.includes(word)) ? 0.4 : 0;
}

type ListProps = {
  label: string;
  listId: string;
  groups: ComboboxGroup[];
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  loading?: boolean;
  emptyText: string;
};

/** The popover opens before this module has loaded; the search box takes focus as soon as it is mounted. */
function useFocusOnMount() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  return input;
}

export function ComboboxSingleList({ label, listId, groups, search, onSearch, searchPlaceholder, loading, emptyText, value, showCustom, customLabel, onPick }: ListProps & {
  value: string;
  showCustom: boolean;
  customLabel: string;
  onPick: (value: string) => void;
}) {
  const input = useFocusOnMount();
  return <Command label={label} filter={(itemValue, searchText, keywords) => score(itemValue, searchText, keywords)} loop>
    <div className="ops-combobox-search"><Search size={16} aria-hidden="true" /><Command.Input ref={input} value={search} onValueChange={onSearch} placeholder={searchPlaceholder} /></div>
    <Command.List id={listId} className="ops-combobox-list">
      {loading ? <div className="ops-combobox-empty" role="status">Đang tải…</div> : <Command.Empty className="ops-combobox-empty">{emptyText}</Command.Empty>}
      {groups.map((group) => <Command.Group key={group.name} heading={group.name} className="ops-combobox-group">
        {group.items.map((option) => <Command.Item key={option.value} value={option.label} keywords={option.keywords} disabled={option.disabled} data-value={option.value} data-selected={option.value === value || undefined} className="ops-combobox-item" onSelect={() => onPick(option.value)}>
          <span className="ops-combobox-item-text"><span>{option.label}</span>{option.hint && <small>{option.hint}</small>}</span>
          {option.value === value && <Check size={16} aria-hidden="true" />}
        </Command.Item>)}
      </Command.Group>)}
      {showCustom && <Command.Group heading="Khác" className="ops-combobox-group">
        <Command.Item value={`__custom__ ${search}`} forceMount className="ops-combobox-item ops-combobox-custom" onSelect={() => onPick(search.trim())}>{customLabel} “{search.trim()}”</Command.Item>
      </Command.Group>}
    </Command.List>
  </Command>;
}

export function ComboboxMultiList({ label, listId, groups, search, onSearch, searchPlaceholder, loading, emptyText, values, onToggle, onClear }: ListProps & {
  values: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const input = useFocusOnMount();
  return <Command label={label} filter={(itemValue, searchText, keywords) => score(itemValue, searchText, keywords)} loop>
    <div className="ops-combobox-search"><Search size={16} aria-hidden="true" /><Command.Input ref={input} value={search} onValueChange={onSearch} placeholder={searchPlaceholder} /></div>
    <Command.List id={listId} className="ops-combobox-list">
      {loading ? <div className="ops-combobox-empty" role="status">Đang tải…</div> : <Command.Empty className="ops-combobox-empty">{emptyText}</Command.Empty>}
      {groups.map((group) => <Command.Group key={group.name} heading={group.name} className="ops-combobox-group">
        {group.items.map((option) => {
          const active = values.includes(option.value);
          return <Command.Item key={option.value} value={option.label} keywords={option.keywords} disabled={option.disabled} data-value={option.value} data-selected={active || undefined} className="ops-combobox-item" onSelect={() => onToggle(option.value)}>
            <span className={cn("ops-combobox-check", active && "is-on")} aria-hidden="true">{active && <Check size={12} />}</span>
            <span className="ops-combobox-item-text"><span>{option.label}</span>{option.hint && <small>{option.hint}</small>}</span>
          </Command.Item>;
        })}
      </Command.Group>)}
    </Command.List>
    {values.length > 0 && <div className="ops-combobox-foot"><button type="button" onClick={onClear}>Bỏ chọn tất cả</button></div>}
  </Command>;
}
