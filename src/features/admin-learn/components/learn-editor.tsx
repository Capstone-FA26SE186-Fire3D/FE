"use client";

import { ArrowLeft, FilePlus2, Save, Send } from "lucide-react";
import { useState } from "react";
import { stableStringify, useIdempotencyKey } from "@/api/idempotency";
import { useUrlParams } from "@/api/use-url-params";
import { DetailList, formatDateTime } from "@/components/ops/detail-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useSampleQuery, type SampleMode } from "@/features/dev-prototype/use-sample-query";
import { toWireContent, describeLearnError, type LearnErrorView } from "../api";
import { kindLabel, lifecycleActionsFor, lifecycleCopy, lifecycleDone, postStatusView } from "../status";
import type { DraftContent, LearnCatalog, LearnCmsPort, LearnKind, LearnPost, LearnVersion, LifecycleAction, WithEtag } from "../types";
import { validateDraft, validateSlug } from "../validate";
import { BlockEditor } from "./learn-blocks";

const emptyContent: DraftContent = { title: "", summary: "", coverImageUrl: "", kind: "Article", blocks: [], situationIds: [], sourceIds: [] };
const contentOf = (version: DraftContent): DraftContent => ({ title: version.title, summary: version.summary, coverImageUrl: version.coverImageUrl, kind: version.kind, blocks: version.blocks, situationIds: version.situationIds, sourceIds: version.sourceIds });
const sameContent = (a: DraftContent, b: DraftContent) => stableStringify(toWireContent(a)) === stableStringify(toWireContent(b)) && stableStringify(a.blocks) === stableStringify(b.blocks);

type Loaded = { post: WithEtag<LearnPost> | null; catalog: LearnCatalog };

/** Loads the post (or an empty form for a new one) and the catalogs, then mounts the editor with that snapshot. */
export function LearnEditor({ port, postId, mode, rev, onChanged, onClose, onOpenPost }: {
  port: LearnCmsPort; postId: string; mode: SampleMode; rev: number; onChanged: () => void; onClose: () => void; onOpenPost: (id: string) => void;
}) {
  const isNew = postId === "new";
  const query = useSampleQuery<Loaded>(`learn-editor:${postId}:${rev}`, mode, async () => ({ catalog: await port.catalog(), post: isNew ? null : await port.get(postId) }));
  const back = <Button variant="quiet" size="sm" onClick={onClose}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Button>;
  if (query.error !== undefined) return <div className="ops-stack">{back}<Alert tone="danger" title="Không tải được bài" action={<Button size="sm" variant="secondary" className="mt-3" onClick={query.reload}>Thử lại</Button>}>Hãy kiểm tra kết nối rồi thử lại.</Alert></div>;
  if (query.loading && !query.data) return <div className="ops-stack">{back}<SkeletonRows rows={6} label="Đang tải bài…" /></div>;
  if (!query.data) return <div className="ops-stack">{back}</div>;
  const { post, catalog } = query.data;
  return <EditorBody key={`${postId}:${post?.etag ?? "new"}`} port={port} loaded={post} catalog={catalog} onChanged={onChanged} onClose={onClose} onOpenPost={onOpenPost} onReload={query.reload} />;
}

