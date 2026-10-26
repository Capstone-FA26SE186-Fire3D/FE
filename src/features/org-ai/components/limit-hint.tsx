"use client";

import { useAsyncData } from "@/api/use-async-data";
import { formatQuota } from "@/features/billing/format";

import { orgAiApi } from "../api";
import { limitOf } from "../use-ai-submit";
import type { AiOperation, AiOperationLimit } from "../types";
import styles from "../org-ai.module.css";

/** Limits of one operation (`GET /api/ai/organization/limits`) for the form: hint, max length, max sources. */
export function useOperationLimit(accessToken: string, operation: AiOperation) {
  const data = useAsyncData(`org-ai:limits:${operation}`, (signal) => orgAiApi.limits(accessToken, signal));
  return { limit: data.data ? limitOf(data.data.items, operation) : undefined, loading: data.loading, error: data.error, reload: data.reload };
}

/**
 * One line under the form: what a request reserves and what is left. It is information only; the submit reads the limits
 * again (the balance may have changed) and the BE has the final word.
 */
export function LimitHint({ limit }: { limit: AiOperationLimit | null | undefined }) {
  if (limit === undefined) return null;
  if (limit === null || !limit.policyActive) {
    return <p className={styles.dim} data-testid="ai-limit-hint">Chưa có chính sách AI đang hiệu lực cho thao tác này; yêu cầu sẽ không được gửi.</p>;
  }
  const unit = limit.quotaUnit ?? undefined;
  return <p className={styles.dim} data-testid="ai-limit-hint">
    Mỗi yêu cầu tạm trừ khoảng {limit.estimatedReserve != null ? formatQuota(limit.estimatedReserve, unit) : "—"}; tổ chức còn {formatQuota(limit.availableUnits, unit)}
    {limit.maxSources ? `; tối đa ${limit.maxSources} nguồn` : ""}.
    {!limit.canSubmit && " Không đủ cho một yêu cầu: cần nạp thêm hạn mức trước khi gửi."}
  </p>;
}

/** Characters left against the policy's `maxInputChars` (null when the policy gives no limit). */
export function CharCount({ value, max }: { value: string; max: number | null | undefined }) {
  if (!max) return null;
  const over = value.length > max;
  return <span className={styles.dim} data-testid="ai-char-count" data-over={over} aria-live="polite">{value.length}/{max} ký tự{over ? " (quá giới hạn)" : ""}</span>;
}
