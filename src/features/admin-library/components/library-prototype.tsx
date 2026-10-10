"use client";

import { Library, Plus, Power, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/api/types/common";
import { useUrlParams } from "@/api/use-url-params";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer, Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableMessage } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { PrototypeControls } from "@/features/dev-prototype/prototype-controls";
import { useSampleQuery, type SampleMode } from "@/features/dev-prototype/use-sample-query";
import { CODE_PATTERN, SampleLibraryStore, runtimeCapabilities } from "../sample-store";
import { libraryKindLabel, type LibraryItem, type LibraryKind, type LibraryVersionInput } from "../types";

const kinds = Object.keys(libraryKindLabel) as LibraryKind[];
const isKind = (value: string): value is LibraryKind => (kinds as string[]).includes(value);
const latest = (item: LibraryItem) => [...item.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
const draftOf = (item: LibraryItem) => item.versions.find((version) => version.publishedAt === null);

export function LibraryPrototype() {
  const [store, setStore] = useState(() => new SampleLibraryStore());
  const [rev, setRev] = useState(0);
  const [mode, setMode] = useState<SampleMode>("normal");
  const [creating, setCreating] = useState(false);
  const url = useUrlParams();
  const kindParam = url.get("kind");
  const kind: LibraryKind = isKind(kindParam) ? kindParam : "ScenarioTemplate";
  const itemId = url.get("item");
  const showInactive = url.get("inactive") === "1";
  const bump = () => setRev((value) => value + 1);

  const list = useSampleQuery(`library:${rev}:${kind}:${showInactive}`, mode, (m) => (m === "empty" ? [] : store.list(kind, showInactive)));
  const items = list.data ?? [];
  const selected = items.find((item) => item.id === itemId) ?? null;

  return <div>
    <PrototypeControls mode={mode} onModeChange={setMode} onReset={() => { setStore(new SampleLibraryStore()); bump(); url.setParams({ item: null }); }} />
    <Panel title="Thư viện hỗ trợ tổ chức" description="Template, rubric mẫu và thiết bị theo phiên bản. Phiên bản đã xuất bản bất biến; cập nhật mẫu không sửa kịch bản đã phát hành."
      actions={<Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Thêm mục</Button>} bodyClassName="ops-stack">
      <Tabs value={kind} onValueChange={(value) => url.setParams({ kind: value, item: null })}>
        <TabsList aria-label="Loại mục thư viện">{kinds.map((value) => <TabsTrigger key={value} value={value}>{libraryKindLabel[value]}</TabsTrigger>)}</TabsList>
      </Tabs>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)" }}>
        <input type="checkbox" checked={showInactive} onChange={(event) => url.setParams({ inactive: event.target.checked ? "1" : null })} />Hiện cả mục đã ngừng dùng
      </label>
      {kind === "Equipment" && <Alert tone="info" title="Metadata thiết bị không thêm khả năng cho runtime">Mỗi thiết bị chỉ được gắn khả năng mà runtime đã hỗ trợ. Thiết bị mới cần phát triển ở Unity trước khi dùng được trong bài.</Alert>}
      {list.error !== undefined && <Alert tone="danger" title="Không tải được thư viện" action={<Button size="sm" variant="secondary" className="mt-3" onClick={list.reload}>Thử lại</Button>}>Hãy kiểm tra kết nối rồi thử lại.</Alert>}
      <Table caption={`${libraryKindLabel[kind]} (dữ liệu mẫu)`}>
        <thead><tr><th>Mục</th><th>Phiên bản mới nhất</th><th>Trạng thái</th><th>Khả năng runtime</th></tr></thead>
        <tbody>
          {list.loading && !list.data && <TableMessage colSpan={4}><SkeletonRows rows={4} label="Đang tải thư viện…" /></TableMessage>}
          {items.map((item) => {
            const current = latest(item);
            return <tr key={item.id}>
              <td><button type="button" className="ops-cell-primary" style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", minHeight: 24 }} onClick={() => url.setParams({ item: item.id })}>{current.name}<span className="ops-cell-sub">{item.code}</span></button></td>
              <td>v{current.versionNumber}{draftOf(item) ? " (nháp)" : ""}</td>
              <td><StatusBadge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Đang dùng" : "Ngừng dùng"}</StatusBadge></td>
              <td>{current.requiredCapabilities.length ? current.requiredCapabilities.join(", ") : "—"}</td>
            </tr>;
          })}
          {list.data && !items.length && <TableMessage colSpan={4}><EmptyState icon={Library} title={`Chưa có ${libraryKindLabel[kind].toLowerCase()}`} description="Thêm mục đầu tiên để tổ chức có thể dùng khi soạn kịch bản." action={<Button size="sm" onClick={() => setCreating(true)}>Thêm mục</Button>} /></TableMessage>}
        </tbody>
      </Table>
    </Panel>
    <ItemDrawer key={selected?.id ?? "none"} item={selected} store={store} onClose={() => url.setParams({ item: null })} onChanged={bump} />
    <CreateDrawer open={creating} defaultKind={kind} store={store} onClose={() => setCreating(false)} onCreated={(created) => { setCreating(false); bump(); url.setParams({ kind: created.kind, item: created.id }); }} />
  </div>;
}

