"use client";

import { MessageSquarePlus, Plus, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { newIdempotencyKey } from "@/api/idempotency";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/api/types/common";
import { buildingsApi } from "../api";
import { describeApiError } from "../format";
import type { AnnotationItem, AnnotationSnapshot } from "../types";

const MAX_ITEMS = 500;

type Row = AnnotationItem;

function itemsOf(snapshot: AnnotationSnapshot): Row[] {
  return snapshot.data.items.map((item) => ({ ...item, note: item.note ?? null }));
}

function normalizeRows(rows: Row[]): AnnotationItem[] {
  return rows.map((row) => ({ id: row.id, ifcGlobalId: row.ifcGlobalId.trim(), label: row.label.trim(), note: row.note?.trim() || null }));
}

function rowErrors(rows: Row[]) {
  const errors = new Map<string, { ifcGlobalId?: string; label?: string; note?: string }>();
  for (const row of rows) {
    const entry: { ifcGlobalId?: string; label?: string; note?: string } = {};
    if (!row.ifcGlobalId.trim()) entry.ifcGlobalId = "Nhập IFC GlobalId.";
    else if (row.ifcGlobalId.length > 255) entry.ifcGlobalId = "Tối đa 255 ký tự.";
    if (!row.label.trim()) entry.label = "Nhập nhãn.";
    else if (row.label.length > 200) entry.label = "Tối đa 200 ký tự.";
    if ((row.note?.length ?? 0) > 2000) entry.note = "Tối đa 2000 ký tự.";
    if (Object.keys(entry).length) errors.set(row.id, entry);
  }
  return errors;
}

function Editor({ accessToken, revisionId, snapshot }: { accessToken: string; revisionId: string; snapshot: AnnotationSnapshot }) {
  const toast = useToast();
  const saving = useRef(false);
  const [rows, setRows] = useState<Row[]>(() => itemsOf(snapshot));
  const [baseVersion, setBaseVersion] = useState(snapshot.version);
  const [savedItems, setSavedItems] = useState(() => normalizeRows(itemsOf(snapshot)));
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<AnnotationSnapshot | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const errors = rowErrors(rows);
  const dirty = JSON.stringify(normalizeRows(rows)) !== JSON.stringify(savedItems);
  const update = (id: string, patch: Partial<Row>) => { setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row))); };

  const save = async () => {
    if (saving.current) return;
    setShowErrors(true);
    if (errors.size > 0) return;
    saving.current = true;
    setBusy(true);
    setError("");
    const payload = normalizeRows(rows);
    try {
      const saved = await buildingsApi.saveAnnotations(accessToken, revisionId, payload, baseVersion);
      setBaseVersion(saved.version);
      setSavedItems(payload);
      setConflict(null);
      toast.notify({ tone: "success", title: "Đã lưu annotation", description: `Phiên bản ${saved.version}.` });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 412) {
        // Keep what the user typed; fetch the newer version so they can compare.
        setLoadingLatest(true);
        try { setConflict(await buildingsApi.getAnnotations(accessToken, revisionId)); } catch { setConflict(null); setError("Annotation đã bị người khác thay đổi và không tải được bản mới. Nội dung của bạn vẫn được giữ lại."); } finally { setLoadingLatest(false); }
      } else {
        setError(describeApiError(cause, "Không thể lưu annotation. Nội dung bạn nhập vẫn được giữ lại."));
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const useRemote = () => {
    if (!conflict) return;
    setRows(itemsOf(conflict));
    setBaseVersion(conflict.version);
    setConflict(null);
    setSavedItems(normalizeRows(itemsOf(conflict)));
    setShowErrors(false);
  };
  const keepMine = () => {
    if (!conflict) return;
    // Explicit choice: base the next save on the newest version, overwriting the other person's change.
    setBaseVersion(conflict.version);
    setConflict(null);
  };

  return <div className="ops-stack">
    {conflict && <Alert tone="warning" title="Annotation đã được người khác cập nhật (phiên bản mới hơn)" action={<div className="ops-actions" style={{ marginTop: 12 }}>
      <Button size="sm" variant="secondary" onClick={useRemote}>Dùng bản mới (bỏ thay đổi của tôi)</Button>
      <Button size="sm" variant="quiet" onClick={keepMine}>Giữ bản của tôi để ghi đè</Button>
    </div>}>
      Nội dung bạn đang soạn vẫn được giữ nguyên. Bản mới có {conflict.data.items.length} annotation (phiên bản {conflict.version}); chọn một hướng xử lý trước khi lưu lại.
      {conflict.data.items.length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{conflict.data.items.slice(0, 5).map((item) => <li key={item.id}>{item.label} <span className="ops-mono">({item.ifcGlobalId})</span></li>)}{conflict.data.items.length > 5 && <li>… và {conflict.data.items.length - 5} mục khác</li>}</ul>}
    </Alert>}
    {loadingLatest && <p className="ops-muted" role="status">Đang tải bản mới nhất…</p>}
    {error && <Alert tone="danger">{error}</Alert>}

    {rows.length === 0 ? <EmptyState icon={MessageSquarePlus} title="Chưa có annotation" description="Gắn ghi chú vào cấu kiện theo IFC GlobalId. Annotation nằm ngoài hình học và không thay đổi mô hình." action={<Button variant="secondary" onClick={() => { setRows([{ id: newIdempotencyKey(), ifcGlobalId: "", label: "", note: null }]); }}><Plus size={16} aria-hidden="true" />Thêm annotation</Button>} /> : <div>
      {rows.map((row, index) => {
        const e = showErrors ? errors.get(row.id) : undefined;
        return <div className="ops-annotation-row" key={row.id}>
          <Field label={`IFC GlobalId #${index + 1}`} required error={e?.ifcGlobalId}>{(p) => <Input {...p} className="ops-mono" value={row.ifcGlobalId} maxLength={300} onChange={(event) => update(row.id, { ifcGlobalId: event.target.value })} />}</Field>
          <Field label={`Nhãn #${index + 1}`} required error={e?.label}>{(p) => <Input {...p} value={row.label} maxLength={220} onChange={(event) => update(row.id, { label: event.target.value })} />}</Field>
          <Field label={`Ghi chú #${index + 1}`} error={e?.note}>{(p) => <Textarea {...p} rows={1} style={{ minHeight: 42, padding: "10px 12px" }} value={row.note ?? ""} maxLength={2100} onChange={(event) => update(row.id, { note: event.target.value })} />}</Field>
          <Button variant="quiet" size="icon" aria-label={`Xóa annotation ${index + 1}`} onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); }}><Trash2 size={16} aria-hidden="true" /></Button>
        </div>;
      })}
    </div>}

    <div className="ops-actions">
      <Button variant="secondary" disabled={rows.length >= MAX_ITEMS || busy} onClick={() => { setRows((current) => [...current, { id: newIdempotencyKey(), ifcGlobalId: "", label: "", note: null }]); }}><Plus size={16} aria-hidden="true" />Thêm annotation</Button>
      <Button onClick={() => void save()} disabled={busy || !dirty || conflict !== null}><Save size={16} aria-hidden="true" />{busy ? "Đang lưu…" : "Lưu annotation"}</Button>
      <span className="ops-muted">{rows.length}/{MAX_ITEMS} · phiên bản {baseVersion}{dirty ? " · có thay đổi chưa lưu" : ""}</span>
    </div>
  </div>;
}

