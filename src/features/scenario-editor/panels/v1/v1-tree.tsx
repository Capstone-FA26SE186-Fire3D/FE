"use client";

import { Ban, ChevronDown, Eye, EyeOff, Flag, Flame, Layers, ListPlus, MapPinPlus, Plus, UserRound, Wrench } from "lucide-react";

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

/** Vietnamese names for the IFC element types the model splits into layers; the IFC name stays in the tooltip. */
const IFC_NAMES: Record<string, string> = {
  ifcwall: "Tường", ifcwallstandardcase: "Tường", ifccurtainwall: "Vách kính", ifcdoor: "Cửa đi", ifcwindow: "Cửa sổ",
  ifcslab: "Sàn", ifcroof: "Mái", ifcstair: "Cầu thang", ifcstairflight: "Vế cầu thang", ifcramp: "Dốc", ifcrailing: "Lan can",
  ifccolumn: "Cột", ifcbeam: "Dầm", ifcmember: "Thanh", ifcplate: "Tấm", ifccovering: "Ốp, trần", ifcspace: "Phòng",
  ifcfurnishingelement: "Nội thất", ifcfurniture: "Nội thất", ifcbuildingelementproxy: "Khác", ifcopeningelement: "Lỗ mở",
  ifcflowterminal: "Thiết bị kỹ thuật", ifcflowsegment: "Ống, máng", ifcdistributionelement: "Thiết bị kỹ thuật",
};

function labelIfcLayers(layers: LayerInfo[]) {
  const named = layers.map((layer) => ({ key: layer.key, raw: layer.label, label: IFC_NAMES[layer.label.toLowerCase()] ?? layer.label.replace(/^Ifc/, "") }));
  // Two IFC types with one Vietnamese name (IfcWall, IfcWallStandardCase) stay apart by their IFC suffix.
  const seen = new Map<string, number>();
  for (const item of named) seen.set(item.label, (seen.get(item.label) ?? 0) + 1);
  return named.map((item) => (seen.get(item.label)! > 1 ? { ...item, label: `${item.label} (${item.raw.replace(/^Ifc/, "")})` } : item));
}

export function V1Tree({ floors, geometryNote, activeFloor, onFloor, objects, selected, issues, onSelect, onAdd, kindStatus, addDisabledReason, modelLayers, layerVisibility, onLayer, modelVisible, onModelVisible, hasModel, onImportEquipment }: {
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
  /** Opens the "Thêm thiết bị đã xác nhận" preview (IFC equipment decisions); absent hides the action. */
  onImportEquipment?: () => void;
}) {
  const layerToggle = (key: string, label: string, raw?: string) => {
    const visible = layerVisibility[key] !== false;
    return <li key={key}>
      <button type="button" className="se-layer-chip" aria-pressed={visible} onClick={() => onLayer(key, !visible)} title={`${visible ? "Ẩn" : "Hiện"} lớp ${label}${raw && raw !== label ? ` (${raw})` : ""}`}>
        {visible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}<span>{label}</span>
      </button>
    </li>;
  };
  const ifcLayers = labelIfcLayers(modelLayers);
  const hiddenCount = [...OBJECT_KINDS, ...modelLayers.map((layer) => layer.key)].filter((key) => layerVisibility[key] === false).length + (hasModel && !modelVisible ? 1 : 0);
  const floorName = (id: string) => floors.find((floor) => floor.id === id)?.name ?? id;

  return <div className="se-tree" data-testid="v1-tree">
    <section aria-labelledby="se-floors-title">
      <h3 id="se-floors-title"><Layers size={14} aria-hidden="true" /> Tầng</h3>
      {floors.length === 0
        ? <p className="se-note" data-testid="floors-empty">{geometryNote ?? "Chưa có dữ liệu tầng (cần mô hình 3D hợp lệ)."}</p>
        : <ul className="se-chips" role="radiogroup" aria-label="Chọn tầng">
          <li role="none"><button type="button" role="radio" aria-checked={activeFloor === null} className="se-chip" onClick={() => onFloor(null)}>Tất cả</button></li>
          {[...floors].sort((a, b) => a.elevationMeters - b.elevationMeters).map((floor) => <li role="none" key={floor.id}>
            <button type="button" role="radio" aria-checked={activeFloor === floor.id} className="se-chip" onClick={() => onFloor(floor.id)} title={`Cao độ ${fmt(floor.elevationMeters)} m`}>
              {floor.name}<small>{fmt(floor.elevationMeters)} m</small>
            </button>
          </li>)}
        </ul>}
      {floors.length > 0 && activeFloor === null && <p className="se-note" role="status">Chọn một tầng để đặt đối tượng: vị trí lưu theo tọa độ cục bộ của tầng.</p>}
    </section>

    {/* Collapsed by default: a dozen toggles pushed the object list far down the panel. */}
    <details className="se-layers-box">
      <summary>
        <span className="se-layers-title"><Eye size={14} aria-hidden="true" /> Lớp hiển thị</span>
        <span className="se-layers-count">{hiddenCount > 0 ? `${hiddenCount} lớp đang ẩn` : "Đang hiện hết"}</span>
        <ChevronDown size={14} aria-hidden="true" className="se-layers-caret" />
      </summary>
      <p className="se-layers-group">Đối tượng kịch bản</p>
      <ul className="se-layer-chips">
        {OBJECT_KINDS.map((kind) => layerToggle(kind, KIND_META[kind].plural))}
      </ul>
      <p className="se-layers-group">Mô hình IFC</p>
      <ul className="se-layer-chips">
        <li>
          <button type="button" className="se-layer-chip" aria-pressed={modelVisible} disabled={!hasModel} onClick={() => onModelVisible(!modelVisible)} title={modelVisible ? "Ẩn cả mô hình tòa nhà" : "Hiện mô hình tòa nhà"}>
            {modelVisible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}<span>Cả tòa nhà</span>
          </button>
        </li>
        {ifcLayers.map((layer) => layerToggle(layer.key, layer.label, layer.raw))}
      </ul>
    </details>

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
        <Button type="button" variant="quiet" size="sm" className="se-add" data-testid={`add-${kind}`} disabled={blocked} title={addDisabledReason ?? (blocked ? "Xem tab “Khả dụng” để biết điều kiện" : undefined)} onClick={() => onAdd(kind)}>
          <Plus size={14} aria-hidden="true" /> Thêm {KIND_META[kind].lower}
        </Button>
        {kind === "Equipment" && onImportEquipment && <Button type="button" variant="quiet" size="sm" className="se-add se-equipment-import" data-testid="import-equipment" onClick={onImportEquipment}>
          <ListPlus size={14} aria-hidden="true" /> Thêm thiết bị đã xác nhận
        </Button>}
      </section>;
    })}
  </div>;
}
