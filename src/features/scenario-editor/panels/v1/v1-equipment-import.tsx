"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ApiError } from "@/api/types/common";
import { describeApiError } from "@/api/describe-error";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { routes } from "@/configs/routes";
import { buildingsApi } from "@/features/buildings/api";

import type { JsonObject } from "../../store/json";
import type { RuntimeOption } from "../../v1/catalog";
import type { V1Command, V1Selection } from "../../v1/commands";
import { importEquipmentCommand, planEquipmentImport, SKIP_LABEL, type ImportRow } from "../../v1/equipment-import";
import type { GeometryInfo } from "../../v1/geometry";

const fmt = (value: number) => (Math.round(value * 100) / 100).toString();

function where(row: ImportRow, geometry: GeometryInfo | null) {
  const position = row.candidate.position ?? [];
  const floorId = row.status === "add" ? row.floorId : row.candidate.floorId;
  const floor = floorId ? geometry?.floors.find((item) => item.id === floorId)?.name ?? floorId : "?";
  return `${floor} · ${position.length === 3 ? position.map((value) => (typeof value === "number" ? fmt(value) : "?")).join(", ") : "?"}`;
}

/**
 * "Thêm thiết bị đã xác nhận": reads the revision's equipment decisions, previews which become Equipment objects and why the
 * others are skipped, and adds them only after confirmation as ONE undoable command. Nothing is saved or validated here.
 */