/** Annotation overlay: edited as a list. PUT uses If-Match "<version>"; on 412 the draft is kept and the newer version is offered. */
export function AnnotationsPanel({ accessToken, revisionId }: { accessToken: string; revisionId: string }) {
  return <RevisionAnnotations key={revisionId} accessToken={accessToken} revisionId={revisionId} />;
}

function RevisionAnnotations({ accessToken, revisionId }: { accessToken: string; revisionId: string }) {
  const annotations = useAsyncData(`annotations:${revisionId}`, async (signal) => {
    const snapshot = await buildingsApi.getAnnotations(accessToken, revisionId, signal);
    if (snapshot.revisionId !== revisionId) throw new Error("Annotation trả về không thuộc revision đang chọn. Hãy thử tải lại.");
    return snapshot;
  });
  const { data, error, loading, reload } = annotations;

  return <Panel title="Annotation overlay" description="Ghi chú bám theo IFC GlobalId, tách khỏi hình học. Lưu bằng phiên bản (If-Match) để không ghi đè thay đổi mới hơn.">
    {loading && !data && <SkeletonRows rows={3} label="Đang tải annotation…" />}
    {error !== undefined && !data && <Alert tone="danger" title="Không tải được annotation" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{describeApiError(error, "Hãy thử lại sau.")}</Alert>}
    {data && <Editor key={revisionId} accessToken={accessToken} revisionId={revisionId} snapshot={data} />}
  </Panel>;
}
