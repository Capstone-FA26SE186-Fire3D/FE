"use client";

import { ExternalLink, Send } from "lucide-react";
import { useState } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SkeletonDetail } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { kindLabel } from "@/features/learn/types";
import { learnAdminApi } from "../api";
import { commandDone, commandKey } from "../command-keys";
import { checkContent, contentFromVersion, fingerprint, toVersionInput, type EditorContent } from "../content";
import { describeLearnError, translateIssue, type LearnErrorView } from "../errors";
import { loadPostWithVersion, type LoadedPost } from "../load-post";
import { lifecycleBody, lifecycleCopy, lifecycleFor, postStatusView, publishBlockReason, versionStatusView } from "../status";
import type { AdminPost, AdminVersion, LifecycleOperation, WithEtag } from "../types";
import { useSourceFlags } from "../use-source-flags";
import { SituationPicker } from "./situation-picker";

type Operation = { kind: "publish" } | { kind: "lifecycle"; operation: LifecycleOperation };

const DRAWER_ID = "learn-quick-drawer";

/**
 * "Sửa nhanh" popup (Figma 53:1009; a centered dialog like the other editors since 26/10), opened by a row click (`?quick=<id>`): title, summary and situations of the post's
 * working version (newest Draft, else the newest version), save, publish and the lifecycle commands its status allows,
 * plus "Mở trình soạn đầy đủ". It loads the post detail on open because the list only carries the published version.
 * Every write goes through the same api functions, ETags and Idempotency-Key intents as the full editor.
 */
export function QuickEditDrawer({ accessToken, postId, fallbackName, onClose, onOpenEditor, onChanged }: {
  accessToken: string; postId: string; fallbackName: string; onClose: () => void; onOpenEditor: (postId: string) => void; onChanged: () => void;
}) {
  const [rev, setRev] = useState(0);
  const loaded = useAsyncData<LoadedPost>(`learn-quick:${postId}:${rev}`, (signal) => loadPostWithVersion(accessToken, postId, "", signal), true, { keepPrevious: false });
  const view = loaded.error !== undefined && !loaded.data ? describeLearnError(loaded.error) : null;
  if (loaded.data) return <QuickBody key={`${loaded.data.post.data.id}:${loaded.data.version?.data.id ?? "none"}:${rev}`} accessToken={accessToken} initial={loaded.data} onClose={onClose} onOpenEditor={() => onOpenEditor(postId)} onChanged={onChanged} onReload={() => setRev((value) => value + 1)} />;
  return <Modal open onOpenChange={(open) => { if (!open) onClose(); }} size="md" data-testid={DRAWER_ID} title={fallbackName} description="Sửa nhanh tiêu đề, tóm tắt và tình huống." footer={<Button variant="quiet" onClick={onClose}>Đóng</Button>}>
    {view
      ? <Alert tone="danger" title={view.kind === "notFound" ? "Không tìm thấy bài" : "Không tải được bài"} action={view.kind === "notFound" ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={loaded.reload}>Thử lại</Button>}>{view.message}</Alert>
      : <SkeletonDetail rows={5} />}
  </Modal>;
}

