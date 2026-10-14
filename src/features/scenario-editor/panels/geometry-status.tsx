"use client";

import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/configs/routes";

import type { FloorsReading } from "../v1/geometry";

export const ifcTabHref = (buildingId: string, revisionId: string) => `${routes.workspaceBuildings}/${buildingId}?tab=ifc&revision=${encodeURIComponent(revisionId)}`;

/** Legacy Geometry metadata: no coordinates and no download URL are returned, so nothing is drawn or pinned. */
export function ReprocessGuide({ buildingId, revisionId }: { buildingId: string; revisionId: string }) {
  return <Alert tone="warning" title="Cần xử lý lại IFC để dùng editor fet3d.editor/1">
    <div className="ops-stack" data-testid="reprocess-guide">
      <p style={{ margin: 0 }}>Mô hình của revision được tạo bằng bản xử lý cũ, chưa có tọa độ theo contract nên máy chủ không trả tọa độ hay liên kết tải. Editor không dựng mô hình và không đoán tọa độ.</p>
      <p style={{ margin: 0 }}>Chạy lại xử lý Geometry cho revision ở tab IFC rồi tải lại trang. Tạo bản nháp mới và đặt đối tượng bị khóa cho đến lúc đó.</p>
      <div><Button asChild variant="secondary" size="sm"><Link href={ifcTabHref(buildingId, revisionId)} data-testid="reprocess-link">Mở tab IFC của công trình</Link></Button></div>
    </div>
  </Alert>;
}

/** Status of `GET /api/revisions/{id}/floors` for a revision, as a short note with the next step. */
export function FloorsStatus({ reading, loading, error, reload, buildingId, revisionId }: { reading: FloorsReading | null; loading: boolean; error: unknown; reload: () => void; buildingId: string; revisionId: string }) {
  if (loading) return <div role="status" aria-label="Đang kiểm tra Geometry"><Skeleton style={{ height: 36 }} /></div>;
  if (error || !reading) return <Alert tone="danger" title="Không đọc được Geometry của revision" action={<Button type="button" size="sm" variant="secondary" onClick={reload}>Thử lại</Button>} />;
  if (reading.kind === "reprocess") return <ReprocessGuide buildingId={buildingId} revisionId={revisionId} />;
  if (reading.kind === "not-ready") {
    return <Alert tone="warning" title="Revision chưa có Geometry được chấp nhận" action={<Button type="button" size="sm" variant="secondary" onClick={reload}>Kiểm tra lại</Button>}>
      Cần một lần xử lý Geometry thành công và đạt kiểm tra trước khi tạo bản nháp. Xem tab IFC của công trình.
    </Alert>;
  }
  if (reading.kind === "invalid") return <Alert tone="danger" title="Geometry không đạt contract">{reading.reason}</Alert>;
  return <Alert tone="success" title={`Geometry hợp lệ: ${reading.floors.length} tầng`}>
    Artifact {reading.pin.artifactId.slice(0, 8)}… · SHA-256 {reading.pin.sha256Hash.slice(0, 12)}…
  </Alert>;
}
