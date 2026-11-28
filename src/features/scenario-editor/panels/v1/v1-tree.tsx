"use client";

import { Ban, ChevronDown, Eye, EyeOff, Flag, Flame, Layers, ListPlus, MapPinPlus, Plus, UserRound, Wrench } from "lucide-react";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import type { LayerInfo } from "../../scene/preview-model";
import { placementBlocked, type KindStatus } from "../../v1/availability";
import { KIND_META, OBJECT_KINDS, type ObjectKind } from "../../v1/contract";
import type { FloorV1 } from "../../v1/geometry";
import { objectIssues } from "../../v1/issues";
import { objectName } from "../../v1/object-name";
import type { ObjectView } from "../../v1/state";
import type { Issue } from "../../store/validation";

const KIND_ICON: Record<ObjectKind, typeof MapPinPlus> = { Spawn: MapPinPlus, Hazard: Flame, Goal: Flag, Npc: UserRound, BlockedElement: Ban, Equipment: Wrench };
const fmt = (value: number) => (Math.round(value * 100) / 100).toString();

/** Vietnamese names for the IFC element types the model splits into layers; a type not listed is "Bộ phận khác", never its IFC name. */
const IFC_NAMES: Record<string, string> = {
  ifcwall: "Tường", ifcwallstandardcase: "Tường", ifccurtainwall: "Vách kính", ifcdoor: "Cửa đi", ifcwindow: "Cửa sổ",
  ifcslab: "Sàn", ifcroof: "Mái", ifcstair: "Cầu thang", ifcstairflight: "Vế cầu thang", ifcramp: "Dốc", ifcrampflight: "Vế dốc", ifcrailing: "Lan can",
  ifccolumn: "Cột", ifcbeam: "Dầm", ifcmember: "Thanh", ifcplate: "Tấm", ifccovering: "Ốp, trần", ifcspace: "Phòng",
  ifcfurnishingelement: "Nội thất", ifcfurniture: "Nội thất", ifcsystemfurnitureelement: "Nội thất", ifcbuildingelementproxy: "Bộ phận khác", ifcopeningelement: "Lỗ mở",
  ifcflowterminal: "Thiết bị kỹ thuật", ifcflowsegment: "Ống, máng", ifcflowfitting: "Phụ kiện ống", ifcflowcontroller: "Van, công tắc",
  ifcdistributionelement: "Thiết bị kỹ thuật", ifcdistributionflowelement: "Thiết bị kỹ thuật", ifcenergyconversiondevice: "Thiết bị kỹ thuật",
  ifclightfixture: "Đèn", ifclamp: "Đèn", ifcsanitaryterminal: "Thiết bị vệ sinh", ifcfiresuppressionterminal: "Thiết bị chữa cháy", ifcalarm: "Thiết bị báo cháy",
  ifcelectricappliance: "Thiết bị điện", ifctransportelement: "Thang máy", ifcfooting: "Móng", ifcpile: "Cọc", ifcchimney: "Ống khói",
  ifcshadingdevice: "Tấm che nắng", ifcbuildingelementpart: "Bộ phận khác", ifcsite: "Khu đất",
};

function labelIfcLayers(layers: LayerInfo[]) {
  const named = layers.map((layer) => ({ key: layer.key, label: IFC_NAMES[layer.label.toLowerCase()] ?? "Bộ phận khác" }));
  // Two IFC types with one Vietnamese name (IfcWall, IfcWallStandardCase) stay apart by a number, not by their IFC name.
  const seen = new Map<string, number>();
  return named.map((item) => {
    const n = (seen.get(item.label) ?? 0) + 1;
    seen.set(item.label, n);
    return n > 1 ? { ...item, label: `${item.label} (${n})` } : item;
  });
}

