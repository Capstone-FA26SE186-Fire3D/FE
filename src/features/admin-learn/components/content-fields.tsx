"use client";

import type { ReactNode } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, Textarea } from "@/components/ui/field";
import { kindLabel, LEARN_KINDS } from "@/features/learn/types";
import type { ContentIssue, EditorContent } from "../content";
import type { LearnKind } from "../types";
import { SituationPicker } from "./situation-picker";

const KIND_OPTIONS = LEARN_KINDS.map((kind) => ({ value: kind, label: kindLabel[kind] }));
const isKind = (value: string): value is LearnKind => (LEARN_KINDS as readonly string[]).includes(value);

/**
 * The post's own fields (Figma "Thông tin bài"): title, slug (on create), kind, summary, situations and cover. Shared by
 * the "Bài mới" modal (`compact`, no cover) and the editor's side card. The caller owns the state and decides which
 * issues are visible.
 */
export function ContentFields({ accessToken, form, onChange, readOnly, busy = false, issues, slugField, compact = false }: {
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
}) {
  const patch = (change: Partial<EditorContent>) => onChange((current) => ({ ...current, ...change }));
  const issueFor = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const locked = readOnly || busy;
  return <fieldset disabled={locked} className="ops-stack" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    <Field label="Tiêu đề" required error={issueFor("$.title")}>{(p) => <Input {...p} maxLength={255} value={form.title} onChange={(event) => patch({ title: event.target.value })} />}</Field>
    {slugField}
    <Field label="Loại bài" hint="Loại Video cần ít nhất một khối video.">{(p) => <Combobox {...p} aria-label="Loại bài" value={form.kind} onChange={(value) => { if (isKind(value)) patch({ kind: value }); }} options={KIND_OPTIONS} groupLabel="Loại bài" disabled={locked} />}</Field>
    <Field label="Tóm tắt" required hint={`${form.summary.length}/2000 ký tự. Hiển thị ở danh sách và thay cho video khi video không nhúng được.`} error={issueFor("$.summary")}>{(p) => <Textarea {...p} rows={compact ? 3 : 4} value={form.summary} maxLength={2000} onChange={(event) => patch({ summary: event.target.value })} />}</Field>
    <Field label="Tình huống" hint="Tối đa 20; chỉ chọn được tình huống đang hoạt động." error={issueFor("$.situationIds")}>{(p) => <SituationPicker {...p} accessToken={accessToken} selected={form.situations} disabled={locked} onChange={(situations) => patch({ situations })} />}</Field>
    {!compact && <Field label="Ảnh bìa (https, không bắt buộc)" error={issueFor("$.coverImageUrl")}>{(p) => <Input {...p} inputMode="url" value={form.coverImageUrl} onChange={(event) => patch({ coverImageUrl: event.target.value })} />}</Field>}
  </fieldset>;
}
