"use client";

import type { ReactNode } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { kindLabel, LEARN_KINDS } from "@/features/learn/types";
import type { ContentIssue, EditorContent } from "../content";
import type { MediaCheck } from "../use-media-checks";
import type { KnowledgeSource, LearnKind } from "../types";
import { BlockEditor } from "./learn-blocks";
import { SituationPicker } from "./situation-picker";
import { SourcePicker } from "./source-picker";

export type ExtraTab = { value: string; label: string; content: ReactNode };

/**
 * The three content tabs shared by "new post" and "edit version": Thông tin, Nội dung, Phân loại và nguồn. The caller
 * adds its own tabs (versions, publish) through `extraTabs` and owns every piece of state.
 */
export function ContentFields({ accessToken, form, onChange, readOnly, busy = false, issues, checks, onCheck, sourceFlags, onKnownSources, tab, onTab, extraTabs = [], slugField, label }: {
  accessToken: string;
  form: EditorContent;
  onChange: (update: (current: EditorContent) => EditorContent) => void;
  readOnly: boolean;
  /** A write is in flight: fields lock but the add/remove controls stay in place. */
  busy?: boolean;
  /** Issues already filtered to the ones that should be visible now. */
  issues: ContentIssue[];
  checks: Record<string, MediaCheck>;
  onCheck: (blockId: string, url: string) => void;
  sourceFlags: Record<string, KnowledgeSource | null>;
  onKnownSources: (sources: KnowledgeSource[]) => void;
  tab: string;
  onTab: (value: string) => void;
  extraTabs?: ExtraTab[];
  slugField?: ReactNode;
  label: string;
}) {
  const patch = (change: Partial<EditorContent>) => onChange((current) => ({ ...current, ...change }));
  const issueFor = (path: string) => issues.find((issue) => issue.path === path)?.message;
  return <Tabs value={tab} onValueChange={onTab}>
    <TabsList aria-label={label}>
      <TabsTrigger value="info">Thông tin</TabsTrigger>
      <TabsTrigger value="content">Nội dung</TabsTrigger>
      <TabsTrigger value="classify">Phân loại và nguồn</TabsTrigger>
      {extraTabs.map((extra) => <TabsTrigger key={extra.value} value={extra.value}>{extra.label}</TabsTrigger>)}
    </TabsList>
    <fieldset disabled={readOnly || busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <TabsContent value="info"><Panel bodyClassName="ops-stack">
        <div className="ops-form-grid">
          {slugField}
          <Field label="Tiêu đề" required error={issueFor("$.title")} className="ops-span-all">{(p) => <Input {...p} maxLength={255} value={form.title} onChange={(event) => patch({ title: event.target.value })} />}</Field>
          <Field label="Loại bài" hint="Loại Video cần ít nhất một khối video.">{(p) => <Select {...p} value={form.kind} onChange={(event) => patch({ kind: event.target.value as LearnKind })}>{LEARN_KINDS.map((kind) => <option key={kind} value={kind}>{kindLabel[kind]}</option>)}</Select>}</Field>
          <Field label="Tóm tắt" required hint={`${form.summary.length}/2000 ký tự. Hiển thị ở danh sách và thay cho video khi video không nhúng được.`} error={issueFor("$.summary")} className="ops-span-all">{(p) => <Textarea {...p} rows={3} value={form.summary} onChange={(event) => patch({ summary: event.target.value })} />}</Field>
          <Field label="Ảnh bìa (https, không bắt buộc)" error={issueFor("$.coverImageUrl")} className="ops-span-all">{(p) => <Input {...p} inputMode="url" value={form.coverImageUrl} onChange={(event) => patch({ coverImageUrl: event.target.value })} />}</Field>
        </div>
      </Panel></TabsContent>
      <TabsContent value="content"><Panel title="Khối nội dung" description="Văn bản thuần, danh sách, ảnh https và liên kết video YouTube/Facebook/TikTok. Không nhận HTML, iframe hay script." bodyClassName="ops-stack">
        <BlockEditor blocks={form.blocks} disabled={readOnly} issues={issues} checks={checks} onCheck={onCheck} onChange={(blocks) => patch({ blocks })} />
      </Panel></TabsContent>
      <TabsContent value="classify"><div className="ops-grid ops-grid-2">
        <Panel title="Tình huống" description="Một bài có thể thuộc nhiều tình huống (tối đa 20). Chỉ dùng được tình huống đang hoạt động." bodyClassName="ops-stack">
          <SituationPicker accessToken={accessToken} selected={form.situations} disabled={readOnly} onChange={(situations) => patch({ situations })} />
        </Panel>
        <Panel title="Nguồn Common" description="Bản nháp có thể trích nguồn Common chưa duyệt; xuất bản cần mọi nguồn đã duyệt và còn hiệu lực." bodyClassName="ops-stack">
          <SourcePicker accessToken={accessToken} selected={form.sources} flags={sourceFlags} known={onKnownSources} disabled={readOnly}
            onAdd={(source) => onChange((current) => current.sources.some((entry) => entry.sourceId === source.id && entry.role === "Reference") ? current : { ...current, sources: [...current.sources, { sourceId: source.id, role: "Reference", locator: {}, title: source.title, versionLabel: source.versionLabel }] })}
            onRemove={(index) => onChange((current) => ({ ...current, sources: current.sources.filter((_, position) => position !== index) }))}
            onRole={(index, role) => onChange((current) => ({ ...current, sources: current.sources.map((entry, position) => (position === index ? { ...entry, role } : entry)) }))} />
          {issueFor("$.sources") && <p role="alert" className="ops-field-error">{issueFor("$.sources")}</p>}
        </Panel>
      </div></TabsContent>
    </fieldset>
    {extraTabs.map((extra) => <TabsContent key={extra.value} value={extra.value}>{extra.content}</TabsContent>)}
  </Tabs>;
}