function EditorBody({ port, loaded, catalog, onChanged, onClose, onOpenPost, onReload }: {
  port: LearnCmsPort; loaded: WithEtag<LearnPost> | null; catalog: LearnCatalog; onChanged: () => void; onClose: () => void; onOpenPost: (id: string) => void; onReload: () => void;
}) {
  const toast = useToast();
  // The active tab lives in the URL so it survives the reload that follows every successful write.
  const url = useUrlParams();
  const tab = url.get("tab") || "info";
  const createKey = useIdempotencyKey();
  const draftKey = useIdempotencyKey();
  const post = loaded?.data ?? null;
  const isNew = post === null;
  const draft = post?.versions.find((version) => version.status === "Draft") ?? null;
  const latestPublished = post ? [...post.versions].filter((version) => version.status === "Published").sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null : null;
  const shown = draft ?? latestPublished;
  const readOnly = !isNew && (draft === null || post?.status === "Deleted");

  const initial = shown ? contentOf(shown) : emptyContent;
  const [form, setForm] = useState<DraftContent>(initial);
  const [saved, setSaved] = useState<DraftContent>(initial);
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [etag, setEtag] = useState(loaded?.etag ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | "draft" | null>(null);
  const [error, setError] = useState<LearnErrorView | null>(null);
  const [conflict, setConflict] = useState<WithEtag<LearnPost> | null>(null);
  const [leaving, setLeaving] = useState(false);

  const dirty = !sameContent(form, saved);
  const issues = validateDraft(form, { forPublish: false, sources: catalog.sources });
  const issueFor = (path: string) => (showErrors ? issues.find((issue) => issue.path === path)?.message : undefined);
  const slugError = isNew && showErrors ? validateSlug(slug) : undefined;
  const patch = (change: Partial<DraftContent>) => setForm((current) => ({ ...current, ...change }));
  const toggle = (key: "situationIds" | "sourceIds", id: string) => patch({ [key]: form[key].includes(id) ? form[key].filter((item) => item !== id) : [...form[key], id] });

  const loadConflict = async () => {
    if (!post) return;
    try { setConflict(await port.get(post.id)); } catch { /* the error alert already tells the user to reload */ }
  };

  const save = async () => {
    if (busy || !post || !draft) return;
    setShowErrors(true);
    if (issues.length > 0) { setError(null); return; }
    setBusy("save");
    setError(null);
    try {
      const result = await port.saveDraft(post.id, draft.id, form, etag);
      setEtag(result.etag);
      setSaved(form);
      setConflict(null);
      toast.notify({ tone: "success", title: "Đã lưu bản nháp", description: "Dữ liệu mẫu — không gọi API thật." });
    } catch (cause) {
      const view = describeLearnError(cause);
      setError(view);
      if (view.kind === "conflict") await loadConflict();
    } finally {
      setBusy(null);
    }
  };

  const create = async (publishImmediately: boolean) => {
    if (busy) return;
    setShowErrors(true);
    const problems = validateDraft(form, { forPublish: publishImmediately, sources: catalog.sources });
    if (validateSlug(slug) || problems.length > 0) { setError(null); return; }
    setBusy(publishImmediately ? "publish" : "save");
    setError(null);
    try {
      const input = { slug, content: form, publishImmediately };
      const result = await port.create(input, createKey.keyFor({ slug, publishImmediately, content: toWireContent(form) }));
      createKey.done();
      toast.notify({ tone: "success", title: publishImmediately ? "Đã tạo và xuất bản bài" : "Đã tạo bản nháp", description: "Dữ liệu mẫu — không gọi API thật." });
      onChanged();
      onOpenPost(result.data.id);
    } catch (cause) {
      setError(describeLearnError(cause));
    } finally {
      setBusy(null);
    }
  };

  const startDraft = async () => {
    if (busy || !post || !shown) return;
    setBusy("draft");
    setError(null);
    try {
      await port.newDraft(post.id, shown.id, etag, draftKey.keyFor({ postId: post.id, fromVersionId: shown.id, etag }));
      draftKey.done();
      toast.notify({ tone: "success", title: "Đã tạo bản nháp mới", description: `Từ phiên bản ${shown.versionNumber}.` });
      onChanged();
      onReload();
    } catch (cause) {
      const view = describeLearnError(cause);
      setError(view);
      if (view.kind === "conflict") await loadConflict();
    } finally {
      setBusy(null);
    }
  };

  const differences = conflict && draft ? differencesBetween(form, conflict.data.versions.find((version) => version.status === "Draft")) : [];
  const close = () => (dirty ? setLeaving(true) : onClose());

  return <div className="ops-stack">
    <div><Button variant="quiet" size="sm" onClick={close}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Button></div>
    <Panel
      title={isNew ? "Bài mới" : form.title || "Bài chưa đặt tên"}
      description={isNew ? "Lưu thành bản nháp hoặc xuất bản ngay khi nội dung đã sẵn sàng." : `${post.slug} · ${shown ? `phiên bản ${shown.versionNumber} (${shown.status === "Draft" ? "bản nháp" : "đã xuất bản"})` : ""}`}
      actions={<>
        {!isNew && <StatusBadge tone={postStatusView[post.status].tone}>{postStatusView[post.status].label}</StatusBadge>}
        {dirty && <StatusBadge tone="warning">Chưa lưu</StatusBadge>}
        {isNew && <>
          <Button variant="secondary" disabled={busy !== null} onClick={() => void create(false)}><Save size={16} aria-hidden="true" />{busy === "save" ? "Đang lưu…" : "Lưu bản nháp"}</Button>
          <Button disabled={busy !== null} onClick={() => void create(true)}><Send size={16} aria-hidden="true" />{busy === "publish" ? "Đang xuất bản…" : "Tạo và xuất bản ngay"}</Button>
        </>}
        {!isNew && !readOnly && <Button disabled={busy !== null || !dirty} onClick={() => void save()}><Save size={16} aria-hidden="true" />{busy === "save" ? "Đang lưu…" : "Lưu bản nháp"}</Button>}
        {!isNew && readOnly && post.status !== "Deleted" && shown && <Button disabled={busy !== null} onClick={() => void startDraft()}><FilePlus2 size={16} aria-hidden="true" />{busy === "draft" ? "Đang tạo…" : `Tạo bản nháp từ v${shown.versionNumber}`}</Button>}
      </>}
      bodyClassName="ops-stack"
    >
      {!isNew && readOnly && post.status !== "Deleted" && <Alert tone="info" title="Đang xem bản đã xuất bản (bất biến)">Bản đã xuất bản không sửa tại chỗ. Tạo bản nháp mới để chỉnh sửa; bản công khai hiện tại giữ nguyên tới khi bản mới được xuất bản.</Alert>}
      {!isNew && post.status === "Deleted" && <Alert tone="warning" title="Bài đã bị xóa mềm">Khôi phục bài ở thẻ Xuất bản trước khi chỉnh sửa.</Alert>}
      {error && <Alert tone={error.kind === "conflict" ? "warning" : "danger"} title={error.kind === "conflict" ? "Bài đã thay đổi ở nơi khác" : "Không thể hoàn tất"}>
        <span style={{ display: "grid", gap: 6 }}>
          <span>{error.message}</span>
          {error.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{error.issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul>}
        </span>
      </Alert>}
      {conflict && <Alert tone="warning" title="Đối chiếu với bản mới nhất" action={<div className="ops-actions" style={{ marginTop: 10 }}>
        <Button size="sm" variant="secondary" onClick={() => { const latest = conflict.data.versions.find((version) => version.status === "Draft"); if (latest) { const next = contentOf(latest); setForm(next); setSaved(next); } setEtag(conflict.etag); setConflict(null); setError(null); }}>Tải bản mới (bỏ thay đổi của tôi)</Button>
        <Button size="sm" variant="quiet" onClick={() => { setEtag(conflict.etag); setConflict(null); setError(null); }}>Giữ nội dung của tôi</Button>
      </div>}>
        {differences.length > 0 ? `Khác biệt so với bản trên máy chủ: ${differences.join(", ")}.` : "Nội dung của bạn trùng bản trên máy chủ."} Chọn &quot;Giữ nội dung của tôi&quot; sẽ ghi đè bản mới ở lần lưu kế tiếp.
      </Alert>}
      {showErrors && issues.length > 0 && !readOnly && <Alert tone="danger" title={`Còn ${issues.length} điểm cần sửa trước khi lưu`}><ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></Alert>}
    </Panel>

    <Tabs value={tab} onValueChange={(value) => url.setParams({ tab: value }, "replace")}>
      <TabsList aria-label="Soạn bài">
        <TabsTrigger value="info">Thông tin</TabsTrigger>
        <TabsTrigger value="content">Nội dung</TabsTrigger>
        <TabsTrigger value="classify">Phân loại và nguồn</TabsTrigger>
        {!isNew && <TabsTrigger value="versions">Phiên bản</TabsTrigger>}
        {!isNew && <TabsTrigger value="publish">Xuất bản</TabsTrigger>}
      </TabsList>
      <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <TabsContent value="info"><Panel bodyClassName="ops-stack">
          <div className="ops-form-grid">
            <Field label="Tiêu đề" required error={issueFor("title")} className="ops-span-all">{(p) => <Input {...p} maxLength={200} value={form.title} onChange={(event) => patch({ title: event.target.value })} />}</Field>
            <Field label="Slug (đường dẫn)" required hint={isNew ? "Chữ thường không dấu, số và dấu gạch ngang. Không đổi được sau khi tạo." : "Slug ổn định, không đổi sau khi tạo."} error={slugError}>
              {(p) => <Input {...p} value={slug} disabled={!isNew} onChange={(event) => setSlug(event.target.value.toLowerCase())} />}
            </Field>
            <Field label="Loại bài">{(p) => <Select {...p} value={form.kind} onChange={(event) => patch({ kind: event.target.value as LearnKind })}>{(Object.keys(kindLabel) as LearnKind[]).map((kind) => <option key={kind} value={kind}>{kindLabel[kind]}</option>)}</Select>}</Field>
            <Field label="Tóm tắt" hint={`${form.summary.length}/500 ký tự`} error={issueFor("summary")} className="ops-span-all">{(p) => <Textarea {...p} rows={3} value={form.summary} onChange={(event) => patch({ summary: event.target.value })} />}</Field>
            <Field label="Ảnh bìa (https, không bắt buộc)" error={issueFor("coverImageUrl")} className="ops-span-all">{(p) => <Input {...p} inputMode="url" value={form.coverImageUrl} onChange={(event) => patch({ coverImageUrl: event.target.value })} />}</Field>
          </div>
        </Panel></TabsContent>
        <TabsContent value="content"><Panel title="Khối nội dung" description="Văn bản, ảnh và video theo danh sách cho phép. Không nhận HTML, iframe hay script tùy ý." bodyClassName="ops-stack">
          <BlockEditor blocks={form.blocks} onChange={(blocks) => patch({ blocks })} />
        </Panel></TabsContent>
        <TabsContent value="classify"><div className="ops-grid ops-grid-2">
          <Panel title="Tình huống" description="Một bài có thể thuộc nhiều tình huống; cần ít nhất một khi xuất bản." bodyClassName="ops-stack">
            <fieldset className="ops-fieldset" style={{ minWidth: 0 }}><legend className="ops-field-hint">Chọn tình huống</legend>
              {catalog.situations.map((situation) => <label key={situation.id} style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 32, fontSize: 14 }}><input type="checkbox" checked={form.situationIds.includes(situation.id)} onChange={() => toggle("situationIds", situation.id)} />{situation.name}</label>)}
            </fieldset>
          </Panel>
          <Panel title="Nguồn Common" description="Bản nháp có thể trích nguồn chưa duyệt; xuất bản và hiện bài cần nguồn đã duyệt." bodyClassName="ops-stack">
            <fieldset className="ops-fieldset" style={{ minWidth: 0 }}><legend className="ops-field-hint">Chọn nguồn</legend>
              {catalog.sources.map((source) => <label key={source.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, minHeight: 32 }}><input type="checkbox" checked={form.sourceIds.includes(source.id)} onChange={() => toggle("sourceIds", source.id)} style={{ marginTop: 4 }} /><span style={{ minWidth: 0 }}>{source.title} <StatusBadge tone={source.status === "Approved" ? "success" : "warning"}>{source.status === "Approved" ? "Đã duyệt" : "Chờ thẩm định"}</StatusBadge></span></label>)}
            </fieldset>
          </Panel>
        </div></TabsContent>
      </fieldset>
      {!isNew && <TabsContent value="versions"><VersionsTab post={post} /></TabsContent>}
      {!isNew && <TabsContent value="publish"><LifecyclePanel port={port} post={post} etag={etag} draft={draft} dirty={dirty} onDone={() => { onChanged(); onReload(); }} /></TabsContent>}
    </Tabs>

    <Modal open={leaving} onOpenChange={setLeaving} title="Bỏ thay đổi chưa lưu?" description="Nội dung bạn vừa sửa chưa được lưu và sẽ mất nếu rời khỏi bài."
      footer={<><Button variant="quiet" onClick={() => setLeaving(false)}>Tiếp tục sửa</Button><Button variant="danger" onClick={() => { setLeaving(false); onClose(); }}>Bỏ thay đổi</Button></>}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Bạn có thể bấm &quot;Lưu bản nháp&quot; để giữ lại.</p>
    </Modal>
  </div>;
}

