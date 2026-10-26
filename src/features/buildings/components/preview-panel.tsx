"use client";

import { Box, Eraser, RefreshCw, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { usePolling } from "@/api/use-polling";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FloatingButtonGroup } from "@/components/ui/floating-button-group";
import { Skeleton } from "@/components/ui/skeleton";
import { buildingsApi } from "../api";
import { describeApiError, formatDateTime } from "../format";
import { hasRuntimePreview } from "../runtime-preview";

const RuntimePreviewViewer = dynamic(
  () => import("./runtime-preview-viewer").then((module) => module.RuntimePreviewViewer),
  { ssr: false, loading: () => <Skeleton style={{ height: 320 }} /> },
);

const POLL_MS = 5000;
const MAX_POLLS = 24; // ~2 minutes, like the editor preview; then a manual check

/**
 * Figma "IFC · Preview 3D": the GLB viewer fills the card, the artifact/expiry meta sits top-left, and the actions live in
 * a floating button group. The signed URL is short-lived (~5 min) and never cached: it is requested when the panel opens
 * and requested again when loading fails (most likely expired). `NotReady` is a normal 200 and is re-checked every 5s
 * for ~2 minutes; `ReprocessRequired` is final for this revision.
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

  const ready = Boolean(data && hasRuntimePreview(data));

  let body;
  if (loading) body = <Skeleton style={{ height: 320 }} />;
  else if (error !== undefined && !data) {
    body = <Alert tone="danger" title="Không tải được bản xem trước 3D" action={<Button size="sm" variant="secondary" className="mt-3" onClick={reload}>Thử lại</Button>}>{describeApiError(error, "Hãy thử lại sau.")}</Alert>;
  } else if (data && data.status === "NotReady") {
    body = <EmptyState icon={Box} title="Xem trước 3D chưa sẵn sàng" description={`Bản IFC này chưa có mô hình 3D đã xử lý và qua kiểm tra tự động. ${preview.polling ? "Đang tự kiểm tra lại mỗi 5 giây." : "Đã dừng tự kiểm tra; bấm Kiểm tra lại khi xử lý xong."} Bản xem trước không dùng tệp IFC trên máy bạn.`} action={<Button variant="secondary" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Kiểm tra lại</Button>} />;
  } else if (data && data.status === "ReprocessRequired") {
    body = <div data-testid="preview-reprocess"><Alert tone="warning" title="Mô hình được tạo bằng bản xử lý cũ"
      action={onUploadNew ? <Button size="sm" variant="secondary" className="mt-3" onClick={onUploadNew}><Upload size={14} aria-hidden="true" />Tải lên IFC mới</Button> : undefined}>
      Mô hình này được dựng bằng cách xử lý cũ nên không xem trước và không soạn kịch bản được. Bản IFC đã xử lý xong không chạy lại được, nên hãy tải lên lại tệp IFC để hệ thống dựng lại.
    </Alert></div>;
  } else if (data && hasRuntimePreview(data)) {
    body = <>
      <RuntimePreviewViewer key={data.downloadUrl} downloadUrl={data.downloadUrl} onLoadError={renewUrl} highlight={highlight} semanticMapping={data.semanticMapping} />
      {highlight && highlight.length > 0 && <p className="bd-preview-highlight" data-testid="preview-highlight-ids">Đang đánh dấu {highlight.length} cấu kiện</p>}
    </>;
  } else {
    body = <Alert tone="warning" title="Chưa mở được bản xem trước 3D">Hệ thống chưa gửi được liên kết tải mô hình. Hãy bấm Tải lại sau ít phút.</Alert>;
  }

  return <section id="revision-preview" className="bd-preview" aria-label="Xem trước mô hình 3D" data-ready={ready || undefined}>
    <div className="bd-preview-stage">
      {ready && data && <span className="bd-preview-meta">Mô hình 3D · liên kết hết hạn {formatDateTime(data.expiresAt)}</span>}
      {body}
      {ready && <FloatingButtonGroup label="Thao tác xem trước 3D" placement="bottom" onAction={(id) => { if (id === "reload") { autoRenewals.current = 0; reload(); } else if (id === "clear") onClearHighlight?.(); else if (id === "upload") onUploadNew?.(); }} items={[
        { id: "reload", label: "Tải lại mô hình", icon: RefreshCw },
        { id: "clear", label: "Bỏ đánh dấu cấu kiện", icon: Eraser, disabled: !highlight?.length },
        { id: "upload", label: "Tải IFC mới", icon: Upload, separator: true },
      ]} />}
    </div>
    <p className="ops-muted">Bản xem trước dùng mô hình 3D hệ thống dựng từ bản IFC đang chọn, không dùng tệp IFC trên máy bạn. Tự kiểm tra lại mỗi 5 giây khi chưa sẵn sàng; xem được mô hình chưa có nghĩa là đã được phép huấn luyện hay phát hành.{!ready && !loading && <> <Button size="sm" variant="quiet" onClick={() => { autoRenewals.current = 0; reload(); }}><RefreshCw size={14} aria-hidden="true" />Tải lại</Button></>}</p>
  </section>;
}
