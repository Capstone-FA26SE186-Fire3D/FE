"use client";

import { ArrowLeft, CircleAlert, CircleCheck, Eye, FilePlus2, PenLine, RefreshCw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CellTitle, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubTabs } from "@/components/ui/sub-tabs";
import { useToast } from "@/components/ui/toast";
import { Rows } from "@/features/admin-overview/components/admin-kit";
import { kindLabel } from "@/features/learn/types";
import { learnAdminApi } from "../api";
import { loadPostWithVersion } from "../load-post";
import { commandDone, commandKey } from "../command-keys";
import { checkContent, contentFromVersion, describeDifferences, emptyContent, fingerprint, toVersionInput, type ContentIssue, type EditorContent } from "../content";
import { describeLearnError, translateIssue, type LearnErrorView } from "../errors";
import { lifecycleBody, lifecycleCopy, lifecycleFor, postStatusView, publishBlockReason, versionStatusView } from "../status";
import type { AdminPost, AdminVersion, LifecycleOperation, VersionSummary, WithEtag } from "../types";
import { isMediaRefused, useMediaChecks } from "../use-media-checks";
import { useSourceFlags } from "../use-source-flags";
import { wordCount } from "../doc-actions";
import { ContentFields } from "./content-fields";
import { DocToolbar } from "./doc-toolbar";
import { ReaderPreview } from "./reader-preview";
import { BlockEditor } from "./learn-blocks";
import { PublishPanel } from "./publish-panel";
import { SourcePicker } from "./source-picker";
import "./learn-quick.css";

type Loaded = { post: WithEtag<AdminPost>; version: WithEtag<AdminVersion> | null };
type Conflict = { latest: WithEtag<AdminVersion>; differences: string[] };
type Operation = { kind: "publish" } | { kind: "lifecycle"; operation: LifecycleOperation } | { kind: "newVersion" };

/** The two editor screens (Figma 64:2708 / 64:3069). Older `tab=` values (info/content/classify → content, versions → publish) keep working. */
export type EditorScreen = "content" | "publish";
export const editorScreen = (tab: string): EditorScreen => (tab === "publish" || tab === "versions" ? "publish" : "content");
const SCREENS = [{ value: "content", label: "Nội dung" }, { value: "publish", label: "Phiên bản & Xuất bản" }];

function ErrorList({ view }: { view: LearnErrorView }) {
  return <span style={{ display: "grid", gap: 6 }}>
    <span>{view.message}</span>
    {view.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{view.issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{translateIssue(issue).message}</li>)}</ul>}
  </span>;
}

/**
 * Opens one post: `GET /posts/{id}` (post ETag + version summaries) and the chosen version `GET /versions/{id}` (version ETag).
 * No version in the URL → the newest Draft, else the newest version. The editor below is remounted whenever the user asks to reload.
 */
export function PostEditor({ accessToken, postId, versionId, tab, onTab, onBack, onOpenVersion }: {
  accessToken: string; postId: string; versionId: string; tab: string; onTab: (tab: string) => void; onBack: () => void; onOpenVersion: (versionId: string) => void;
}) {
  const [rev, setRev] = useState(0);
  const loaded = useAsyncData<Loaded>(`learn-post:${postId}:${versionId}:${rev}`, (signal) => loadPostWithVersion(accessToken, postId, versionId, signal));
  const back = <div><Button variant="quiet" size="sm" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Button></div>;

  if (loaded.error !== undefined) {
    const view = describeLearnError(loaded.error);
    if (view.kind === "notFound") return <div className="ops-stack">{back}<EmptyState icon={FilePlus2} title="Không tìm thấy bài" description="Bài không tồn tại hoặc đường dẫn không đúng." /></div>;
    return <div className="ops-stack">{back}<Alert tone="danger" title="Không tải được bài" action={<Button size="sm" variant="secondary" className="mt-3" onClick={loaded.reload}>Thử lại</Button>}>{view.message}</Alert></div>;
  }
  if (!loaded.data) return <div className="ops-stack">{back}<Panel bodyClassName="ops-stack"><SkeletonDetail rows={6} /></Panel></div>;
  const { post, version } = loaded.data;
  return <EditorBody key={`${post.data.id}:${version?.data.id ?? "none"}:${rev}`} accessToken={accessToken} initialPost={post} initialVersion={version} screen={editorScreen(tab)} onTab={onTab} onBack={onBack} onOpenVersion={onOpenVersion} onReload={() => setRev((value) => value + 1)} />;
}