function differencesBetween(mine: DraftContent, server: LearnVersion | undefined): string[] {
  if (!server) return [];
  const out: string[] = [];
  if (mine.title !== server.title) out.push(`tiêu đề (máy chủ: “${server.title}”)`);
  if (mine.summary !== server.summary) out.push("tóm tắt");
  if (mine.kind !== server.kind) out.push("loại bài");
  if (mine.coverImageUrl !== server.coverImageUrl) out.push("ảnh bìa");
  if (stableStringify(mine.blocks) !== stableStringify(server.blocks)) out.push("khối nội dung");
  if (stableStringify(mine.situationIds) !== stableStringify(server.situationIds)) out.push("tình huống");
  if (stableStringify(mine.sourceIds) !== stableStringify(server.sourceIds)) out.push("nguồn");
  return out;
}

function VersionsTab({ post }: { post: LearnPost }) {
  const versions = [...post.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  return <Panel title="Phiên bản" description="Bản đã xuất bản bất biến. Mỗi lần sửa nội dung tạo một bản nháp mới." bodyClassName="ops-stack">
    <Table caption="Các phiên bản của bài">
      <thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Tiêu đề</th><th>Hash nội dung</th><th>Cập nhật</th></tr></thead>
      <tbody>{versions.map((version) => <tr key={version.id}>
        <td className="ops-cell-primary">v{version.versionNumber}</td>
        <td><span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}><StatusBadge tone={version.status === "Draft" ? "warning" : "success"}>{version.status === "Draft" ? "Bản nháp" : "Đã xuất bản"}</StatusBadge>{post.publishedVersionId === version.id && <StatusBadge tone="ember">Bản được ghim</StatusBadge>}</span></td>
        <td>{version.title}</td>
        <td><code style={{ fontSize: 12 }}>{version.contentHash.slice(0, 12)}…</code></td>
        <td>{formatDateTime(version.publishedAt ?? version.updatedAt)}</td>
      </tr>)}</tbody>
    </Table>
  </Panel>;
}

