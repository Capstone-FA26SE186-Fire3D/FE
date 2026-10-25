"use client";

import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/configs/routes";
import { isUnsettledRevision, revisionLabel } from "@/features/buildings/pipeline";

import { SupportCode } from "@/components/ui/support-code";

import type { FloorsReading } from "../v1/geometry";

export const ifcTabHref = (buildingId: string, revisionId: string) => `${routes.workspaceBuildings}/${buildingId}?tab=ifc&revision=${encodeURIComponent(revisionId)}`;

/** Legacy Geometry metadata: no coordinates and no download URL are returned, so nothing is drawn or pinned. */
export function ReprocessGuide({ buildingId, revisionId }: { buildingId: string; revisionId: string }) {
  return <Alert tone="warning" title="Cần xử lý lại IFC để soạn trên mô hình 3D">
    <div className="ops-stack" data-testid="reprocess-guide">
      <p style={{ margin: 0 }}>Mô hình của bản IFC này được dựng bằng cách xử lý cũ, chưa có tọa độ cho trình soạn nên không hiển thị được và trình soạn không đoán tọa độ.</p>
      <p style={{ margin: 0 }}>Bản IFC đã xử lý xong không chạy lại được, nên hãy tải lên lại tệp IFC ở tab IFC rồi soạn trên bản IFC mới. Trên bản IFC này không tạo được bản nháp mới và không đặt được đối tượng.</p>
      <div><Button asChild variant="secondary" size="sm"><Link href={ifcTabHref(buildingId, revisionId)} data-testid="reprocess-link">Mở tab IFC của công trình</Link></Button></div>
    </div>
  </Alert>;
}

/** Why a revision is not ready to author, with a link back to its IFC progress. Nothing for ReadyForScenario/ConfirmedForTraining. */
export function RevisionStatusNote({ status, buildingId, revisionId }: { status: string; buildingId: string; revisionId: string }) {
  if (status === "ReadyForScenario" || status === "ConfirmedForTraining") return null;
  const link = <Button asChild variant="secondary" size="sm"><Link href={ifcTabHref(buildingId, revisionId)} data-testid="revision-ifc-link">Mở tiến trình của bản IFC</Link></Button>;
  if (status === "NeedsFix") {
    return <div data-testid="revision-needs-fix"><Alert tone="warning" title="Bản IFC cần sửa trước khi soạn kịch bản" action={<div className="mt-3">{link}</div>}>
      Mô hình chưa qua kiểm tra tự động hoặc chưa có cửa thoát ra ngoài được xác nhận. Xem các vấn đề và cách xử lý ở tab IFC: chọn cửa thoát trong mục Thiết bị phát hiện từ IFC, hoặc sửa mô hình rồi tải lên IFC mới.
    </Alert></div>;
  }
  const label = revisionLabel(status).label;
  return <Alert tone={isUnsettledRevision(status) ? "info" : "warning"} title={`Bản IFC chưa sẵn sàng soạn kịch bản: ${label}`} action={<div className="mt-3">{link}</div>}>
    {isUnsettledRevision(status) ? "Mô hình đang được xử lý và kiểm tra tự động; quay lại khi tab IFC báo sẵn sàng." : "Xem trạng thái và hướng xử lý ở tab IFC của công trình."}
  </Alert>;
}

/** Status of `GET /api/revisions/{id}/floors` for a revision, as a short note with the next step. */
export function FloorsStatus({ reading, loading, error, reload, buildingId, revisionId }: { reading: FloorsReading | null; loading: boolean; error: unknown; reload: () => void; buildingId: string; revisionId: string }) {
  if (loading) return <div role="status" aria-label="Đang kiểm tra mô hình 3D"><Skeleton style={{ height: 36 }} /></div>;
  if (error || !reading) return <Alert tone="danger" title="Không đọc được mô hình 3D của bản IFC" action={<Button type="button" size="sm" variant="secondary" onClick={reload}>Thử lại</Button>} />;
  if (reading.kind === "reprocess") return <ReprocessGuide buildingId={buildingId} revisionId={revisionId} />;
  if (reading.kind === "not-ready") {
    return <Alert tone="warning" title="Bản IFC chưa có mô hình 3D đạt kiểm tra" action={<Button type="button" size="sm" variant="secondary" onClick={reload}>Kiểm tra lại</Button>}>
      Cần một lần xử lý thành công và đạt kiểm tra tự động trước khi tạo bản nháp. Xem tab IFC của công trình.
    </Alert>;
  }
  if (reading.kind === "invalid") return <Alert tone="danger" title="Mô hình 3D chưa đúng chuẩn của trình soạn">{reading.reason}</Alert>;
  return <Alert tone="success" title={`Mô hình 3D hợp lệ: ${reading.floors.length} tầng`}>
    Có thể đặt đối tượng theo từng tầng.
    <SupportCode id={reading.pin.artifactId} />
  </Alert>;
}
