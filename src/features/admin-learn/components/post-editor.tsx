"use client";

import { ArrowLeft, FilePlus2, RefreshCw, Save } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/components/ops/detail-parts";
import { learnAdminApi } from "../api";
import { loadPostWithVersion } from "../load-post";
import { commandDone, commandKey } from "../command-keys";
import { checkContent, contentFromVersion, describeDifferences, emptyContent, fingerprint, toVersionInput, type ContentIssue, type EditorContent } from "../content";
import { describeLearnError, translateIssue, type LearnErrorView } from "../errors";
import { lifecycleBody, lifecycleCopy, postStatusView, publishBlockReason, versionStatusView } from "../status";
import type { AdminPost, AdminVersion, LifecycleOperation, WithEtag } from "../types";
import { isMediaRefused, useMediaChecks } from "../use-media-checks";
import { useSourceFlags } from "../use-source-flags";
import { ContentFields } from "./content-fields";
import { PublishPanel } from "./publish-panel";

type Loaded = { post: WithEtag<AdminPost>; version: WithEtag<AdminVersion> | null };
type Conflict = { latest: WithEtag<AdminVersion>; differences: string[] };
type Operation = { kind: "publish" } | { kind: "lifecycle"; operation: LifecycleOperation } | { kind: "newVersion" };

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
  if (!loaded.data) return <div className="ops-stack">{back}<SkeletonRows rows={6} label="Đang tải bài…" /></div>;
  const { post, version } = loaded.data;
  return <EditorBody key={`${post.data.id}:${version?.data.id ?? "none"}:${rev}`} accessToken={accessToken} initialPost={post} initialVersion={version} tab={tab} onTab={onTab} onBack={onBack} onOpenVersion={onOpenVersion} onReload={() => setRev((value) => value + 1)} />;
}

