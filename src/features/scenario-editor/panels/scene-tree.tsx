"use client";

import { Eye, EyeOff, Flame, Layers, MapPin, Plus, Wind, Cloud, Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

import type { FloorInfo, LayerInfo } from "../scene/preview-model";
import type { Hazard, Position, Selection } from "../store/model";
import { issuesAt, type Issue } from "../store/validation";

function HazardIcon({ type }: { type: string }) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (type === "Fire") return <Flame {...props} />;
  if (type === "Smoke") return <Cloud {...props} />;
  if (type === "Wind") return <Wind {...props} />;
  return <Box {...props} />;
}

const fmt = (value: number) => (Math.round(value * 100) / 100).toString();

export type LayerState = Record<string, boolean>;

export function SceneTree({ floors, floorsNote, activeFloor, onFloor, spawns, hazards, selection, issues, onSelect, onAdd, modelLayers, layerVisibility, onLayer, modelVisible, onModelVisible, hasModel }: {
  floors: FloorInfo[];
  floorsNote: string | null;
  activeFloor: string | null;
  onFloor: (key: string | null) => void;
  spawns: Position[];
  hazards: Hazard[];
  selection: Selection;
  issues: Issue[];
  onSelect: (selection: Selection) => void;
  onAdd: (kind: "spawn" | "hazard") => void;
  modelLayers: LayerInfo[];
  layerVisibility: LayerState;
  onLayer: (key: string, visible: boolean) => void;
  modelVisible: boolean;
  onModelVisible: (visible: boolean) => void;
  hasModel: boolean;
}) {
  const isSelected = (kind: "spawn" | "hazard", index: number) => selection?.kind === kind && selection.index === index;
  const layerToggle = (key: string, label: string, visible: boolean) => (
    <li key={key}>
      <button type="button" className="se-layer" aria-pressed={visible} onClick={() => onLayer(key, !visible)} title={visible ? `Ẩn lớp ${label}` : `Hiện lớp ${label}`}>
        {visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}<span>{label}</span>
      </button>
    </li>
  );

  return <div className="se-tree">
    <section aria-labelledby="se-floors-title">
      <h3 id="se-floors-title"><Layers size={14} aria-hidden="true" /> Tầng</h3>
      {floors.length === 0
        ? <p className="se-note" data-testid="floors-empty">{hasModel ? "Mô hình chưa kèm dữ liệu tầng, hiển thị toàn bộ." : "Chưa có dữ liệu tầng (cần mô hình đã xử lý)."}</p>
        : <ul className="se-chips" role="radiogroup" aria-label="Chọn tầng">
          <li><button type="button" role="radio" aria-checked={activeFloor === null} className="se-chip" onClick={() => onFloor(null)}>Tất cả</button></li>
          {floors.map((floor) => <li key={floor.key}>
            <button type="button" role="radio" aria-checked={activeFloor === floor.key} className="se-chip" onClick={() => onFloor(floor.key)} title={floor.elevation !== null ? `Cao độ ${fmt(floor.elevation)} m` : undefined}>
              {floor.name}{floor.elevation !== null && <small>{fmt(floor.elevation)} m</small>}
            </button>
          </li>)}
        </ul>}
      {floorsNote && <p className="se-note" role="status">{floorsNote}</p>}
    </section>

    <section aria-labelledby="se-layers-title">
      <h3 id="se-layers-title"><Eye size={14} aria-hidden="true" /> Lớp hiển thị</h3>
      <ul className="se-layers">
        <li>
          <button type="button" className="se-layer" aria-pressed={modelVisible} disabled={!hasModel} onClick={() => onModelVisible(!modelVisible)}>
            {modelVisible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}<span>Mô hình tòa nhà</span>
          </button>
        </li>
        {layerToggle("spawn", "Điểm xuất phát", layerVisibility.spawn !== false)}
        {layerToggle("hazard", "Nguy cơ", layerVisibility.hazard !== false)}
        {modelLayers.map((layer) => layerToggle(layer.key, layer.label, layerVisibility[layer.key] !== false))}
      </ul>
    </section>

    <section aria-labelledby="se-objects-title">
      <h3 id="se-objects-title"><MapPin size={14} aria-hidden="true" /> Điểm xuất phát <StatusBadge>{spawns.length}</StatusBadge></h3>
      <ul className="se-objects" data-testid="spawn-list">
        {spawns.map((spawn, index) => {
          const flagged = issuesAt(issues, `$.spawnPoints[${index}]`).length > 0;
          return <li key={index}><button type="button" className="se-object" aria-pressed={isSelected("spawn", index)} onClick={() => onSelect({ kind: "spawn", index })}>
            <MapPin size={16} aria-hidden="true" /><span>Điểm #{index + 1}</span><small>{fmt(spawn.x)}, {fmt(spawn.y)}, {fmt(spawn.z)}</small>{flagged && <span className="se-flag" role="img" aria-label="Có lỗi" title="Có lỗi cần xử lý" />}
          </button></li>;
        })}
      </ul>
      <Button type="button" variant="quiet" size="sm" data-testid="add-spawn" onClick={() => onAdd("spawn")}><Plus size={14} aria-hidden="true" /> Thêm điểm xuất phát</Button>
    </section>

    <section aria-labelledby="se-hazards-title">
      <h3 id="se-hazards-title"><Flame size={14} aria-hidden="true" /> Nguy cơ <StatusBadge>{hazards.length}</StatusBadge></h3>
      <ul className="se-objects" data-testid="hazard-list">
        {hazards.map((hazard, index) => {
          const flagged = issuesAt(issues, `$.hazards[${index}]`).length > 0;
          return <li key={index}><button type="button" className="se-object" aria-pressed={isSelected("hazard", index)} onClick={() => onSelect({ kind: "hazard", index })}>
            <HazardIcon type={hazard.type} /><span>{hazard.id || `Nguy cơ #${index + 1}`}</span><small>{hazard.type || "?"} · {fmt(hazard.activationTime)} giây</small>{flagged && <span className="se-flag" role="img" aria-label="Có lỗi" title="Có lỗi cần xử lý" />}
          </button></li>;
        })}
      </ul>
      <Button type="button" variant="quiet" size="sm" data-testid="add-hazard" onClick={() => onAdd("hazard")}><Plus size={14} aria-hidden="true" /> Thêm nguy cơ</Button>
    </section>
  </div>;
}
