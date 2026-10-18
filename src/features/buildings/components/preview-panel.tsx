"use client";

import { Box, RefreshCw, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { usePolling } from "@/api/use-polling";
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

const POLL_MS = 5000;
const MAX_POLLS = 24; // ~2 minutes, like the editor preview; then a manual check

/**
 * GLB preview of the selected revision. The signed URL is short-lived (~5 min) and never cached: it is requested
 * when the panel opens and requested again when loading fails (most likely expired). `NotReady` is a normal 200 and is
 * re-checked every 5s for ~2 minutes; `ReprocessRequired` is final for this revision.
 */
export function PreviewPanel({ accessToken, buildingId, revisionId, reloadKey, highlight, onClearHighlight, onUploadNew }: {
  accessToken: string;
  buildingId: string;
  revisionId: string;
  reloadKey: string;
  /** IFC GlobalIds to emphasize in the model (from a QA issue or an equipment candidate). */
  highlight?: string[];
  onClearHighlight?: () => void;
  onUploadNew?: () => void;
}) {
  const resetKey = `${buildingId}:${revisionId}:${reloadKey}`;
  const polls = useRef({ key: "", count: 0 });
  const preview = usePolling({
    resetKey,
    intervalMs: POLL_MS,
    fetcher: async (signal) => {
      const value = await buildingsApi.getPreview(accessToken, buildingId, revisionId, signal);
      if (polls.current.key !== resetKey) polls.current = { key: resetKey, count: 0 };
      if (value.status === "NotReady") polls.current.count += 1;
      return value;
    },
    isDone: (value) => value.status !== "NotReady" || polls.current.count >= MAX_POLLS,
  });
  const autoRenewals = useRef(0);
  const data = preview.data?.revisionId === revisionId ? preview.data : undefined;
  const { error } = preview;
  const loading = !data && error === undefined;
  const reload = () => {
    polls.current = { key: "", count: 0 };
    preview.refresh();
  };

  const renewUrl = () => {
    // One silent renewal per loaded URL; after that the viewer shows its own retry button.
    if (autoRenewals.current >= 1) return;
    autoRenewals.current += 1;
    reload();
  };

  let body;
  if (loading) body = <Skeleton style={{ height: 320 }} />;
  else if (error !== undefined && !data) {
    body = <Alert tone="danger" title="Không tải được thông tin preview" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{describeApiError(error, "Hãy thử lại sau.")}</Alert>;
  } else if (data && data.status === "NotReady") {
    body = <EmptyState icon={Box} title="Preview chưa sẵn sàng" description={`Revision này chưa có mô hình GLB đã qua xử lý và QA. ${preview.polling ? "Đang tự kiểm tra lại mỗi 5 giây." : "Đã dừng tự kiểm tra; bấm Kiểm tra lại khi worker xong."} Preview không dùng tệp IFC trên máy bạn thay thế.`} action={<Button variant="secondary" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Kiểm tra lại</Button>} />;
  } else if (data && data.status === "ReprocessRequired") {
    body = <div data-testid="preview-reprocess"><Alert tone="warning" title="Mô hình được tạo bằng bản xử lý cũ"
      action={onUploadNew ? <Button size="sm" variant="secondary" className="mt-3" onClick={onUploadNew}><Upload size={14} aria-hidden="true" />Tải lên IFC mới</Button> : undefined}>
      Máy chủ không trả liên kết tải hay tọa độ cho mô hình này nên không xem trước và không soạn kịch bản được. Revision đã xử lý xong không chạy lại được (chỉ job thất bại mới chạy lại), nên hãy tải lên lại tệp IFC để tạo revision mới.
    </Alert></div>;
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