function EditorBody({ accessToken, initialPost, initialVersion, screen, onTab, onBack, onOpenVersion, onReload }: {
  accessToken: string; initialPost: WithEtag<AdminPost>; initialVersion: WithEtag<AdminVersion> | null; screen: EditorScreen; onTab: (tab: string) => void;
  onBack: () => void; onOpenVersion: (versionId: string) => void; onReload: () => void;
}) {
  const toast = useToast();
  const [post, setPost] = useState(initialPost);
  const [version, setVersion] = useState(initialVersion);
  const [initial] = useState<EditorContent>(() => (initialVersion ? contentFromVersion(initialVersion.data) : emptyContent()));
  const [form, setForm] = useState<EditorContent>(initial);
  const [savedPrint, setSavedPrint] = useState(() => fingerprint(initial));
  const [showIssues, setShowIssues] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ print: string; issues: ContentIssue[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<LearnErrorView | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  // What to do once the user confirms dropping unsaved edits (go back, or open another version).
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [operationError, setOperationError] = useState<LearnErrorView | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [active, setActive] = useState(-1);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Page-wide undo/redo (block moves and type changes too); typing within a field coalesces into one step.
  const [history, setHistory] = useState<{ past: EditorContent[]; future: EditorContent[] }>({ past: [], future: [] });
  const lastEdit = useRef(0);
  const media = useMediaChecks(accessToken);
  const { flags, known } = useSourceFlags(accessToken, form.sources);

  const status = post.data.publicationStatus;
  const isDraft = version?.data.status === "Draft";
  const readOnly = !isDraft || status === "Deleted";
  const print = fingerprint(form);
  const dirty = print !== savedPrint;
  const clientIssues = checkContent(form);
  const refusedVideo = form.blocks.some((block) => block.type === "video" && isMediaRefused(media.checks, block.id, block.fields.url));
  const shownIssues: ContentIssue[] = [...(showIssues ? clientIssues : []), ...(serverIssues && serverIssues.print === print ? serverIssues.issues : [])];
  const issueFor = (path: string) => shownIssues.find((issue) => issue.path === path)?.message;

  const sourceProblems = form.sources.flatMap((entry) => {
    const verdict = flags[entry.sourceId];
    const reason = verdict ? publishBlockReason(verdict) : null;
    return reason ? [`Nguồn “${entry.title}”: ${reason}`] : [];
  });
  const publishBlockers = [...sourceProblems, ...(clientIssues.length > 0 ? ["Nội dung còn điểm chưa hợp lệ, xem thẻ Nội dung."] : [])];
  const publishReasons = [...(status === "Deleted" ? ["Bài đã bị xóa: khôi phục bài trước khi xuất bản."] : []), ...(dirty ? ["Lưu bản nháp trước khi xuất bản."] : []), ...publishBlockers];

  /** Replaces the form with what the server holds (canonical URLs, ordering) and makes it the saved baseline. */
  const applyVersion = (next: WithEtag<AdminVersion>) => {
    const content = contentFromVersion(next.data);
    setVersion(next);
    setForm(content);
    setSavedPrint(fingerprint(content));
    setServerIssues(null);
    setShowIssues(false);
  };

  const loadConflict = async (current: EditorContent) => {
    if (!version) return;
    try {
      const latest = await learnAdminApi.getVersion(accessToken, version.data.id);
      setConflict({ latest, differences: describeDifferences(current, latest.data) });
    } catch {
      setConflict(null);
    }
  };

  const fail = (cause: unknown, current: EditorContent) => {
    const view = describeLearnError(cause);
    setError(view);
    if (view.issues.length > 0) setServerIssues({ print: fingerprint(current), issues: view.issues.map(translateIssue) });
    if (view.kind === "stale") void loadConflict(current);
    return view;
  };

  const save = async () => {
    if (busy || !version || readOnly) return;
    setShowIssues(true);
    if (clientIssues.length > 0 || refusedVideo) { setError(null); return; }
    setBusy(true);
    setSaveState("busy");
    setError(null);
    const input = toVersionInput(form);
    const intent = { op: "update-version", versionId: version.data.id, etag: version.etag, input };
    try {
      const result = await learnAdminApi.updateVersion(accessToken, version.data.id, input, version.etag, commandKey(intent));
      commandDone(intent);
      applyVersion(result);
      setConflict(null);
      setSaveState("done");
      window.setTimeout(() => setSaveState("idle"), 1200);
      toast.notify({ tone: "success", title: "Đã lưu bản nháp", description: `Phiên bản ${result.data.versionNumber}` });
    } catch (cause) {
      setSaveState("idle");
      fail(cause, form);
    } finally {
      setBusy(false);
    }
  };

  /** Fetches the newest post (and version when the form has nothing unsaved) without throwing away the user's edits. */
  const refresh = async () => {
    try {
      const latestPost = await learnAdminApi.getPost(accessToken, post.data.id);
      setPost(latestPost);
      if (version) {
        const latestVersion = await learnAdminApi.getVersion(accessToken, version.data.id);
        if (!dirty) applyVersion(latestVersion);
        else setConflict({ latest: latestVersion, differences: describeDifferences(form, latestVersion.data) });
      }
    } catch (cause) {
      setError(describeLearnError(cause));
    }
  };

  const closeOperation = () => { if (!busy) { setOperation(null); setOperationError(null); } };
  const start = (next: Operation) => { setOperationError(null); setOperation(next); };

  const runOperation = async () => {
    if (!operation || busy) return;
    setBusy(true);
    setOperationError(null);
    try {
      if (operation.kind === "publish" && version) {
        const intent = { op: "publish-version", versionId: version.data.id, etag: version.etag };
        const result = await learnAdminApi.publishVersion(accessToken, version.data.id, version.etag, commandKey(intent));
        commandDone(intent);
        setPost(result);
        try { applyVersion(await learnAdminApi.getVersion(accessToken, version.data.id)); } catch { onReload(); }
        toast.notify({ tone: "success", title: "Đã xuất bản", description: `Phiên bản ${version.data.versionNumber} · bài ${postStatusView[result.data.publicationStatus].label.toLowerCase()}` });
      } else if (operation.kind === "lifecycle") {
        const intent = { op: operation.operation, postId: post.data.id, etag: post.etag };
        const result = await learnAdminApi.lifecycle(accessToken, post.data.id, operation.operation, post.etag, commandKey(intent));
        commandDone(intent);
        setPost(result);
        toast.notify({ tone: "success", title: lifecycleCopy[operation.operation].done, description: `Bài hiện ${postStatusView[result.data.publicationStatus].label.toLowerCase()}` });
      } else if (operation.kind === "newVersion") {
        const input = toVersionInput(form);
        const intent = { op: "create-version", postId: post.data.id, input };
        const result = await learnAdminApi.createVersion(accessToken, post.data.id, input, commandKey(intent));
        commandDone(intent);
        toast.notify({ tone: "success", title: "Đã tạo bản nháp mới", description: `v${result.data.versionNumber}` });
        setOperation(null);
        onOpenVersion(result.data.id);
        return;
      }
      setOperation(null);
    } catch (cause) {
      const view = describeLearnError(cause);
      setOperationError(view);
      if (view.kind === "stale") void refresh();
    } finally {
      setBusy(false);
    }
  };

  const refreshPostOnly = async () => { try { setPost(await learnAdminApi.getPost(accessToken, post.data.id)); } catch { /* the stale banner already told the user to reload */ } };
  const takeServerVersion = () => { if (conflict) { applyVersion(conflict.latest); setConflict(null); setError(null); void refreshPostOnly(); } };
  const keepMine = () => {
    if (!conflict) return;
    // Adopt the newer ETag but keep the form: the next save carries the user's content against the newest version.
    setVersion(conflict.latest);
    setSavedPrint(fingerprint(contentFromVersion(conflict.latest.data)));
    setConflict(null);
    setError(null);
    void refreshPostOnly();
  };

  const guard = (go: () => void) => (dirty ? setLeaving(() => go) : go());
  /** Every edit on the page goes through here so it can be undone. */
  const edit = (update: (current: EditorContent) => EditorContent) => {
    const now = Date.now();
    const next = update(form);
    // Adding, removing, moving or retyping a block is always its own step; typing in one field coalesces.
    const shape = (content: EditorContent) => content.blocks.map((block) => `${block.id}:${block.type}:${String(block.fields.level ?? "")}:${String(block.fields.ordered ?? "")}:${String(block.fields.tone ?? "")}`).join("|");
    if (shape(next) !== shape(form) || now - lastEdit.current > 700) setHistory((log) => ({ past: [...log.past.slice(-99), form], future: [] }));
    lastEdit.current = now;
    setForm(next);
  };
  const undo = () => { const previous = history.past.at(-1); if (!previous) return; setHistory({ past: history.past.slice(0, -1), future: [...history.future, form] }); lastEdit.current = 0; setForm(previous); };
  const redo = () => { const next = history.future.at(-1); if (!next) return; setHistory({ past: [...history.past, form], future: history.future.slice(0, -1) }); lastEdit.current = 0; setForm(next); };
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  // Ctrl/⌘+S saves the draft, like a document editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const words = wordCount(form.blocks, form.summary);
  const readiness: Array<{ ok: boolean; text: string }> = [
    { ok: !!form.title.trim() && !!form.summary.trim(), text: form.title.trim() && form.summary.trim() ? "Có tiêu đề và tóm tắt" : "Cần tiêu đề và tóm tắt" },
    { ok: form.blocks.length > 0, text: `${form.blocks.length} khối nội dung · ${words} chữ · ${Math.max(1, Math.round(words / 200))} phút đọc` },
    ...(form.kind === "Video" ? [{ ok: form.blocks.some((block) => block.type === "video"), text: form.blocks.some((block) => block.type === "video") ? "Có khối video" : "Bài Video cần ít nhất một khối video" }] : []),
    { ok: !!form.coverImageUrl.trim(), text: form.coverImageUrl.trim() ? "Có ảnh bìa" : "Chưa có ảnh bìa (không bắt buộc)" },
    { ok: sourceProblems.length === 0, text: form.sources.length ? (sourceProblems.length ? `${sourceProblems.length} nguồn chưa đủ điều kiện` : `${form.sources.length} nguồn đủ điều kiện`) : "Chưa trích nguồn (không bắt buộc)" },
    ...(clientIssues.length ? [{ ok: false, text: `Còn ${clientIssues.length} điểm chưa hợp lệ` }] : []),
  ];
  const conflictPublished = conflict?.latest.data.status === "Published";
  const statusView = postStatusView[status];
  const versions = [...(post.data.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const title = form.title.trim() || post.data.publishedVersion?.title || "Bài chưa đặt tên";
  const operationCopy = operation?.kind === "lifecycle" ? lifecycleCopy[operation.operation] : null;

  const versionColumns: DataColumn<VersionSummary>[] = [
    { key: "version", header: "Phiên bản", primary: true, render: (item) => <CellTitle title={`v${item.versionNumber}`} sub={item.title} /> },
    { key: "status", header: "Trạng thái", width: 260, render: (item) => <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}><StatusBadge tone={versionStatusView[item.status].tone}>{versionStatusView[item.status].label}</StatusBadge>{post.data.publishedVersionId === item.id && <StatusBadge tone="ember">Đang công khai</StatusBadge>}{version?.data.id === item.id && <StatusBadge tone="info">Đang mở</StatusBadge>}</span> },
    { key: "updated", header: "Cập nhật", width: 170, hideBelow: 768, render: (item) => formatDateTime(item.updatedAt) },
  ];
  const versionMenu = (item: VersionSummary) => [
    ...(version?.data.id !== item.id ? [{ label: "Mở phiên bản", onSelect: () => guard(() => onOpenVersion(item.id)) }] : []),
    ...(version?.data.id === item.id && isDraft && status !== "Deleted" ? [{ label: "Xuất bản bản nháp", icon: Send, onSelect: () => start({ kind: "publish" }), disabled: publishReasons.length > 0, hint: publishReasons[0] }] : []),
    ...(version?.data.id === item.id && !isDraft && status !== "Deleted" ? [{ label: `Tạo bản nháp mới từ v${item.versionNumber}`, icon: FilePlus2, onSelect: () => start({ kind: "newVersion" }) }] : []),
  ];

  const lifecycleButtons = lifecycleFor[status].map((op) => <Button key={op} variant={lifecycleCopy[op].danger ? "danger" : op === "show" || op === "restore" ? "primary" : "secondary"} disabled={busy} onClick={() => start({ kind: "lifecycle", operation: op })}>{lifecycleCopy[op].label}</Button>);

  return <div className="ops-stack" data-testid="learn-post-editor">
    <header className="learn-editor-head">
      <Button size="icon" variant="quiet" aria-label="Về danh sách" onClick={() => guard(onBack)}><ArrowLeft size={18} aria-hidden="true" /></Button>
      <div className="learn-editor-head-text">
        <p className="learn-eyebrow">Bài học · {kindLabel[form.kind]}{version ? ` · v${version.data.versionNumber} (${versionStatusView[version.data.status].label.toLowerCase()})` : ""}</p>
        <h2>{title}</h2>
        <p className="learn-list-note">Đường dẫn rút gọn: {post.data.slug}</p>
      </div>
      <div className="learn-editor-head-actions">
        {screen === "content" && <div className="doc-mode" role="group" aria-label="Chế độ xem">
          <button type="button" aria-pressed={view === "edit"} onClick={() => setView("edit")}><PenLine size={15} aria-hidden="true" />Soạn</button>
          <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}><Eye size={15} aria-hidden="true" />Xem như người đọc</button>
        </div>}
        <StatusBadge tone={statusView.tone}>{statusView.label}</StatusBadge>
        {dirty && <StatusBadge tone="warning">Chưa lưu</StatusBadge>}
        {!readOnly && <SubmitButton state={saveState} disabled={busy || !dirty} doneLabel="Đã lưu" onClick={() => void save()}>Lưu bản nháp</SubmitButton>}
        {isDraft && status !== "Deleted" && <Button disabled={busy || publishReasons.length > 0} title={publishReasons[0]} onClick={() => start({ kind: "publish" })}><Send size={16} aria-hidden="true" />Xuất bản v{version?.data.versionNumber}</Button>}
      </div>
    </header>

    <SubTabs label="Trình soạn bài" value={screen} onValueChange={(value) => onTab(value === "content" ? "" : value)} items={SCREENS} />

    {(error || conflict || (showIssues && (clientIssues.length > 0 || refusedVideo) && !readOnly)) && <div className="ops-stack">
      {error && <Alert tone={error.kind === "stale" ? "warning" : "danger"} title={error.title}><ErrorList view={error} /></Alert>}
      {conflict && <Alert tone="warning" title="Đối chiếu với bản mới nhất trên máy chủ" action={<div className="ops-actions" style={{ marginTop: 10 }}>
        <Button size="sm" variant="secondary" onClick={takeServerVersion}>Tải bản mới (bỏ thay đổi của tôi)</Button>
        {conflictPublished
          ? <Button size="sm" onClick={() => { keepMine(); start({ kind: "newVersion" }); }}>Tạo bản nháp mới từ nội dung của tôi</Button>
          : <Button size="sm" variant="quiet" onClick={keepMine}>Giữ nội dung của tôi</Button>}
      </div>}>
        {conflictPublished ? "Bản nháp này đã được xuất bản ở nơi khác nên không sửa được nữa. " : ""}
        {conflict.differences.length > 0 ? `Khác biệt so với máy chủ: ${conflict.differences.join(", ")}. ` : "Nội dung của bạn trùng bản trên máy chủ. "}
        Nội dung bạn đang sửa vẫn được giữ; “Giữ nội dung của tôi” lưu nó lên bản mới nhất ở lần lưu kế tiếp.
      </Alert>}
      {showIssues && clientIssues.length > 0 && !readOnly && <Alert tone="danger" title={`Còn ${clientIssues.length} điểm cần sửa trước khi lưu`}><ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{clientIssues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></Alert>}
      {showIssues && refusedVideo && <Alert tone="danger" title="Có liên kết video không hợp lệ">Sửa hoặc xóa khối video đó trước khi lưu.</Alert>}
    </div>}

    {screen === "content" && <div className="learn-editor doc-editor">
      <div className="ops-stack learn-editor-main">
        {!isDraft && status !== "Deleted" && version && <Alert tone="info" title="Đang xem bản đã xuất bản (không sửa được)" action={<Button size="sm" className="mt-3" disabled={busy} onClick={() => start({ kind: "newVersion" })}><FilePlus2 size={16} aria-hidden="true" />Tạo bản nháp mới từ v{version.data.versionNumber}</Button>}>Không sửa trực tiếp bản đã xuất bản. Tạo bản nháp mới để chỉnh sửa; bản công khai hiện tại giữ nguyên tới khi bản mới được xuất bản.</Alert>}
        {status === "Deleted" && <Alert tone="warning" title="Bài đã bị xóa (vẫn khôi phục được)">Khôi phục bài (thẻ Trạng thái hoặc “Phiên bản & Xuất bản”) trước khi sửa, tạo bản nháp hay xuất bản.</Alert>}
        {view === "preview" ? <div className="doc-paper doc-paper-preview"><ReaderPreview form={form} checks={media.checks} /></div> : <>
          {!readOnly && <DocToolbar blocks={form.blocks} active={active} disabled={busy} canUndo={history.past.length > 0} canRedo={history.future.length > 0} onUndo={undo} onRedo={redo}
            onBlocks={(blocks, id) => { edit((current) => ({ ...current, blocks })); if (id) { setFocusId(id); setActive(blocks.findIndex((block) => block.id === id)); } }} />}
          <fieldset disabled={busy || readOnly} className="doc-paper" aria-label="Trang soạn bài">
            <Field label="Ảnh bìa (https, không bắt buộc)" className="doc-cover" error={issueFor("$.coverImageUrl")}>{(p) => <Input {...p} inputMode="url" placeholder="Dán đường dẫn ảnh bìa https (tải ảnh từ máy: sắp có)" value={form.coverImageUrl} onChange={(event) => edit((current) => ({ ...current, coverImageUrl: event.target.value }))} />}</Field>
            <Field label="Tiêu đề" required className="doc-title" error={issueFor("$.title")}>{(p) => <Textarea {...p} rows={1} maxLength={255} placeholder="Tiêu đề bài" value={form.title} onChange={(event) => edit((current) => ({ ...current, title: event.target.value.replace(/\n/g, " ") }))} />}</Field>
            <Field label="Tóm tắt" required className="doc-lede" hint={`${form.summary.length}/2000 · hiện ở danh sách bài và dưới video`} error={issueFor("$.summary")}>{(p) => <Textarea {...p} rows={2} maxLength={2000} placeholder="Tóm tắt một–hai câu cho người đọc" value={form.summary} onChange={(event) => edit((current) => ({ ...current, summary: event.target.value }))} />}</Field>
            <hr className="doc-rule" />
            <BlockEditor doc blocks={form.blocks} disabled={readOnly} issues={shownIssues} checks={media.checks} onCheck={(blockId, url) => void media.check(blockId, url)} active={active} onActive={setActive} focusId={focusId}
              onChange={(blocks) => edit((current) => ({ ...current, blocks }))} />
          </fieldset>
        </>}
        <Panel title="Nguồn trích dẫn" description="Bản nháp có thể trích nguồn dùng chung chưa duyệt; muốn xuất bản thì mọi nguồn phải đã duyệt và còn hiệu lực." bodyClassName="ops-stack">
          <SourcePicker accessToken={accessToken} selected={form.sources} flags={flags} known={known} disabled={readOnly || busy}
            onAdd={(source) => edit((current) => current.sources.some((entry) => entry.sourceId === source.id && entry.role === "Reference") ? current : { ...current, sources: [...current.sources, { sourceId: source.id, role: "Reference", locator: {}, title: source.title, versionLabel: source.versionLabel }] })}
            onRemove={(index) => edit((current) => ({ ...current, sources: current.sources.filter((_, position) => position !== index) }))}
            onRole={(index, role) => edit((current) => ({ ...current, sources: current.sources.map((entry, position) => (position === index ? { ...entry, role } : entry)) }))} />
          {issueFor("$.sources") && <p role="alert" className="ops-field-error" style={{ margin: 0 }}>{issueFor("$.sources")}</p>}
        </Panel>
      </div>
      <aside className="ops-stack learn-editor-side" aria-label="Thông tin và trạng thái bài">
        <Panel title="Thông tin bài" bodyClassName="ops-stack">
          <ContentFields accessToken={accessToken} form={form} onChange={edit} readOnly={readOnly} busy={busy} issues={shownIssues} onPage />
          <p className="learn-list-note">Đường dẫn: fet3d.io.vn/learn/{post.data.slug} · không đổi được sau khi tạo.</p>
        </Panel>
        <Panel title="Sẵn sàng xuất bản" bodyClassName="ops-stack" data-testid="learn-readiness">
          <ul className="doc-ready">{readiness.map((item) => <li key={item.text} data-ok={item.ok}>{item.ok ? <CircleCheck size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}<span>{item.text}</span></li>)}</ul>
          {dirty && <p className="learn-list-note">Có thay đổi chưa lưu · Ctrl+S để lưu bản nháp.</p>}
        </Panel>
        <Panel title="Trạng thái" bodyClassName="ops-stack">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <StatusBadge tone={statusView.tone}>{statusView.label}</StatusBadge>
            {version && <StatusBadge tone={versionStatusView[version.data.status].tone}>{versionStatusView[version.data.status].label}</StatusBadge>}
          </div>
          <Rows items={[
            { label: "Phiên bản đang mở", value: version ? `v${version.data.versionNumber}` : "—" },
            { label: "Bản công khai", value: post.data.publishedVersion ? `v${post.data.publishedVersion.versionNumber}` : "Chưa có" },
            { label: "Lưu lần cuối", value: formatDateTime(version?.data.updatedAt ?? post.data.updatedAt) },
          ]} />
          <p className="learn-list-note">{statusView.visibility}</p>
          {lifecycleButtons.length > 0 && <div className="learn-actions-col">{lifecycleButtons}</div>}
          {isDraft && status !== "Deleted" && publishReasons.length > 0 && <ul className="learn-reasons">{publishReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
        </Panel>
        {!readOnly && <Panel title="Phím tắt" bodyClassName="doc-keys">
          <p><kbd>/</kbd> Chèn khối</p><p><kbd>Enter</kbd> Đoạn mới</p><p><kbd>Shift</kbd>+<kbd>Enter</kbd> Xuống dòng</p><p><kbd>Ctrl</kbd>+<kbd>S</kbd> Lưu bản nháp</p>
        </Panel>}
      </aside>
    </div>}

    {screen === "publish" && <div className="ops-stack">
      <DataTable caption="Các phiên bản của bài" data-testid="learn-versions-table" columns={versionColumns} rows={versions} rowKey={(item) => item.id}
        onRowClick={(item) => { if (version?.data.id !== item.id) guard(() => onOpenVersion(item.id)); }}
        rowMenu={versionMenu}
        toolbar={<div><strong style={{ fontSize: 15 }}>Lịch sử phiên bản</strong><p className="learn-list-note">Bản đã xuất bản không sửa được nữa; mỗi lần sửa nội dung tạo một bản nháp mới. Bấm một phiên bản để mở.</p></div>}
        empty={<EmptyState icon={FilePlus2} title="Bài chưa có phiên bản" description="Tạo bản nháp đầu tiên từ thẻ Nội dung." />} />
      <PublishPanel post={post.data} postEtag={post.etag} version={version?.data ?? null} versionEtag={version?.etag ?? null} dirty={dirty} busy={busy}
        publishBlockers={publishBlockers}
        onPublish={() => start({ kind: "publish" })}
        onLifecycle={(op) => start({ kind: "lifecycle", operation: op })}
        onNewVersion={() => start({ kind: "newVersion" })} />
    </div>}

    {operation && <Modal open onOpenChange={(open) => { if (!open) closeOperation(); }} size="sm"
      title={operation.kind === "publish" ? "Xuất bản bản nháp này?" : operation.kind === "newVersion" ? "Tạo bản nháp mới?" : operationCopy?.title ?? ""}
      description={operation.kind === "publish" ? "Bản nháp trở thành bản công khai và không sửa được nữa. Muốn sửa tiếp phải tạo bản nháp mới." : operation.kind === "newVersion" ? "Bản nháp mới được tạo từ nội dung đang hiển thị ở đây. Bản công khai hiện tại giữ nguyên." : lifecycleBody(operation.operation, !!post.data.publishedVersionId)}
      footer={<>
        <Button variant="quiet" onClick={closeOperation} disabled={busy}>Hủy</Button>
        {operationError?.kind === "stale"
          ? <Button variant="secondary" onClick={() => { closeOperation(); }}>Đã tải bản mới, đóng</Button>
          : <Button variant={operationCopy?.danger ? "danger" : "primary"} disabled={busy} onClick={() => void runOperation()}>{busy ? "Đang gửi…" : operationError?.kind === "retry" ? "Thử lại" : operation.kind === "publish" ? "Xuất bản" : operation.kind === "newVersion" ? "Tạo bản nháp" : operationCopy?.confirm}</Button>}
      </>}>
      <div className="ops-stack">
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Bài: <strong style={{ color: "var(--text)" }}>{post.data.slug}</strong></p>
        {operation.kind === "publish" && <>
          {status === "Hidden" && <Alert tone="info">Bài đang ẩn: bản mới được ghim nhưng bài vẫn ẩn. Dùng “Hiện lại” sau đó nếu muốn công khai.</Alert>}
          {form.sources.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", fontSize: 13 }}>{form.sources.map((entry) => { const verdict = flags[entry.sourceId]; return <li key={`${entry.sourceId}-${entry.role}`}>{entry.title}: {verdict === undefined ? "đang kiểm tra" : verdict === null ? "chưa kiểm tra được" : publishBlockReason(verdict) ?? "đủ điều kiện"}</li>; })}</ul>}
        </>}
        {operationError && <Alert tone={operationError.kind === "stale" ? "warning" : "danger"} title={operationError.title}><ErrorList view={operationError} /></Alert>}
      </div>
    </Modal>}

    <Modal open={leaving !== null} onOpenChange={(open) => { if (!open) setLeaving(null); }} size="sm" title="Bỏ thay đổi chưa lưu?" description="Nội dung bạn vừa sửa chưa được lưu và sẽ mất nếu rời khỏi bản này."
      footer={<><Button variant="quiet" onClick={() => setLeaving(null)}>Tiếp tục sửa</Button><Button variant="danger" onClick={() => { const go = leaving; setLeaving(null); go?.(); }}>Bỏ thay đổi</Button></>}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Bấm “Lưu bản nháp” để giữ lại.</p>
    </Modal>
    <p className="learn-list-note"><RefreshCw size={12} aria-hidden="true" style={{ verticalAlign: "-1px" }} /> Dữ liệu lấy từ máy chủ. <button type="button" className="learn-link-button" onClick={onReload}>Tải lại bài</button> sẽ bỏ thay đổi chưa lưu.</p>
  </div>;
}
