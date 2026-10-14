"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";

import { orgAiApi } from "../api";
import { aiErrorText, sourceKindLabel } from "../labels";
import type { AiEligibleSource, AiSourceRef } from "../types";
import styles from "../org-ai.module.css";

export type SourceChoice = { mode: "all" | "selected"; selected: string[] };
export const ALL_SOURCES: SourceChoice = { mode: "all", selected: [] };

const keyOf = (source: { kind: string; id: string }) => `${source.kind}:${source.id}`;

/** Refs for the request body. `all` sends none: the BE then pins every eligible source up to the policy limit. */
export function toSourceRefs(choice: SourceChoice, available: AiEligibleSource[]): AiSourceRef[] | undefined {
  if (choice.mode === "all") return undefined;
  const wanted = new Set(choice.selected);
  return available.filter((source) => wanted.has(keyOf(source))).map((source) => ({ kind: source.kind, id: source.id })).sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
}

/**
 * Scope of a request: all eligible sources (the BE decides, up to its policy limit) or an explicit choice. The list is
 * what `GET /api/ai/organization/sources` returns now; a stale pick the server no longer allows is refused with 422.
 */
export function SourcePicker({ accessToken, value, onChange, disabled, onLoaded }: {
  accessToken: string;
  value: SourceChoice;
  onChange: (value: SourceChoice) => void;
  disabled?: boolean;
  /** Receives the current list (use a stable setter). */
  onLoaded?: (sources: AiEligibleSource[]) => void;
}) {
  const sources = useAsyncData("org-ai:sources", (signal) => orgAiApi.sources(accessToken, signal));
  const items = sources.data?.items;
  useEffect(() => {
    if (items) onLoaded?.(items);
  }, [items, onLoaded]);
  const groups = useMemo(() => {
    const map = new Map<string, AiEligibleSource[]>();
    for (const item of items ?? []) map.set(item.kind, [...(map.get(item.kind) ?? []), item]);
    return [...map.entries()];
  }, [items]);
  const selected = new Set(value.selected);

  return <fieldset className={styles.pickGroup} disabled={disabled} data-testid="source-picker" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    <legend>Phạm vi nguồn</legend>
    {sources.loading && !items && <SkeletonRows rows={2} label="Đang tải nguồn đủ điều kiện…" />}
    {sources.error !== undefined && <Alert tone="danger" title="Không tải được nguồn đủ điều kiện" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={sources.reload}>Thử lại</Button>}>{aiErrorText(sources.error)}</Alert>}
    {items && items.length === 0 && <Alert tone="warning" title="Chưa có nguồn nào đủ điều kiện">Cần ít nhất một nguồn được duyệt (tri thức chuẩn đã duyệt, thư viện đã phát hành hoặc bài Learn đủ điều kiện). PlatformAdmin duyệt nguồn ở khu quản trị; yêu cầu sẽ bị từ chối khi không có nguồn.</Alert>}
    {items && items.length > 0 && <>
      <div className={styles.radioRow} role="radiogroup" aria-label="Chọn cách giới hạn nguồn">
        <label className={styles.radio} data-on={value.mode === "all"}><input type="radio" name="source-mode" checked={value.mode === "all"} onChange={() => onChange({ ...value, mode: "all" })} />Tất cả nguồn đủ điều kiện ({items.length})</label>
        <label className={styles.radio} data-on={value.mode === "selected"}><input type="radio" name="source-mode" checked={value.mode === "selected"} onChange={() => onChange({ ...value, mode: "selected" })} />Chọn nguồn cụ thể</label>
      </div>
      {value.mode === "all" && <p className={styles.dim}>Máy chủ ghim các nguồn đủ điều kiện, tối đa theo chính sách AI hiện hành.</p>}
      {value.mode === "selected" && <div className={styles.stack}>
        {groups.map(([kind, list]) => <div key={kind} className={styles.pickGroup} role="group" aria-label={sourceKindLabel(kind)}>
          <strong style={{ fontSize: 12, color: "var(--muted)" }}>{sourceKindLabel(kind)}</strong>
          {list.map((source) => <label key={keyOf(source)} className={styles.pick}>
            <input type="checkbox" checked={selected.has(keyOf(source))} onChange={(event) => onChange({ ...value, selected: event.target.checked ? [...value.selected, keyOf(source)] : value.selected.filter((entry) => entry !== keyOf(source)) })} />
            <span><strong>{source.title}</strong><span className={styles.dim}> · phiên bản {source.versionLabel}</span></span>
          </label>)}
        </div>)}
        {value.selected.length === 0 && <p className={styles.dim} role="status">Chưa chọn nguồn nào: chọn ít nhất một nguồn hoặc quay lại “Tất cả nguồn”.</p>}
      </div>}
      <div><Button type="button" size="sm" variant="quiet" onClick={sources.reload} disabled={sources.loading}><RefreshCw size={14} aria-hidden="true" />Tải lại nguồn</Button></div>
    </>}
  </fieldset>;
}