function LifecyclePanel({ port, post, etag, draft, dirty, onDone }: { port: LearnCmsPort; post: LearnPost; etag: string; draft: LearnVersion | null; dirty: boolean; onDone: () => void }) {
  const toast = useToast();
  const idempotency = useIdempotencyKey();
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<LearnErrorView | null>(null);
  const view = postStatusView[post.status];

  const blockedReason = (candidate: LifecycleAction): string | null => {
    if (candidate !== "publish") return null;
    if (!draft) return "Cần có bản nháp. Tạo bản nháp mới ở đầu trang.";
    if (dirty) return "Lưu bản nháp trước khi xuất bản.";
    return null;
  };

  const run = async () => {
    if (!action || saving) return;
    setSaving(true);
    setError(null);
    try {
      const versionId = action === "publish" ? draft?.id ?? null : null;
      await port.transition(post.id, action, versionId, etag, idempotency.keyFor({ postId: post.id, action, versionId, etag }));
      idempotency.done();
      toast.notify({ tone: "success", title: lifecycleDone[action], description: `${post.slug} (dữ liệu mẫu — không gọi API thật)` });
      setAction(null);
      onDone();
    } catch (cause) {
      setError(describeLearnError(cause));
    } finally {
      setSaving(false);
    }
  };

  const copy = action ? lifecycleCopy[action] : null;
  return <Panel title="Xuất bản và hiển thị" description="Mỗi thao tác gửi ETag của bài (If-Match) và một Idempotency-Key; thử lại không tạo thao tác trùng." bodyClassName="ops-stack">
    <DetailList items={[
      { label: "Trạng thái bài", value: <StatusBadge tone={view.tone}>{view.label}</StatusBadge> },
      { label: "ETag hiện tại", value: <code>{etag}</code> },
      { label: "Hiển thị theo Docs v7 (backend quyết định)", value: view.visibility },
    ]} columns={1} />
    <div className="ops-actions">
      {lifecycleActionsFor[post.status].map((candidate) => {
        const reason = blockedReason(candidate);
        return <span key={candidate} style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
          <Button variant={lifecycleCopy[candidate].danger ? "danger" : candidate === "publish" || candidate === "show" || candidate === "restore" ? "primary" : "secondary"} disabled={reason !== null} onClick={() => { setError(null); setAction(candidate); }}>{lifecycleCopy[candidate].label}</Button>
          {reason && <span className="ops-field-hint">{reason}</span>}
        </span>;
      })}
    </div>
    {action && copy && <Modal open onOpenChange={(open) => { if (!open && !saving) setAction(null); }} title={copy.title} description={copy.body}
      footer={<>
        <Button variant="quiet" onClick={() => setAction(null)} disabled={saving}>Hủy</Button>
        {error?.kind === "conflict"
          ? <Button variant="secondary" onClick={() => { setAction(null); onDone(); }}>Tải bản mới</Button>
          : <Button variant={copy.danger ? "danger" : "primary"} disabled={saving} onClick={() => void run()}>{saving ? "Đang gửi…" : error?.kind === "retry" ? "Thử lại" : copy.confirm}</Button>}
      </>}>
      <div className="ops-stack">
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Bài: <strong style={{ color: "var(--text)" }}>{post.slug}</strong></p>
        {error && <Alert tone={error.kind === "conflict" ? "warning" : "danger"}><span style={{ display: "grid", gap: 6 }}><span>{error.message}</span>{error.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{error.issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul>}</span></Alert>}
      </div>
    </Modal>}
  </Panel>;
}

export function EmptyEditor({ onClose }: { onClose: () => void }) {
  return <EmptyState icon={FilePlus2} title="Không tìm thấy bài" description="Bài không tồn tại hoặc đã bị gỡ." action={<Button size="sm" variant="secondary" onClick={onClose}>Về danh sách</Button>} />;
}