function EditorBody({ accessToken, initialPost, initialVersion, tab, onTab, onBack, onOpenVersion, onReload }: {
  accessToken: string; initialPost: WithEtag<AdminPost>; initialVersion: WithEtag<AdminVersion> | null; tab: string; onTab: (tab: string) => void;
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
  const [error, setError] = useState<LearnErrorView | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  // What to do once the user confirms dropping unsaved edits (go back, or open another version).
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [operationError, setOperationError] = useState<LearnErrorView | null>(null);
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

  const sourceProblems = form.sources.flatMap((entry) => {
    const verdict = flags[entry.sourceId];
    const reason = verdict ? publishBlockReason(verdict) : null;
    return reason ? [`Nguồn “${entry.title}”: ${reason}`] : [];
  });
  const publishBlockers = [...sourceProblems, ...(clientIssues.length > 0 ? ["Nội dung còn điểm chưa hợp lệ, xem thẻ Thông tin/Nội dung."] : [])];

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
    setError(null);
    const input = toVersionInput(form);
    const intent = { op: "update-version", versionId: version.data.id, etag: version.etag, input };
    try {
      const result = await learnAdminApi.updateVersion(accessToken, version.data.id, input, version.etag, commandKey(intent));
      commandDone(intent);
      applyVersion(result);
      setConflict(null);
      toast.notify({ tone: "success", title: "Đã lưu bản nháp", description: `v${result.data.versionNumber} · ETag ${result.etag}` });
    } catch (cause) {
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
        toast.notify({ tone: "success", title: "Đã xuất bản", description: `v${version.data.versionNumber} của ${result.data.slug} · bài ${postStatusView[result.data.publicationStatus].label.toLowerCase()}` });
      } else if (operation.kind === "lifecycle") {
        const intent = { op: operation.operation, postId: post.data.id, etag: post.etag };
        const result = await learnAdminApi.lifecycle(accessToken, post.data.id, operation.operation, post.etag, commandKey(intent));
        commandDone(intent);
        setPost(result);
        toast.notify({ tone: "success", title: lifecycleCopy[operation.operation].done, description: `${result.data.slug} · ${postStatusView[result.data.publicationStatus].label}` });
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

  const takeServerVersion = () => { if (conflict) { applyVersion(conflict.latest); setConflict(null); setError(null); void refreshPostOnly(); } };
  const refreshPostOnly = async () => { try { setPost(await learnAdminApi.getPost(accessToken, post.data.id)); } catch { /* the stale banner already told the user to reload */ } };
  const keepMine = () => {
    if (!conflict) return;
    // Adopt the newer ETag but keep the form: the next save carries the user's content against the newest version.
    setVersion(conflict.latest);
    setSavedPrint(fingerprint(contentFromVersion(conflict.latest.data)));
    setConflict(null);
    setError(null);
    void refreshPostOnly();
  };

  const leave = () => (dirty ? setLeaving(() => onBack) : onBack());
  const conflictPublished = conflict?.latest.data.status === "Published";
  const statusView = postStatusView[status];
  const versions = [...(post.data.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const title = form.title.trim() || post.data.publishedVersion?.title || "Bài chưa đặt tên";

  const operationCopy = operation?.kind === "lifecycle" ? lifecycleCopy[operation.operation] : null;

  return <div className="ops-stack">
    <div><Button variant="quiet" size="sm" onClick={leave}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Button></div>
    <Panel
      title={title}
      description={`${post.data.slug}${version ? ` · phiên bản ${version.data.versionNumber} (${versionStatusView[version.data.status].label.toLowerCase()})` : ""}`}
      actions={<>
        <StatusBadge tone={statusView.tone}>{statusView.label}</StatusBadge>
        {dirty && <StatusBadge tone="warning">Chưa lưu</StatusBadge>}
        {!readOnly && <Button disabled={busy || !dirty} onClick={() => void save()}><Save size={16} aria-hidden="true" />{busy ? "Đang lưu…" : "Lưu bản nháp"}</Button>}
      </>}
      bodyClassName="ops-stack"
    >
      <Alert tone={status === "Deleted" ? "warning" : "info"} title={`Trạng thái: ${statusView.label}`}>{statusView.visibility}</Alert>
      {isDraft === false && status !== "Deleted" && version && <Alert tone="info" title="Đang xem bản đã xuất bản (bất biến)" action={<Button size="sm" className="mt-3" disabled={busy} onClick={() => { setOperationError(null); setOperation({ kind: "newVersion" }); }}><FilePlus2 size={16} aria-hidden="true" />Tạo bản nháp mới từ v{version.data.versionNumber}</Button>}>Không sửa trực tiếp bản đã xuất bản. Tạo bản nháp mới để chỉnh sửa; bản công khai hiện tại giữ nguyên tới khi bản mới được xuất bản.</Alert>}
      {status === "Deleted" && <Alert tone="warning" title="Bài đã bị xóa mềm">Khôi phục bài ở thẻ “Xuất bản và hiển thị” trước khi sửa, tạo bản nháp hay xuất bản.</Alert>}
      {error && <Alert tone={error.kind === "stale" ? "warning" : "danger"} title={error.title}><ErrorList view={error} /></Alert>}
      {conflict && <Alert tone="warning" title="Đối chiếu với bản mới nhất trên máy chủ" action={<div className="ops-actions" style={{ marginTop: 10 }}>
        <Button size="sm" variant="secondary" onClick={takeServerVersion}>Tải bản mới (bỏ thay đổi của tôi)</Button>
        {conflictPublished
          ? <Button size="sm" onClick={() => { keepMine(); setOperationError(null); setOperation({ kind: "newVersion" }); }}>Tạo bản nháp mới từ nội dung của tôi</Button>
          : <Button size="sm" variant="quiet" onClick={keepMine}>Giữ nội dung của tôi</Button>}
      </div>}>
        {conflictPublished ? "Bản nháp này đã được xuất bản ở nơi khác nên không sửa được nữa. " : ""}
        {conflict.differences.length > 0 ? `Khác biệt so với máy chủ: ${conflict.differences.join(", ")}. ` : "Nội dung của bạn trùng bản trên máy chủ. "}
        Nội dung bạn đang sửa vẫn được giữ; “Giữ nội dung của tôi” lưu nó lên bản mới nhất ở lần lưu kế tiếp.
      </Alert>}
      {showIssues && clientIssues.length > 0 && !readOnly && <Alert tone="danger" title={`Còn ${clientIssues.length} điểm cần sửa trước khi lưu`}><ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{clientIssues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></Alert>}
      {showIssues && refusedVideo && <Alert tone="danger" title="Có liên kết video bị máy chủ từ chối">Sửa hoặc xóa khối video đó trước khi lưu.</Alert>}
    </Panel>

    <ContentFields
      accessToken={accessToken} form={form} onChange={(update) => setForm(update)} readOnly={readOnly} busy={busy} issues={shownIssues}
      checks={media.checks} onCheck={(blockId, url) => void media.check(blockId, url)} sourceFlags={flags} onKnownSources={known}
      tab={tab} onTab={onTab} label="Soạn bài"
      extraTabs={[
        { value: "versions", label: "Phiên bản", content: <Panel title="Phiên bản" description="Bản đã xuất bản bất biến; mỗi lần sửa nội dung tạo một bản nháp mới. Chọn một phiên bản để mở." bodyClassName="ops-stack">
          <Table caption="Các phiên bản của bài">
            <thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Tiêu đề</th><th>ETag</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody>{versions.map((item) => <tr key={item.id}>
              <td className="ops-cell-primary">v{item.versionNumber}</td>
              <td><span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}><StatusBadge tone={versionStatusView[item.status].tone}>{versionStatusView[item.status].label}</StatusBadge>{post.data.publishedVersionId === item.id && <StatusBadge tone="ember">Đang công khai</StatusBadge>}{version?.data.id === item.id && <StatusBadge tone="info">Đang mở</StatusBadge>}</span></td>
              <td>{item.title}</td>
              <td><code style={{ fontSize: 12 }}>{`"${item.revision}"`}</code></td>
              <td>{formatDateTime(item.updatedAt)}</td>
              <td className="ops-cell-actions">{version?.data.id !== item.id && <Button size="sm" variant="quiet" aria-label={`Mở phiên bản ${item.versionNumber}`} onClick={() => (dirty ? setLeaving(() => () => onOpenVersion(item.id)) : onOpenVersion(item.id))}>Mở</Button>}</td>
            </tr>)}</tbody>
          </Table>
        </Panel> },
        { value: "publish", label: "Xuất bản và hiển thị", content: <PublishPanel post={post.data} postEtag={post.etag} version={version?.data ?? null} versionEtag={version?.etag ?? null} dirty={dirty} busy={busy}
          publishBlockers={publishBlockers}
          onPublish={() => { setOperationError(null); setOperation({ kind: "publish" }); }}
          onLifecycle={(op) => { setOperationError(null); setOperation({ kind: "lifecycle", operation: op }); }}
          onNewVersion={() => { setOperationError(null); setOperation({ kind: "newVersion" }); }} /> },
      ]}
    />

    {operation && <Modal open onOpenChange={(open) => { if (!open) closeOperation(); }}
      title={operation.kind === "publish" ? "Xuất bản bản nháp này?" : operation.kind === "newVersion" ? "Tạo bản nháp mới?" : operationCopy?.title ?? ""}
      description={operation.kind === "publish" ? "Bản nháp trở thành bản công khai và bất biến. Muốn sửa tiếp phải tạo bản nháp mới." : operation.kind === "newVersion" ? "Bản nháp mới được tạo từ nội dung đang hiển thị ở đây. Bản công khai hiện tại giữ nguyên." : lifecycleBody(operation.operation, !!post.data.publishedVersionId)}
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

    <Modal open={leaving !== null} onOpenChange={(open) => { if (!open) setLeaving(null); }} title="Bỏ thay đổi chưa lưu?" description="Nội dung bạn vừa sửa chưa được lưu và sẽ mất nếu rời khỏi bản này."
      footer={<><Button variant="quiet" onClick={() => setLeaving(null)}>Tiếp tục sửa</Button><Button variant="danger" onClick={() => { const go = leaving; setLeaving(null); go?.(); }}>Bỏ thay đổi</Button></>}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Bấm “Lưu bản nháp” để giữ lại.</p>
    </Modal>
    <p className="ops-field-hint" style={{ margin: 0 }}><RefreshCw size={12} aria-hidden="true" style={{ verticalAlign: "-1px" }} /> Dữ liệu lấy từ máy chủ. <button type="button" className="ops-link-button" onClick={onReload} style={{ background: "none", border: 0, padding: 0, color: "var(--ember)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Tải lại bài</button> sẽ bỏ thay đổi chưa lưu.</p>
  </div>;
}
