"use client";

import { useAsyncData } from "@/api/use-async-data";
import { MultiCombobox, type ComboboxFieldProps, type ComboboxOption } from "@/components/ui/combobox";
import { learnAdminApi } from "../api";
import { describeLearnError } from "../errors";
import type { SituationRef } from "../types";

/**
 * Situations a version belongs to, as a searchable multi-select (Figma "Tình huống" combobox). The catalog is the admin
 * list (it includes inactive ones): an inactive situation can stay on a stored version but cannot be newly chosen (the
 * backend answers LEARN_SITUATION_INVALID), so it is listed disabled unless already selected.
 */
export function SituationPicker({ accessToken, selected, onChange, disabled, ...field }: { accessToken: string; selected: SituationRef[]; onChange: (next: SituationRef[]) => void; disabled: boolean } & Partial<ComboboxFieldProps>) {
  const catalog = useAsyncData("learn-situation-picker", (signal) => learnAdminApi.listSituations(accessToken, { page: 1, pageSize: 100 }, signal));
  const items = catalog.data?.items ?? [];
  const total = catalog.data?.total ?? 0;
  const chosen = new Set(selected.map((item) => item.id));
  const byId = new Map<string, SituationRef>();
  for (const item of items) byId.set(item.id, { id: item.id, slug: item.slug, name: item.name });
  for (const item of selected) if (!byId.has(item.id)) byId.set(item.id, item);
  const options: ComboboxOption[] = [
    ...items.map((item) => ({ value: item.id, label: item.name, hint: item.isActive ? item.slug : `${item.slug} · ngừng dùng`, disabled: !item.isActive && !chosen.has(item.id), keywords: [item.slug] })),
    // A situation stored on the version but absent from the first catalog page stays removable.
    ...selected.filter((item) => !items.some((entry) => entry.id === item.id)).map((item) => ({ value: item.id, label: item.name, hint: item.slug, keywords: [item.slug] })),
  ];

  return <div style={{ display: "grid", gap: 6 }}>
    <MultiCombobox {...field} values={selected.map((item) => item.id)} onChange={(values) => onChange(values.flatMap((id) => { const ref = byId.get(id); return ref ? [ref] : []; }))}
      options={options} disabled={disabled} loading={catalog.loading && !catalog.data} placeholder="Chọn tình huống" searchPlaceholder="Tìm theo tên hoặc slug" groupLabel="Tình huống"
      emptyText={catalog.data && items.length === 0 ? "Chưa có tình huống nào. Tạo ở thẻ “Tình huống”." : "Không có tình huống khớp từ khóa."} maxChips={4} />
    {catalog.error !== undefined && <span className="ops-field-error" role="alert">Không tải được danh mục tình huống: {describeLearnError(catalog.error).message} <button type="button" onClick={catalog.reload} style={{ background: "none", border: 0, padding: 0, color: "var(--ember)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Thử lại</button></span>}
    {total > items.length && <span className="ops-field-hint">Hiển thị {items.length}/{total} tình huống đầu tiên.</span>}
  </div>;
}