function CapabilityPicker({ value, onChange, error }: { value: string[]; onChange: (next: string[]) => void; error?: string }) {
  return <fieldset className="ops-fieldset" style={{ minWidth: 0 }} aria-describedby={error ? "cap-error" : undefined}>
    <legend className="ops-field-label">Khả năng runtime cần có</legend>
    {runtimeCapabilities.map((capability) => <label key={capability} style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 32, fontSize: 14 }}>
      <input type="checkbox" checked={value.includes(capability)} onChange={() => onChange(value.includes(capability) ? value.filter((item) => item !== capability) : [...value, capability])} />{capability}
    </label>)}
    {error && <span id="cap-error" className="ops-field-error" role="alert">{error}</span>}
  </fieldset>;
}

function useVersionForm(initial: LibraryVersionInput) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const run = async (task: () => Promise<void>) => {
    if (saving) return;
    setSaving(true); setFormError(""); setErrors({});
    try { await task(); }
    catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors.length) setErrors(Object.fromEntries(cause.fieldErrors.map((item) => [item.path, item.message])));
      setFormError(cause instanceof ApiError && cause.code === "LIBRARY_DRAFT_EXISTS" ? "Mục này đã có bản nháp. Xuất bản hoặc dùng bản nháp đó trước." : "Không thể lưu. Nội dung bạn nhập vẫn được giữ lại; hãy kiểm tra và thử lại.");
    } finally { setSaving(false); }
  };
  return { form, setForm, errors, formError, saving, run };
}

function ItemDrawer({ item, store, onClose, onChanged }: { item: LibraryItem | null; store: SampleLibraryStore; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const current = item ? latest(item) : null;
  const draft = item ? draftOf(item) : undefined;
  const state = useVersionForm({ name: current?.name ?? "", description: current?.description ?? "", requiredCapabilities: current?.requiredCapabilities ?? [] });
  const [showForm, setShowForm] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    void state.run(async () => {
      await store.addVersion(item.id, state.form);
      toast.notify({ tone: "success", title: "Đã tạo bản nháp mới", description: "Dữ liệu mẫu — không gọi API thật." });
      setShowForm(false); onChanged();
    });
  };
  const publish = async () => {
    if (!item || !draft || publishing) return;
    setPublishing(true);
    try { await store.publishVersion(item.id, draft.id); toast.notify({ tone: "success", title: `Đã xuất bản v${draft.versionNumber}`, description: "Kịch bản đã phát hành không bị thay đổi." }); onChanged(); }
    catch { toast.notify({ tone: "danger", title: "Không xuất bản được", description: "Hãy thử lại." }); }
    finally { setPublishing(false); }
  };
  const toggle = async () => {
    if (!item || toggleBusy) return;
    setToggleBusy(true);
    try { await store.setActive(item.id, !item.isActive); toast.notify({ tone: "success", title: item.isActive ? "Đã ngừng dùng mục" : "Đã dùng lại mục" }); setToggling(false); onChanged(); }
    catch { toast.notify({ tone: "danger", title: "Không đổi được trạng thái" }); }
    finally { setToggleBusy(false); }
  };

  return <>
    <Drawer open={item !== null} onOpenChange={(open) => { if (!open) onClose(); }} title={current?.name ?? "Mục thư viện"} description={item ? `${libraryKindLabel[item.kind]} · ${item.code}` : undefined}
      footer={item && <><Button variant={item.isActive ? "secondary" : "primary"} onClick={() => setToggling(true)}><Power size={16} aria-hidden="true" />{item.isActive ? "Ngừng dùng" : "Dùng lại"}</Button>
        {draft ? <Button disabled={publishing} onClick={() => void publish()}><Send size={16} aria-hidden="true" />{publishing ? "Đang xuất bản…" : `Xuất bản v${draft.versionNumber}`}</Button> : <Button onClick={() => setShowForm(true)}><Plus size={16} aria-hidden="true" />Tạo phiên bản mới</Button>}</>}>
      {item && <div className="ops-stack">
        {!item.isActive && <Alert tone="warning" title="Mục đang ngừng dùng">Tổ chức không chọn được mục này khi soạn kịch bản mới. Lịch sử vẫn được giữ.</Alert>}
        <ol style={{ margin: 0, padding: 0, display: "grid", gap: 10 }} aria-label="Các phiên bản">
          {[...item.versions].sort((a, b) => b.versionNumber - a.versionNumber).map((version) => <li key={version.id} style={{ listStyle: "none", padding: 12, border: "1px solid var(--line)", borderRadius: 10, display: "grid", gap: 6 }}>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}><strong>v{version.versionNumber}</strong><StatusBadge tone={version.publishedAt ? "success" : "warning"}>{version.publishedAt ? "Đã xuất bản (bất biến)" : "Bản nháp"}</StatusBadge></span>
            <span style={{ fontSize: 14 }}>{version.name}</span>
            <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>{version.description || "Chưa có mô tả."}</span>
            <span className="ops-field-hint">{version.requiredCapabilities.length ? `Khả năng: ${version.requiredCapabilities.join(", ")}` : "Không yêu cầu khả năng đặc biệt"} · {formatDateTime(version.publishedAt ?? version.createdAt)}</span>
          </li>)}
        </ol>
        {showForm && <form onSubmit={submit} noValidate className="ops-stack" aria-label="Tạo phiên bản mới">
          <VersionFields state={state} kind={item.kind} />
          <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button type="button" variant="quiet" onClick={() => setShowForm(false)} disabled={state.saving}>Hủy</Button><Button type="submit" disabled={state.saving}>{state.saving ? "Đang lưu…" : "Lưu bản nháp"}</Button></div>
        </form>}
      </div>}
    </Drawer>
    <Modal open={toggling} onOpenChange={(open) => { if (!open && !toggleBusy) setToggling(false); }} title={item?.isActive ? "Ngừng dùng mục này?" : "Dùng lại mục này?"}
      description={item?.isActive ? "Tổ chức không chọn được mục này cho kịch bản mới. Kịch bản đã phát hành giữ nguyên." : "Mục xuất hiện lại cho tổ chức khi soạn kịch bản."}
      footer={<><Button variant="quiet" onClick={() => setToggling(false)} disabled={toggleBusy}>Hủy</Button><Button variant={item?.isActive ? "danger" : "primary"} disabled={toggleBusy} onClick={() => void toggle()}>{toggleBusy ? "Đang lưu…" : "Xác nhận"}</Button></>}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Thư viện giữ lịch sử, không xóa vĩnh viễn.</p>
    </Modal>
  </>;
}

