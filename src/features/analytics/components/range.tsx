"use client";

import { useState, type FormEvent } from "react";
import { useUrlParams } from "@/api/use-url-params";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { addDays, buildRange, formatDateTime, todayUtc } from "@/utils/date-range";
import type { AnalyticsRange } from "../types";
import styles from "./analytics.module.css";

const PRESETS = [7, 30, 90] as const;

/**
 * The reporting period lives in the URL (`from`/`to` as UTC dates, inclusive). Without it the server default of the last
 * 30 days applies. A period over 90 days, an inverted one or a half-filled one never reaches the API.
 */
export function useAnalyticsRange() {
  const { get, setParams } = useUrlParams();
  const urlFrom = get("from");
  const urlTo = get("to");
  const hasRange = Boolean(urlFrom || urlTo);
  const built = hasRange ? buildRange(urlFrom, urlTo) : null;
  const error = built && !built.ok ? built.message : null;
  const range: AnalyticsRange = built?.ok ? { from: built.from, to: built.to } : {};
  return { urlFrom, urlTo, hasRange, error, range, get, setParams, apply: (from: string, to: string) => setParams({ from, to }) };
}

export function RangeBar({ urlFrom, urlTo, onApply }: { urlFrom: string; urlTo: string; onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState(urlFrom);
  const [to, setTo] = useState(urlTo);
  const [error, setError] = useState<{ field: "from" | "to" | "range"; message: string } | null>(null);
  const today = todayUtc();
  const activePreset = PRESETS.find((days) => urlTo === today && urlFrom === addDays(today, -(days - 1)));

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const result = buildRange(from, to);
    if (!result.ok) { setError(result); return; }
    setError(null);
    onApply(from, to);
  };

  const pick = (days: number) => {
    const end = todayUtc();
    const start = addDays(end, -(days - 1));
    setFrom(start); setTo(end); setError(null);
    onApply(start, end);
  };

  return <form className={`ops-panel ${styles.range}`} onSubmit={apply} noValidate aria-label="Khoảng thời gian">
    <div className={styles.presets} role="group" aria-label="Khoảng nhanh">
      {PRESETS.map((days) => <button key={days} type="button" aria-pressed={activePreset === days} onClick={() => pick(days)}>{days} ngày</button>)}
    </div>
    <div className={styles.dates}>
      <Field label="Từ ngày" error={error?.field === "from" || error?.field === "range" ? error.message : undefined}>{(p) => <Input {...p} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />}</Field>
      <Field label="Đến ngày" error={error?.field === "to" ? error.message : undefined}>{(p) => <Input {...p} type="date" value={to} onChange={(event) => setTo(event.target.value)} />}</Field>
    </div>
    <Button type="submit" variant="secondary">Áp dụng</Button>
  </form>;
}

/** The effective period and snapshot time as the server reports them (not what the browser asked for). */
export function PeriodMeta({ data, hasRange, urlFrom, urlTo }: { data: { from: string; to: string; asOf: string } | undefined; hasRange: boolean; urlFrom: string; urlTo: string }) {
  return <p className={styles.meta} aria-live="polite">
    {data ? <>
      <span>Khoảng thời gian: <strong>{formatDateTime(data.from)}</strong> – <strong>{formatDateTime(data.to)}</strong>{hasRange ? "" : " (mặc định 30 ngày gần nhất)"}</span>
      <span>Cập nhật lúc <strong>{formatDateTime(data.asOf)}</strong></span>
      <span>Ngày chọn tính theo UTC</span>
    </> : <span>Khoảng thời gian: {hasRange ? `${urlFrom} – ${urlTo}` : "30 ngày gần nhất (mặc định)"}</span>}
  </p>;
}

export function RangeError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Alert tone="danger" title="Khoảng thời gian trong đường dẫn không hợp lệ">{message} Chọn lại khoảng thời gian ở trên.</Alert>;
}
