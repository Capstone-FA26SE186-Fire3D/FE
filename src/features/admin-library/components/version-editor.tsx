"use client";

import { FilePlus2, Save, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { commandDone, commandKey } from "@/api/command-keys";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { libraryAdminApi } from "@/features/library/api";
import { VersionPreview } from "@/features/library/components/version-preview";
import { describeLibraryError, issueFieldLabel, translateIssue, type LibraryErrorView, type LibraryIssue } from "@/features/library/errors";
import { checkForm, describeDifferences, emptyForm, fingerprint, formFromVersion, inputFromForm, type VersionForm } from "@/features/library/payload";
import { kindLabel, type LibraryItem, type LibraryVersion, type WithEtag } from "@/features/library/types";
import { scenarioEditorApi } from "@/features/scenario-editor/api";
import { parseRubricCatalog } from "@/features/scenario-editor/v1/catalog";
import "@/features/scenario-editor/panels/editor.css";
import { issuesFrom, PayloadFields } from "./payload-fields";

type Conflict = { latest: WithEtag<LibraryVersion>; differences: string[] };

function ErrorBody({ view }: { view: LibraryErrorView }) {
  return <span style={{ display: "grid", gap: 6 }}>
    <span>{view.message}</span>
    {view.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{view.issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issueFieldLabel(issue.path)}: {translateIssue(issue)}</li>)}</ul>}
  </span>;
}

/**
 * One library version. A Draft is edited as a form that sends only what the author typed and saves with PUT If-Match; a
 * Published version is immutable and offers only "new version from this one". 412 keeps the author's content and compares
 * with the server; every command's Idempotency-Key is durable (same key while the same intent is retried).
 */
