"use client";

import { ApiError } from "@/api/types/common";
import { useAsyncData } from "@/api/use-async-data";

/** What a prototype screen pretends the backend is doing, so loading/empty/error states can be reviewed. */
export type SampleMode = "normal" | "loading" | "empty" | "error";

export const sampleModeLabels: Record<SampleMode, string> = {
  normal: "Bình thường",
  loading: "Đang tải (không kết thúc)",
  empty: "Dữ liệu trống",
  error: "Lỗi tải dữ liệu",
};

const LATENCY_MS = 280;

export const sampleDelay = (signal?: AbortSignal, ms = LATENCY_MS) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

/**
 * Same contract as `useAsyncData`, but fed by a local producer. `key` must change when the underlying
 * sample store changes. In "loading" mode the request never settles; in "error" mode it fails with a 503.
 */
export function useSampleQuery<T>(key: string, mode: SampleMode, produce: (mode: SampleMode) => T | Promise<T>) {
  return useAsyncData<T>(`${key}:${mode}`, async (signal) => {
    await sampleDelay(signal);
    if (mode === "loading") return new Promise<T>(() => undefined);
    if (mode === "error") throw new ApiError("Dịch vụ mẫu đang mô phỏng lỗi.", 503, undefined, undefined, "SAMPLE_UNAVAILABLE");
    return (await produce(mode)) as T;
  });
}
