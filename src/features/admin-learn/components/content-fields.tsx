"use client";

import type { ReactNode } from "react";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { ContentIssue, EditorContent } from "../content";
import { KindPicker } from "./kind-picker";
import { SituationPicker } from "./situation-picker";

/**
 * The post's own fields (Figma "Thông tin bài"): title, slug (on create), kind, summary, situations and cover. Shared by
 * the "Bài mới" modal (`compact`: picture kind cards, no cover) and the editor's side card (`onPage`: title, summary and
 * cover live on the editor's page instead). The caller owns the state and decides which issues are visible.
 */
export function ContentFields({ accessToken, form, onChange, readOnly, busy = false, issues, slugField, compact = false, onPage = false }: {
  accessToken: string;
  form: EditorContent;
  onChange: (update: (current: EditorContent) => EditorContent) => void;
  readOnly: boolean;
  /** A write is in flight: fields lock. */
  busy?: boolean;
  /** Issues already filtered to the ones that should be visible now. */
  issues: ContentIssue[];
  slugField?: ReactNode;
  compact?: boolean;
  /** Title, summary and cover are edited on the editor's page, so this card leaves them out. */
  onPage?: boolean;
}) {
  const patch = (change: Partial<EditorContent>) => onChange((current) => ({ ...current, ...change }));
  const issueFor = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const locked = readOnly || busy;
  return <fieldset disabled={locked} className="ops-stack" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    <div className="ops-field"><span className="kind-label">Loại bài</span><KindPicker value={form.kind} onChange={(kind) => patch({ kind })} disabled={locked} visual={compact} />{form.kind === "Video" && <span className="ops-field-hint">Bài Video cần ít nhất một khối video.</span>}</div>
    {!onPage && <Field label="Tiêu đề" required error={issueFor("$.title")}>{(p) => <Input {...p} maxLength={255} value={form.title} onChange={(event) => patch({ title: event.target.value })} />}</Field>}
    {slugField}
    {!onPage && <Field label="Tóm tắt" required hint={`${form.summary.length}/2000 ký tự · hiện ở danh sách bài và dưới video.`} error={issueFor("$.summary")}>{(p) => <Textarea {...p} rows={compact ? 3 : 4} value={form.summary} maxLength={2000} onChange={(event) => patch({ summary: event.target.value })} />}</Field>}
    <Field label="Tình huống" hint="Tối đa 20; chỉ chọn được tình huống đang hoạt động." error={issueFor("$.situationIds")}>{(p) => <SituationPicker {...p} accessToken={accessToken} selected={form.situations} disabled={locked} onChange={(situations) => patch({ situations })} />}</Field>
    {!compact && !onPage && <Field label="Ảnh bìa (https, không bắt buộc)" error={issueFor("$.coverImageUrl")}>{(p) => <Input {...p} inputMode="url" value={form.coverImageUrl} onChange={(event) => patch({ coverImageUrl: event.target.value })} />}</Field>}
  </fieldset>;
}
