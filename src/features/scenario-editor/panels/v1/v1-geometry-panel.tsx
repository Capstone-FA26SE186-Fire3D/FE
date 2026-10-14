"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import type { PreviewState } from "../../use-editor-preview";
import type { GeometryPin } from "../../v1/contract";
import type { GeometryReading } from "../../v1/geometry";
import { ifcToGlb, round3 } from "../../v1/matrix";
import { ReprocessGuide } from "../geometry-status";
import { NumberField } from "../fields";

const short = (value: string, n = 10) => `${value.slice(0, n)}…`;

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
    <div className="se-form-head"><div><h3>Mô hình và Geometry</h3><p>Đối tượng ghim vào một artifact Geometry đã được chấp nhận của revision và dùng tọa độ cục bộ của từng tầng.</p></div></div>

    {reading.kind === "reprocess" && <ReprocessGuide buildingId={buildingId} revisionId={revisionId} />}
    {reading.kind === "not-ready" && <Alert tone="warning" title="Chưa có Geometry được chấp nhận">Revision đang xử lý hoặc chưa có artifact đạt kiểm tra. Có thể đặt đối tượng sau khi Geometry sẵn sàng.</Alert>}
    {reading.kind === "invalid" && <Alert tone="danger" title="Geometry không đạt contract">{reading.reason}</Alert>}
    {preview.phase === "error" && <Alert tone="danger" title="Không lấy được thông tin mô hình">{preview.error}</Alert>}

    {info && <>
      <fieldset className="ops-fieldset">
        <legend>Artifact đã ghim {matches === true && <StatusBadge tone="success">Khớp</StatusBadge>}{matches === false && <StatusBadge tone="warning">Khác bản hiện tại</StatusBadge>}{matches === null && <StatusBadge tone="danger">Chưa ghim</StatusBadge>}</legend>
        <dl className="se-facts" data-testid="geometry-facts">
          <div><dt>Hiện tại</dt><dd><code title={info.artifactId}>{short(info.artifactId, 13)}</code> · SHA-256 <code title={info.sha256Hash}>{short(info.sha256Hash, 12)}</code></dd></div>
          <div><dt>Bản nháp ghim</dt><dd>{pin ? <><code title={pin.artifactId}>{short(pin.artifactId, 13)}</code> · SHA-256 <code title={pin.sha256Hash}>{short(pin.sha256Hash, 12)}</code></> : "Chưa ghim"}</dd></div>
          <div><dt>Hệ tọa độ</dt><dd>mét · Y hướng lên · tay phải</dd></div>
          {modelSummary && <div><dt>Mô hình</dt><dd data-testid="model-summary">{modelSummary}</dd></div>}
        </dl>
        {matches !== true && <Alert tone="warning" title={pin ? "Geometry của revision đã đổi sau khi ghim" : "Bản nháp chưa ghim Geometry"}>
          <div className="ops-stack">
            <span>{pin ? "Tầng và cấu kiện neo có thể đã khác. Ghim lại rồi chạy Kiểm tra để máy chủ xác nhận từng đối tượng." : "Ghim artifact hiện tại để máy chủ kiểm tra được tầng và neo."}</span>
            <div><Button type="button" size="sm" variant="secondary" data-testid="repin-geometry" onClick={() => onRepin({ artifactId: info.artifactId, sha256Hash: info.sha256Hash })}>{pin ? "Ghim lại artifact hiện tại" : "Ghim artifact hiện tại"}</Button></div>
          </div>
        </Alert>}
      </fieldset>

      <fieldset className="ops-fieldset">
        <legend>Tầng ({info.floors.length})</legend>
        <ul className="se-floors" data-testid="floor-list">
          {[...info.floors].sort((a, b) => a.elevationMeters - b.elevationMeters).map((floor) => <li key={floor.id}><strong>{floor.name}</strong><code>{floor.id}</code><span>{round3(floor.elevationMeters)} m</span></li>)}
        </ul>
        <p className="ops-field-hint">{info.semantic.length} cấu kiện trong ánh xạ ngữ nghĩa dùng làm neo.</p>
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