function VersionFields({ state, kind }: { state: ReturnType<typeof useVersionForm>; kind: LibraryKind }) {
  const { form, setForm, errors, formError } = state;
  return <>
    <Field label="Tên phiên bản" required error={errors.name}>{(p) => <Input {...p} maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />}</Field>
    <Field label={kind === "Equipment" ? "Mô tả thiết bị" : kind === "RubricSample" ? "Tiêu chí và trọng số" : "Mục tiêu và tình huống"}>{(p) => <Textarea {...p} rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />}</Field>
    <CapabilityPicker value={form.requiredCapabilities} onChange={(requiredCapabilities) => setForm({ ...form, requiredCapabilities })} error={errors.requiredCapabilities} />
    {formError && <Alert tone="danger">{formError}</Alert>}
  </>;
}

function CreateDrawer({ open, defaultKind, store, onClose, onCreated }: { open: boolean; defaultKind: LibraryKind; store: SampleLibraryStore; onClose: () => void; onCreated: (item: LibraryItem) => void }) {
  return <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Thêm mục thư viện" description="Mục mới bắt đầu bằng bản nháp v1; xuất bản khi sẵn sàng.">
    {open && <CreateForm defaultKind={defaultKind} store={store} onClose={onClose} onCreated={onCreated} />}
  </Drawer>;
}

function CreateForm({ defaultKind, store, onClose, onCreated }: { defaultKind: LibraryKind; store: SampleLibraryStore; onClose: () => void; onCreated: (item: LibraryItem) => void }) {
  const toast = useToast();
  const state = useVersionForm({ name: "", description: "", requiredCapabilities: [] });
  const [kind, setKind] = useState<LibraryKind>(defaultKind);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const invalid = CODE_PATTERN.test(code) ? "" : "Mã gồm 3–64 ký tự: chữ thường, số, gạch ngang hoặc gạch dưới.";
    setCodeError(invalid);
    if (invalid) return;
    void state.run(async () => {
      try { const created = await store.createItem({ ...state.form, kind, code }); toast.notify({ tone: "success", title: "Đã tạo mục thư viện", description: "Dữ liệu mẫu — không gọi API thật." }); onCreated(created); }
      catch (cause) { if (cause instanceof ApiError && cause.code === "LIBRARY_CODE_TAKEN") setCodeError("Mã này đã tồn tại."); throw cause; }
    });
  };
  return <form onSubmit={submit} noValidate className="ops-stack">
    <Field label="Loại">{(p) => <select {...p} className="ops-input" value={kind} onChange={(event) => setKind(event.target.value as LibraryKind)}>{kinds.map((value) => <option key={value} value={value}>{libraryKindLabel[value]}</option>)}</select>}</Field>
    <Field label="Mã" required hint="Duy nhất, không đổi sau khi tạo." error={codeError}>{(p) => <Input {...p} autoComplete="off" value={code} onChange={(event) => setCode(event.target.value.toLowerCase())} />}</Field>
    <VersionFields state={state} kind={kind} />
    <div className="ops-actions" style={{ justifyContent: "flex-end" }}><Button type="button" variant="quiet" onClick={onClose} disabled={state.saving}>Hủy</Button><Button type="submit" disabled={state.saving}>{state.saving ? "Đang tạo…" : "Tạo mục"}</Button></div>
  </form>;
}