export function VersionEditor({ accessToken, item, version, seed, onCreated, onChanged, onFork, onClose }: {
  accessToken: string;
  item: LibraryItem;
  /** The version being opened; null while creating a new one. */
  version: WithEtag<LibraryVersion> | null;
  /** Starting content for a NEW version (copy of an earlier one, or the author's own unsaved form). */
  seed: VersionForm | null;
  onCreated: (version: LibraryVersion) => void;
  /** The item or its versions moved on the server: reload the item and the list. */
  onChanged: () => void;
  onFork: (form: VersionForm | null, fromVersion: LibraryVersion | null) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const kind = item.kind;
  const rubricQuery = useAsyncData("library-rubric-catalog", (signal) => scenarioEditorApi.rubricCatalog(accessToken, signal));
  const rubricView = useMemo(() => (rubricQuery.data ? parseRubricCatalog(rubricQuery.data) : null), [rubricQuery.data]);
  const rubricCatalog = useMemo(() => ({ loading: rubricQuery.loading && !rubricQuery.data, error: Boolean(rubricQuery.error) && !rubricQuery.data, reload: rubricQuery.reload, view: rubricView }), [rubricQuery.loading, rubricQuery.data, rubricQuery.error, rubricQuery.reload, rubricView]);
  const metrics = useMemo(() => (rubricView ? new Set(rubricView.metrics.map((metric) => metric.id)) : null), [rubricView]);

  const [current, setCurrent] = useState(version);
  const initialForm = useMemo(() => (version ? formFromVersion(version.data) : seed ?? emptyForm(kind)), [version, seed, kind]);
  const [form, setForm] = useState<VersionForm>(initialForm);
  const [savedPrint, setSavedPrint] = useState(() => (version ? fingerprint(kind, initialForm) : fingerprint(kind, seed ?? emptyForm(kind))));
  const [showIssues, setShowIssues] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ print: string; issues: LibraryIssue[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LibraryErrorView | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<LibraryErrorView | null>(null);

  const isNew = current === null;
  const readOnly = current !== null && current.data.status !== "Draft";
  const print = fingerprint(kind, form);
  const dirty = print !== savedPrint;
  const checks = useMemo(() => checkForm(kind, form, { metrics, schemaVersions: rubricView?.supportedSchemaVersions ?? null }), [kind, form, metrics, rubricView]);
  // Server issues come first so the field shows what the API said (in Vietnamese, with the code); the same path from the client check is shadowed.
  const shown = useMemo(() => issuesFrom([...(serverIssues && serverIssues.print === print ? serverIssues.issues.map((issue) => ({ ...issue, message: translateIssue(issue) })) : []), ...(showIssues ? checks.blocking : []), ...checks.advisory]), [serverIssues, print, showIssues, checks]);

  const applyServerVersion = (next: WithEtag<LibraryVersion>) => {
    const content = formFromVersion(next.data);
    setCurrent(next);
    setForm(content);
    setSavedPrint(fingerprint(kind, content));
    setServerIssues(null);
    setShowIssues(false);
  };

  const loadConflict = async (mine: VersionForm) => {
    if (!current) return;
    try {
      const latest = await libraryAdminApi.getVersion(accessToken, current.data.id);
      setConflict({ latest, differences: describeDifferences(kind, mine, latest.data) });
    } catch {
      setConflict(null);
    }
  };

  const fail = (cause: unknown) => {
    const view = describeLibraryError(cause);
    setError(view);
    if (view.issues.length > 0) setServerIssues({ print, issues: view.issues });
    if (view.kind === "stale") void loadConflict(form);
    return view;
  };

  const save = async () => {
    if (busy || readOnly) return;
    setShowIssues(true);
    if (checks.blocking.length > 0) { setError(null); return; }
    setBusy(true);
    setError(null);
    const input = inputFromForm(kind, form);
    try {
      if (!current) {
        const intent = { op: "library-create-version", itemId: item.id, input };
        const created = await libraryAdminApi.createVersion(accessToken, item.id, input, commandKey(intent));
        commandDone(intent);
        toast.notify({ tone: "success", title: "Đã tạo phiên bản nháp", description: `v${created.data.versionNumber} · ${created.data.name}` });
        onChanged();
        onCreated(created.data);
        return;
      }
      const intent = { op: "library-update-version", versionId: current.data.id, etag: current.etag, input };
      const result = await libraryAdminApi.updateVersion(accessToken, current.data.id, input, current.etag, commandKey(intent));
      commandDone(intent);
      applyServerVersion(result);
      setConflict(null);
      onChanged();
      toast.notify({ tone: "success", title: "Đã lưu bản nháp", description: `Phiên bản ${result.data.versionNumber}` });
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!current || busy) return;
    setBusy(true);
    setPublishError(null);
    const intent = { op: "library-publish-version", versionId: current.data.id, etag: current.etag };
    try {
      const result = await libraryAdminApi.publishVersion(accessToken, current.data.id, current.etag, commandKey(intent));
      commandDone(intent);
      applyServerVersion(result);
      setPublishing(false);
      onChanged();
      toast.notify({ tone: "success", title: "Đã xuất bản phiên bản", description: `v${result.data.versionNumber} · từ giờ không sửa được nữa` });
    } catch (cause) {
      const view = describeLibraryError(cause);
      setPublishError(view);
      if (view.kind === "stale") void loadConflict(form);
    } finally {
      setBusy(false);
    }
  };

  const takeServerVersion = () => { if (conflict) { applyServerVersion(conflict.latest); setConflict(null); setError(null); } };
  const keepMine = () => {
    if (!conflict) return;
    // Adopt the newer ETag but keep the form: the next save carries the author's content against the newest version.
    setCurrent(conflict.latest);
    setSavedPrint(fingerprint(kind, formFromVersion(conflict.latest.data)));
    setConflict(null);
    setError(null);
  };

  const conflictPublished = conflict?.latest.data.status === "Published";
  const title = isNew ? "Phiên bản mới" : `v${current!.data.versionNumber} · ${current!.data.name}`;
  const publishReasons = [...(dirty ? ["Lưu bản nháp trước khi xuất bản."] : []), ...(checks.blocking.length > 0 ? ["Nội dung còn điểm chưa hợp lệ."] : [])];

  return <section className="ops-stack" aria-label={title} data-testid="version-editor">
    <Panel title={title} description={`${kindLabel[kind]} · mục ${item.code}`}
      actions={<>
        {current && <StatusBadge tone={readOnly ? "success" : "warning"}>{readOnly ? "Đã xuất bản (không sửa được)" : "Bản nháp"}</StatusBadge>}
        {isNew && <StatusBadge tone="info">Chưa lưu</StatusBadge>}
        {dirty && !readOnly && <StatusBadge tone="warning">Chưa lưu</StatusBadge>}
        {!readOnly && <Button disabled={busy || (!dirty && !isNew)} onClick={() => void save()} data-testid="save-version"><Save size={16} aria-hidden="true" />{busy ? "Đang lưu…" : isNew ? "Tạo bản nháp" : "Lưu bản nháp"}</Button>}
        {current && !readOnly && <Button variant="secondary" disabled={busy || publishReasons.length > 0} onClick={() => { setPublishError(null); setPublishing(true); }} data-testid="publish-version"><Send size={16} aria-hidden="true" />Xuất bản</Button>}
        <Button variant="quiet" onClick={onClose}>Đóng</Button>
      </>}
      bodyClassName="ops-stack">
      {readOnly && current && <Alert tone="info" title="Phiên bản đã xuất bản không sửa được" action={<Button size="sm" className="mt-3" onClick={() => onFork(null, current.data)} data-testid="new-from-published"><FilePlus2 size={16} aria-hidden="true" />Tạo phiên bản mới từ v{current.data.versionNumber}</Button>}>Muốn thay đổi nội dung, tạo một phiên bản nháp mới rồi xuất bản. Các kịch bản đã áp dụng mẫu này trước đó không bị đổi.</Alert>}
      {!item.isActive && <Alert tone="warning" title="Mục đang ngừng dùng">Tổ chức không thấy mục này trong danh sách chọn cho tới khi được dùng lại. Các phiên bản đã xuất bản vẫn đọc được theo mã phiên bản.</Alert>}
      {error && <Alert tone={error.kind === "stale" ? "warning" : "danger"} title={error.title}><ErrorBody view={error} /></Alert>}
      {conflict && <Alert tone="warning" title="Đối chiếu với bản mới nhất trên máy chủ" action={<div className="ops-actions" style={{ marginTop: 10 }}>
        <Button size="sm" variant="secondary" onClick={takeServerVersion} data-testid="take-server">Tải bản mới (bỏ thay đổi của tôi)</Button>
        {conflictPublished
          ? <Button size="sm" onClick={() => onFork(form, null)} data-testid="fork-mine">Tạo phiên bản mới từ nội dung của tôi</Button>
          : <Button size="sm" variant="quiet" onClick={keepMine} data-testid="keep-mine">Giữ nội dung của tôi</Button>}
      </div>}>
        {conflictPublished ? "Bản nháp này đã được xuất bản ở nơi khác nên không sửa được nữa. " : ""}
        {conflict.differences.length > 0 ? `Khác biệt so với máy chủ: ${conflict.differences.join(", ")}. ` : "Nội dung của bạn trùng bản trên máy chủ. "}
        Nội dung bạn đang sửa vẫn được giữ; “Giữ nội dung của tôi” lưu nó lên bản mới nhất ở lần lưu kế tiếp.
      </Alert>}
      {showIssues && checks.blocking.length > 0 && !readOnly && <Alert tone="danger" title={`Còn ${checks.blocking.length} điểm cần sửa trước khi lưu`}><ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{checks.blocking.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></Alert>}
    </Panel>

    {readOnly && current
      ? <Panel title="Nội dung phiên bản" bodyClassName="ops-stack"><VersionPreview version={current.data} /></Panel>
      : <PayloadFields kind={kind} form={form} setForm={(update) => setForm(update)} issues={shown} rubricCatalog={rubricCatalog} disabled={busy} />}

    {publishing && <Modal open onOpenChange={(open) => { if (!open && !busy) setPublishing(false); }} title="Xuất bản phiên bản này?"
      description="Phiên bản trở thành bản công khai cho mọi tổ chức và không sửa được nữa. Muốn sửa tiếp phải tạo phiên bản mới."
      footer={<>
        <Button variant="quiet" disabled={busy} onClick={() => setPublishing(false)}>Hủy</Button>
        {publishError?.kind === "stale"
          ? <Button variant="secondary" onClick={() => setPublishing(false)}>Đóng và đối chiếu</Button>
          : <Button disabled={busy} onClick={() => void publish()} data-testid="confirm-publish">{busy ? "Đang gửi…" : publishError?.kind === "retry" ? "Thử lại" : "Xuất bản"}</Button>}
      </>}>
      <div className="ops-stack">
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Mục <strong style={{ color: "var(--text)" }}>{item.code}</strong> · {kindLabel[kind]}</p>
        <Alert tone="info">Tổ chức áp dụng mẫu là sao chép vào bản nháp của họ. Cập nhật mẫu về sau không tự đổi kịch bản đã soạn hoặc đã phát hành.</Alert>
        {!item.isActive && <Alert tone="warning">Mục đang ngừng dùng nên tổ chức chưa thấy phiên bản này cho tới khi mục được dùng lại.</Alert>}
        {publishError && <Alert tone={publishError.kind === "stale" ? "warning" : "danger"} title={publishError.title}><ErrorBody view={publishError} /></Alert>}
      </div>
    </Modal>}
  </section>;
}
