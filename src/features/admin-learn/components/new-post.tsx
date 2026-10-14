"use client";

import { ArrowLeft, Save, Send } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { learnAdminApi } from "../api";
import { commandDone, commandKey } from "../command-keys";
import { checkContent, checkSlug, emptyContent, fingerprint, toVersionInput, type ContentIssue, type EditorContent } from "../content";
import { describeLearnError, translateIssue, type LearnErrorView } from "../errors";
import { publishBlockReason } from "../status";
import { isMediaRefused, useMediaChecks } from "../use-media-checks";
import { useSourceFlags } from "../use-source-flags";
import { ContentFields } from "./content-fields";

/**
 * Create a post with its first Draft. "Lưu bản nháp" sends `publish:false`; "Tạo và xuất bản" sends `publish:true`, which the
 * backend does atomically (and refuses with 409 when a cited source is not approved). One Idempotency-Key per intent.
 */
export function NewPost({ accessToken, tab, onTab, onBack, onCreated }: { accessToken: string; tab: string; onTab: (tab: string) => void; onBack: () => void; onCreated: (postId: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<EditorContent>(emptyContent);
  const [slug, setSlug] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ print: string; issues: ContentIssue[] } | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<LearnErrorView | null>(null);
  const [leaving, setLeaving] = useState(false);
  const media = useMediaChecks(accessToken);
  const { flags, known } = useSourceFlags(accessToken, form.sources);

  const print = fingerprint(form);
  const started = print !== fingerprint(emptyContent()) || slug !== "";
  const clientIssues = checkContent(form);
  const slugProblem = checkSlug(slug) ?? (error?.code === "SLUG_EXISTS" ? error.message : undefined);
  const refusedVideo = form.blocks.some((block) => block.type === "video" && isMediaRefused(media.checks, block.id, block.fields.url));
  const sourceProblems = form.sources.flatMap((entry) => { const verdict = flags[entry.sourceId]; const reason = verdict ? publishBlockReason(verdict) : null; return reason ? [`Nguồn “${entry.title}”: ${reason}`] : []; });
  const shown: ContentIssue[] = [...(showIssues ? clientIssues : []), ...(serverIssues && serverIssues.print === print ? serverIssues.issues : [])];

  const create = async (publish: boolean) => {
    if (busy) return;
    setShowIssues(true);
    if (checkSlug(slug) || clientIssues.length > 0 || refusedVideo) { setError(null); return; }
    setBusy(publish ? "publish" : "draft");
    setError(null);
    const input = { slug, publish, version: toVersionInput(form) };
    const intent = { op: "create-post", input };
    try {
      const result = await learnAdminApi.createPost(accessToken, input, commandKey(intent));
      commandDone(intent);
      toast.notify({ tone: "success", title: publish ? "Đã tạo và xuất bản bài" : "Đã tạo bản nháp", description: `${result.data.slug} · ${result.etag}` });
      onCreated(result.data.id);
    } catch (cause) {
      const view = describeLearnError(cause);
      setError(view);
      if (view.issues.length > 0) setServerIssues({ print, issues: view.issues.map(translateIssue) });
    } finally {
      setBusy(null);
    }
  };

  const leave = () => (started ? setLeaving(true) : onBack());

  return <div className="ops-stack">
    <div><Button variant="quiet" size="sm" onClick={leave}><ArrowLeft size={16} aria-hidden="true" />Về danh sách</Button></div>
    <Panel title="Bài mới" description="Lưu thành bản nháp hoặc xuất bản ngay khi nội dung đã sẵn sàng. Bản đã xuất bản là bất biến." bodyClassName="ops-stack"
      actions={<>
        {started && <StatusBadge tone="warning">Chưa lưu</StatusBadge>}
        <Button variant="secondary" disabled={busy !== null} onClick={() => void create(false)}><Save size={16} aria-hidden="true" />{busy === "draft" ? "Đang lưu…" : "Lưu bản nháp"}</Button>
        <Button disabled={busy !== null || sourceProblems.length > 0} onClick={() => void create(true)}><Send size={16} aria-hidden="true" />{busy === "publish" ? "Đang xuất bản…" : "Tạo và xuất bản ngay"}</Button>
      </>}>
      {sourceProblems.length > 0 && <Alert tone="warning" title="Chưa thể xuất bản ngay">{sourceProblems.join(" ")} Có thể lưu bản nháp rồi xuất bản khi nguồn đã được duyệt.</Alert>}
      {error && <Alert tone={error.kind === "stale" ? "warning" : "danger"} title={error.title}>
        <span style={{ display: "grid", gap: 6 }}><span>{error.message}</span>{error.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{error.issues.map((issue, index) => <li key={index}>{translateIssue(issue).message}</li>)}</ul>}</span>
      </Alert>}
      {showIssues && (clientIssues.length > 0 || checkSlug(slug)) && <Alert tone="danger" title="Còn điểm cần sửa trước khi lưu"><ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{checkSlug(slug) && <li>{checkSlug(slug)}</li>}{clientIssues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></Alert>}
      {showIssues && refusedVideo && <Alert tone="danger" title="Có liên kết video bị máy chủ từ chối">Sửa hoặc xóa khối video đó trước khi lưu.</Alert>}
    </Panel>
    <ContentFields accessToken={accessToken} form={form} onChange={(update) => setForm(update)} readOnly={false} busy={busy !== null} issues={shown}
      checks={media.checks} onCheck={(blockId, url) => void media.check(blockId, url)} sourceFlags={flags} onKnownSources={known} tab={tab} onTab={onTab} label="Soạn bài mới"
      slugField={<Field label="Slug (đường dẫn)" required hint="Chữ thường không dấu, số và dấu gạch ngang. Không đổi được sau khi tạo." error={showIssues || error?.code === "SLUG_EXISTS" ? slugProblem : undefined}>
        {(p) => <Input {...p} maxLength={180} value={slug} onChange={(event) => { setSlug(event.target.value.toLowerCase()); if (error?.code === "SLUG_EXISTS") setError(null); }} />}
      </Field>} />
    <Modal open={leaving} onOpenChange={setLeaving} title="Bỏ bài đang soạn?" description="Nội dung chưa được lưu và sẽ mất nếu rời khỏi trang này."
      footer={<><Button variant="quiet" onClick={() => setLeaving(false)}>Tiếp tục soạn</Button><Button variant="danger" onClick={() => { setLeaving(false); onBack(); }}>Bỏ bài</Button></>}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Bấm “Lưu bản nháp” để giữ lại.</p>
    </Modal>
  </div>;
}