function QuickBody({ accessToken, initial, onClose, onOpenEditor, onChanged, onReload }: { accessToken: string; initial: LoadedPost; onClose: () => void; onOpenEditor: () => void; onChanged: () => void; onReload: () => void }) {
  const toast = useToast();
  const [post, setPost] = useState<WithEtag<AdminPost>>(initial.post);
  const [version, setVersion] = useState<WithEtag<AdminVersion> | null>(initial.version);
  const [form, setForm] = useState<EditorContent | null>(() => (initial.version ? contentFromVersion(initial.version.data) : null));
  const [savedPrint, setSavedPrint] = useState(() => (initial.version ? fingerprint(contentFromVersion(initial.version.data)) : ""));
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "busy" | "done">("idle");
  const [showIssues, setShowIssues] = useState(false);
  const [error, setError] = useState<LearnErrorView | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [operationError, setOperationError] = useState<LearnErrorView | null>(null);
  const { flags } = useSourceFlags(accessToken, form?.sources ?? []);

  const status = post.data.publicationStatus;
  const statusView = postStatusView[status];
  const isDraft = version?.data.status === "Draft";
  const readOnly = !isDraft || status === "Deleted";
  const dirty = form !== null && fingerprint(form) !== savedPrint;
  const issues = form ? checkContent(form) : [];
  const issueFor = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const otherIssues = issues.filter((issue) => !["$.title", "$.summary", "$.situationIds"].includes(issue.path));
  const sourceProblems = (form?.sources ?? []).flatMap((entry) => {
    const verdict = flags[entry.sourceId];
    const reason = verdict ? publishBlockReason(verdict) : null;
    return reason ? [`Nguồn “${entry.title}”: ${reason}`] : [];
  });
  const publishReasons = [
    ...(status === "Deleted" ? ["Bài đã bị xóa: khôi phục trước khi xuất bản."] : []),
    ...(dirty ? ["Lưu bản nháp trước khi xuất bản."] : []),
    ...(issues.length > 0 ? ["Nội dung còn điểm chưa hợp lệ; mở trình soạn để sửa."] : []),
    ...sourceProblems,
  ];
  const heading = form?.title.trim() || post.data.publishedVersion?.title || post.data.slug;

  const apply = (next: WithEtag<AdminVersion>) => {
    const content = contentFromVersion(next.data);
    setVersion(next);
    setForm(content);
    setSavedPrint(fingerprint(content));
    setShowIssues(false);
  };

  const save = async () => {
    if (busy || !version || !form || readOnly) return;
    setShowIssues(true);
    if (issues.length > 0) { setError(null); return; }
    setBusy(true);
    setSaveState("busy");
    setError(null);
    const input = toVersionInput(form);
    const intent = { op: "update-version", versionId: version.data.id, etag: version.etag, input };
    try {
      const result = await learnAdminApi.updateVersion(accessToken, version.data.id, input, version.etag, commandKey(intent));
      commandDone(intent);
      apply(result);
      setSaveState("done");
      window.setTimeout(() => setSaveState("idle"), 1200);
      toast.notify({ tone: "success", title: "Đã lưu bản nháp", description: `Phiên bản ${result.data.versionNumber}` });
      onChanged();
    } catch (cause) {
      setSaveState("idle");
      setError(describeLearnError(cause));
    } finally {
      setBusy(false);
    }
  };

  const closeOperation = () => { if (!busy) { setOperation(null); setOperationError(null); } };

  const run = async () => {
    if (!operation || busy) return;
    setBusy(true);
    setOperationError(null);
    try {
      if (operation.kind === "publish" && version) {
        const intent = { op: "publish-version", versionId: version.data.id, etag: version.etag };
        const result = await learnAdminApi.publishVersion(accessToken, version.data.id, version.etag, commandKey(intent));
        commandDone(intent);
        setPost(result);
        try { apply(await learnAdminApi.getVersion(accessToken, version.data.id)); } catch { onReload(); }
        toast.notify({ tone: "success", title: "Đã xuất bản", description: `Phiên bản ${version.data.versionNumber} · bài ${postStatusView[result.data.publicationStatus].label.toLowerCase()}` });
      } else if (operation.kind === "lifecycle") {
        const intent = { op: operation.operation, postId: post.data.id, etag: post.etag };
        const result = await learnAdminApi.lifecycle(accessToken, post.data.id, operation.operation, post.etag, commandKey(intent));
        commandDone(intent);
        setPost(result);
        toast.notify({ tone: "success", title: lifecycleCopy[operation.operation].done, description: `Bài hiện ${postStatusView[result.data.publicationStatus].label.toLowerCase()}` });
      }
      setOperation(null);
      onChanged();
    } catch (cause) {
      const failure = describeLearnError(cause);
      setOperationError(failure);
      if (failure.kind === "stale") onChanged();
    } finally {
      setBusy(false);
    }
  };

  const copy = operation?.kind === "lifecycle" ? lifecycleCopy[operation.operation] : null;
  const kind = version?.data.kind ?? post.data.publishedVersion?.kind;

  return <Modal open onOpenChange={(open) => { if (!open && !busy) onClose(); }} size="md" data-testid={DRAWER_ID}
    title={heading}
    description={[kind ? kindLabel[kind] : null, version ? `v${version.data.versionNumber}` : null, `cập nhật ${formatDateTime(post.data.updatedAt)}`].filter(Boolean).join(" · ")}
    eyebrow={<>
      <StatusBadge tone={statusView.tone}>{statusView.label}</StatusBadge>
      {version && <StatusBadge tone={versionStatusView[version.data.status].tone}>{versionStatusView[version.data.status].label}</StatusBadge>}
      {dirty && <StatusBadge tone="warning">Chưa lưu</StatusBadge>}
    </>}
    footer={<>
      <Button variant="quiet" onClick={onOpenEditor}><ExternalLink size={16} aria-hidden="true" />Mở trình soạn đầy đủ</Button>
      {isDraft && status !== "Deleted" && <SubmitButton state={saveState} disabled={busy || !dirty} doneLabel="Đã lưu" onClick={() => void save()}>Lưu nháp</SubmitButton>}
    </>}>
    <div className="ops-stack" data-testid="learn-quick-edit">
      {!form && <Alert tone="info" title="Bài chưa có phiên bản">Mở trình soạn để tạo nội dung đầu tiên.</Alert>}
      {form && <>
        <Field label="Tiêu đề" hint={readOnly ? undefined : "Hiển thị công khai khi xuất bản."} error={showIssues ? issueFor("$.title") : undefined}>{(p) => <Input {...p} value={form.title} readOnly={readOnly} maxLength={255} onChange={(event) => setForm({ ...form, title: event.target.value })} />}</Field>
        <Field label="Tóm tắt" error={showIssues ? issueFor("$.summary") : undefined}>{(p) => <Textarea {...p} rows={4} value={form.summary} readOnly={readOnly} maxLength={2000} onChange={(event) => setForm({ ...form, summary: event.target.value })} />}</Field>
        <Field label="Tình huống" hint="Tối đa 20; chỉ chọn được tình huống đang hoạt động." error={showIssues ? issueFor("$.situationIds") : undefined}>{(p) => <SituationPicker {...p} accessToken={accessToken} selected={form.situations} disabled={readOnly || busy} onChange={(situations) => setForm({ ...form, situations })} />}</Field>
        {status === "Deleted" && <Alert tone="warning" title="Bài đã bị xóa (vẫn khôi phục được)">Khôi phục bài trước khi sửa hoặc xuất bản.</Alert>}
        {!isDraft && status !== "Deleted" && <Alert tone="info" title="Bản đã xuất bản không sửa được nữa">Mở trình soạn để tạo bản nháp mới từ nội dung này; bản công khai giữ nguyên tới khi bản mới được xuất bản.</Alert>}
        {showIssues && otherIssues.length > 0 && !readOnly && <Alert tone="danger" title="Nội dung còn điểm cần sửa trong trình soạn"><ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{otherIssues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></Alert>}
      </>}
      {error && <Alert tone={error.kind === "stale" ? "warning" : "danger"} title={error.title} action={error.kind === "stale" ? <Button size="sm" variant="secondary" className="mt-3" onClick={onReload}>Tải lại bài</Button> : undefined}>
        <span style={{ display: "grid", gap: 6 }}><span>{error.message}</span>{error.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{error.issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{translateIssue(issue).message}</li>)}</ul>}</span>
      </Alert>}

      <section aria-label="Trạng thái bài" className="ops-stack" style={{ gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 650, color: "var(--dim)", letterSpacing: ".06em", textTransform: "uppercase" }}>Trạng thái</h3>
        <p className="learn-list-note">{statusView.visibility}</p>
        <div className="learn-actions-col">
          {isDraft && status !== "Deleted" && <Button disabled={busy || publishReasons.length > 0} onClick={() => { setOperationError(null); setOperation({ kind: "publish" }); }}><Send size={16} aria-hidden="true" />Xuất bản</Button>}
          {lifecycleFor[status].map((op) => <Button key={op} variant={lifecycleCopy[op].danger ? "danger" : op === "show" || op === "restore" ? "primary" : "secondary"} disabled={busy} onClick={() => { setOperationError(null); setOperation({ kind: "lifecycle", operation: op }); }}>{lifecycleCopy[op].label}</Button>)}
        </div>
        {isDraft && publishReasons.length > 0 && status !== "Deleted" && <ul className="learn-reasons">{publishReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      </section>
    </div>

    {operation && <Modal open onOpenChange={(open) => { if (!open) closeOperation(); }} size="sm"
      title={operation.kind === "publish" ? "Xuất bản bản nháp này?" : copy?.title ?? ""}
      description={operation.kind === "publish" ? "Bản nháp trở thành bản công khai và không sửa được nữa. Muốn sửa tiếp phải tạo bản nháp mới." : lifecycleBody((operation as { operation: LifecycleOperation }).operation, !!post.data.publishedVersionId)}
      footer={<>
        <Button variant="quiet" onClick={closeOperation} disabled={busy}>Hủy</Button>
        {operationError?.kind === "stale"
          ? <Button variant="secondary" onClick={() => { closeOperation(); onReload(); }}>Tải bản mới</Button>
          : <Button variant={copy?.danger ? "danger" : "primary"} disabled={busy} onClick={() => void run()}>{busy ? "Đang gửi…" : operationError?.kind === "retry" ? "Thử lại" : operation.kind === "publish" ? "Xuất bản" : copy?.confirm}</Button>}
      </>}>
      <div className="ops-stack">
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Bài: <strong style={{ color: "var(--text)" }}>{heading}</strong></p>
        {operationError && <Alert tone={operationError.kind === "stale" ? "warning" : "danger"} title={operationError.title}>{operationError.message}</Alert>}
      </div>
    </Modal>}
  </Modal>;
}