export function V1Tree({ floors, floorNames, geometryNote, activeFloor, onFloor, objects, selected, issues, onSelect, onAdd, kindStatus, addDisabledReason, modelLayers, layerVisibility, onLayer, modelVisible, onModelVisible, hasModel, onImportEquipment, kinds = OBJECT_KINDS, footer }: {
  floors: FloorV1[];
  /** Display name per floor id (Tầng trệt, Tầng 1, Hầm 1); the IFC name stays as a tooltip. */
  floorNames: ReadonlyMap<string, string>;
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
  /** Kinds this session may place; the others are not listed. */
  kinds?: readonly ObjectKind[];
  footer?: ReactNode;
}) {
  const layerToggle = (key: string, label: string) => {
    const visible = layerVisibility[key] !== false;
    return <li key={key}>
      <button type="button" className="se-layer-chip" aria-pressed={visible} onClick={() => onLayer(key, !visible)} title={`${visible ? "Ẩn" : "Hiện"} lớp ${label}`}>
        {visible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}<span>{label}</span>
      </button>
    </li>;
  };
  const ifcLayers = labelIfcLayers(modelLayers);
  const hiddenCount = [...kinds, ...modelLayers.map((layer) => layer.key)].filter((key) => layerVisibility[key] === false).length + (hasModel && !modelVisible ? 1 : 0);
  const nameOf = (floor: FloorV1) => floorNames.get(floor.id) ?? floor.name;
  const floorOf = (id: string) => floors.find((floor) => floor.id === id);
  const floorName = (id: string) => { const floor = floorOf(id); return floor ? nameOf(floor) : id; };

  return <div className="se-tree" data-testid="v1-tree">
    <section aria-labelledby="se-floors-title">
      <h3 id="se-floors-title"><Layers size={14} aria-hidden="true" /> Tầng</h3>
      {floors.length === 0
        ? <p className="se-note" data-testid="floors-empty">{geometryNote ?? "Chưa có dữ liệu tầng (cần mô hình 3D hợp lệ)."}</p>
        : <ul className="se-chips" role="radiogroup" aria-label="Chọn tầng">
          <li role="none"><button type="button" role="radio" aria-checked={activeFloor === null} className="se-chip" onClick={() => onFloor(null)}>Tất cả</button></li>
          {[...floors].sort((a, b) => a.elevationMeters - b.elevationMeters).map((floor) => <li role="none" key={floor.id}>
            <button type="button" role="radio" aria-checked={activeFloor === floor.id} className="se-chip" onClick={() => onFloor(floor.id)} title={`${floor.name} · cao độ ${fmt(floor.elevationMeters)} m`}>
              {nameOf(floor)}<small>{fmt(floor.elevationMeters)} m</small>
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
        {kinds.map((kind) => layerToggle(kind, KIND_META[kind].plural))}
      </ul>
      <p className="se-layers-group">Mô hình IFC</p>
      <ul className="se-layer-chips">
        <li>
          <button type="button" className="se-layer-chip" aria-pressed={modelVisible} disabled={!hasModel} onClick={() => onModelVisible(!modelVisible)} title={modelVisible ? "Ẩn cả mô hình tòa nhà" : "Hiện mô hình tòa nhà"}>
            {modelVisible ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}<span>Cả tòa nhà</span>
          </button>
        </li>
        {ifcLayers.map((layer) => layerToggle(layer.key, layer.label))}
      </ul>
    </details>

    {kinds.map((kind) => {
      const list = objects.filter((object) => object.kind === kind);
      const Icon = KIND_ICON[kind];
      const blocked = addDisabledReason !== null || placementBlocked(kindStatus[kind]);
      return <section key={kind} aria-labelledby={`se-kind-${kind}`}>
        <h3 id={`se-kind-${kind}`}><Icon size={14} aria-hidden="true" /> {KIND_META[kind].plural} <StatusBadge>{list.length}</StatusBadge></h3>
        <ul className="se-objects" data-testid={`list-${kind}`}>
          {list.map((object) => {
            const flagged = objectIssues(issues, object.index).length > 0;
            // Unnamed objects share their capability name, so the inspector's number tells them apart.
            const name = objectName(object);
            return <li key={object.index}><button type="button" className="se-object" aria-pressed={selected === object.index} data-testid={`object-item-${object.index}`} onClick={() => onSelect(object.index)}>
              <Icon size={16} aria-hidden="true" /><span>{name === object.label.trim() ? name : `${name} #${object.index + 1}`}</span><small title={floorOf(object.floorId)?.name}>{floorName(object.floorId)} · {fmt(object.position.x)}, {fmt(object.position.y)}, {fmt(object.position.z)}</small>
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
    {footer}
  </div>;
}
