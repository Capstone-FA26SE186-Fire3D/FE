"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { learnAdminApi } from "../api";
import { describeLearnError } from "../errors";
import type { SituationRef } from "../types";

/**
 * Situations a version belongs to. The catalog is the admin list (it includes inactive ones): an inactive situation can
 * stay on a stored version but cannot be newly chosen (the backend answers LEARN_SITUATION_INVALID).
 */
export function SituationPicker({ accessToken, selected, onChange, disabled }: { accessToken: string; selected: SituationRef[]; onChange: (next: SituationRef[]) => void; disabled: boolean }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const catalog = useAsyncData(`learn-situation-picker:${term}`, (signal) => learnAdminApi.listSituations(accessToken, { search: term, page: 1, pageSize: 100 }, signal));
  const chosen = new Set(selected.map((item) => item.id));
  const items = catalog.data?.items ?? [];
  const activeById = new Map(items.map((item) => [item.id, item.isActive]));
  const total = catalog.data?.total ?? 0;

  const toggle = (item: SituationRef) => onChange(chosen.has(item.id) ? selected.filter((entry) => entry.id !== item.id) : [...selected, item]);

  return <div className="ops-stack">
    <div style={{ display: "grid", gap: 6 }}>
      <span className="ops-field-hint">Đã chọn ({selected.length}/20)</span>
      {selected.length === 0 && <p className="ops-field-hint" style={{ margin: 0 }}>Chưa chọn tình huống nào. Bài vẫn đọc được ở danh sách chung nhưng không lọc được theo tình huống.</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {selected.map((item) => <li key={item.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <StatusBadge tone={activeById.get(item.id) === false ? "warning" : "info"}>{item.name}{activeById.get(item.id) === false ? " · ngừng dùng" : ""}</StatusBadge>
          {!disabled && <Button type="button" size="sm" variant="quiet" aria-label={`Bỏ tình huống ${item.name}`} onClick={() => toggle(item)}>Bỏ</Button>}
        </li>)}
      </ul>
    </div>
    <div className="ops-field">
      <label htmlFor="situation-search">Tìm tình huống</label>
      <div style={{ position: "relative" }}><Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 14, color: "var(--dim)" }} /><Input id="situation-search" style={{ paddingLeft: 36 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc slug" maxLength={200} /></div>
    </div>
    {catalog.error !== undefined && <Alert tone="danger" title="Không tải được danh mục tình huống" action={<Button size="sm" variant="secondary" className="mt-3" onClick={catalog.reload}>Thử lại</Button>}>{describeLearnError(catalog.error).message}</Alert>}
    {catalog.loading && !catalog.data && <p role="status" className="ops-field-hint">Đang tải tình huống…</p>}
    {catalog.data && items.length === 0 && <p className="ops-field-hint" role="status">{term ? "Không có tình huống khớp từ khóa." : "Chưa có tình huống nào. Tạo ở thẻ “Tình huống” của Learn CMS."}</p>}
    <fieldset className="ops-fieldset" style={{ minWidth: 0, border: 0, margin: 0, padding: 0 }} disabled={disabled}>
      <legend className="ops-field-hint">Chọn tình huống</legend>
      {items.map((item) => {
        const checked = chosen.has(item.id);
        const blocked = !item.isActive && !checked;
        return <label key={item.id} style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44, fontSize: 14, opacity: blocked ? 0.6 : 1 }}>
          <input type="checkbox" checked={checked} disabled={blocked} onChange={() => toggle({ id: item.id, slug: item.slug, name: item.name })} />
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{item.name} <span className="ops-field-hint">({item.slug})</span>{!item.isActive && <> <StatusBadge tone="neutral">Ngừng dùng</StatusBadge></>}</span>
        </label>;
      })}
    </fieldset>
    {total > items.length && <p className="ops-field-hint">Hiển thị {items.length}/{total}. Thu hẹp bằng ô tìm kiếm để thấy các tình huống khác.</p>}
  </div>;
}
