"use client";

import type { ReactNode } from "react";
import { ApiError } from "@/api";
import type { AsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function reportErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Khoảng thời gian không hợp lệ: dùng ngày theo UTC và tối đa 90 ngày.";
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    if (error.status === 403) return "Phiên hiện tại không có quyền xem báo cáo này.";
    if (error.status === 404) return "Không tìm thấy tổ chức hoặc tổ chức đã bị xóa.";
    if (error.status === 429) return error.retryAfterSeconds ? `Thao tác quá nhanh. Thử lại sau ${error.retryAfterSeconds} giây.` : "Thao tác quá nhanh. Hãy thử lại sau ít phút.";
  }
  return "Không tải được báo cáo. Hãy kiểm tra kết nối rồi thử lại.";
}

/**
 * Loading, error and stale states of one report. A failed reload keeps the last good data on screen with a warning, so an
 * error is never confused with "no data". A late response for an old period is dropped by `useAsyncData`.
 */
export function ReportShell<T>({ query, title, children }: { query: AsyncData<T>; title: string; children: (data: T) => ReactNode }) {
  const { data, error, loading, reload } = query;
  const failed = error !== undefined;
  const retry = <Button size="sm" variant="secondary" className="mt-3" onClick={reload} disabled={loading}>{loading ? "Đang tải…" : "Thử lại"}</Button>;
  return <>
    {failed && <Alert tone={data ? "warning" : "danger"} title={data ? `Không làm mới được ${title}` : `Không tải được ${title}`} action={retry}>{reportErrorText(error)}{data ? " Số liệu bên dưới là bản đã tải trước đó." : ""}</Alert>}
    {!data && loading && !failed && <div role="status" aria-live="polite" className="ops-grid ops-grid-4">
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Đang tải {title}…</span>
      {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} style={{ height: 92 }} />)}
    </div>}
    {data && <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 150ms", marginTop: failed ? 16 : 0 }} aria-busy={loading}>{children(data)}</div>}
  </>;
}