export function V1EquipmentImport({ accessToken, buildingId, revisionId, draft, runtime, runtimeVersion, geometry, onApply, onClose }: {
  accessToken: string;
  buildingId: string;
  revisionId: string;
  draft: JsonObject;
  runtime: RuntimeOption | undefined;
  runtimeVersion: string | undefined;
  geometry: GeometryInfo | null;
  onApply: (build: (draft: JsonObject, id: number, selection: V1Selection, now: number) => V1Command | null) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const view = useAsyncData(`editor-equipment:${revisionId}`, (signal) => buildingsApi.getEquipmentCandidates(accessToken, revisionId, signal), true, { keepPrevious: false });
  const data = view.data?.data;
  const plan = useMemo(() => (data ? planEquipmentImport({ draft, candidates: data.items, runtime, geometry }) : null), [data, draft, runtime, geometry]);
  const toAdd = plan ? plan.rows.filter((row): row is Extract<ImportRow, { status: "add" }> => row.status === "add") : [];
  const skipped = plan ? plan.rows.filter((row) => row.status === "skip" && row.reason !== "not-decided" && row.reason !== "rejected") : [];
  const undecided = plan ? plan.rows.filter((row) => row.status === "skip" && (row.reason === "not-decided" || row.reason === "rejected")).length : 0;
  const needParameters = toAdd.filter((row) => row.requiredParameters.length > 0).length;
  const unavailable = view.error instanceof ApiError && view.error.code === "EQUIPMENT_CANDIDATES_UNAVAILABLE";
  const decideHref = `${routes.workspaceBuildings}/${buildingId}`;

  const confirm = () => {
    if (toAdd.length === 0) return;
    const objects = toAdd.map((row) => row.object);
    onApply((current, id, selection, now) => {
      // Re-plan against the draft at apply time so an object added meanwhile is not duplicated.
      const fresh = data ? planEquipmentImport({ draft: current, candidates: data.items, runtime, geometry }) : null;
      const added = fresh ? fresh.rows.flatMap((row) => (row.status === "add" ? [row.object] : [])) : objects;
      return importEquipmentCommand(current, id, added, now, selection);
    });
    toast.notify({ tone: "success", title: `Đã thêm ${toAdd.length} thiết bị vào bản nháp`, description: needParameters > 0 ? "Chưa lưu. Hãy điền tham số bắt buộc của từng thiết bị rồi bấm Lưu." : "Chưa lưu. Hoàn tác bằng nút Hoàn tác hoặc Ctrl+Z." });
    onClose();
  };

  return <Modal open onOpenChange={(open) => { if (!open) onClose(); }} className="se-import-modal" title="Thêm thiết bị đã xác nhận"
    description="Thiết bị phát hiện từ IFC đã được xác nhận hoặc đổi loại trở thành đối tượng Thiết bị: neo vào cấu kiện IFC, khả năng theo loại đã chọn, vị trí theo tầng. Chưa lưu, hoàn tác được."
    footer={<><Button type="button" variant="quiet" onClick={onClose}>Đóng</Button>
      <Button type="button" onClick={confirm} disabled={toAdd.length === 0} data-testid="equipment-import-confirm">Thêm {toAdd.length} thiết bị (chưa lưu)</Button></>}>
    <div className="ops-stack" data-testid="equipment-import">
      {view.loading && !data && <SkeletonRows rows={3} label="Đang tải thiết bị đã xác nhận…" />}
      {unavailable && <Alert tone="info" title="Bản IFC chưa có mô hình 3D đạt kiểm tra">Danh sách thiết bị có sau khi xử lý IFC xong và mô hình qua kiểm tra tự động.</Alert>}
      {view.error !== undefined && !unavailable && <Alert tone="danger" title="Không tải được thiết bị" action={<Button type="button" size="sm" variant="secondary" className="mt-3" onClick={view.reload}>Thử lại</Button>}>{describeApiError(view.error, "Hãy thử lại sau.")}</Alert>}
      {data && !data.metadataAvailable && <Alert tone="info" title="Chưa có dữ liệu thiết bị">Bản IFC này không có thông tin thiết bị. Đặt thiết bị bằng tay trong trình soạn thảo.</Alert>}
      {plan?.blocked === "geometry" && <Alert tone="warning" title="Cần mô hình 3D hợp lệ">Thiết bị được neo vào cấu kiện IFC và đặt theo tầng của mô hình 3D; hãy chờ mô hình sẵn sàng.</Alert>}
      {plan?.blocked === "runtime" && <Alert tone="warning" title={runtimeVersion ? `Không tìm thấy phiên bản ứng dụng ${runtimeVersion}` : "Chọn phiên bản ứng dụng trước"}>Khả năng và phiên bản của thiết bị lấy theo phiên bản ứng dụng của bản nháp. Chọn phiên bản ở tab “Kịch bản”.</Alert>}
      {plan && !plan.blocked && data?.metadataAvailable && <>
        {toAdd.length === 0 && <div data-testid="equipment-import-empty"><Alert tone="info" title="Không có thiết bị mới để thêm">
          {data.items.length === 0 ? "IFC không có thiết bị nào." : skipped.length > 0 ? "Các thiết bị đã xác nhận đều đã có trong bản nháp hoặc không thêm được (xem lý do bên dưới)." : "Chưa có thiết bị nào được xác nhận hoặc đổi loại."}
          {" "}<Link href={decideHref}>Xác nhận thiết bị ở trang công trình</Link>.
        </Alert></div>}
        {needParameters > 0 && <Alert tone="warning" title="Cần điền tham số bắt buộc">{needParameters} thiết bị có tham số bắt buộc (không có giá trị mặc định). Sau khi thêm, chọn từng thiết bị và điền tham số trước khi lưu.</Alert>}
        {toAdd.length > 0 && <h3 className="se-import-title">Sẽ thêm {toAdd.length} thiết bị</h3>}
        {toAdd.length > 0 && <Table caption="Sẽ thêm vào bản nháp" data-testid="equipment-import-add">
          <thead><tr><th>Khả năng</th><th>Cấu kiện IFC</th><th>Tầng · vị trí (m)</th><th>Tham số bắt buộc</th></tr></thead>
          <tbody>{toAdd.map((row) => <tr key={row.candidate.id} data-testid="equipment-import-row">
            <td>{row.catalogKey}{row.candidate.decision?.decision === "Retyped" && <> <StatusBadge tone="info">Đã đổi loại</StatusBadge></>}</td>
            <td><span className="ops-mono">{row.candidate.ifcGlobalId}</span>{row.candidate.ifcClass ? ` · ${row.candidate.ifcClass}` : ""}</td>
            <td>{where(row, geometry)}</td>
            <td>{row.requiredParameters.length > 0 ? <StatusBadge tone="warning">Cần điền: {row.requiredParameters.join(", ")}</StatusBadge> : "—"}</td>
          </tr>)}</tbody>
        </Table>}
        {skipped.length > 0 && <h3 className="se-import-title">Không thêm ({skipped.length})</h3>}
        {skipped.length > 0 && <Table caption="Không thêm" data-testid="equipment-import-skip">
          <thead><tr><th>Khả năng</th><th>Cấu kiện IFC</th><th>Lý do</th></tr></thead>
          <tbody>{skipped.map((row) => <tr key={row.candidate.id} data-testid="equipment-import-skip-row">
            <td>{row.catalogKey ?? row.candidate.catalogKey}</td>
            <td className="ops-mono">{row.candidate.ifcGlobalId}</td>
            <td>{row.status === "skip" ? SKIP_LABEL[row.reason] : ""}</td>
          </tr>)}</tbody>
        </Table>}
        {undecided > 0 && <p className="se-note" data-testid="equipment-import-undecided">{undecided} thiết bị chưa được xác nhận hoặc đã bị loại bỏ nên không được thêm. <Link href={decideHref}>Xem ở trang công trình</Link>.</p>}
      </>}
    </div>
  </Modal>;
}
