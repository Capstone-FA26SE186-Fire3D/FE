"use client";

import { Ban, Eye, EyeOff, Flag, Flame, Layers, MapPinPlus, Plus, UserRound, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import type { LayerInfo } from "../../scene/preview-model";
import { placementBlocked, type KindStatus } from "../../v1/availability";
import { KIND_META, OBJECT_KINDS, type ObjectKind } from "../../v1/contract";
import type { FloorV1 } from "../../v1/geometry";
import { objectIssues } from "../../v1/issues";
import type { ObjectView } from "../../v1/state";
import type { Issue } from "../../store/validation";

const KIND_ICON: Record<ObjectKind, typeof MapPinPlus> = { Spawn: MapPinPlus, Hazard: Flame, Goal: Flag, Npc: UserRound, BlockedElement: Ban, Equipment: Wrench };
const fmt = (value: number) => (Math.round(value * 100) / 100).toString();

export function V1Tree({ floors, geometryNote, activeFloor, onFloor, objects, selected, issues, onSelect, onAdd, kindStatus, addDisabledReason, modelLayers, layerVisibility, onLayer, modelVisible, onModelVisible, hasModel }: {
  floors: FloorV1[];
  geometryNote: string | null;
  activeFloor: string | null;
  onFloor: (id: string | null) => void;
  objects: ObjectView[];
  selected: number | null;
  issues: Issue[];
  onSelect: (index: number) => void;
  onAdd: (kind: ObjectKind) => void;
  kindStatus: Record<ObjectKind, KindStatus>;
  addDisabledReason: string | null;
  modelLayers: LayerInfo[];
  layerVisibility: Record<string, boolean>;
  onLayer: (key: string, visible: boolean) => void;
  modelVisible: boolean;
  onModelVisible: (visible: boolean) => void;
  hasModel: boolean;
}) {
  const layerToggle = (key: string, label: string) => {
    const visible = layerVisibility[key] !== false;
    return <li key={key}>
      <button type="button" className="se-layer" aria-pressed={visible} onClick={() => onLayer(key, !visible)} title={visible ? `Ẩn lớp ${label}` : `Hiện lớp ${label}`}>
        {visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}<span>{label}</span>
      </button>
    </li>;
  };
  const floorName = (id: string) => floors.find((floor) => floor.id === id)?.name ?? id;

  return <div className="se-tree" data-testid="v1-tree">
    <section aria-labelledby="se-floors-title">
      <h3 id="se-floors-title"><Layers size={14} aria-hidden="true" /> Tầng</h3>
      {floors.length === 0
        ? <p className="se-note" data-testid="floors-empty">{geometryNote ?? "Chưa có dữ liệu tầng (cần Geometry hợp lệ)."}</p>
        : <ul className="se-chips" role="radiogroup" aria-label="Chọn tầng">
          <li><button type="button" role="radio" aria-checked={activeFloor === null} className="se-chip" onClick={() => onFloor(null)}>Tất cả</button></li>
          {[...floors].sort((a, b) => a.elevationMeters - b.elevationMeters).map((floor) => <li key={floor.id}>
            <button type="button" role="radio" aria-checked={activeFloor === floor.id} className="se-chip" onClick={() => onFloor(floor.id)} title={`Cao độ ${fmt(floor.elevationMeters)} m · mã ${floor.id}`}>
              {floor.name}<small>{fmt(floor.elevationMeters)} m</small>
            </button>
          </li>)}
        </ul>}
      {floors.length > 0 && activeFloor === null && <p className="se-note" role="status">Chọn một tầng để đặt đối tượng: vị trí lưu theo tọa độ cục bộ của tầng.</p>}
    </section>

    <section aria-labelledby="se-layers-title">
      <h3 id="se-layers-title"><Eye size={14} aria-hidden="true" /> Lớp hiển thị</h3>
      <ul className="se-layers">
        <li>
          <button type="button" className="se-layer" aria-pressed={modelVisible} disabled={!hasModel} onClick={() => onModelVisible(!modelVisible)}>
            {modelVisible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}<span>Mô hình tòa nhà</span>
          </button>
        </li>
        {OBJECT_KINDS.map((kind) => layerToggle(kind, KIND_META[kind].plural))}
        {modelLayers.map((layer) => layerToggle(layer.key, layer.label))}
      </ul>
    </section>

    {OBJECT_KINDS.map((kind) => {
      const list = objects.filter((object) => object.kind === kind);
      const Icon = KIND_ICON[kind];
      const blocked = addDisabledReason !== null || placementBlocked(kindStatus[kind]);
      return <section key={kind} aria-labelledby={`se-kind-${kind}`}>
        <h3 id={`se-kind-${kind}`}><Icon size={14} aria-hidden="true" /> {KIND_META[kind].plural} <StatusBadge>{list.length}</StatusBadge></h3>
        <ul className="se-objects" data-testid={`list-${kind}`}>
          {list.map((object) => {
            const flagged = objectIssues(issues, object.index).length > 0;
            return <li key={object.index}><button type="button" className="se-object" aria-pressed={selected === object.index} data-testid={`object-item-${object.index}`} onClick={() => onSelect(object.index)}>
              <Icon size={16} aria-hidden="true" /><span>{object.label || object.id || `#${object.index + 1}`}</span><small>{floorName(object.floorId)} · {fmt(object.position.x)}, {fmt(object.position.y)}, {fmt(object.position.z)}</small>
              {flagged && <span className="se-flag" role="img" aria-label="Có lỗi" title="Có lỗi cần xử lý" />}
            </button></li>;
          })}
        </ul>
        <Button type="button" variant="quiet" size="sm" className="se-add" data-testid={`add-${kind}`} disabled={blocked} title={addDisabledReason ?? (blocked ? "Xem tab “Loại đối tượng” để biết điều kiện" : undefined)} onClick={() => onAdd(kind)}>
          <Plus size={14} aria-hidden="true" /> Thêm {KIND_META[kind].label.toLowerCase()}
        </Button>
      </section>;
    })}
  </div>;
}
