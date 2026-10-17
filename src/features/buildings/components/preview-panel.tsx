"use client";

import { Box, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { buildingsApi } from "../api";
import { describeApiError, formatDateTime, shortHash } from "../format";
import { hasRuntimePreview } from "../runtime-preview";

const RuntimePreviewViewer = dynamic(
  () => import("./runtime-preview-viewer").then((module) => module.RuntimePreviewViewer),
  { ssr: false, loading: () => <Skeleton style={{ height: 320 }} /> },
);

/**
 * GLB preview of the selected revision. The signed URL is short-lived (~5 min) and never cached: it is requested
 * when the panel opens and requested again when loading fails (most likely expired). `NotReady` is a normal 200.
 */
export function PreviewPanel({ accessToken, buildingId, revisionId, reloadKey, highlight, onClearHighlight }: {
  accessToken: string;
  buildingId: string;
  revisionId: string;
  reloadKey: string;
  /** IFC GlobalIds to emphasize in the model (from a QA issue or an equipment candidate). */
  highlight?: string[];
  onClearHighlight?: () => void;
}) {
  const preview = useAsyncData(
    `preview:${buildingId}:${revisionId}:${reloadKey}`,
    (signal) => buildingsApi.getPreview(accessToken, buildingId, revisionId, signal),
  );
  const autoRenewals = useRef(0);
  const { data, error, loading, reload } = preview;

  const renewUrl = () => {
    // One silent renewal per loaded URL; after that the viewer shows its own retry button.
    if (autoRenewals.current >= 1) return;
    autoRenewals.current += 1;
    reload();
  };

  let body;
  if (loading && !data) body = <Skeleton style={{ height: 320 }} />;
  else if (error !== undefined && !data) {
    body = <Alert tone="danger" title="Không tải được thông tin preview" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{describeApiError(error, "Hãy thử lại sau.")}</Alert>;
  } else if (data && data.status === "NotReady") {
    body = <EmptyState icon={Box} title="Preview chưa sẵn sàng" description="Revision này chưa có mô hình GLB đã qua xử lý. Hãy chạy xử lý IFC và chờ worker hoàn tất; preview không dùng tệp IFC trên máy bạn thay thế." action={<Button variant="secondary" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Kiểm tra lại</Button>} />;
  } else if (data && hasRuntimePreview(data)) {
    body = <>
      <RuntimePreviewViewer key={data.downloadUrl} downloadUrl={data.downloadUrl} onLoadError={renewUrl} highlight={highlight} semanticMapping={data.semanticMapping} />
      {highlight && highlight.length > 0 && <p className="ops-muted" style={{ marginTop: 8 }} data-testid="preview-highlight-ids">Đang đánh dấu: <span className="ops-mono">{highlight.slice(0, 5).join(", ")}{highlight.length > 5 ? ` và ${highlight.length - 5} cấu kiện khác` : ""}</span>{onClearHighlight && <> · <Button size="sm" variant="quiet" onClick={onClearHighlight}>Bỏ đánh dấu</Button></>}</p>}
      <p className="ops-muted" style={{ marginTop: 10 }}>
        Artifact <span className="ops-mono">{shortHash(data.artifactId, 8)}</span> · SHA-256 <span className="ops-mono" title={data.sha256Hash}>{shortHash(data.sha256Hash, 16)}</span> · liên kết hết hạn {formatDateTime(data.expiresAt)}. Preview kỹ thuật không đồng nghĩa với việc cho phép đào tạo hoặc phát hành.
      </p>
    </>;
  } else {
    body = <Alert tone="warning" title="Preview thiếu dữ liệu">Máy chủ trả trạng thái {data?.status ?? "không rõ"} nhưng không kèm liên kết tải hợp lệ.</Alert>;
  }

  return <Panel id="revision-preview" title="Preview mô hình 3D" description="Mô hình GLB do worker tạo cho revision đang chọn." actions={<Button size="sm" variant="quiet" onClick={() => { autoRenewals.current = 0; reload(); }} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button>}>
    {body}
  </Panel>;
}
