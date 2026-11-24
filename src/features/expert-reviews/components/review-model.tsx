"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { describeApiError } from "@/api/describe-error";
import { useAsyncData } from "@/api/use-async-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table } from "@/components/ui/table";
import { capabilityLabel } from "@/configs/capability-labels";
import "@/features/scenario-editor/panels/editor.css";
import type { ModelRequest } from "@/features/scenario-editor/scene/editor-viewport";
import type { FloorInfo } from "@/features/scenario-editor/scene/preview-model";
import type { MarkerInput } from "@/features/scenario-editor/scene/scene-controller";
import { isObject } from "@/features/scenario-editor/store/json";
import { KIND_META } from "@/features/scenario-editor/v1/contract";
import { parseGeometry } from "@/features/scenario-editor/v1/geometry";
import { applyMatrix, isUnitQuaternion, localToGlb } from "@/features/scenario-editor/v1/matrix";
import { categoryOf, itemsToObjects, type InfrastructureCategory } from "@/features/scenario-editor/v1/scope";
import { readObjects, type ObjectView } from "@/features/scenario-editor/v1/state";

import { expertReviewsApi, type ExpertReviewDetail } from "../api";

const EditorViewport = dynamic(() => import("@/features/scenario-editor/scene/editor-viewport"), { ssr: false, loading: () => <div className="se-viewport" aria-busy="true"><Skeleton style={{ position: "absolute", inset: 0, borderRadius: 0 }} /></div> });

const ORIGIN = { x: 0, y: 0, z: 0 };
const noop = () => undefined;
const CATEGORY_LABEL: Record<InfrastructureCategory, string> = { Exit: "Lối thoát nạn", AssemblyPoint: "Điểm tập kết", Equipment: "Thiết bị cố định", WaterSource: "Nguồn nước" };

/** The objects under review: the frozen scenario document, or the items of an infrastructure version. */
export function reviewObjects(detail: ExpertReviewDetail): ObjectView[] {
  const content = isObject(detail.content) ? detail.content : {};
  return detail.review.kind === "Infrastructure" ? readObjects({ objects: itemsToObjects(content.items) }) : readObjects(content);
}

/** What one object is, in the words of the review: its infrastructure category, else its scenario kind. */
function objectType(object: ObjectView): string {
  const category = categoryOf(object.kind, object.capability?.id);
  return category ? CATEGORY_LABEL[category] : object.kind ? KIND_META[object.kind].label : "Không rõ";
}

/**
 * The reviewed content on the building's 3D model, read-only: every object is a marker (nothing can be selected, moved
 * or placed), with a floor filter and the same list as a table for readers who cannot use the 3D view.
 */
export function ReviewModel({ accessToken, detail }: { accessToken: string; detail: ExpertReviewDetail }) {
  const reviewId = detail.review.reviewId;
  const preview = useAsyncData(`expert-preview:${reviewId}`, (signal) => expertReviewsApi.preview(accessToken, reviewId, signal));
  const [floorChoice, setFloorChoice] = useState<string | null>(null);
  const reading = useMemo(() => parseGeometry(preview.data), [preview.data]);
  const geometry = reading.kind === "valid" ? reading.info : null;
  const objects = useMemo(() => reviewObjects(detail), [detail]);
  const floors = useMemo<FloorInfo[]>(() => (geometry?.floors ?? []).map((floor) => ({ key: floor.id, name: floor.name, elevation: applyMatrix(floor.transform, ORIGIN).y })).sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0)), [geometry]);
  const markers = useMemo<MarkerInput[]>(() => objects.flatMap((object): MarkerInput[] => {
    const floor = geometry?.floors.find((item) => item.id === object.floorId);
    if (!floor || !object.kind) return [];
    return [{ kind: "review", index: object.index, variant: object.kind, layer: object.kind, position: localToGlb(floor.transform, object.position), quaternion: isUnitQuaternion(object.rotation, 0.5) ? object.rotation : undefined }];
  }), [objects, geometry]);
  const model: ModelRequest | null = preview.data?.downloadUrl && geometry
    ? { key: `${geometry.artifactId}:${preview.data.expiresAt ?? ""}`, url: preview.data.downloadUrl, expiresAt: preview.data.expiresAt, coordinateTransform: geometry.coordinateTransform, floors, semanticMapping: {}, applyTransform: false }
    : null;
  const floorName = (id: string) => geometry?.floors.find((floor) => floor.id === id)?.name ?? "—";
  const listed = floorChoice ? objects.filter((object) => object.floorId === floorChoice) : objects;

  return <Panel title="Vị trí trên mô hình 3D" description="Chỉ xem: kéo để xoay, cuộn để phóng to. Chọn tầng để xem từng tầng." bodyClassName="ops-stack" data-testid="review-model">
    {preview.error !== undefined && !preview.data
      ? <Alert tone="warning" title="Chưa mở được mô hình 3D" action={<Button size="sm" variant="secondary" className="mt-3" onClick={preview.reload}>Thử lại</Button>}>{describeApiError(preview.error, "Hãy thử lại sau.")} Bạn vẫn xem được danh sách bên dưới.</Alert>
      : preview.data && !model
        ? <Alert tone="warning" title="Mô hình 3D của bản IFC này chưa sẵn sàng">Bạn vẫn xem được danh sách bên dưới.</Alert>
        : <>
          {floors.length > 1 && <ul className="se-chips" role="radiogroup" aria-label="Chọn tầng">
            <li role="none"><button type="button" role="radio" aria-checked={floorChoice === null} className="se-chip" onClick={() => setFloorChoice(null)}>Tất cả</button></li>
            {floors.map((floor) => <li role="none" key={floor.key}><button type="button" role="radio" aria-checked={floorChoice === floor.key} className="se-chip" onClick={() => setFloorChoice(floor.key)}>{floor.name}</button></li>)}
          </ul>}
          <div style={{ display: "flex", height: 420 }}>
            <EditorViewport markers={markers} selection={null} tool="select" placeKind="" gizmoEnabled={false} model={model} floors={floors} activeFloor={floorChoice} showModel layerVisibility={{}}
              onSelect={noop} onPlace={noop} onTransform={noop} onModelPick={noop} onModelStatus={noop} onUrlExpired={preview.reload} />
          </div>
        </>}
    {listed.length === 0
      ? <p className="rev-note">{objects.length === 0 ? "Nội dung này không có đối tượng nào." : "Tầng này không có đối tượng nào."}</p>
      : <Table caption="Các đối tượng cần thẩm định">
        <thead><tr><th>Loại</th><th>Tên</th><th>Tầng</th></tr></thead>
        <tbody>{listed.map((object) => <tr key={object.index} data-testid="review-object">
          <td className="ops-cell-primary">{objectType(object)}</td>
          <td>{object.label || (object.capability ? capabilityLabel(object.capability.id) : "—")}</td>
          <td>{floorName(object.floorId)}</td>
        </tr>)}</tbody>
      </Table>}
  </Panel>;
}
