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
      toast.notify({ tone: "success", title: "Đã lưu ghi chú", description: `Phiên bản ${saved.version}.` });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 412) {
        // Keep what the user typed; fetch the newer version so they can compare.
        setLoadingLatest(true);
        try { setConflict(await buildingsApi.getAnnotations(accessToken, revisionId)); } catch { setConflict(null); setError("Ghi chú vừa được người khác thay đổi nhưng chưa tải được bản mới. Nội dung của bạn vẫn được giữ lại."); } finally { setLoadingLatest(false); }
      } else {
        setError(describeApiError(cause, "Không thể lưu ghi chú. Nội dung bạn nhập vẫn được giữ lại."));
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
    {conflict && <Alert tone="warning" title="Ghi chú vừa được người khác cập nhật" action={<div className="ops-actions" style={{ marginTop: 12 }}>
      <Button size="sm" variant="secondary" onClick={useRemote}>Dùng bản mới (bỏ thay đổi của tôi)</Button>
      <Button size="sm" variant="quiet" onClick={keepMine}>Giữ bản của tôi để ghi đè</Button>
    </div>}>
      Nội dung bạn đang soạn vẫn được giữ nguyên. Bản mới có {conflict.data.items.length} ghi chú (phiên bản {conflict.version}); chọn một hướng xử lý trước khi lưu lại.
      {conflict.data.items.length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{conflict.data.items.slice(0, 5).map((item) => <li key={item.id}>{item.label} <span className="ops-mono">({item.ifcGlobalId})</span></li>)}{conflict.data.items.length > 5 && <li>… và {conflict.data.items.length - 5} mục khác</li>}</ul>}
    </Alert>}
    {loadingLatest && <p className="ops-muted" role="status">Đang tải bản mới nhất…</p>}
    {error && <Alert tone="danger">{error}</Alert>}

    {rows.length === 0 ? <EmptyState icon={MessageSquarePlus} title="Chưa có ghi chú" description="Gắn ghi chú vào cấu kiện bằng mã cấu kiện IFC (GlobalId). Ghi chú được lưu riêng và không thay đổi mô hình." action={<Button variant="secondary" onClick={() => { setRows([{ id: newIdempotencyKey(), ifcGlobalId: "", label: "", note: null }]); }}><Plus size={16} aria-hidden="true" />Thêm ghi chú</Button>} /> : <div>
      {rows.map((row, index) => {
        const e = showErrors ? errors.get(row.id) : undefined;
        return <div className="ops-annotation-row" key={row.id}>
          <Field label={`Mã cấu kiện IFC #${index + 1}`} required error={e?.ifcGlobalId}>{(p) => <Input {...p} className="ops-mono" value={row.ifcGlobalId} maxLength={300} onChange={(event) => update(row.id, { ifcGlobalId: event.target.value })} />}</Field>
          <Field label={`Nhãn #${index + 1}`} required error={e?.label}>{(p) => <Input {...p} value={row.label} maxLength={220} onChange={(event) => update(row.id, { label: event.target.value })} />}</Field>
          <Field label={`Nội dung #${index + 1}`} error={e?.note}>{(p) => <Textarea {...p} rows={1} style={{ minHeight: 42, padding: "10px 12px" }} value={row.note ?? ""} maxLength={2100} onChange={(event) => update(row.id, { note: event.target.value })} />}</Field>
          <Button variant="quiet" size="icon" aria-label={`Xóa ghi chú ${index + 1}`} onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); }}><Trash2 size={16} aria-hidden="true" /></Button>
        </div>;
      })}
    </div>}

    <div className="ops-actions">
      <Button variant="secondary" disabled={rows.length >= MAX_ITEMS || busy} onClick={() => { setRows((current) => [...current, { id: newIdempotencyKey(), ifcGlobalId: "", label: "", note: null }]); }}><Plus size={16} aria-hidden="true" />Thêm ghi chú</Button>
      <Button onClick={() => void save()} disabled={busy || !dirty || conflict !== null}><Save size={16} aria-hidden="true" />{busy ? "Đang lưu…" : "Lưu ghi chú"}</Button>
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
    if (snapshot.revisionId !== revisionId) throw new Error("Ghi chú tải về không thuộc bản IFC đang chọn. Hãy thử tải lại.");
    return snapshot;
  });
  const { data, error, loading, reload } = annotations;

  return <Panel title="Ghi chú trên mô hình" description="Ghi chú gắn vào từng cấu kiện và được lưu riêng, không thay đổi mô hình. Nếu người khác vừa sửa, bạn sẽ được hỏi trước khi ghi đè.">
    {loading && !data && <SkeletonRows rows={3} label="Đang tải ghi chú…" />}
    {error !== undefined && !data && <Alert tone="danger" title="Không tải được ghi chú" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{describeApiError(error, "Hãy thử lại sau.")}</Alert>}
    {data && <Editor key={revisionId} accessToken={accessToken} revisionId={revisionId} snapshot={data} />}
  </Panel>;
}
