"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { SupportCode } from "@/components/ui/support-code";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import type { PreviewState } from "../../use-editor-preview";
import type { GeometryPin } from "../../v1/contract";
import type { GeometryReading } from "../../v1/geometry";
import { ifcToGlb, round3 } from "../../v1/matrix";
import { ReprocessGuide } from "../geometry-status";
import { NumberField } from "../fields";


/**
 * Geometry the draft is pinned to and the floors/transform the editor works with. The IFC → GLB `coordinateTransform` is
 * shown and can be checked with a point, but it is never applied to scenario objects: objects are floor-local.
 */
export function V1GeometryPanel({ reading, preview, pin, buildingId, revisionId, onRepin, modelSummary }: {
  reading: GeometryReading;
  preview: PreviewState;
  pin: GeometryPin | null;
  buildingId: string;
  revisionId: string;
  onRepin: (pin: GeometryPin) => void;
  modelSummary: string | null;
}) {
  const [ifc, setIfc] = useState<{ x?: number; y?: number; z?: number }>({});
  const info = reading.kind === "valid" ? reading.info : null;
  const matches = info && pin ? info.artifactId === pin.artifactId && info.sha256Hash === pin.sha256Hash : null;
  const glb = info && ifc.x !== undefined && ifc.y !== undefined && ifc.z !== undefined ? ifcToGlb(info.coordinateTransform, { x: ifc.x, y: ifc.y, z: ifc.z }) : null;

  return <div className="se-form" data-testid="geometry-panel">
    <div className="se-form-head"><div><h3>Mô hình 3D</h3><p>Bản nháp được gắn với một mô hình 3D đã đạt kiểm tra của bản IFC; đối tượng dùng tọa độ của từng tầng.</p></div></div>

    {reading.kind === "reprocess" && <ReprocessGuide buildingId={buildingId} revisionId={revisionId} />}
    {reading.kind === "not-ready" && <Alert tone="warning" title="Chưa có mô hình 3D đạt kiểm tra">Bản IFC đang được xử lý hoặc chưa qua kiểm tra tự động. Có thể đặt đối tượng sau khi mô hình 3D sẵn sàng.</Alert>}
    {reading.kind === "invalid" && <Alert tone="danger" title="Mô hình 3D chưa đúng chuẩn của trình soạn">{reading.reason}</Alert>}
    {preview.phase === "error" && <Alert tone="danger" title="Không lấy được thông tin mô hình">{preview.error}</Alert>}

    {info && <>
      <fieldset className="ops-fieldset">
        <legend>Mô hình đã gắn {matches === true && <StatusBadge tone="success">Khớp</StatusBadge>}{matches === false && <StatusBadge tone="warning">Khác bản hiện tại</StatusBadge>}{matches === null && <StatusBadge tone="danger">Chưa ghim</StatusBadge>}</legend>
        <dl className="se-facts" data-testid="geometry-facts">
          <div><dt>Mô hình mới nhất</dt><dd>Đã có<SupportCode id={info.artifactId} /></dd></div>
          <div><dt>Bản nháp đang gắn</dt><dd>{pin ? <>{matches ? "Mô hình mới nhất" : "Một mô hình cũ hơn"}<SupportCode id={pin.artifactId} /></> : "Chưa gắn"}</dd></div>
          <div><dt>Hệ tọa độ</dt><dd>mét · Y hướng lên · tay phải</dd></div>
          {modelSummary && <div><dt>Mô hình</dt><dd data-testid="model-summary">{modelSummary}</dd></div>}
        </dl>
        {matches !== true && <Alert tone="warning" title={pin ? "Mô hình 3D của bản IFC đã đổi sau khi gắn" : "Bản nháp chưa gắn mô hình 3D"}>
          <div className="ops-stack">
            <span>{pin ? "Tầng và cấu kiện neo có thể đã khác. Gắn lại rồi bấm Kiểm tra để hệ thống xác nhận từng đối tượng." : "Gắn mô hình mới nhất để hệ thống kiểm tra được tầng và neo."}</span>
            <div><Button type="button" size="sm" variant="secondary" data-testid="repin-geometry" onClick={() => onRepin({ artifactId: info.artifactId, sha256Hash: info.sha256Hash })}>{pin ? "Gắn lại mô hình mới nhất" : "Gắn mô hình mới nhất"}</Button></div>
          </div>
        </Alert>}
      </fieldset>

      <fieldset className="ops-fieldset">
        <legend>Tầng ({info.floors.length})</legend>
        <ul className="se-floors" data-testid="floor-list">
          {[...info.floors].sort((a, b) => a.elevationMeters - b.elevationMeters).map((floor) => <li key={floor.id}><strong>{floor.name}</strong><span>{round3(floor.elevationMeters)} m</span></li>)}
        </ul>
        <p className="ops-field-hint">{info.semantic.length} cấu kiện có thể dùng làm neo.</p>
      </fieldset>

      <fieldset className="ops-fieldset">
        <legend>Kiểm tra tọa độ IFC → GLB</legend>
        <p className="ops-field-hint">Biến đổi này đã gồm đổi đơn vị và gốc tọa độ. Chỉ để đối chiếu; không áp dụng lên đối tượng.</p>
        <div className="se-coord-grid">
          {(["x", "y", "z"] as const).map((axis) => <NumberField key={axis} label={`IFC ${axis.toUpperCase()}`} data-testid={`ifc-${axis}`} value={ifc[axis]} onCommit={(value) => setIfc((current) => ({ ...current, [axis]: value }))} />)}
        </div>
        <p className="ops-field-hint" data-testid="ifc-result">{glb ? `GLB: ${round3(glb.x)}, ${round3(glb.y)}, ${round3(glb.z)} m` : "Nhập đủ ba tọa độ IFC để xem điểm tương ứng trong GLB."}</p>
      </fieldset>
    </>}
  </div>;
}
