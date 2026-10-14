"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, type ReactNode } from "react";

import { ApiError } from "@/api/types/common";
import { usePolling } from "@/api/use-polling";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";

import { adminAiApi, orgAiApi } from "../api";
import { aiErrorText, isInFlight } from "../labels";
import type { AiRequest } from "../types";
import styles from "../org-ai.module.css";
import { RequestView } from "./request-view";

/**
 * A request followed by id: the server is the only source of truth (`GET /api/ai/requests/{id}`), so a reload, another
 * tab or a recovered lost response all end up here. Polls only while the service may still change it (Queued/Running; for
 * the admin also a NeedsReconcile that has a reconcile scheduled), backs off on errors, honors Retry-After and pauses while
 * the tab is hidden (`usePolling`). An answer for another id than the one shown is never displayed.
 */
export function RequestPanel({ accessToken, requestId, admin, onApply, renderExtra }: {
  accessToken: string;
  requestId: string;
  admin?: boolean;
  onApply?: (request: AiRequest) => void;
  renderExtra?: (request: AiRequest, refresh: () => void) => ReactNode;
}) {
  const fetcher = useCallback((signal: AbortSignal) => (admin ? adminAiApi.getRequest(accessToken, requestId, signal) : orgAiApi.getRequest(accessToken, requestId, signal)), [accessToken, admin, requestId]);
  const isDone = useCallback((request: AiRequest) => (admin ? !(isInFlight(request.status) || (request.status === "NeedsReconcile" && Boolean(request.reconcileRequestedAt))) : !isInFlight(request.status)), [admin]);
  const polling = usePolling<AiRequest>({ fetcher, isDone, resetKey: `${admin ? "admin" : "org"}:${requestId}` });
  const request = polling.data?.requestId === requestId ? polling.data : undefined;
  const gone = polling.error instanceof ApiError && (polling.error.status === 404 || polling.error.status === 403 || polling.error.status === 401);

  return <div className={styles.stack} data-testid="ai-request-panel" aria-busy={polling.polling && !request}>
    {!request && !polling.error && <SkeletonRows rows={4} label="Đang tải yêu cầu AI…" />}
    {polling.error !== undefined && <Alert tone={request ? "warning" : "danger"} title={request ? "Chưa cập nhật được, đang hiển thị dữ liệu đã tải" : gone ? "Không mở được yêu cầu này" : "Không tải được yêu cầu"}
      action={gone ? undefined : <Button size="sm" variant="secondary" className="mt-3" onClick={polling.refresh}>Thử lại ngay</Button>}>
      {aiErrorText(polling.error, "Hãy kiểm tra kết nối. Trang tự thử lại.")}
    </Alert>}
    {request && <RequestView request={request} admin={admin} onApply={onApply} extra={renderExtra?.(request, polling.refresh)} />}
    {request && <div className="ops-actions">
      <Button type="button" size="sm" variant="quiet" onClick={polling.refresh}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>
      <span className={styles.dim} role="status">{polling.polling ? "Đang theo dõi, tự cập nhật…" : "Đã dừng theo dõi (trạng thái không còn tự đổi)."}</span>
    </div>}
  </div>;
}
