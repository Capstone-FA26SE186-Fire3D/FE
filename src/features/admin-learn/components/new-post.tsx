"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { learnAdminApi } from "../api";
import { newBlock, updateFields, type EditorBlock } from "../blocks";
import { commandDone, commandKey } from "../command-keys";
import { checkContent, checkSlug, emptyContent, fingerprint, toVersionInput, type ContentIssue, type EditorContent } from "../content";
import { describeLearnError, translateIssue, type LearnErrorView } from "../errors";
import { ContentFields } from "./content-fields";

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * "Bài mới" modal (Figma 53:758 · create = Modal): slug, title, kind, summary, situations, the opening paragraph (the
 * backend requires at least one block) and, for a Video post, its link. "Xuất bản ngay" sends `publish:true`, which the
 * backend does atomically. One Idempotency-Key per intent; the author lands in the editor to add the rest.
 */
export function NewPostModal({ accessToken, onClose, onCreated }: { accessToken: string; onClose: () => void; onCreated: (postId: string) => void }) {
  const toast = useToast();
  const formId = useId();
  const [form, setForm] = useState<EditorContent>(() => ({ ...emptyContent(), blocks: [newBlock("paragraph")] }));
  const [slug, setSlug] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [serverIssues, setServerIssues] = useState<{ print: string; issues: ContentIssue[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LearnErrorView | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Block 0 is the opening paragraph; a Video post also carries its video block (the server derives provider/videoId).
  const paragraph = form.blocks[0];
  const video = form.blocks.find((block) => block.type === "video");
  const setBlock = (block: EditorBlock) => setForm((current) => ({ ...current, blocks: current.blocks.map((item) => (item.id === block.id ? block : item)) }));
  const setKindBlocks = (update: (current: EditorContent) => EditorContent) => setForm((current) => {
    const next = update(current);
    const hasVideo = next.blocks.some((block) => block.type === "video");
    if (next.kind === "Video" && !hasVideo) return { ...next, blocks: [...next.blocks, newBlock("video")] };
    if (next.kind !== "Video" && hasVideo && !text(next.blocks.find((block) => block.type === "video")?.fields.url).trim()) return { ...next, blocks: next.blocks.filter((block) => block.type !== "video") };
    return next;
  });

  const print = fingerprint(form);
  const started = form.title !== "" || form.summary !== "" || slug !== "" || text(paragraph?.fields.text) !== "" || form.situations.length > 0;
  const clientIssues = checkContent(form);
  const slugProblem = checkSlug(slug) ?? (error?.code === "SLUG_EXISTS" ? error.message : undefined);
  const shown: ContentIssue[] = [...(showIssues ? clientIssues : []), ...(serverIssues && serverIssues.print === print ? serverIssues.issues : [])];
  const issueFor = (path: string) => shown.find((issue) => issue.path === path)?.message;
  const videoIndex = form.blocks.findIndex((block) => block.type === "video");

  const create = async () => {
    if (busy) return;
    setShowIssues(true);
    if (checkSlug(slug) || clientIssues.length > 0) { setError(null); return; }
    setBusy(true);
    setError(null);
    const input = { slug, publish: publishNow, version: toVersionInput(form) };
    const intent = { op: "create-post", input };
    try {
      const result = await learnAdminApi.createPost(accessToken, input, commandKey(intent));
      commandDone(intent);
      toast.notify({ tone: "success", title: publishNow ? "Đã tạo và xuất bản bài" : "Đã tạo bản nháp", description: `${result.data.slug} · ${result.etag}` });
      onCreated(result.data.id);
    } catch (cause) {
      const view = describeLearnError(cause);
      setError(view);
      if (view.issues.length > 0) setServerIssues({ print, issues: view.issues.map(translateIssue) });
    } finally {
      setBusy(false);
    }
  };

  const leave = () => { if (busy) return; if (started) setLeaving(true); else onClose(); };

  return <>
    <Modal open onOpenChange={(open) => { if (!open) leave(); }} size="lg" title="Bài mới" description="Tạo bản nháp đầu tiên rồi soạn tiếp trong trình soạn. Bản đã xuất bản là bất biến." data-testid="learn-new-post"
      footer={<>
        <Button type="button" variant="quiet" disabled={busy} onClick={leave}>Hủy</Button>
        <SubmitButton type="submit" form={formId} state={busy ? "busy" : "idle"} data-testid="create-post">{busy ? (publishNow ? "Đang xuất bản…" : "Đang tạo…") : error?.kind === "retry" ? "Thử lại" : publishNow ? "Tạo và xuất bản ngay" : "Tạo bản nháp"}</SubmitButton>
      </>}>
      <form id={formId} className="ops-stack" onSubmit={(event) => { event.preventDefault(); void create(); }} noValidate>
        {error && error.code !== "SLUG_EXISTS" && <Alert tone={error.kind === "stale" ? "warning" : "danger"} title={error.title}>
          <span style={{ display: "grid", gap: 6 }}><span>{error.message}</span>{error.issues.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{error.issues.map((issue, index) => <li key={index}>{translateIssue(issue).message}</li>)}</ul>}</span>
        </Alert>}
        {showIssues && (clientIssues.length > 0 || checkSlug(slug)) && <Alert tone="danger" title="Còn điểm cần sửa trước khi tạo bài"><ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>{checkSlug(slug) && <li>{checkSlug(slug)}</li>}{clientIssues.map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></Alert>}
        <ContentFields accessToken={accessToken} form={form} onChange={setKindBlocks} readOnly={false} busy={busy} issues={shown} compact
          slugField={<Field label="Slug (đường dẫn)" required hint="Chữ thường không dấu, số và dấu gạch ngang. Không đổi được sau khi tạo." error={showIssues || error?.code === "SLUG_EXISTS" ? slugProblem : undefined}>
            {(p) => <Input {...p} maxLength={180} value={slug} onChange={(event) => { setSlug(event.target.value.toLowerCase()); if (error?.code === "SLUG_EXISTS") setError(null); }} />}
          </Field>} />
        <fieldset disabled={busy} className="ops-stack" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          {paragraph && <Field label="Đoạn mở đầu" required hint="Khối đoạn văn đầu tiên của bài (văn bản thuần). Thêm tiêu đề phụ, danh sách, ảnh và video trong trình soạn." error={issueFor("$.blocks[0].text") ?? issueFor("$.blocks")}>
            {(p) => <Textarea {...p} rows={4} maxLength={5000} value={text(paragraph.fields.text)} onChange={(event) => setBlock(updateFields(paragraph, { text: event.target.value }))} />}
          </Field>}
          {video && <Field label="Liên kết video" required hint="Liên kết đầy đủ từ YouTube, Facebook hoặc TikTok (https). Máy chủ kiểm tra và chuẩn hóa khi tạo bài." error={issueFor(`$.blocks[${videoIndex}].url`)}>
            {(p) => <Input {...p} inputMode="url" value={text(video.fields.url)} onChange={(event) => setBlock(updateFields(video, { url: event.target.value }))} />}
          </Field>}
          <label className="learn-toggle">
            <input type="checkbox" checked={publishNow} onChange={(event) => setPublishNow(event.target.checked)} />
            <span>Xuất bản ngay<small>Bài công khai ngay khi tạo xong. Mọi nguồn trích dẫn phải đã được duyệt; bỏ chọn để lưu bản nháp và xuất bản sau.</small></span>
          </label>
        </fieldset>
      </form>
    </Modal>
    <ConfirmDialog open={leaving} onOpenChange={setLeaving} title="Bỏ bài đang soạn?" description="Nội dung chưa được lưu và sẽ mất nếu đóng hộp thoại này." tone="danger" confirmLabel="Bỏ bài" cancelLabel="Tiếp tục soạn" onConfirm={() => { setLeaving(false); onClose(); }} />
  </>;
}
