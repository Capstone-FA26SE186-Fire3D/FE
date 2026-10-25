"use client";

import { Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { learnAdminApi } from "../api";
import type { SourceEntry } from "../content";
import { describeLearnError } from "../errors";
import { publishBlockReason, sourceRoleLabel, sourceStatusView } from "../status";
import { SOURCE_ROLES, type KnowledgeSource } from "../types";

/** What a chosen source is worth at publish time, as the backend reported it (`canPublishReference`). */
function SourceVerdict({ source }: { source: KnowledgeSource | null | undefined }) {
  if (source === undefined) return <StatusBadge tone="pending">Đang kiểm tra nguồn…</StatusBadge>;
  if (source === null) return <StatusBadge tone="warning">Chưa kiểm tra được nguồn này; hệ thống sẽ kiểm tra khi xuất bản</StatusBadge>;
  const reason = publishBlockReason(source);
  return reason
    ? <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}><StatusBadge tone="danger">Chặn xuất bản</StatusBadge><span className="ops-field-hint">{reason}</span></span>
    : <StatusBadge tone="success">Dùng được khi xuất bản</StatusBadge>;
}

/**
 * Common sources a version cites. The catalog asks for `visibility=Common` only. The backend flags decide what is allowed:
 * `canUseInDraft` (a draft may cite it) and `canPublishReference` (publish, Hidden and RAG accept it). A source that is not
 * yet publishable can sit in a draft but blocks publishing.
 */
export function SourcePicker({ accessToken, selected, flags, known, onAdd, onRemove, onRole, disabled }: {
  accessToken: string;
  selected: SourceEntry[];
  /** Backend verdict per source id (loaded from the catalog or by id). */
  flags: Record<string, KnowledgeSource | null>;
  known: (sources: KnowledgeSource[]) => void;
  onAdd: (source: KnowledgeSource) => void;
  onRemove: (index: number) => void;
  onRole: (index: number, role: string) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const catalog = useAsyncData(`learn-source-picker:${term}:${status}`, async (signal) => {
    const page = await learnAdminApi.listSources(accessToken, { search: term, status, page: 1, pageSize: 20 }, signal);
    known(page.items);
    return page;
  });
  const items = catalog.data?.items ?? [];
  const taken = new Set(selected.filter((entry) => entry.role === "Reference").map((entry) => entry.sourceId));

  return <div className="ops-stack">
    <div style={{ display: "grid", gap: 8 }}>
      <span className="ops-field-hint">Đã chọn ({selected.length}/20)</span>
      {selected.length === 0 && <p className="ops-field-hint" style={{ margin: 0 }}>Chưa trích nguồn nào.</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }} aria-label="Nguồn đã chọn">
        {selected.map((entry, index) => <li key={`${entry.sourceId}-${entry.role}`} style={{ display: "grid", gap: 8, padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)" }} data-testid="selected-source">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 14, minWidth: 0, overflowWrap: "anywhere" }}>{entry.title}</strong>
            {entry.versionLabel && <span className="ops-field-hint">bản {entry.versionLabel}</span>}
            {!disabled && <Button type="button" size="sm" variant="quiet" style={{ marginLeft: "auto" }} aria-label={`Bỏ nguồn ${entry.title}`} onClick={() => onRemove(index)}><X size={14} aria-hidden="true" />Bỏ</Button>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <label className="ops-field-hint" htmlFor={`role-${index}`}>Vai trò</label>
            <Select id={`role-${index}`} style={{ width: 170 }} disabled={disabled} value={entry.role} onChange={(event) => onRole(index, event.target.value)}>
              {SOURCE_ROLES.map((role) => <option key={role} value={role}>{sourceRoleLabel[role]}</option>)}
            </Select>
            <SourceVerdict source={flags[entry.sourceId]} />
          </div>
          {Object.keys(entry.locator).length > 0 && <span className="ops-field-hint" style={{ overflowWrap: "anywhere" }}>Vị trí trích dẫn được giữ nguyên.</span>}
        </li>)}
      </ul>
    </div>

    {!disabled && <>
      <div className="ops-toolbar" style={{ marginBottom: 0 }}>
        <div className="ops-field ops-toolbar-grow">
          <label htmlFor="source-search">Tìm nguồn dùng chung</label>
          <div style={{ position: "relative" }}><Search size={16} aria-hidden="true" style={{ position: "absolute", left: 12, top: 14, color: "var(--dim)" }} /><Input id="source-search" style={{ paddingLeft: 36 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tiêu đề, phiên bản hoặc khu vực áp dụng" maxLength={200} /></div>
        </div>
        <div className="ops-field">
          <label htmlFor="source-status">Trạng thái</label>
          <Select id="source-status" style={{ width: 170 }} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Mọi trạng thái</option><option value="Approved">Đã duyệt</option><option value="Draft">Chưa duyệt</option><option value="Retired">Đã ngừng dùng</option></Select>
        </div>
      </div>
      {catalog.error !== undefined && <Alert tone="danger" title="Không tải được danh mục nguồn" action={<Button size="sm" variant="secondary" className="mt-3" onClick={catalog.reload}>Thử lại</Button>}>{describeLearnError(catalog.error).message}</Alert>}
      {catalog.loading && !catalog.data && <p role="status" className="ops-field-hint">Đang tải nguồn…</p>}
      {catalog.data && items.length === 0 && <p role="status" className="ops-field-hint">{term || status ? "Không có nguồn khớp bộ lọc." : "Chưa có nguồn dùng chung nào. Nguồn do quản trị FET3D đăng ký và duyệt ở danh mục nguồn tri thức."}</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }} aria-label="Danh mục nguồn dùng chung">
        {items.map((source) => {
          const view = sourceStatusView[source.approvalStatus];
          const added = taken.has(source.id);
          const reason = !source.canUseInDraft ? "Không thể trích trong bản nháp (nguồn đã ngừng dùng)." : null;
          const publishReason = publishBlockReason(source);
          return <li key={source.id} style={{ display: "grid", gap: 6, padding: 12, border: "1px solid var(--line)", borderRadius: 10 }} data-testid="source-option">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 14, minWidth: 0, overflowWrap: "anywhere" }}>{source.title}</strong>
              <span className="ops-field-hint">bản {source.versionLabel}{source.jurisdiction ? ` · ${source.jurisdiction}` : ""}</span>
              <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
              <Button type="button" size="sm" variant="secondary" style={{ marginLeft: "auto" }} disabled={!source.canUseInDraft || added} aria-label={`Thêm nguồn ${source.title}`} onClick={() => onAdd(source)}><Plus size={14} aria-hidden="true" />{added ? "Đã thêm" : "Thêm"}</Button>
            </div>
            <span className="ops-field-hint">{reason ?? (publishReason ? `Thêm được vào bản nháp, nhưng chặn xuất bản: ${publishReason}` : "Dùng được trong bản nháp và khi xuất bản.")}</span>
          </li>;
        })}
      </ul>
      {(catalog.data?.total ?? 0) > items.length && <p className="ops-field-hint">Hiển thị {items.length}/{catalog.data?.total}. Dùng ô tìm kiếm để thu hẹp.</p>}
    </>}
  </div>;
}
